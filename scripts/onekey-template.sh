#!/bin/sh
# Lucent 3 — 一键安装 / 卸载脚本（安装数据已内嵌，主题安装本身无需联网）
#
# 用法：
#   sh lucent-onekey-install.sh install     安装或升级（默认）
#   sh lucent-onekey-install.sh uninstall   卸载并恢复 Bootstrap
#   sh lucent-onekey-install.sh status      查看当前状态
#
# 支持 OpenWrt 23.05+（opkg）和 25.12+（apk）。安装时会检查 OpenWrt 的
# LuCI 界面；若系统缺少 LuCI，会尝试从路由器已配置的软件源安装 luci。

set -e

VER="__VER__"
PKG_NAME="luci-theme-lucent"

usage() {
	cat <<'EOF'
Lucent 3 一键脚本

  sh lucent-onekey-install.sh install     安装或升级主题（默认）
  sh lucent-onekey-install.sh uninstall   卸载主题并恢复 Bootstrap
  sh lucent-onekey-install.sh status      查看安装状态

说明：
  - 主题文件已内嵌，安装主题本身不需要联网。
  - 若路由器缺少 OpenWrt LuCI，脚本会尝试安装 luci / luci-base，
    这一步需要路由器能够访问已配置的软件源。
  - 浏览器为中文时会自动显示中文；也可强制：
      uci set luci.main.lang=zh_cn && uci commit luci
EOF
}

ACTION="${1:-install}"
case "$ACTION" in
	install|uninstall|status) ;;
	-h|--help|help) usage; exit 0 ;;
	*)
		echo "未知操作：$ACTION" >&2
		usage >&2
		exit 1
		;;
esac

[ "$(id -u)" = "0" ] || { echo "请使用 root 运行：sh $0 $ACTION" >&2; exit 1; }
[ -f /etc/openwrt_release ] || { echo "这不是 OpenWrt 系统。" >&2; exit 1; }

TMP=$(mktemp -d /tmp/lucent-install.XXXXXX) || exit 1
trap 'rm -rf "$TMP"' EXIT INT TERM

ensure_luci() {
	if [ -d /usr/share/ucode/luci ]; then
		return 0
	fi

	echo "→ 未检测到 OpenWrt LuCI，尝试安装 luci 界面…"
	if command -v apk >/dev/null 2>&1; then
		if apk add luci >"$TMP/luci.log" 2>&1 ||
		   apk add luci-base >>"$TMP/luci.log" 2>&1; then
			if [ -d /usr/share/ucode/luci ]; then
				echo "  LuCI: 完成"
				return 0
			fi
		fi
	elif command -v opkg >/dev/null 2>&1; then
		opkg update >/dev/null 2>&1 || true
		if opkg install luci >"$TMP/luci.log" 2>&1 ||
		   opkg install luci-base >>"$TMP/luci.log" 2>&1; then
			if [ -d /usr/share/ucode/luci ]; then
				echo "  LuCI: 完成"
				return 0
			fi
		fi
	fi

	[ -s "$TMP/luci.log" ] && cat "$TMP/luci.log"
	echo "无法自动安装 LuCI。请确认路由器可访问软件源，或先手动安装 luci。" >&2
	return 1
}

decode_payload() {
	echo "→ 解压安装数据…"
	cat > "$TMP/payload.b64" <<'__LUCENT_PAYLOAD__'
__PAYLOAD__
__LUCENT_PAYLOAD__

	if command -v base64 >/dev/null 2>&1; then
		base64 -d "$TMP/payload.b64" > "$TMP/payload.tar.gz"
	elif command -v ucode >/dev/null 2>&1; then
		B64="$TMP/payload.b64" OUT="$TMP/payload.tar.gz" ucode -e \
			'import * as fs from "fs"; fs.writefile(getenv("OUT"), b64dec(fs.readfile(getenv("B64"))));'
	else
		echo "缺少 base64 或 ucode，无法解压安装数据。" >&2
		return 1
	fi

	rm -f "$TMP/payload.b64"
	[ -s "$TMP/payload.tar.gz" ] || { echo "安装数据解码失败。" >&2; return 1; }
	tar -xzf "$TMP/payload.tar.gz" -C "$TMP" || { echo "安装数据损坏。" >&2; return 1; }
}

activate_theme() {
	uci -q get luci.themes.Lucent >/dev/null 2>&1 || \
		uci -q set luci.themes.Lucent=/luci-static/lucent

	case "$(uci -q get luci.main.mediaurlbase)" in
		''|/luci-static/bootstrap|/luci-static/bootstrap-dark|/luci-static/bootstrap-light)
			uci -q set luci.main.mediaurlbase=/luci-static/lucent
			;;
	esac

	uci -q get luci.languages.zh_cn >/dev/null 2>&1 || \
		uci -q set luci.languages.zh_cn='简体中文 (Simplified Chinese)'
	uci -q commit luci
}

do_install() {
	ensure_luci || exit 1
	decode_payload || exit 1

	INSTALLED=0

	if command -v apk >/dev/null 2>&1; then
		echo "→ 使用 apk 安装…"
		if apk add --allow-untrusted --no-network \
			"$TMP/$PKG_NAME-$VER.apk" >"$TMP/pkg.log" 2>&1; then
			INSTALLED=1
			echo "  apk: 完成"
		else
			cat "$TMP/pkg.log"
		fi
	elif command -v opkg >/dev/null 2>&1; then
		echo "→ 使用 opkg 安装…"
		if opkg install "$TMP/${PKG_NAME}_${VER}_all.ipk" >"$TMP/pkg.log" 2>&1; then
			INSTALLED=1
			echo "  opkg: 完成"
		else
			cat "$TMP/pkg.log"
		fi
	fi

	if [ "$INSTALLED" != "1" ]; then
		echo "→ 软件包安装未成功，改用文件方式…"
		if [ -f /etc/config/lucent ]; then
			cp /etc/config/lucent "$TMP/lucent.conf"
		fi

		cp -R "$TMP/files/htdocs/." /www/
		mkdir -p /usr/share/ucode/luci
		cp -R "$TMP/files/ucode/." /usr/share/ucode/luci/
		cp -R "$TMP/files/root/usr/." /usr/
		mkdir -p /etc/uci-defaults
		cp "$TMP/files/root/etc/uci-defaults/30_luci-theme-lucent" /etc/uci-defaults/
		mkdir -p /usr/lib/lua/luci/i18n
		cp "$TMP/files/i18n/"*.lmo /usr/lib/lua/luci/i18n/

		if [ -f "$TMP/lucent.conf" ]; then
			cp "$TMP/lucent.conf" /etc/config/lucent
		else
			cp "$TMP/files/root/etc/config/lucent" /etc/config/lucent
		fi

		chmod 755 /etc/uci-defaults/30_luci-theme-lucent /usr/libexec/rpcd/luci.lucent
		mkdir -p /www/luci-static/lucent/media/image /www/luci-static/lucent/media/video \
			/www/luci-static/lucent/media/icon /www/luci-static/lucent/media/wallpaper
		chmod 755 /www/luci-static/lucent/media /www/luci-static/lucent/media/*
		( cd /etc/uci-defaults && . ./30_luci-theme-lucent ) || true
		rm -f /etc/uci-defaults/30_luci-theme-lucent
	fi

	activate_theme

	rm -rf /tmp/luci-indexcache* /tmp/luci-modulecache/ /tmp/lucent-upload
	/etc/init.d/rpcd reload >/dev/null 2>&1 || true
	/etc/init.d/uhttpd restart >/dev/null 2>&1 || true

	echo ""
	echo "完成。打开 http://$(uci -q get network.lan.ipaddr | cut -d/ -f1) 并登录。"
	echo "浏览器为中文时会自动显示中文；也可以强制切换："
	echo "  uci set luci.main.lang=zh_cn && uci commit luci"
	echo "  切回英文：uci set luci.main.lang=en && uci commit luci"
	echo "卸载：sh $0 uninstall"
}

do_uninstall() {
	echo "→ 卸载 Lucent…"

	if command -v apk >/dev/null 2>&1; then
		if apk info -e "$PKG_NAME" >/dev/null 2>&1; then
			apk del "$PKG_NAME" >"$TMP/pkg.log" 2>&1 || cat "$TMP/pkg.log"
		fi
	elif command -v opkg >/dev/null 2>&1; then
		opkg remove "$PKG_NAME" >"$TMP/pkg.log" 2>&1 || cat "$TMP/pkg.log"
	fi

	rm -rf /www/luci-static/lucent
	rm -rf /www/luci-static/resources/lucent
	rm -rf /www/luci-static/resources/view/lucent
	rm -rf /usr/share/ucode/luci/template/themes/lucent
	rm -f /usr/share/luci/menu.d/luci-theme-lucent.json
	rm -f /usr/share/rpcd/acl.d/luci-theme-lucent.json
	rm -f /usr/libexec/rpcd/luci.lucent
	rm -f /usr/lib/lua/luci/i18n/lucent.zh-cn.lmo
	rm -f /usr/lib/lua/luci/i18n/lucent-zh-*.zh-cn.lmo
	rm -f /etc/uci-defaults/30_luci-theme-lucent
	rm -rf /tmp/lucent-upload /tmp/luci-indexcache* /tmp/luci-modulecache*
	rm -f /tmp/lucent-*.json /tmp/lucent-*.prev /tmp/lucent-*.cur \
		/var/run/lucent-*.pid /var/run/lucent-*.job.sh \
		/tmp/lucent-check.sh /tmp/lucent-update.sh

	# The daily wallpaper job lives in root's crontab, not in the package.
	if [ -w /etc/crontabs/root ]; then
		sed -i '/# lucent-wallpaper/d' /etc/crontabs/root 2>/dev/null || true
		/etc/init.d/cron restart >/dev/null 2>&1 || true
	fi

	uci -q delete luci.themes.Lucent || true
	if [ "$(uci -q get luci.main.mediaurlbase)" = "/luci-static/lucent" ]; then
		uci -q set luci.main.mediaurlbase=/luci-static/bootstrap
	fi

	if ! ls /usr/lib/lua/luci/i18n/*.zh-cn.lmo >/dev/null 2>&1; then
		uci -q delete luci.languages.zh_cn || true
	fi

	uci -q delete lucent || true
	uci -q commit luci || true
	rm -f /etc/config/lucent

	/etc/init.d/rpcd reload >/dev/null 2>&1 || true
	/etc/init.d/uhttpd restart >/dev/null 2>&1 || true

	echo "卸载完成，LuCI 已恢复 Bootstrap。"
}

do_status() {
	PKG_STATE="未安装"

	if command -v apk >/dev/null 2>&1; then
		if apk info -e "$PKG_NAME" >/dev/null 2>&1; then
			PKG_STATE="$(apk info -e -v "$PKG_NAME" 2>/dev/null | head -n1 || echo '已安装')"
		fi
	elif command -v opkg >/dev/null 2>&1; then
		OPKG_VER="$(opkg status "$PKG_NAME" 2>/dev/null | sed -n 's/^Version: //p')"
		[ -n "$OPKG_VER" ] && PKG_STATE="$PKG_NAME $OPKG_VER"
	fi

	echo "软件包：$PKG_STATE"
	echo "当前主题：$(uci -q get luci.main.mediaurlbase || echo '未设置')"
	echo "Lucent 注册路径：$(uci -q get luci.themes.Lucent || echo '未注册')"
	echo "中文语言项：$(uci -q get luci.languages.zh_cn || echo '未注册')"
	echo "中文目录文件：$(ls /usr/lib/lua/luci/i18n/lucent*.lmo 2>/dev/null | wc -l) 个"
}

case "$ACTION" in
	install) do_install ;;
	uninstall) do_uninstall ;;
	status) do_status ;;
esac
