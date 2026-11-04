#!/bin/sh
#
# Lucent 3 — 在线一键安装 / 卸载脚本
#
# 这是从 GitHub 在线拉取安装包的一键脚本。路由器本身不需要预置任何文件，
# 只要能够访问 GitHub（或国内镜像）即可。
#
# 一行命令安装（在路由器 SSH 里执行）：
#
#   直连 GitHub：
#     wget -qO- https://raw.githubusercontent.com/likz0421/luci-theme-lucent/main/install.sh | sh
#
#   国内镜像加速（jsDelivr，拉脚本更快）：
#     wget -qO- https://cdn.jsdelivr.net/gh/likz0421/luci-theme-lucent@main/install.sh | sh
#
#   若路由器没有 wget，可用 curl：
#     curl -fsSL https://github.com/likz0421/luci-theme-lucent/raw/main/install.sh | sh
#
# 卸载：
#     wget -qO- https://cdn.jsdelivr.net/gh/likz0421/luci-theme-lucent@main/install.sh | sh -s uninstall
#
# 环境变量（可选）：
#   LUCENT_CN=1        强制优先使用国内镜像下载软件包
#   LUCENT_BASE_URL=…  指定你自己的下载地址（私有镜像 / 内网 / 本地测试）
#   LUCENT_VERSION=…   覆盖要安装的版本号
#
set -e

# ---- 版本与仓库（由 build-onekey.sh 在发布时替换）--------------------------
LUCENT_VERSION_DEFAULT="3.10.10-r1"
LUCENT_TAG_DEFAULT="v3.10.10"
LUCENT_REPO="likz0421/luci-theme-lucent"
# -------------------------------------------------------------------------

VER="${LUCENT_VERSION:-$LUCENT_VERSION_DEFAULT}"
TAG="${LUCENT_TAG:-$LUCENT_TAG_DEFAULT}"
VER_NO_R="${VER%%-r*}"
PKG_NAME="luci-theme-lucent"

log() { [ "$QUIET" = "1" ] || echo "$@"; }

usage() {
	cat <<EOF
Lucent 3 在线一键脚本  (版本 $VER)

  sh install.sh install     在线下载并安装 / 升级（默认）
  sh install.sh check       检查是否有新版本（输出 JSON）
  sh install.sh update      检测到新版本时在线升级
  sh install.sh uninstall   卸载并恢复 Bootstrap
  sh install.sh status      查看安装状态

默认从 GitHub Releases 下载，失败时自动回退到国内镜像。
强制走镜像：  LUCENT_CN=1 sh install.sh
自定义地址：  LUCENT_BASE_URL=https://your-host/lucent sh install.sh
EOF
}

ACTION="${1:-install}"
case "$ACTION" in
	install|check|update|uninstall|status) ;;
	-h|--help|help) usage; exit 0 ;;
	*) log "未知操作：$ACTION"; usage; exit 1 ;;
esac

# ---- 下载工具 --------------------------------------------------------------
have() { command -v "$1" >/dev/null 2>&1; }

fetch() {
	# fetch <url> <outfile>
	url="$1"; out="$2"
	tmo="${LUCENT_FETCH_TIMEOUT:-20}"
	rm -f "$out"
	if have wget; then
		# OpenWrt's wget is uclient-fetch: supports -q/-T/-O but NOT -t.
		wget -q -T "$tmo" -O "$out" "$url" 2>/dev/null
	elif have curl; then
		curl -fsSL --connect-timeout "$tmo" --max-time $((tmo * 4)) -o "$out" "$url" 2>/dev/null
	else
		return 1
	fi
	[ -s "$out" ]
}

# 构造候选下载地址列表（release 资源）
rel_bases() {
	rel="https://github.com/$LUCENT_REPO/releases/download/$TAG"
	mirrors="https://ghfast.top/$rel https://gh-proxy.com/$rel https://mirror.ghproxy.com/$rel https://github.moeyy.xyz/$rel"
	if [ "${LUCENT_CN:-0}" = "1" ]; then
		echo "$mirrors $rel"
	else
		echo "$rel $mirrors"
	fi
}

# 指向"最新发布版"的地址列表：用于获取 latest 指针文件，这样旧版本也能发现新版。
# 优先用仓库树里的指针文件（随每次发布自动更新、镜像友好、版本无关），
# 再回退到 GitHub "releases/latest" 资源。指针内容是被选中的资源文件名，
# 由 get_latest 里的 sed 解析出版本号。
latest_bases() {
	gh="https://raw.githubusercontent.com/$LUCENT_REPO/main"
	jsd="https://cdn.jsdelivr.net/gh/$LUCENT_REPO@main"
	fastly="https://cdn.fastly.jsdelivr.net/gh/$LUCENT_REPO@main"
	rel="https://github.com/$LUCENT_REPO/releases/latest/download"
	if [ "${LUCENT_CN:-0}" = "1" ]; then
		# 国内优先镜像，再回退直连
		echo "$jsd $fastly $gh $rel"
	else
		echo "$gh $jsd $fastly $rel"
	fi
}

# ---- 权威"最新版" ----------------------------------------------------------
# CDN 对 @main 的文件缓存最长 7 天（jsDelivr: max-age=604800），所以仓库里的脚本
# 本身和 latest*.txt 都可能是旧副本。下面这些是接口而不是仓库文件，不受该缓存影响：
#   1) jsDelivr 版本索引（国内可达，第一项就是最新已发布 tag）
#   2) GitHub api releases/latest 的 tag_name
#   3) GitHub releases/latest 的 302 Location
# 命中的来源记进 LATEST_VIA，输出里能直接看出是谁在骗人。
# 命中的来源写进 $TMP/latest-via（resolve_latest 常在子 shell 里跑，变量传不出来）
mark_via() { [ -n "$TMP" ] && printf '%s' "$1" > "$TMP/latest-via" 2>/dev/null; }

json_field() {
	# json_field <field> — 取 JSON 里该字段的第一个字符串值。
	# 先删掉空白和方括号，这样 "versions":["x" 和 "tag_name":"x" 变成同一种形状
	# （GNU sed 的 BRE 里 `\[?` 不是可选量词，得避免）
	tr -d ' \t\r\n[]' | sed -n "s/.*\"$1\":\"v\{0,1\}\([^\"]*\)\".*/\1/p" | head -n1
}

try_url() {
	# try_url <url> <field|""> — field 为空表示从 302 Location 里取 tag
	local url="$1" field="$2" v="" tmo="${LUCENT_FETCH_TIMEOUT:-8}"

	if have curl; then
		if [ -n "$field" ]; then
			v=$(curl -fsSL --connect-timeout "$tmo" --max-time $((tmo * 4)) "$url" 2>/dev/null | json_field "$field")
		else
			v=$(curl -fsSI --connect-timeout "$tmo" --max-time $((tmo * 4)) "$url" 2>/dev/null | \
				sed -n 's/^[Ll]ocation:[[:space:]]*.*\/tag\/v\{0,1\}\([0-9][^[:space:]]*\).*/\1/p' | head -n1)
		fi
	elif have wget; then
		if [ -n "$field" ]; then
			v=$(wget -q -T "$tmo" -O- "$url" 2>/dev/null | json_field "$field")
		else
			v=$(wget -q -S --spider -T "$tmo" "$url" 2>&1 | \
				sed -n 's/^[[:space:]]*[Ll]ocation:[[:space:]]*.*\/tag\/v\{0,1\}\([0-9][^[:space:]]*\).*/\1/p' | head -n1)
		fi
	fi

	printf '%s' "$v" | sed 's/^v//' | tr -cd '0-9A-Za-z._-'
}

resolve_latest() {
	local api="https://api.github.com/repos/$LUCENT_REPO/releases/latest"
	local red="https://github.com/$LUCENT_REPO/releases/latest"
	local jdi="https://data.jsdelivr.com/v1/package/gh/$LUCENT_REPO"
	local v=""

	v=$(try_url "$jdi" "versions")
	if [ -n "$v" ]; then mark_via "jsdelivr-index"; printf '%s' "$v"; return 0; fi

	if [ "${LUCENT_CN:-0}" = "1" ]; then
		v=$(try_url "$red" "")
		if [ -n "$v" ]; then mark_via "gh-redirect"; printf '%s' "$v"; return 0; fi
		v=$(try_url "$api" "tag_name")
		if [ -n "$v" ]; then mark_via "gh-api"; printf '%s' "$v"; return 0; fi
	else
		v=$(try_url "$api" "tag_name")
		if [ -n "$v" ]; then mark_via "gh-api"; printf '%s' "$v"; return 0; fi
		v=$(try_url "$red" "")
		if [ -n "$v" ]; then mark_via "gh-redirect"; printf '%s' "$v"; return 0; fi
	fi

	return 1
}

# 尝试从多个地址下载某个文件
try_download() {
	fname="$1"; dest="$2"

	if [ -n "$LUCENT_BASE_URL" ]; then
		log "  下载 $LUCENT_BASE_URL/$fname"
		fetch "$LUCENT_BASE_URL/$fname" "$dest" && return 0
		return 1
	fi

	for base in $(rel_bases); do
		log "  尝试 $base/$fname"
		if fetch "$base/$fname" "$dest"; then
			return 0
		fi
	done
	return 1
}

# ---- 版本比较与在线检查 ----------------------------------------------------
# 只保留版本号里合法的字符，避免把外部内容原样拼进 JSON。
sanitize() { printf '%s' "$1" | tr -cd 'A-Za-z0-9._-'; }

# 3.6.0-r1 -> 0003.0006.0000.0001（定宽，便于字符串比较）
vkey() {
	printf '%s' "$1" | sed 's/[-.rR]/ /g' | awk '{printf "%06d.%06d.%06d.%06d", $1+0, $2+0, $3+0, $4+0}'
}

get_current() {
	local v=""
	if have apk; then
		v=$(apk info -e -v "$PKG_NAME" 2>/dev/null | head -n1 | sed "s/^${PKG_NAME}-//")
	elif have opkg; then
		v=$(opkg status "$PKG_NAME" 2>/dev/null | sed -n 's/^Version: //p' | head -n1)
	fi
	# File-copy installs leave no package record; fall back to the marker we
	# write at install time so the dashboard can still show the current version.
	[ -n "$v" ] || v=$(cat /usr/share/lucent/version 2>/dev/null || true)
	printf '%s' "$v"
}

get_latest() {
	local f base ptr="" tag
	if have apk; then f="latest-apk.txt"; else f="latest.txt"; fi

	# 自建镜像优先：完全按用户指定的地址，不去碰 GitHub
	if [ -n "$LUCENT_BASE_URL" ]; then
		if fetch "$LUCENT_BASE_URL/$f" "$TMP/latest"; then
			sed -e 's/.*luci-theme-lucent[-_]//' -e 's/\.apk$//' -e 's/_all\.ipk$//' -e 's/\.ipk$//' "$TMP/latest" | tr -d ' \t\r\n'
			mark_via "base-url"
			return 0
		fi
		return 1
	fi

	# 指针文件带时间戳参数，绕开镜像 CDN 的长缓存
	for base in $(latest_bases); do
		case "$base" in
			*jsdelivr.net*) log "  检查 $base/$f"; fetch "$base/$f?cb=$(date +%s 2>/dev/null || echo 0)" "$TMP/latest" && \
				ptr=$(sed -e 's/.*luci-theme-lucent[-_]//' -e 's/\.apk$//' -e 's/_all\.ipk$//' -e 's/\.ipk$//' "$TMP/latest" | tr -d ' \t\r\n') ;;
			*) log "  检查 $base/$f"; fetch "$base/$f" "$TMP/latest" && \
				ptr=$(sed -e 's/.*luci-theme-lucent[-_]//' -e 's/\.apk$//' -e 's/_all\.ipk$//' -e 's/\.ipk$//' "$TMP/latest" | tr -d ' \t\r\n') ;;
		esac
		[ -n "$ptr" ] && { mark_via "pointer-file"; break; }
	done

	# 线上 tag 才是准的，命中时 mark_via 会覆盖上面的 pointer-file
	tag=$(resolve_latest)

	if [ -n "$tag" ]; then
		if [ "${ptr%%-r*}" = "$tag" ]; then
			printf '%s' "$ptr"
		else
			printf '%s-r1' "$tag"
		fi
		return 0
	fi

	[ -n "$ptr" ] && { printf '%s' "$ptr"; return 0; }
	return 1
}

# ---- 临时目录 --------------------------------------------------------------
TMP=""
cleanup() { [ -n "$TMP" ] && rm -rf "$TMP"; }
trap cleanup EXIT INT TERM

new_tmp() {
	TMP=$(mktemp -d /tmp/lucent.XXXXXX) || exit 1
}

# ---- 确保 LuCI 存在 --------------------------------------------------------
ensure_luci() {
	[ -d /usr/share/ucode/luci ] && return 0
	log "→ 未检测到 OpenWrt LuCI，尝试安装 luci 界面…"
	if have apk; then
		if apk add luci >"$TMP/luci.log" 2>&1 || apk add luci-base >>"$TMP/luci.log" 2>&1; then
			[ -d /usr/share/ucode/luci ] && { log "  LuCI: 完成"; return 0; }
		fi
	elif have opkg; then
		opkg update >/dev/null 2>&1 || true
		if opkg install luci >"$TMP/luci.log" 2>&1 || opkg install luci-base >>"$TMP/luci.log" 2>&1; then
			[ -d /usr/share/ucode/luci ] && { log "  LuCI: 完成"; return 0; }
		fi
	fi
	[ -s "$TMP/luci.log" ] && cat "$TMP/luci.log"
	log "无法自动安装 LuCI，请确认路由器可联网访问软件源。" >&2
	return 1
}

# ---- 激活主题 --------------------------------------------------------------
activate_theme() {
	uci -q get luci.themes.Lucent >/dev/null 2>&1 || \
		uci -q set luci.themes.Lucent=/luci-static/lucent
	case "$(uci -q get luci.main.mediaurlbase)" in
		''|/luci-static/bootstrap|/luci-static/bootstrap-dark|/luci-static/bootstrap-light)
			uci -q set luci.main.mediaurlbase=/luci-static/lucent ;;
	esac
	uci -q get luci.languages.zh_cn >/dev/null 2>&1 || \
		uci -q set luci.languages.zh_cn='简体中文 (Simplified Chinese)'
	uci -q commit luci
}

# ---- 安装 ------------------------------------------------------------------
do_install() {
	[ "$(id -u)" = "0" ] || { log "请用 root 运行。" >&2; exit 1; }
	[ -f /etc/openwrt_release ] || { log "这不是 OpenWrt 系统。" >&2; exit 1; }
	[ -d /usr/share/ucode/luci ] || have apk || have opkg || {
		log "既没有 LuCI 也没有包管理器，无法在线安装。" >&2; exit 1; }

	new_tmp
	ensure_luci || exit 1

	# 这份脚本自己可能就是 CDN 里的旧副本，所以装之前先向线上确认最新版；
	# 用户显式给了 LUCENT_VERSION 时不擅自改动。
	if [ -z "$LUCENT_VERSION" ]; then
		QUIET=1
		NEWEST=$(sanitize "$(get_latest 2>/dev/null)")
		QUIET=0
		if [ -n "$NEWEST" ] && [ "$NEWEST" != "$VER" ]; then
			log "→ 脚本内置默认 $VER，线上最新为 $NEWEST，改按最新版安装"
			VER="$NEWEST"; VER_NO_R="${VER%%-r*}"; TAG="v$VER_NO_R"
		fi
	fi

	log "→ 从 GitHub / 镜像在线下载 Lucent…"

	# 根据包管理器选择要下载的安装包
	if have apk; then
		PKGFILE="$PKG_NAME-$VER.apk"
	elif have opkg; then
		PKGFILE="${PKG_NAME}_${VER}_all.ipk"
	else
		PKGFILE="lucent-$VER_NO_R.tar.gz"
	fi

	if ! try_download "$PKGFILE" "$TMP/$PKGFILE"; then
		log ""
		log "所有地址都无法下载 $PKGFILE。" >&2
		log "国内网络可尝试：  LUCENT_CN=1 sh install.sh" >&2
		log "或指定镜像：      LUCENT_BASE_URL=https://你的镜像 sh install.sh" >&2
		log "HTTPS 失败时先装证书：  apk add ca-bundle ca-certificates  (或 opkg install ca-bundle)" >&2
		exit 1
	fi

	INSTALLED=0
	if have apk; then
		log "→ 使用 apk 安装…"
		if apk add --allow-untrusted --no-network "$TMP/$PKGFILE" >"$TMP/pkg.log" 2>&1; then
			INSTALLED=1; log "  apk: 完成"
		else
			cat "$TMP/pkg.log"
		fi
	elif have opkg; then
		log "→ 使用 opkg 安装…"
		if opkg install "$TMP/$PKGFILE" >"$TMP/pkg.log" 2>&1; then
			INSTALLED=1; log "  opkg: 完成"
		else
			cat "$TMP/pkg.log"
		fi
	else
		# 无包管理器：解压 tar.gz 并用其中的离线安装脚本
		log "→ 未找到包管理器，使用文件方式安装…"
		tar -xzf "$TMP/$PKGFILE" -C "$TMP" || { log "安装包损坏。" >&2; exit 1; }
		DIR=$(find "$TMP" -maxdepth 1 -type d -name 'luci-theme-lucent-*' | head -n1)
		[ -n "$DIR" ] && sh "$DIR/install.sh" && INSTALLED=1
	fi

	[ "$INSTALLED" = "1" ] || { log "安装失败。" >&2; exit 1; }

	# Record the installed version so file-copy installs (no package manager
	# record) can still report the current version to the in-page updater.
	mkdir -p /usr/share/lucent 2>/dev/null || true
	[ -n "$VER" ] && printf '%s\n' "$VER" > /usr/share/lucent/version

	activate_theme
	rm -rf /tmp/luci-indexcache* /tmp/luci-modulecache/ /tmp/lucent-upload
	/etc/init.d/rpcd reload >/dev/null 2>&1 || true
	/etc/init.d/uhttpd restart >/dev/null 2>&1 || true

	log ""
	log "完成。打开 http://$(uci -q get network.lan.ipaddr | cut -d/ -f1) 并登录。"
	log "浏览器为中文时自动显示中文；强制中文：uci set luci.main.lang=zh_cn && uci commit luci"
	log "卸载：sh install.sh uninstall"
}

# ---- 卸载（无需联网）------------------------------------------------------
do_uninstall() {
	[ "$(id -u)" = "0" ] || { log "请用 root 运行。" >&2; exit 1; }
	[ -f /etc/openwrt_release ] || { log "这不是 OpenWrt 系统。" >&2; exit 1; }
	new_tmp
	log "→ 卸载 Lucent…"

	if have apk; then
		apk info -e "$PKG_NAME" >/dev/null 2>&1 && \
			{ apk del "$PKG_NAME" >"$TMP/pkg.log" 2>&1 || cat "$TMP/pkg.log"; }
	elif have opkg; then
		opkg remove "$PKG_NAME" >"$TMP/pkg.log" 2>&1 || cat "$TMP/pkg.log"
	fi

	rm -rf /www/luci-static/lucent /www/luci-static/resources/lucent \
		/www/luci-static/resources/view/lucent /usr/share/ucode/luci/template/themes/lucent \
		/usr/share/lucent
	rm -f /usr/share/luci/menu.d/luci-theme-lucent.json \
		/usr/share/rpcd/acl.d/luci-theme-lucent.json \
		/usr/libexec/rpcd/luci.lucent \
		/usr/lib/lua/luci/i18n/lucent.zh-cn.lmo \
		/usr/lib/lua/luci/i18n/lucent-zh-*.zh-cn.lmo \
		/etc/uci-defaults/30_luci-theme-lucent
	rm -rf /tmp/lucent-upload /tmp/luci-indexcache* /tmp/luci-modulecache*

	uci -q delete luci.themes.Lucent || true
	[ "$(uci -q get luci.main.mediaurlbase)" = "/luci-static/lucent" ] && \
		uci -q set luci.main.mediaurlbase=/luci-static/bootstrap
	ls /usr/lib/lua/luci/i18n/*.zh-cn.lmo >/dev/null 2>&1 || \
		uci -q delete luci.languages.zh_cn || true
	uci -q delete lucent || true
	uci -q commit luci || true
	rm -f /etc/config/lucent

	/etc/init.d/rpcd reload >/dev/null 2>&1 || true
	/etc/init.d/uhttpd restart >/dev/null 2>&1 || true
	log "卸载完成，LuCI 已恢复 Bootstrap。"
}

# ---- 状态 ------------------------------------------------------------------
do_status() {
	new_tmp
	PKG_STATE="未安装"
	if have apk; then
		apk info -e "$PKG_NAME" >/dev/null 2>&1 && \
			PKG_STATE="$(apk info -e -v "$PKG_NAME" 2>/dev/null | head -n1 || echo '已安装')"
	elif have opkg; then
		V="$(opkg status "$PKG_NAME" 2>/dev/null | sed -n 's/^Version: //p')"
		[ -n "$V" ] && PKG_STATE="$PKG_NAME $V"
	fi
	echo "软件包：$PKG_STATE"
	echo "当前主题：$(uci -q get luci.main.mediaurlbase || echo '未设置')"
	echo "Lucent 注册路径：$(uci -q get luci.themes.Lucent || echo '未注册')"
	echo "中文语言项：$(uci -q get luci.languages.zh_cn || echo '未注册')"
	echo "中文目录文件：$(ls /usr/lib/lua/luci/i18n/lucent*.lmo 2>/dev/null | wc -l) 个"
}

# ---- 在线检查更新 ----------------------------------------------------------
do_check() {
	[ "$(id -u)" = "0" ] || { log "请用 root 运行。" >&2; exit 1; }
	new_tmp
	export LUCENT_FETCH_TIMEOUT=8
	QUIET=1
	CURRENT=$(sanitize "$(get_current 2>/dev/null)")
	LATEST=$(sanitize "$(get_latest 2>/dev/null)")
	QUIET=0
	AVAIL=false
	# 注意：脚本开了 set -e，这里必须容忍文件不存在，否则整个 check 会在
	# 输出之前静默退出，用户只看到"拉不到新版"而没有任何原因。
	VIA=$(cat "$TMP/latest-via" 2>/dev/null || true)
	[ -n "$LATEST" ] || { printf '{"current":"%s","latest":"","available":false,"error":"no-source"}\n' "$CURRENT"; exit 0; }
	if [ -z "$CURRENT" ]; then
		AVAIL=true
	elif [ "$(vkey "$LATEST")" != "$(vkey "$CURRENT")" ]; then
		AVAIL=true
	fi
	printf '{"current":"%s","latest":"%s","available":%s,"via":"%s"}\n' "$CURRENT" "$LATEST" "$AVAIL" "${VIA:-unknown}"
}

# ---- 在线升级 --------------------------------------------------------------
do_update() {
	[ "$(id -u)" = "0" ] || { log "请用 root 运行。" >&2; exit 1; }
	new_tmp
	QUIET=1
	CURRENT=$(sanitize "$(get_current 2>/dev/null)")
	LATEST=$(sanitize "$(get_latest 2>/dev/null)")
	QUIET=0
	if [ -z "$LATEST" ]; then
		log "无法连接更新源，请检查网络或改用镜像：LUCENT_CN=1 sh install.sh update" >&2
		exit 1
	fi
	if [ -n "$CURRENT" ] && [ "$(vkey "$LATEST")" = "$(vkey "$CURRENT")" ]; then
		log "已是最新版本 $LATEST。"
		exit 0
	fi
	log "→ 发现新版本 $LATEST（当前 ${CURRENT:-未安装}），开始在线升级…"
	# 重新导出全局版本变量，确保 do_install 下载的是新版本而不是默认值。
	LUCENT_VERSION="$LATEST"; LUCENT_TAG="v${LATEST%%-r*}"
	VER="$LATEST"; TAG="$LUCENT_TAG"; VER_NO_R="${LATEST%%-r*}"
	do_install
	log "升级完成。"
}

case "$ACTION" in
	install) do_install ;;
	check) do_check ;;
	update) do_update ;;
	uninstall) do_uninstall ;;
	status) do_status ;;
esac
