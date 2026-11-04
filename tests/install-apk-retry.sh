#!/bin/sh
# Drive install.sh's apk branch end-to-end against a stub router: the first
# `apk add` fails with the exact "trying to overwrite" error a machine that was
# once installed by file-copy produces, and the script must notice and retry
# with --force-overwrite instead of giving up.
#
# Everything runs in a fake root; no real system path is touched.
ROOT=$(cd "$(dirname "$0")/.." && pwd)
fails=0
ok() { printf '  PASS %s\n' "$1"; }
no() { printf '  FAIL %s — %s\n' "$1" "$2"; fails=$((fails + 1)); }

FAKE=$(mktemp -d)
BIN="$FAKE/bin"
mkdir -p "$BIN" "$FAKE/etc" "$FAKE/tmp" "$FAKE/usr/share/lucent" "$FAKE/www"

# a fake OpenWrt box, with LuCI already present so ensure_luci passes
printf 'VERSION="25.12.0"\n' > "$FAKE/etc/openwrt_release"
mkdir -p "$FAKE/usr/share/ucode/luci"

# id -> root
printf '#!/bin/sh\n[ "$1" = -u ] && echo 0 && exit 0\nexec /usr/bin/env id "$@"\n' > "$BIN/id"

# uci -> inert
printf '#!/bin/sh\nexit 0\n' > "$BIN/uci"

# wget -> latest.txt pointer for pointer URLs, otherwise a gzip-magic blob
cat > "$BIN/wget" <<EOF
#!/bin/sh
out=""
prev=""
for a in "\$@"; do
	[ "\$prev" = "-O" ] && out="\$a"
	prev="\$a"
done
case "\$*" in
	*latest.txt*) printf 'luci-theme-lucent-3.12.1-r1.apk\n' > "\$out" ;;
	*) printf '\037\213fakepayload' > "\$out" ;;
esac
exit 0
EOF

# apk -> first add fails like the real router, retry with --force-overwrite wins
cat > "$BIN/apk" <<EOF
#!/bin/sh
{ echo "apk \$*"; } >> "$FAKE/apk.log"
case "\$*" in
	"info -e luci-theme-lucent") exit 0 ;;
	"info -e -v luci-theme-lucent") echo "luci-theme-lucent-3.11.0-r1"; exit 0 ;;
	*--force-overwrite*) exit 0 ;;
	"add "*) echo "ERROR: luci-theme-lucent-3.12.1-r1: trying to overwrite usr/lib/lua/luci/i18n/lucent.zh-cn.lmo" >&2; exit 1 ;;
esac
exit 0
EOF
chmod +x "$BIN"/*

# rewrite absolute paths into the fake root (two passes: $FAKE itself contains /tmp)
sed -e 's|/www/|@F@/www/|g' -e 's|/usr/|@F@/usr/|g' -e 's|/etc/|@F@/etc/|g' \
	-e 's|/tmp/|@F@/tmp/|g' -e 's|/var/|@F@/var/|g' \
	"$ROOT/install.sh" | sed "s|@F@|$FAKE|g" > "$FAKE/install.sh"

PATH="$BIN:$PATH"
OUT=$(sh "$FAKE/install.sh" install 2>&1)
RC=$?

echo "--- apk overwrite conflict"
case "$OUT" in
	*"trying to overwrite"*) ok "the real error is shown, not swallowed" ;;
	*) no "the real error is shown" "$(printf '%s' "$OUT" | head -3 | tr '\n' ' ')" ;;
esac
case "$OUT" in
	*"--force-overwrite 重试"*) ok "script recognises the conflict and retries" ;;
	*) no "script recognises the conflict" "$(printf '%s' "$OUT" | tail -3 | tr '\n' ' ')" ;;
esac
case "$OUT" in
	*"已覆盖旧残留文件"*) ok "retry reports success" ;;
	*) no "retry reports success" "$(printf '%s' "$OUT" | tail -3 | tr '\n' ' ')" ;;
esac
[ "$RC" = "0" ] && ok "install exits 0 after the retry" || no "install exits 0" "rc=$RC"

grep -q -- "--force-overwrite" "$FAKE/apk.log" && ok "apk was actually re-invoked with --force-overwrite" || no "apk re-invoked" "$(cat "$FAKE/apk.log")"

# and it must not retry when the failure is something else
echo "--- unrelated apk failure must not force-overwrite"
printf '#!/bin/sh\n{ echo "apk $*"; } >> %s/apk2.log\ncase "$*" in\n\t"info -e luci-theme-lucent") exit 0 ;;\n\t"info -e -v luci-theme-lucent") echo "luci-theme-lucent-3.11.0-r1"; exit 0 ;;\nesac\nif [ "$1" = add ]; then echo "ERROR: unable to open database" >&2; exit 1; fi\nexit 0\n' "$FAKE" > "$BIN/apk"
chmod +x "$BIN/apk"
OUT2=$(sh "$FAKE/install.sh" install 2>&1)
RC2=$?
case "$OUT2" in
	*"--force-overwrite 重试"*) no "no blind force-overwrite" "retried on an unrelated error" ;;
	*) ok "no blind force-overwrite on other failures" ;;
esac
[ "$RC2" != "0" ] && ok "a real failure still fails the install" || no "a real failure still fails" "rc=0"

rm -rf "$FAKE"

echo "--- conflict owned by our own language sub-package"
# luci.mk generates luci-i18n-lucent-zh-cn from po/, and Build/Prepare also
# bundles the same .lmo into the theme: two packages, one path. The installer
# must remove the language package and reinstall, not --force-overwrite a
# package that still exists.
FAKE=$(mktemp -d)
BIN="$FAKE/bin"
mkdir -p "$BIN" "$FAKE/etc" "$FAKE/tmp" "$FAKE/usr/share/ucode/luci"
printf 'VERSION="25.12.0"\n' > "$FAKE/etc/openwrt_release"
printf '#!/bin/sh\n[ "$1" = -u ] && echo 0 && exit 0\nexit 0\n' > "$BIN/id"
printf '#!/bin/sh\nexit 0\n' > "$BIN/uci"
cat > "$BIN/wget" <<EOF
#!/bin/sh
out=""; prev=""
for a in "\$@"; do [ "\$prev" = "-O" ] && out="\$a"; prev="\$a"; done
case "\$*" in *latest.txt*) printf 'x\n' > "\$out" ;; *) printf '\037\213fake' > "\$out" ;; esac
exit 0
EOF
cat > "$BIN/apk" <<EOF
#!/bin/sh
{ echo "apk \$*"; } >> "$FAKE/apk.log"
case "\$*" in
	"info -e luci-theme-lucent") exit 0 ;;
	"info -e -v luci-theme-lucent") echo "luci-theme-lucent-0.1-r1"; exit 0 ;;
	"info -W /usr/lib/lua/luci/i18n/lucent.zh-cn.lmo") echo "luci-i18n-lucent-zh-cn"; exit 0 ;;
	add*)
		if grep -q "apk del luci-i18n-lucent" "$FAKE/apk.log" 2>/dev/null; then exit 0; fi
		echo "ERROR: luci-theme-lucent-0.2-r1: trying to overwrite usr/lib/lua/luci/i18n/lucent.zh-cn.lmo" >&2
		exit 1 ;;
esac
exit 0
EOF
chmod +x "$BIN"/*
PATH="$BIN:$PATH"
sed -e 's|/www/|@F@/www/|g' -e 's|/usr/|@F@/usr/|g' -e 's|/etc/|@F@/etc/|g' \
	-e 's|/tmp/|@F@/tmp/|g' -e 's|/var/|@F@/var/|g' \
	"$ROOT/install.sh" | sed "s|@F@|$FAKE|g" > "$FAKE/install.sh"

OUT3=$(LUCENT_VERSION=0.2-r1 sh "$FAKE/install.sh" install 2>&1)
RC3=$?
grep -q "apk del luci-i18n-lucent-zh-cn" "$FAKE/apk.log" && ok "the stray language package is removed" || no "language package removed" "$(cat "$FAKE/apk.log")"
case "$OUT3" in
	*"已替换旧语言包"*) ok "reinstall after removing it succeeds" ;;
	*) no "reinstall after removing it" "$(printf '%s' "$OUT3" | tail -3 | tr '\n' ' ')" ;;
esac
grep -q -- "--force-overwrite" "$FAKE/apk.log" && no "no force-overwrite when the owner still exists" "forced over a live package" || ok "no force-overwrite when the owner still exists"
[ "$RC3" = "0" ] && ok "install completes" || no "install completes" "rc=$RC3"

rm -rf "$FAKE"

echo
[ "$fails" = 0 ] && echo "apk retry behaves" || { echo "$fails FAILED"; exit 1; }
