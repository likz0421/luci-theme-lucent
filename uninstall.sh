#!/bin/sh
# Remove a manually installed Lucent 3 and switch LuCI back to Bootstrap.
#   ./uninstall.sh                remove everything, including /etc/config/lucent
#   KEEP_CONFIG=1 ./uninstall.sh  keep /etc/config/lucent (your palette choices)
#
# Uninstalling goes through the package manager first when the theme was
# installed as a package, so the database entry and the conffile disappear
# too; then every path the theme is known to touch is cleaned by hand, which
# is what a file-copy (tar.gz) install needs.

set -e

PKG=luci-theme-lucent

# ---- 1. package record -----------------------------------------------------
if command -v apk >/dev/null 2>&1 && apk info -e "$PKG" >/dev/null 2>&1; then
	echo "→ apk remove $PKG"
	apk del "$PKG" >/dev/null 2>&1 || true
elif command -v opkg >/dev/null 2>&1 && opkg status "$PKG" >/dev/null 2>&1; then
	echo "→ opkg remove $PKG"
	opkg remove "$PKG" >/dev/null 2>&1 || true
fi

# ---- 2. files --------------------------------------------------------------
rm -rf /www/luci-static/lucent
rm -rf /www/luci-static/resources/lucent
rm -rf /www/luci-static/resources/view/lucent
rm -rf /usr/share/ucode/luci/template/themes/lucent
rm -rf /usr/share/lucent
rm -f /usr/share/luci/menu.d/luci-theme-lucent.json
rm -f /usr/share/rpcd/acl.d/luci-theme-lucent.json
rm -f /usr/libexec/rpcd/luci.lucent
# every locale the theme ships, not just the zh-cn names we happen have today
rm -f /usr/lib/lua/luci/i18n/lucent*.lmo
rm -f /etc/uci-defaults/30_luci-theme-lucent

if [ "${KEEP_CONFIG:-0}" != "1" ]; then
	rm -f /etc/config/lucent
fi

# ---- 3. uci ---------------------------------------------------------------
uci -q delete luci.themes.Lucent || true
if [ "$(uci -q get luci.main.mediaurlbase)" = "/luci-static/lucent" ]; then
	uci -q set luci.main.mediaurlbase=/luci-static/bootstrap
fi
# the zh label was added for this theme's translations; drop it only when no
# other Chinese catalogue is left, otherwise another theme loses its language
ls /usr/lib/lua/luci/i18n/*.zh-cn.lmo >/dev/null 2>&1 || uci -q delete luci.languages.zh_cn || true
uci -q delete lucent.main 2>/dev/null || true
uci -q commit luci || true

# ---- 4. cron --------------------------------------------------------------
# The daily wallpaper job lives in root's crontab, not in the package, so it
# has to be removed by hand or cron keeps calling a deleted script forever.
if [ -w /etc/crontabs/root ]; then
	sed -i '/# lucent-wallpaper/d' /etc/crontabs/root 2>/dev/null || true
	sed -i '/lucent\/wallpaper.sh/d' /etc/crontabs/root 2>/dev/null || true
	/etc/init.d/cron restart >/dev/null 2>&1 || true
fi

# ---- 5. runtime caches ----------------------------------------------------
rm -rf /tmp/luci-indexcache* /tmp/luci-modulecache* /tmp/lucent-upload
rm -f /tmp/lucent-*.json /tmp/lucent-*.prev /tmp/lucent-*.cur
rm -f /tmp/lucent-check.sh /tmp/lucent-update.sh /tmp/lucent-wallpaper.*
rm -f /var/run/lucent-*.pid /var/run/lucent-*.job.sh
/etc/init.d/rpcd reload >/dev/null 2>&1 || true
/etc/init.d/uhttpd restart >/dev/null 2>&1 || true

# ---- 6. self-audit --------------------------------------------------------
# Anything still here means the removal missed a path, so say so loudly
# instead of claiming success. Explicit `if` everywhere: the script runs with
# set -e, and a bare `[ -e x ] && …` would abort the audit on the first path
# that is (correctly) missing.
LEFT=""
for p in /www/luci-static/lucent \
	/www/luci-static/resources/lucent \
	/www/luci-static/resources/view/lucent \
	/usr/share/ucode/luci/template/themes/lucent \
	/usr/share/lucent \
	/usr/share/luci/menu.d/luci-theme-lucent.json \
	/usr/share/rpcd/acl.d/luci-theme-lucent.json \
	/usr/libexec/rpcd/luci.lucent \
	/etc/uci-defaults/30_luci-theme-lucent \
	/etc/config/lucent; do
	if [ -e "$p" ]; then
		LEFT="$LEFT $p"
	fi
done
for p in /usr/lib/lua/luci/i18n/lucent*.lmo /tmp/lucent-* /var/run/lucent-*; do
	if [ -e "$p" ]; then
		LEFT="$LEFT $p"
	fi
done
if uci -q get luci.themes.Lucent >/dev/null 2>&1; then
	LEFT="$LEFT luci.themes.Lucent"
fi
if [ "$(uci -q get luci.main.mediaurlbase)" = "/luci-static/lucent" ]; then
	LEFT="$LEFT mediaurlbase"
fi

if [ -n "$LEFT" ]; then
	echo "Lucent 3 removed, but these are still present:$LEFT" >&2
	exit 1
fi

echo "Lucent 3 removed. LuCI is back on Bootstrap."
