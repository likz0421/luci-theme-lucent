#!/bin/sh
# Lucent 3 — manual installer for the extracted source tree or tar.gz.
# Run from this directory:
#   ./install.sh
# This is the fallback for images without apk/opkg. Prefer the .apk or .ipk.

set -e

DIR=$(cd "$(dirname "$0")" && pwd)

[ -f /etc/openwrt_release ] || { echo "This is not an OpenWrt system." >&2; exit 1; }
[ -d /usr/share/ucode/luci ] || { echo "ucode based LuCI (OpenWrt 23.05+) is required." >&2; exit 1; }
[ -d "$DIR/htdocs" ] && [ -d "$DIR/ucode" ] && [ -d "$DIR/root" ] || {
	echo "Run this script from the extracted Lucent source directory." >&2
	exit 1
}

echo "Installing Lucent 3…"

if [ -f /etc/config/lucent ]; then
	cp /etc/config/lucent /tmp/lucent-config.$$
fi

cp -R "$DIR/htdocs/." /www/
mkdir -p /usr/share/ucode/luci
cp -R "$DIR/ucode/." /usr/share/ucode/luci/
cp -R "$DIR/root/." /
mkdir -p /usr/share/lucent
# Record the installed version (from the bundled installer's baked default) so
# the in-page updater can report the current version without a package record.
LV=$(sed -n 's/^LUCENT_VERSION_DEFAULT="\([^"]*\)".*/\1/p' /usr/share/lucent/install.sh 2>/dev/null | head -n1)
[ -n "$LV" ] && printf '%s\n' "$LV" > /usr/share/lucent/version
mkdir -p /usr/lib/lua/luci/i18n
if [ -d "$DIR/i18n" ]; then
	cp "$DIR"/i18n/*.lmo /usr/lib/lua/luci/i18n/ 2>/dev/null || true
fi

if [ -f /tmp/lucent-config.$$ ]; then
	cp /tmp/lucent-config.$$ /etc/config/lucent
	rm -f /tmp/lucent-config.$$
else
	cp "$DIR/root/etc/config/lucent" /etc/config/lucent
fi

chmod 755 /etc/uci-defaults/30_luci-theme-lucent
chmod 755 /usr/libexec/rpcd/luci.lucent
mkdir -p /www/luci-static/lucent/media/image
mkdir -p /www/luci-static/lucent/media/video
mkdir -p /www/luci-static/lucent/media/icon
mkdir -p /www/luci-static/lucent/media/wallpaper

( cd /etc/uci-defaults && . ./30_luci-theme-lucent ) || true
rm -f /etc/uci-defaults/30_luci-theme-lucent

/etc/init.d/rpcd reload >/dev/null 2>&1 || true
rm -rf /tmp/luci-indexcache* /tmp/luci-modulecache/

echo "Done. Reload the router page and choose Lucent under System → System → Language and Style."
