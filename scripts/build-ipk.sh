#!/usr/bin/env bash
# Build dist/luci-theme-lucent_<version>_all.ipk without an OpenWrt SDK.
# The result is a standard opkg package (tar.gz flavour, like ipkg-build).
set -euo pipefail
cd "$(dirname "$0")/.."

VER=$(sed -n 's/^PKG_VERSION:=//p' Makefile)-r$(sed -n 's/^PKG_RELEASE:=//p' Makefile)
NAME=luci-theme-lucent
OUT=dist/${NAME}_${VER}_all.ipk
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
export COPYFILE_DISABLE=1

TAR=tar; command -v gtar >/dev/null && TAR=gtar
own() { if $TAR --version | grep -q GNU; then echo "--format=gnu --owner=0 --group=0 --numeric-owner"; else echo "--format ustar --no-xattrs --no-mac-metadata --uid 0 --gid 0 --uname root --gname root"; fi; }

D=$TMP/data
mkdir -p "$D/www" "$D/usr/share/ucode/luci" "$D/usr/lib/lua/luci/i18n"
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
SIZE=$(find "$D" -type f -printf '%s\n' | awk '{ s += $1 } END { print s + 0 }')

C=$TMP/control
mkdir -p "$C"
cat > "$C/control" <<CTL
Package: $NAME
Version: $VER
Depends: libc, luci-base, rpcd-mod-file
Source: https://github.com/likz0421/luci-theme-lucent
SourceName: $NAME
License: Apache-2.0
Section: luci
URL: https://github.com/likz0421/luci-theme-lucent
Maintainer: likz0421
Architecture: all
Installed-Size: $SIZE
Description: Lucent 3 — an independent LuCI theme with a dashboard, five palettes,
 light/dark/auto modes, configurable glassmorphism, a device list, a media
 library with validated uploads, online wallpapers and an allow-listed
 package installer. Written from scratch for ucode LuCI; not a fork of
 luci-theme-7dollar.
CTL
echo /etc/config/lucent > "$C/conffiles"
cat > "$C/postinst" <<'SH'
#!/bin/sh
[ "${IPKG_NO_SCRIPT}" = "1" ] && exit 0
[ -s ${IPKG_INSTROOT}/lib/functions.sh ] || exit 0
. ${IPKG_INSTROOT}/lib/functions.sh
default_postinst $0 $@
[ -n "${IPKG_INSTROOT}" ] || {
	rm -rf /tmp/luci-indexcache* /tmp/luci-modulecache/
	/etc/init.d/rpcd reload >/dev/null 2>&1
}
exit 0
SH
cat > "$C/prerm" <<'SH'
#!/bin/sh
[ -s ${IPKG_INSTROOT}/lib/functions.sh ] || exit 0
. ${IPKG_INSTROOT}/lib/functions.sh
default_prerm $0 $@
SH
cat > "$C/postrm" <<'SH'
#!/bin/sh
# opkg runs the OLD package's postrm with "upgrade" after unpacking the new
# files. Without this guard an upgrade deletes the theme it just installed and
# resets mediaurlbase to bootstrap: "update complete", blank LuCI, no updater.
[ "$1" = "remove" ] || [ "$1" = "deconfigure" ] || exit 0
[ -n "${IPKG_INSTROOT}" ] || {
	uci -q delete luci.themes.Lucent
	[ "$(uci -q get luci.main.mediaurlbase)" = "/luci-static/lucent" ] && \
		uci -q set luci.main.mediaurlbase=/luci-static/bootstrap
	# the zh label only helps while some zh catalogue exists
	ls /usr/lib/lua/luci/i18n/*.zh-cn.lmo >/dev/null 2>&1 || uci -q delete luci.languages.zh_cn
	uci commit luci
	rm -rf /www/luci-static/lucent /tmp/lucent-upload
	rm -rf /tmp/luci-indexcache* /tmp/luci-modulecache/
	# things the package manifest never knew about: the fetched wallpapers,
	# the daily cron line, helper caches and job pid files
	rm -rf /usr/share/lucent
	rm -f /etc/config/lucent
	rm -f /tmp/lucent-*.json /tmp/lucent-*.prev /tmp/lucent-*.cur \
		/var/run/lucent-*.json /var/run/lucent-*.prev /var/run/lucent-*.cur /var/run/lucent-*.txt /var/run/lucent-*.traffic \
		/tmp/lucent-check.sh /tmp/lucent-update.sh /tmp/lucent-wallpaper.* \
		/var/run/lucent-*.pid /var/run/lucent-*.job.sh
	if [ -w /etc/crontabs/root ]; then
		sed -i '/# lucent-wallpaper/d' /etc/crontabs/root 2>/dev/null
		sed -i '/lucent\/wallpaper.sh/d' /etc/crontabs/root 2>/dev/null
		/etc/init.d/cron restart >/dev/null 2>&1
	fi
	/etc/init.d/rpcd reload >/dev/null 2>&1
}
exit 0
SH
chmod 644 "$C/control" "$C/conffiles"; chmod 755 "$C/postinst" "$C/prerm" "$C/postrm"
echo "2.0" > "$TMP/debian-binary"

( cd "$D" && $TAR $(own) -czf "$TMP/data.tar.gz" . )
( cd "$C" && $TAR $(own) -czf "$TMP/control.tar.gz" . )
mkdir -p dist
( cd "$TMP" && $TAR $(own) -czf pkg.tar.gz ./debian-binary ./data.tar.gz ./control.tar.gz )
mv "$TMP/pkg.tar.gz" "$OUT"
basename "$OUT" > dist/latest.txt
echo "$OUT ($(wc -c < "$OUT" | tr -d ' ') bytes)"
