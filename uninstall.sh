#!/bin/sh
# Remove a manually installed Lucent 3 and switch LuCI back to Bootstrap.
#   ./uninstall.sh            remove theme files, media and /etc/config/lucent
#   KEEP_CONFIG=1 ./uninstall.sh   keep /etc/config/lucent

set -e

rm -rf /www/luci-static/lucent
rm -rf /www/luci-static/resources/lucent
rm -rf /www/luci-static/resources/view/lucent
rm -rf /usr/share/ucode/luci/template/themes/lucent
rm -rf /usr/share/lucent
rm -f /usr/share/luci/menu.d/luci-theme-lucent.json
rm -f /usr/share/rpcd/acl.d/luci-theme-lucent.json
rm -f /usr/libexec/rpcd/luci.lucent
rm -f /usr/lib/lua/luci/i18n/lucent.zh-cn.lmo /usr/lib/lua/luci/i18n/lucent-zh-*.zh-cn.lmo
rm -f /etc/uci-defaults/30_luci-theme-lucent

if [ "${KEEP_CONFIG:-0}" != "1" ]; then
	rm -f /etc/config/lucent
fi

uci -q delete luci.themes.Lucent || true
if [ "$(uci -q get luci.main.mediaurlbase)" = "/luci-static/lucent" ]; then
	uci -q set luci.main.mediaurlbase=/luci-static/bootstrap
fi
uci -q commit luci || true

# The daily wallpaper job lives in root's crontab, not in the package, so it
# has to be removed by hand or cron keeps calling a deleted script forever.
if [ -w /etc/crontabs/root ]; then
	sed -i '/# lucent-wallpaper/d' /etc/crontabs/root 2>/dev/null || true
	/etc/init.d/cron restart >/dev/null 2>&1 || true
fi

/etc/init.d/rpcd reload >/dev/null 2>&1 || true
rm -rf /tmp/luci-indexcache* /tmp/luci-modulecache* /tmp/lucent-upload
rm -f /tmp/lucent-*.json /tmp/lucent-*.prev /tmp/lucent-*.cur
rm -f /var/run/lucent-*.pid /var/run/lucent-*.job.sh /tmp/lucent-check.sh /tmp/lucent-update.sh

echo "Lucent 3 removed. LuCI is back on Bootstrap."
