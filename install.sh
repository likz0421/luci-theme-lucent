#!/bin/sh
#
# Lucent 3 — 在线一键安装 / 卸载脚本
#
# 这是从 GitHub 在线拉取安装包的一键脚本。路由器本身不需要预置任何文件，
# 只要能够访问 GitHub（或国内镜像）即可。
#
# 一行命令安装（在路由器 SSH 里执行）：
#
#   推荐（Release 资源，永远是最新版，不会被 CDN 缓存成旧副本）：
#     wget -qO- https://github.com/likz0421/luci-theme-lucent/releases/latest/download/lucent-install.sh | sh
#
#   直连 GitHub 仓库文件：
#     wget -qO- https://raw.githubusercontent.com/likz0421/luci-theme-lucent/main/install.sh | sh
#
#   国内镜像加速（拉脚本更快）：
#     wget -qO- https://cdn.jsdelivr.net/gh/likz0421/luci-theme-lucent@main/install.sh | sh
#
#   若路由器没有 wget，可用 curl：
#     curl -fsSL https://github.com/likz0421/luci-theme-lucent/raw/main/install.sh | sh
#
#   注意：jsDelivr 这类 CDN 会把 @main 的文件缓存一段时间，可能给你一份旧
#   脚本（旧脚本没有交互菜单）。想拿到当前版本，用上面第一条 Release 资源地址。
#
# 运行后会先问你装什么：
#     1) 安装 / 升级到最新版        2) 卸载主题并恢复 Bootstrap
# 直接回车就是安装。想跳过菜单也可以写全命令：
#     wget -qO- https://cdn.jsdelivr.net/gh/likz0421/luci-theme-lucent@main/install.sh | sh -s uninstall
#
# 环境变量（可选）：
#   LUCENT_CN=1        强制优先使用国内镜像下载软件包
#   LUCENT_BASE_URL=…  指定你自己的下载地址（私有镜像 / 内网 / 本地测试）
#   LUCENT_VERSION=…   覆盖要安装的版本号
#   LUCENT_FORCE=1     已是最新版也覆盖重装；本机比线上新时允许降级
#
set -e

# ---- 版本与仓库（由 build-onekey.sh 在发布时替换）--------------------------
LUCENT_VERSION_DEFAULT="0.5-r1"
LUCENT_TAG_DEFAULT="v0.5"
LUCENT_REPO="likz0421/luci-theme-lucent"
# -------------------------------------------------------------------------

VER="${LUCENT_VERSION:-$LUCENT_VERSION_DEFAULT}"
TAG="${LUCENT_TAG:-$LUCENT_TAG_DEFAULT}"
VER_NO_R="${VER%%-r*}"
PKG_NAME="luci-theme-lucent"
# 覆盖式重装 / 允许降级：LUCENT_FORCE=1（或 FORCE=1）
FORCE="${LUCENT_FORCE:-${FORCE:-0}}"

log() { [ "$QUIET" = "1" ] || echo "$@"; }

usage() {
	cat <<EOF
Lucent 3 在线一键脚本  (版本 $VER)

  sh install.sh             交互菜单：1 安装 / 升级，2 卸载
  sh install.sh install     直接安装 / 升级（管道执行且无终端时的默认动作）
  sh install.sh check       检查是否有新版本（输出 JSON）
  sh install.sh update      检测到新版本时在线升级
  sh install.sh uninstall   卸载并恢复 Bootstrap
  sh install.sh status      查看本机安装状态与版本号

默认从 GitHub Releases 下载，失败时自动回退到国内镜像。
强制走镜像：  LUCENT_CN=1 sh install.sh
自定义地址：  LUCENT_BASE_URL=https://your-host/lucent sh install.sh
已是最新也要重装 / 允许降级：  LUCENT_FORCE=1 sh install.sh
EOF
}

ACTION="${1:-}"
case "$ACTION" in
	''|install|check|update|uninstall|status) ;;
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
# 容器识别不能依赖 od：BusyBox 的 od 对 -N/-t 的支持随构建而变，读不出头部
# 就会把真安装包误判成"不是安装包"（实测三个源都拿到了同一个 171KB 的包）。
# 这里只做一个判断 —— 首字节是 "<" 说明是 HTML/XML 错误页，一定不是包；
# 其余情况交给 apk/opkg 自己校验，它们的报错比我们的猜测准。
is_package() {
	local sig
	[ -s "$1" ] || return 1
	sig=$(dd if="$1" bs=1 count=1 2>/dev/null)
	# 读不到（ash 对某些控制字节会丢内容）就当没判断出来，不要误杀
	[ -n "$sig" ] || return 0
	if [ "$sig" = "<" ]; then
		printf 'html' > "$1.kind" 2>/dev/null || true
		return 1
	fi
	return 0
}

try_download() {
	fname="$1"; dest="$2"
	# 每个候选都要过校验：门户页、重定向页、镜像的错误页都是非空文件，
	# 只看"有没有下下来"会让第一个候选直接"成功"，后面的镜像一次都轮不到。
	if [ -n "$LUCENT_BASE_URL" ]; then
		log "  下载 $LUCENT_BASE_URL/$fname"
		if fetch "$LUCENT_BASE_URL/$fname" "$dest" && is_package "$dest"; then
			return 0
		fi
		report_bad "$dest"
		return 1
	fi

	for base in $(rel_bases); do
		log "  尝试 $base/$fname"
		if fetch "$base/$fname" "$dest" && is_package "$dest"; then
			return 0
		fi
		report_bad "$dest"
		rm -f "$dest"
	done
	return 1
}

report_bad() {
	local size kind
	[ -s "$1" ] || return 0
	size=$(wc -c < "$1" 2>/dev/null | tr -d ' ')
	kind=$(cat "$1.kind" 2>/dev/null)
	rm -f "$1.kind"
	case "$kind" in
		html) log "  返回的是 HTML 页面（$size 字节）：多半被门户页/代理拦截，或该版本资源已删除" ;;
		*) log "  返回内容校验未通过（$size 字节）" ;;
	esac
}

# ---- 版本比较与在线检查 ----------------------------------------------------
# 只保留版本号里合法的字符，避免把外部内容原样拼进 JSON。
sanitize() { printf '%s' "$1" | tr -cd 'A-Za-z0-9._-'; }

# 3.6.0-r1 -> 0003.0006.0000.0001（定宽，便于字符串比较）
vkey() {
	printf '%s' "$1" | sed 's/[-.rR]/ /g' | awk '{printf "%06d.%06d.%06d.%06d", $1+0, $2+0, $3+0, $4+0}'
}

# ver_newer <a> <b> -> true when a sorts above b. Equality alone is not enough:
# a stale mirror pointer would otherwise let "update" install an older build.
ver_newer() {
	local a b
	a=$(vkey "$1"); b=$(vkey "$2")
	[ "$a" != "$b" ] && [ "$(printf '%s\n%s\n' "$a" "$b" | sort | tail -n1)" = "$a" ]
}

# ver_advance <target> <installed> -> true when the target should replace it.
# A 0.x target also counts: the 3.x line was retired and its release assets
# were deleted, so moving onto the new line is the correct direction even
# though 0.1 sorts below 3.12.
ver_advance() {
	# Never let the retired line overwrite the new one: a stale mirror pointer
	# can still name a 3.x build whose release assets no longer exist.
	if [ "${2%%.*}" = "0" ] && [ "${1%%.*}" != "0" ]; then
		return 1
	fi
	if ver_newer "$1" "$2"; then
		return 0
	fi
	if [ "${1%%.*}" = "0" ] && [ "${2%%.*}" != "0" ]; then
		return 0
	fi
	return 1
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

# ---- 已安装状态探测 --------------------------------------------------------
# 包管理器记录、安装时写下的版本标记、以及实际存在的主题目录，三者任一命中都
# 算"已安装"。只查包管理器会漏掉 tar.gz 文件方式安装的那批机器。
detect_installed() {
	CUR_VER=""
	CUR_HOW="none"

	if have apk; then
		CUR_VER=$(apk info -e -v "$PKG_NAME" 2>/dev/null | head -n1 | sed "s/^${PKG_NAME}-//" || true)
		if [ -n "$CUR_VER" ]; then
			CUR_HOW="apk"
		fi
	fi
	if [ -z "$CUR_VER" ] && have opkg; then
		CUR_VER=$(opkg status "$PKG_NAME" 2>/dev/null | sed -n 's/^Version: //p' | head -n1 || true)
		if [ -n "$CUR_VER" ]; then
			CUR_HOW="opkg"
		fi
	fi
	if [ -z "$CUR_VER" ] && [ -f /usr/share/lucent/version ]; then
		CUR_VER=$(cat /usr/share/lucent/version 2>/dev/null || true)
		CUR_HOW="files"
	elif [ "$CUR_HOW" = "none" ] && [ -d /www/luci-static/lucent ]; then
		# 目录在、版本标记不在：装过但没留下可比较的版本号
		CUR_HOW="files"
	fi
	CUR_VER=$(sanitize "$CUR_VER")
}

installed_desc() {
	if [ "$CUR_HOW" = "none" ]; then
		printf '未安装'
	else
		printf '已安装 %s（%s 方式）' "${CUR_VER:-未知版本}" "$CUR_HOW"
	fi
}

# 有没有能打字的终端？stdin 被管道占走时（`wget -qO- … | sh`），控制终端仍然
# 在 /dev/tty 上；没有控制终端时打开它会立刻失败，不会挂住。
# 全部写成显式 if：脚本开着 set -e，裸的 `[ 条件 ] && …` 在部分 shell 里会
# 直接把脚本带走。
has_tty() {
	if [ -t 0 ]; then
		return 0
	fi
	if ! [ -c /dev/tty ]; then
		return 1
	fi
	if { : </dev/tty; } 2>/dev/null; then
		return 0
	fi
	return 1
}

# 交互确认：结果写进 ANSWER，绝不通过 stdout 返回。
# 用 `ANS=$(ask …)` 的写法会把提示语一起捕获进来（"请选择 [1] 2"），
# case 永远匹配不上 —— 菜单就是这么失效的。提示语走 stderr。
ask() {
	local ans
	if [ ! -t 0 ] && ! has_tty; then
		ANSWER="$2"
		return 0
	fi
	printf '%s [%s] ' "$1" "$2" >&2
	if [ -t 0 ]; then
		read -r ans || ans=""
	else
		read -r ans </dev/tty 2>/dev/null || ans=""
	fi
	[ -n "$ans" ] || ans="$2"
	ANSWER="$ans"
}

get_latest() {
	local f base ptr="" tag
	if have apk; then f="latest-apk.txt"; else f="latest.txt"; fi

	# 自建镜像优先：完全按用户指定的地址，不去碰 GitHub
	if [ -n "$LUCENT_BASE_URL" ]; then
		if fetch "$LUCENT_BASE_URL/$f" "$TMP/latest"; then
			v=$(sed -e 's/.*luci-theme-lucent[-_]//' -e 's/\.apk$//' -e 's/_all\.ipk$//' -e 's/\.ipk$//' "$TMP/latest" | tr -d ' \t\r\n')
			case "$v" in
				[0-9]*) printf '%s' "$v"; mark_via "base-url"; return 0 ;;
			esac
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
		# 门户页/错误页也会是非空文件，解析出来就是一串乱字符；版本号必须
		# 以数字开头，否则当作没拿到
		case "$ptr" in
			[0-9]*) : ;;
			*) ptr="" ;;
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
# 冲突文件到底属于谁。apk 的报错给的是相对路径，逐个反查所属包。
apk_conflict_owners() {
	grep -o 'trying to overwrite [^ ]*' "$1" 2>/dev/null |
	sed 's/^trying to overwrite //' |
	while read -r rel; do
		[ -n "$rel" ] || continue
		apk info -W "/$rel" 2>/dev/null | head -n1
	done | sort -u | tr -d ' \r'
}

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

	# 先说清楚这台机器上到底装了什么，再决定是升级、覆盖还是收工。
	detect_installed
	log "→ 本机状态：$(installed_desc)"
	if [ "$CUR_HOW" != "none" ]; then
		if [ -z "$CUR_VER" ]; then
			log "→ 读不到已安装版本号，按覆盖重装处理"
		elif [ "$CUR_VER" = "$VER" ]; then
			log "→ 已是最新版 $VER，无需改动。要修复式重装请用：LUCENT_FORCE=1 sh install.sh"
			[ "$FORCE" = "1" ] || exit 0
		elif ver_newer "$VER" "$CUR_VER"; then
			log "→ 检测到旧版本 $CUR_VER，线上最新为 $VER，开始在线升级"
		elif [ "${VER%%.*}" = "0" ] && [ "${CUR_VER%%.*}" != "0" ]; then
			# 版本线重置：0.x 是新线的起点，机器上的 3.x 已经停止发布、指向的
			# 资源也已删除，所以这不是降级，切过去才是正确方向。
			log "→ 版本线已重置：本机 $CUR_VER 属于不再发布的 3.x，现在切换到新线 $VER"
		else
			log ""
			log "！本机 $CUR_VER 比线上 $VER 更新，继续会降级，并且装完无法在页面里回退。"
			if [ "$FORCE" != "1" ]; then
				ask "  仍要安装 $VER 吗？(y/N)" "n"
				[ "$ANSWER" = "y" ] || [ "$ANSWER" = "Y" ] || { log "已取消，未改动系统。"; exit 0; }
			fi
		fi
	else
		log "→ 未检测到已安装的主题，执行全新安装"
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
		log "所有地址都无法下载到可用的 $PKGFILE。" >&2
		log "国内网络可尝试：  LUCENT_CN=1 sh install.sh" >&2
		log "或指定镜像：      LUCENT_BASE_URL=https://你的镜像 sh install.sh" >&2
		log "HTTPS 失败时先装证书：  apk add ca-bundle ca-certificates  (或 opkg install ca-bundle)" >&2
		log "也可以直接用最新发布版的引导脚本：wget -qO- https://github.com/$LUCENT_REPO/releases/latest/download/lucent-install.sh | sh" >&2
		exit 1
	fi

	INSTALLED=0
	if have apk; then
		log "→ 使用 apk 安装…"
		if apk add --allow-untrusted --no-network "$TMP/$PKGFILE" >"$TMP/pkg.log" 2>&1; then
			INSTALLED=1; log "  apk: 完成"
		else
			cat "$TMP/pkg.log"
			# 同一条 .lmo 路径可能被两个包声明：本主题包，以及 luci.mk 从
			# po/ 自动生成的 luci-i18n-lucent-zh-cn。apk 不肯覆盖别人拥有的
			# 文件，所以先反查属主 —— 是我们自己的语言包就把它移除后重装，
			# 而不是 --force-overwrite 把那个包的文件跟踪打残。
			OWNERS=$(apk_conflict_owners "$TMP/pkg.log")
			OURS=""
			for o in $OWNERS; do
				case "$o" in
					luci-i18n-lucent*) OURS="$OURS $o" ;;
				esac
			done
			if [ -n "$OURS" ]; then
				log "  冲突文件属于本主题早前的语言包分包：$OURS"
				log "  先移除它再安装…"
				apk del $OURS >"$TMP/pkgdel.log" 2>&1 || cat "$TMP/pkgdel.log"
				if apk add --allow-untrusted --no-network "$TMP/$PKGFILE" >"$TMP/pkg2.log" 2>&1; then
					INSTALLED=1; log "  apk: 完成（已替换旧语言包）"
				else
					cat "$TMP/pkg2.log"
				fi
			elif grep -q 'trying to overwrite' "$TMP/pkg.log" 2>/dev/null; then
				# 属主不是我们的包：多半是文件方式安装留下的无主文件，显式覆盖
				log "  与旧版残留文件冲突，使用 --force-overwrite 重试…"
				if apk add --allow-untrusted --force-overwrite --no-network \
					"$TMP/$PKGFILE" >"$TMP/pkg3.log" 2>&1; then
					INSTALLED=1; log "  apk: 完成（已覆盖旧残留文件）"
				else
					cat "$TMP/pkg3.log"
				fi
			fi
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
	detect_installed
	log "→ 本机状态：$(installed_desc)"
	if [ "$CUR_HOW" = "none" ]; then
		log "→ 没有检测到已安装的 Lucent，仍将清理可能残留的文件与配置。"
	else
		ask "→ 确认卸载并恢复 Bootstrap？(y/N)" "y"
		[ "$ANSWER" = "y" ] || [ "$ANSWER" = "Y" ] || { log "已取消，未做任何改动。"; exit 0; }
	fi
	log "→ 卸载 Lucent…"

	if have apk; then
		if apk info -e "$PKG_NAME" >/dev/null 2>&1; then
			# 有包依赖主题时 apk 会拒绝删除，而本主题早前的语言包分包正是这种
			# 依赖。把它们放进同一次事务，否则包记录会留在数据库里，下次安装又
			# 报文件所有权冲突。
			DEPS=$(apk info -r "$PKG_NAME" 2>/dev/null | cut -d' ' -f1 | grep '^luci-i18n-lucent' || true)
			if [ -n "$DEPS" ]; then
				log "  一并移除依赖主题的语言包：$DEPS"
				apk del $DEPS "$PKG_NAME" >"$TMP/pkg.log" 2>&1 || cat "$TMP/pkg.log"
			else
				apk del "$PKG_NAME" >"$TMP/pkg.log" 2>&1 || cat "$TMP/pkg.log"
			fi
		fi
	elif have opkg; then
		IDEPS=$(opkg list-installed 2>/dev/null | cut -d' ' -f1 | grep '^luci-i18n-lucent' || true)
		if [ -n "$IDEPS" ]; then
			log "  一并移除依赖主题的语言包：$IDEPS"
			opkg remove $IDEPS "$PKG_NAME" >"$TMP/pkg.log" 2>&1 || cat "$TMP/pkg.log"
		else
			opkg remove "$PKG_NAME" >"$TMP/pkg.log" 2>&1 || cat "$TMP/pkg.log"
		fi
	fi

	rm -rf /www/luci-static/lucent /www/luci-static/resources/lucent \
		/www/luci-static/resources/view/lucent /usr/share/ucode/luci/template/themes/lucent \
		/usr/share/lucent
	rm -f /usr/share/luci/menu.d/luci-theme-lucent.json \
		/usr/share/rpcd/acl.d/luci-theme-lucent.json \
		/usr/libexec/rpcd/luci.lucent \
		/etc/uci-defaults/30_luci-theme-lucent /etc/uci-defaults/luci-i18n-lucent-*
	# 语言包还登记在案时不要动它的 .lmo：删掉文件而包还在，下次安装又会撞
	# 文件所有权，而且那个包从此变成空壳。
	OUR_I18N=""
	if have apk; then
		OUR_I18N=$(apk info 2>/dev/null | grep '^luci-i18n-lucent' || true)
	elif have opkg; then
		OUR_I18N=$(opkg list-installed 2>/dev/null | cut -d' ' -f1 | grep '^luci-i18n-lucent' || true)
	fi
	if [ -n "$OUR_I18N" ]; then
		log "→ 语言包仍在数据库中（$OUR_I18N），保留其 .lmo 由包管理器负责"
	else
		rm -f /usr/lib/lua/luci/i18n/lucent*.lmo
	fi
	rm -rf /tmp/lucent-upload /tmp/luci-indexcache* /tmp/luci-modulecache*
	rm -f /tmp/lucent-*.json /tmp/lucent-*.prev /tmp/lucent-*.cur \
		/var/run/lucent-*.pid /var/run/lucent-*.job.sh \
		/tmp/lucent-check.sh /tmp/lucent-update.sh /tmp/lucent-wallpaper.*

	# The daily wallpaper job is written into root's crontab, not into the
	# package, so it survives an uninstall unless we drop it here.
	if [ -w /etc/crontabs/root ]; then
		sed -i '/# lucent-wallpaper/d' /etc/crontabs/root 2>/dev/null || true
		sed -i '/lucent\/wallpaper.sh/d' /etc/crontabs/root 2>/dev/null || true
		/etc/init.d/cron restart >/dev/null 2>&1 || true
	fi

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

	# 收尾自查：还有东西没删掉就明说，不要只报"卸载完成"。
	# 全部用显式 if —— 脚本开着 set -e，裸 `[ -e x ] && …` 会在第一个"本该
	# 不存在"的路径上直接把脚本带走。
	LEFT=""
	for p in /www/luci-static/lucent /www/luci-static/resources/lucent \
		/www/luci-static/resources/view/lucent \
		/usr/share/ucode/luci/template/themes/lucent /usr/share/lucent \
		/usr/share/luci/menu.d/luci-theme-lucent.json \
		/usr/share/rpcd/acl.d/luci-theme-lucent.json \
		/usr/libexec/rpcd/luci.lucent /etc/uci-defaults/30_luci-theme-lucent \
		/etc/config/lucent; do
		if [ -e "$p" ]; then
			LEFT="$LEFT $p"
		fi
	done
	for p in /tmp/lucent-* /var/run/lucent-*; do
		if [ -e "$p" ]; then
			LEFT="$LEFT $p"
		fi
	done
	# 语言包还在册时它的 .lmo 是合法存在的，不算残留
	if [ -z "$OUR_I18N" ]; then
		for p in /usr/lib/lua/luci/i18n/lucent*.lmo; do
			if [ -e "$p" ]; then
				LEFT="$LEFT $p"
			fi
		done
	fi
	if uci -q get luci.themes.Lucent >/dev/null 2>&1; then
		LEFT="$LEFT luci.themes.Lucent"
	fi
	# 包记录没删掉比文件没删掉更坑：下次安装会再次撞上文件所有权冲突。
	if have apk; then
		for p in "$PKG_NAME" $(apk info 2>/dev/null | grep '^luci-i18n-lucent' || true); do
			if apk info -e "$p" >/dev/null 2>&1; then
				LEFT="$LEFT 包记录:$p"
			fi
		done
	elif have opkg; then
		# `opkg status <unknown>` can still exit 0, so read the installed list
		OLIST=$(opkg list-installed 2>/dev/null | cut -d' ' -f1 || true)
		for p in "$PKG_NAME" $(printf '%s\n' "$OLIST" | grep '^luci-i18n-lucent' || true); do
			if printf '%s\n' "$OLIST" | grep -qx "$p"; then
				LEFT="$LEFT 包记录:$p"
			fi
		done
	fi
	if [ -n "$LEFT" ]; then
		log "！卸载未清干净，仍然存在：$LEFT" >&2
		exit 1
	fi

	log "卸载完成，LuCI 已恢复 Bootstrap。"
}

# ---- 状态 ------------------------------------------------------------------
do_status() {
	new_tmp
	detect_installed
	echo "本机状态：$(installed_desc)"
	echo "当前主题：$(uci -q get luci.main.mediaurlbase || echo '未设置')"
	echo "Lucent 注册路径：$(uci -q get luci.themes.Lucent || echo '未注册')"
	echo "中文语言项：$(uci -q get luci.languages.zh_cn || echo '未注册')"
	echo "中文目录文件：$(ls /usr/lib/lua/luci/i18n/lucent*.lmo 2>/dev/null | wc -l) 个"
	if [ "$CUR_HOW" != "none" ]; then
		echo "线上最新：运行 sh install.sh check 可直接比对（会访问 GitHub / 镜像）"
	fi
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
	elif ver_advance "$LATEST" "$CURRENT"; then
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
	if [ -n "$CURRENT" ] && ! ver_advance "$LATEST" "$CURRENT"; then
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

# ---- 交互菜单 --------------------------------------------------------------
# 只在真正连着终端时出现：`wget -qO- … | sh` 的 stdin 就是脚本本身，这里一旦
# read，就会把后面还没执行的脚本内容当成输入吃掉。
menu() {
	detect_installed
	cat <<EOF

  Lucent 3 一键脚本    脚本版本 $VER
  本机状态：$(installed_desc)

    1) 安装 / 升级到最新版
    2) 卸载主题并恢复 Bootstrap
    0) 退出
EOF
	ask "  请选择" "1"
	case "$ANSWER" in
		1) do_install ;;
		2) do_uninstall ;;
		0) echo "已退出，未做任何改动。" ;;
		*) echo "没听懂，按退出处理。" ;;
	esac
}

if [ -z "$ACTION" ]; then
	if has_tty; then
		menu
	else
		# 真的没有终端（CI、cron、批量刷机）：保持全自动，直接装
		do_install
	fi
else
	case "$ACTION" in
		install) do_install ;;
		check) do_check ;;
		update) do_update ;;
		uninstall) do_uninstall ;;
		status) do_status ;;
	esac
fi
