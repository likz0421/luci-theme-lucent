#!/bin/sh
# Unit-test the version-detection logic of BOTH installers without a router:
# extract the functions under test, stub the package managers, assert outcomes.
# The offline template carries its own copy of these helpers, so it is checked
# against the same table to catch the two drifting apart.
set -e

ROOT=$(cd "$(dirname "$0")/.." && pwd)
fails=0
ok() { printf '  PASS %s\n' "$1"; }
no() { printf '  FAIL %s — %s\n' "$1" "$2"; fails=$((fails + 1)); }

extract() {
	awk -v fn="$1" '$0 ~ "^"fn"\\(\\) *\\{" { infn=1 } infn { print } infn && /^}/ { infn=0 }' "$SRC"
}

suite() {
	SRC="$1"
	label="$2"
	WORK=$(mktemp -d)

	{
		printf 'PKG_NAME="luci-theme-lucent"\n'
		printf 'have() { command -v "$1" >/dev/null 2>&1; }\n'
		extract sanitize
		extract vkey
		extract ver_newer
		extract detect_installed
		extract installed_desc
		[ "$label" = "install.sh" ] && extract ask
	} > "$WORK/fns.sh"
	. "$WORK/fns.sh"

	printf '%s\n' "--- $label"

	ver_newer 3.11.1 3.10.12 && ok "newer minor" || no "newer minor" "said not newer"
	ver_newer 3.10.12 3.11.1 && no "older not newer" "accepted downgrade" || ok "older not newer"
	ver_newer 3.11.1 3.11.1 && no "equal not newer" "equal counted as newer" || ok "equal not newer"
	ver_newer 3.11.0 3.9.9 && ok "double digit minor" || no "double digit minor" "lexicographic trap"
	ver_newer 3.11.1-r2 3.11.1-r1 && ok "release bump counts" || no "release bump" "ignored -r"

	mkdir -p "$WORK/bin"
	printf '#!/bin/sh\n[ "$1" = info ] && [ "$2" = -e ] && [ "$3" = -v ] && echo "luci-theme-lucent-3.10.12-r1"\nexit 1\n' > "$WORK/bin/apk"
	printf '#!/bin/sh\nexit 127\n' > "$WORK/bin/opkg"
	chmod +x "$WORK/bin/apk" "$WORK/bin/opkg"
	PATH="$WORK/bin:$PATH"
	detect_installed
	[ "$CUR_VER" = "3.10.12-r1" ] && ok "apk version parsed" || no "apk version parsed" "got '$CUR_VER'"
	[ "$CUR_HOW" = "apk" ] && ok "apk method detected" || no "apk method detected" "$CUR_HOW"

	rm -f "$WORK/bin/apk"
	printf '#!/bin/sh\necho "Version: 3.9.4-r1"\n' > "$WORK/bin/opkg"
	chmod +x "$WORK/bin/opkg"
	detect_installed
	[ "$CUR_HOW" = "opkg" ] && [ "$CUR_VER" = "3.9.4-r1" ] && ok "opkg fallback" || no "opkg fallback" "$CUR_HOW / $CUR_VER"

	rm -f "$WORK/bin/opkg"
	detect_installed
	[ "$CUR_HOW" = "none" ] && ok "clean machine reads as not installed" || no "clean machine" "$CUR_HOW / $CUR_VER"

	CUR_HOW=none; CUR_VER=
	[ "$(installed_desc)" = "未安装" ] && ok "desc: not installed" || no "desc: not installed" "$(installed_desc)"
	CUR_HOW=files; CUR_VER=3.8.1-r1
	[ "$(installed_desc)" = "已安装 3.8.1-r1（files 方式）" ] && ok "desc: file install" || no "desc: file install" "$(installed_desc)"
	CUR_HOW=files; CUR_VER=
	[ "$(installed_desc)" = "已安装 未知版本（files 方式）" ] || no "desc: unknown version" "$(installed_desc)"

	if [ "$label" = "install.sh" ]; then
		ASKED=$(ask "question" "n")
		[ "$ASKED" = "n" ] && ok "ask returns default when stdin is not a tty" || no "ask default" "$ASKED"

		# A pipe must never be read: under `wget -qO- … | sh` stdin is the rest
		# of the script, so consuming it there would silently truncate the install.
		PIPED=$(printf 'y' | ask "q" "n")
		[ "$PIPED" = "n" ] && ok "piped stdin is never read" || no "piped stdin" "read '$PIPED'"
	fi

	rm -rf "$WORK"
}

suite "$ROOT/install.sh" "install.sh"
suite "$ROOT/scripts/onekey-template.sh" "onekey-template.sh"

echo
[ "$fails" = 0 ] && echo "all logic checks passed" || { echo "$fails FAILED"; exit 1; }
