#!/bin/sh
# Regression test for the bug that could brick a LuCI on upgrade:
#
#   opkg runs the OLD package's postrm with the argument "upgrade" AFTER it has
#   unpacked the new files. A postrm that ignores $1 therefore deletes the theme
#   it just installed and resets mediaurlbase to bootstrap — "update complete",
#   blank page, no updater.
#
# Both copies of the script are extracted (the ipk builder's and the feed
# Makefile's), run with every destructive command stubbed, and the number of
# removals is counted per argument.
#
# no set -e: a failing predicate here is an assertion result

ROOT=$(cd "$(dirname "$0")/.." && pwd)
WORK=$(mktemp -d) || exit 1
BIN="$WORK/bin"
CNT="$WORK/count"
FAILED=0

cleanup() { rm -rf "$WORK"; }
trap cleanup EXIT INT TERM

mkdir -p "$BIN"

cat > "$BIN/rm" <<'S'
#!/bin/sh
for a in "$@"; do
	case "$a" in
		-*) continue ;;
	esac
	printf '%s\n' "$a" >> "$RMLOG"
done
exit 0
S
cat > "$BIN/uci" <<'S'
#!/bin/sh
exit 0
S
cat > "$BIN/sed" <<'S'
#!/bin/sh
exit 0
S
chmod 755 "$BIN/rm" "$BIN/uci" "$BIN/sed"

# --- extract the two postrm scripts -----------------------------------------
sed -n '/cat > "\$C\/postrm" <<.SH/,/^SH$/p' "$ROOT/scripts/build-ipk.sh" |
	sed -n '2,/^SH$/p' | sed '/^SH$/d' > "$WORK/ipk.postrm"

sed -n '/define Package\/luci-theme-lucent\/postrm/,/^endef/p' "$ROOT/Makefile" |
	sed -n '2,/^endef/p' | sed '/^endef$/d' | sed 's/\$\$/\$/g' > "$WORK/feed.postrm"

for f in ipk feed; do
	if [ -s "$WORK/$f.postrm" ]; then
		echo "  PASS extracted $f postrm ($(wc -l < "$WORK/$f.postrm" | tr -d ' ') lines)"
	else
		echo "  FAIL could not extract $f postrm — the test itself is stale"
		FAILED=1
	fi
done

# --- run each with each argument --------------------------------------------
# "upgrade" must remove NOTHING; "remove" must still clean up.
run() { # run <file> <arg> -> number of rm targets
	: > "$CNT"
	RMLOG="$CNT" PATH="$BIN:$PATH" IPKG_INSTROOT="" sh "$1" "$2" >/dev/null 2>&1
	wc -l < "$CNT" | tr -d ' '
}

for f in ipk feed; do
	up=$(run "$WORK/$f.postrm" upgrade)
	if [ "$up" = "0" ]; then
		echo "  PASS $f postrm does nothing on upgrade"
	else
		echo "  FAIL $f postrm deleted $up paths on upgrade — an update would wipe the new install"
		FAILED=1
	fi

	rm_=$(run "$WORK/$f.postrm" remove)
	if [ "$rm_" -gt 0 ]; then
		echo "  PASS $f postrm still cleans up on remove ($rm_ paths)"
	else
		echo "  FAIL $f postrm no longer removes anything on remove — uninstall is broken"
		FAILED=1
	fi
done

# --- the theme directory must be among what remove does delete --------------
: > "$CNT"
RMLOG="$CNT" PATH="$BIN:$PATH" IPKG_INSTROOT="" sh "$WORK/ipk.postrm" remove >/dev/null 2>&1
if grep -q 'luci-static/lucent' "$CNT"; then
	echo "  PASS remove still clears /www/luci-static/lucent"
else
	echo "  FAIL remove no longer clears the theme directory"
	FAILED=1
fi

echo
if [ "$FAILED" = "0" ]; then
	echo "postrm is upgrade-safe"
else
	echo "POSTRM GUARD FAILED"
	exit 1
fi
