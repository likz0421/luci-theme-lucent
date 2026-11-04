#!/usr/bin/env bash
# Build dist/luci-theme-lucent-<version>.apk for OpenWrt 25.12+ (apk 3).
# Requires apk-tools 3 with the `mkpkg` subcommand:
#   APK_BIN=/path/to/apk.static ./scripts/build-apk.sh
set -euo pipefail
cd "$(dirname "$0")/.."

VER=$(sed -n 's/^PKG_VERSION:=//p' Makefile)-r$(sed -n 's/^PKG_RELEASE:=//p' Makefile)
APK_BIN=${APK_BIN:-}
if [ -z "$APK_BIN" ]; then
	APK_BIN=$(command -v apk 2>/dev/null || true)
fi
if [ -z "$APK_BIN" ] || [ ! -x "$APK_BIN" ]; then
	echo "apk-tools 3 is required (the 'mkpkg' subcommand)." >&2
	echo "Set APK_BIN, e.g. APK_BIN=/usr/libexec/apk/apk.static $0" >&2
	exit 1
fi

NAME=luci-theme-lucent
OUT=dist/${NAME}-${VER}.apk
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
export COPYFILE_DISABLE=1

D=$TMP/data
S=$TMP/scripts
mkdir -p "$D/www" "$D/usr/share/ucode/luci" "$D/usr/lib/lua/luci/i18n" "$D/lib/apk/packages" "$S"
cp -R htdocs/. "$D/www/"
cp -R ucode/. "$D/usr/share/ucode/luci/"
cp -R root/. "$D/"
cp i18n/*.lmo "$D/usr/lib/lua/luci/i18n/"
mkdir -p "$D/usr/share/lucent"
cp install.sh "$D/usr/share/lucent/install.sh"
printf '%s\n' "$VER" > "$D/usr/share/lucent/version"
find "$D" -name .DS_Store -delete
find "$D" -type d -exec chmod 755 {} +
find "$D" -type f -exec chmod 644 {} +
chmod 755 "$D"/etc/uci-defaults/*
chmod 755 "$D"/usr/libexec/rpcd/luci.lucent
chmod 755 "$D"/usr/share/lucent/install.sh

printf '/etc/config/lucent\n' > "$D/lib/apk/packages/$NAME.conffiles"
CS=$(sha256sum "$D/etc/config/lucent" | cut -d' ' -f1)
printf '/etc/config/lucent %s\n' "$CS" > "$D/lib/apk/packages/$NAME.conffiles_static"
(cd "$D" && find . \( -type f -o -type l \) -not -path './lib/apk/packages/*.list' | sed 's|^\./|/|' | sort > "$D/lib/apk/packages/$NAME.list")

cat > "$S/post-install" <<'SH'
#!/bin/sh
[ "${IPKG_NO_SCRIPT}" = "1" ] && exit 0
[ -s "${IPKG_INSTROOT}/lib/functions.sh" ] || exit 0
. ${IPKG_INSTROOT}/lib/functions.sh
export root="${IPKG_INSTROOT}"
export pkgname="luci-theme-lucent"
default_postinst
[ -n "${IPKG_INSTROOT}" ] || {
	rm -rf /tmp/luci-indexcache* /tmp/luci-modulecache/
	/etc/init.d/rpcd reload >/dev/null 2>&1
}
exit 0
SH

cat > "$S/pre-deinstall" <<'SH'
#!/bin/sh
[ -s "${IPKG_INSTROOT}/lib/functions.sh" ] || exit 0
. ${IPKG_INSTROOT}/lib/functions.sh
export root="${IPKG_INSTROOT}"
export pkgname="luci-theme-lucent"
default_prerm
exit 0
SH

cat > "$S/post-deinstall" <<'SH'
#!/bin/sh
[ -n "${IPKG_INSTROOT}" ] || {
	uci -q delete luci.themes.Lucent
	[ "$(uci -q get luci.main.mediaurlbase)" = "/luci-static/lucent" ] && \
		uci -q set luci.main.mediaurlbase=/luci-static/bootstrap
	uci commit luci
	rm -rf /www/luci-static/lucent /tmp/lucent-upload
	rm -rf /tmp/luci-indexcache* /tmp/luci-modulecache/
	/etc/init.d/rpcd reload >/dev/null 2>&1
}
exit 0
SH

{ sed -n '1p' "$S/post-install"; echo 'export PKG_UPGRADE=1'; sed '1d' "$S/post-install"; } > "$S/post-upgrade"
chmod 755 "$S"/*

mkdir -p dist
"$APK_BIN" mkpkg \
	--info "name:$NAME" \
	--info "version:$VER" \
	--info "description:Lucent 3 — an independent LuCI theme with a dashboard, glassmorphism, a validated media library and an allow-listed package installer." \
	--info "arch:noarch" \
	--info "license:Apache-2.0" \
	--info "origin:$NAME" \
	--info "url:https://github.com/likz0421/luci-theme-lucent" \
	--info "maintainer:likz0421" \
	--info "depends:luci-base" \
	--info "depends:rpcd-mod-file" \
	--info "tags:openwrt:section=luci" \
	--script "post-install:$S/post-install" \
	--script "post-upgrade:$S/post-upgrade" \
	--script "pre-deinstall:$S/pre-deinstall" \
	--script "post-deinstall:$S/post-deinstall" \
	--files "$D" \
	--output "$OUT"

printf '%s\n' "$(basename "$OUT")" > dist/latest-apk.txt
echo "$OUT ($(wc -c < "$OUT" | tr -d ' ') bytes)"
