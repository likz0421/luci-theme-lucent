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
# A language sub-package depends on the theme, and apk then refuses to remove
# it, leaving the record behind — which makes the next install trip over file
# ownership again. Drop our own dependents in the same transaction.
if command -v apk >/dev/null 2>&1 && apk info -e "$PKG" >/dev/null 2>&1; then
	DEPS=$(apk info -r "$PKG" 2>/dev/null | cut -d' ' -f1 | grep '^luci-i18n-lucent' || true)
	if [ -n "$DEPS" ]; then
		echo "→ apk del $DEPS $PKG（语言包分包依赖主题）"
		apk del $DEPS "$PKG" >/dev/null 2>&1 || true
	else
		echo "→ apk del $PKG"
		apk del "$PKG" >/dev/null 2>&1 || true
	fi
elif command -v opkg >/dev/null 2>&1 && opkg status "$PKG" >/dev/null 2>&1; then
	DEPS=$(opkg list-installed 2>/dev/null | cut -d' ' -f1 | grep '^luci-i18n-lucent' || true)
	if [ -n "$DEPS" ]; then
		echo "→ opkg remove $DEPS $PKG"
		opkg remove $DEPS "$PKG" >/dev/null 2>&1 || true
	else
		echo "→ opkg remove $PKG"
		opkg remove "$PKG" >/dev/null 2>&1 || true
	fi
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
# Every locale the theme ships. But if a luci-i18n-lucent-* package is still
# registered, those files belong to it — deleting them would leave a live
# package with nothing installed, which is how the "uninstalled but still
# broken" state was created in the first place.
OUR_I18N=""
if command -v apk >/dev/null 2>&1; then
	OUR_I18N=$(apk info 2>/dev/null | grep '^luci-i18n-lucent' || true)
elif command -v opkg >/dev/null 2>&1; then
	OUR_I18N=$(opkg list-installed 2>/dev/null | cut -d' ' -f1 | grep '^luci-i18n-lucent' || true)
fi
if [ -n "$OUR_I18N" ]; then
	echo "→ 语言包仍在数据库中（$OUR_I18N），保留它的 .lmo，交给包管理器处理"
else
	rm -f /usr/lib/lua/luci/i18n/lucent*.lmo
fi
rm -f /etc/uci-defaults/30_luci-theme-lucent /etc/uci-defaults/luci-i18n-lucent-*

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
if [ "$(uci -q get luci.main.mediaurlbase)" = "/luci-static/lucent" ]; then
	LEFT="$LEFT mediaurlbase"
fi
# a surviving package record is worse than a surviving file: the next install
# trips over file ownership again
if command -v apk >/dev/null 2>&1; then
	for p in "$PKG" $(apk info 2>/dev/null | grep '^luci-i18n-lucent' || true); do
		if apk info -e "$p" >/dev/null 2>&1; then
			LEFT="$LEFT 包记录:$p"
		fi
	done
elif command -v opkg >/dev/null 2>&1; then
	# `opkg status <unknown>` can still exit 0, so read the installed list
	OPKG_LIST=$(opkg list-installed 2>/dev/null | cut -d' ' -f1 || true)
	for p in "$PKG" $(printf '%s\n' "$OPKG_LIST" | grep '^luci-i18n-lucent' || true); do
		if printf '%s\n' "$OPKG_LIST" | grep -qx "$p"; then
			LEFT="$LEFT 包记录:$p"
		fi
	done
fi

if [ -n "$LEFT" ]; then
	echo "Lucent 3 removed, but these are still present:$LEFT" >&2
	exit 1
fi

echo "Lucent 3 removed. LuCI is back on Bootstrap."
