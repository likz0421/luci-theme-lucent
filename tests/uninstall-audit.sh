#!/bin/sh
# Prove uninstall.sh really removes everything — and that its self-audit
# notices when it does not. Everything runs against a fake root: absolute paths
# in a copy of the script are redirected under a temp directory and uci is
# stubbed, so nothing on this machine is touched.
# no set -e: a failing predicate here is an assertion result, not an error

ROOT=$(cd "$(dirname "$0")/.." && pwd)
fails=0
ok() { printf '  PASS %s\n' "$1"; }
no() { printf '  FAIL %s — %s\n' "$1" "$2"; fails=$((fails + 1)); }

setup_fake() {
	[ -n "${FAKE:-}" ] && rm -rf "$FAKE"
	FAKE=$(mktemp -d)
	BIN="$FAKE/bin"
	mkdir -p "$BIN" "$FAKE/etc/crontabs" "$FAKE/etc/init.d"

	# uci stub: after a successful removal nothing is registered, so `get`
	# must fail (exit 1) and the writes must succeed.
	printf '#!/bin/sh\n[ "$1" = "-q" ] && shift\ncase "$1" in get) exit 1 ;; *) exit 0 ;; esac\n' > "$BIN/uci"
	chmod +x "$BIN/uci"

	# Two passes with a token: $FAKE itself lives under /tmp, so substituting
	# it in one pass would rewrite the paths the previous -e had just inserted.
	sed -e 's|/www/|@F@/www/|g' -e 's|/usr/|@F@/usr/|g' \
		-e 's|/etc/|@F@/etc/|g' -e 's|/tmp/|@F@/tmp/|g' \
		-e 's|/var/|@F@/var/|g' \
		"$1" | sed "s|@F@|$FAKE|g" > "$FAKE/script.sh"
	chmod +x "$FAKE/script.sh"
	PATH="$BIN:$PATH"
}

plant_install() {
	mkdir -p "$FAKE/www/luci-static/lucent" "$FAKE/www/luci-static/resources/lucent" \
		"$FAKE/www/luci-static/resources/view/lucent" \
		"$FAKE/usr/share/ucode/luci/template/themes/lucent" \
		"$FAKE/usr/share/lucent/wallpaper" "$FAKE/usr/share/luci/menu.d" \
		"$FAKE/usr/share/rpcd/acl.d" "$FAKE/usr/libexec/rpcd" \
		"$FAKE/usr/lib/lua/luci/i18n" "$FAKE/etc/uci-defaults" "$FAKE/etc/config" \
		"$FAKE/tmp" "$FAKE/var/run"
	touch "$FAKE/www/luci-static/lucent/theme.css" \
		"$FAKE/www/luci-static/resources/lucent/util.js" \
		"$FAKE/www/luci-static/resources/view/lucent/home.js" \
		"$FAKE/usr/share/ucode/luci/template/themes/lucent/header.ut" \
		"$FAKE/usr/share/lucent/wallpaper/auto-bing-1.jpg" \
		"$FAKE/usr/share/lucent/install.sh" \
		"$FAKE/usr/share/luci/menu.d/luci-theme-lucent.json" \
		"$FAKE/usr/share/rpcd/acl.d/luci-theme-lucent.json" \
		"$FAKE/usr/libexec/rpcd/luci.lucent" \
		"$FAKE/usr/lib/lua/luci/i18n/lucent.zh-cn.lmo" \
		"$FAKE/usr/lib/lua/luci/i18n/lucent-zh-base.zh-cn.lmo" \
		"$FAKE/usr/lib/lua/luci/i18n/lucent-zh-firewall.zh-cn.lmo" \
		"$FAKE/etc/uci-defaults/30_luci-theme-lucent" \
		"$FAKE/etc/config/lucent" \
		"$FAKE/tmp/lucent-check.json" "$FAKE/tmp/lucent-cpu.prev" \
		"$FAKE/tmp/lucent-host.cur" "$FAKE/tmp/lucent-wallpaper.img" \
		"$FAKE/var/run/lucent-check.pid" "$FAKE/var/run/lucent-pkgupdates.job.sh"
	printf 'keep me\n0 6 * * * /bin/sh /usr/share/lucent/wallpaper.sh # lucent-wallpaper\n' \
		> "$FAKE/etc/crontabs/root"
}

count_left() {
	find "$FAKE/www" "$FAKE/usr" "$FAKE/etc" "$FAKE/tmp" "$FAKE/var" \( \
		-name 'lucent*' -o -name 'luci-theme-lucent*' -o -name '30_luci-theme-lucent' \) \
		-print 2>/dev/null | wc -l | tr -d ' '
}

run_copy() {
	OUT=$(sh "$FAKE/script.sh" 2>&1) && RC=0 || RC=$?
}

echo "--- uninstall.sh against a planted fake root"
setup_fake "$ROOT/uninstall.sh"
plant_install
before=$(count_left)
[ "$before" -gt 0 ] && ok "fake install planted ($before entries)" || no "fake install planted" "nothing there"

run_copy

for p in /www/luci-static/lucent /www/luci-static/resources/lucent \
	/www/luci-static/resources/view/lucent \
	/usr/share/ucode/luci/template/themes/lucent /usr/share/lucent \
	/usr/libexec/rpcd/luci.lucent /usr/lib/lua/luci/i18n/lucent.zh-cn.lmo \
	/usr/lib/lua/luci/i18n/lucent-zh-base.zh-cn.lmo \
	/usr/lib/lua/luci/i18n/lucent-zh-firewall.zh-cn.lmo \
	/etc/config/lucent /etc/uci-defaults/30_luci-theme-lucent \
	/tmp/lucent-check.json /tmp/lucent-cpu.prev /tmp/lucent-host.cur \
	/tmp/lucent-wallpaper.img /var/run/lucent-check.pid \
	/var/run/lucent-pkgupdates.job.sh; do
	[ -e "$FAKE$p" ] && no "removed $p" "still present" || true
done
[ ! -e "$FAKE/usr/lib/lua/luci/i18n/lucent-zh-base.zh-cn.lmo" ] && \
	ok "every shipped translation is removed, not just zh-cn" || \
	no "every shipped translation" "lucent-zh-base.zh-cn.lmo survived"
[ ! -e "$FAKE/usr/share/lucent/wallpaper/auto-bing-1.jpg" ] && \
	ok "runtime wallpaper cache removed" || no "runtime wallpaper cache" "survived"
grep -q 'lucent-wallpaper' "$FAKE/etc/crontabs/root" && \
	no "cron entry removed" "still scheduled" || ok "cron entry removed"
grep -q 'keep me' "$FAKE/etc/crontabs/root" && \
	ok "unrelated cron lines preserved" || no "unrelated cron lines" "sed ate them"

left=$(count_left)
[ "$left" = "0" ] && ok "nothing lucent-shaped survives" || \
	no "nothing survives" "$left left: $(find "$FAKE" -name 'lucent*' 2>/dev/null | head -3 | tr '\n' ' ')"

[ "$RC" = "0" ] && ok "self-audit reports success on a clean removal" || \
	no "self-audit success" "exit $RC: $OUT"

echo "--- the audit must fire when a path is missed"
setup_fake "$ROOT/uninstall.sh"
plant_install
# simulate a regression: this copy forgets to delete the rpcd helper
sed -i 's|^rm -f .*usr/libexec/rpcd/luci.lucent|# skipped by test|' "$FAKE/script.sh"
run_copy
[ "$RC" != "0" ] && ok "self-audit fails loudly on a leftover" || \
	no "self-audit fails loudly" "claimed success with the helper still there"
case "$OUT" in
	*"/usr/libexec/rpcd/luci.lucent"*) ok "audit names the leftover path" ;;
	*) no "audit names the leftover" "$OUT" ;;
esac

rm -rf "$FAKE"

echo "--- every removal path says the same thing"
# Two different jobs:
#  - the manual routes (uninstall.sh, install.sh, offline template) delete
#    everything themselves, because no package manager is involved;
#  - the maintainer scripts only have to sweep what the manifest never knew
#    about — the package manager removes its own files.
RUNTIME="lucent-wallpaper
run/lucent-
tmp/lucent-
/etc/config/lucent
/usr/share/lucent"
MANUAL="$RUNTIME
i18n/lucent
menu.d/luci-theme-lucent.json
acl.d/luci-theme-lucent.json
libexec/rpcd/luci.lucent"

for src in uninstall.sh install.sh scripts/onekey-template.sh Makefile scripts/build-ipk.sh scripts/build-apk.sh; do
	missing=""
	for needle in $RUNTIME; do
		grep -q "$needle" "$ROOT/$src" || missing="$missing $needle"
	done
	[ -z "$missing" ] && ok "$src sweeps the runtime leftovers" || no "$src sweeps the runtime leftovers" "missing:$missing"
done

for src in uninstall.sh install.sh scripts/onekey-template.sh; do
	missing=""
	for needle in $MANUAL; do
		grep -q "$needle" "$ROOT/$src" || missing="$missing $needle"
	done
	[ -z "$missing" ] && ok "$src removes every installed file" || no "$src removes every installed file" "missing:$missing"
done

echo
[ "$fails" = 0 ] && echo "uninstall is clean" || { echo "$fails FAILED"; exit 1; }
