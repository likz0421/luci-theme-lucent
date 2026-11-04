#!/bin/sh
# Unit-test the version-detection logic of BOTH installers without a router:
# extract the functions under test, stub the package managers, assert outcomes.
# The offline template carries its own copy of these helpers, so it is checked
# against the same table to catch the two drifting apart.
# no set -e: a failing predicate here is an assertion result, not an error

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
		[ "$label" = "install.sh" ] && { extract ask; extract has_tty; }
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
		# /dev/tty cannot be probed here: the msys layer on Windows kills the
		# process the moment it is touched. So the two branches are driven by
		# splicing a stub has_tty/ask in just before the dispatch, which is what
		# actually decides whether the menu appears.
		# Contract: ask() answers through ANSWER and writes nothing to stdout.
		# `ANS=$(ask …)` used to capture the prompt text as well, so every menu
		# choice became "  请选择 [1] 2" and fell through to "没听懂".
		has_tty() { return 1; }
		ask "问题" "n" 2>/dev/null
		[ "$ANSWER" = "n" ] && ok "ask returns the default through ANSWER" || no "ask ANSWER default" "$ANSWER"
		STDOUT=$(ask "问题" "n" 2>/dev/null)
		[ -z "$STDOUT" ] && ok "ask writes nothing to stdout" || no "ask writes nothing to stdout" "captured '$STDOUT'"

		case "$(uname -s 2>/dev/null)" in
		MINGW*|MSYS*|CYGWIN*)
			MARK='if [ -z "$ACTION" ]; then'
			printf 'has_tty() { return 1; }\n' > "$WORK/no-tty.ov"
			printf 'has_tty() { return 0; }\nask() { ANSWER="2"; }\n' > "$WORK/tty.ov"

			splice() {
				awk -v m="$2" -v ov="$3" '
					index($0, m) == 1 && !done { while ((getline l < ov) > 0) print l; close(ov); done = 1 }
					{ print }' "$1"
			}

			splice "$SRC" "$MARK" "$WORK/no-tty.ov" > "$WORK/no-tty.sh"
			NO=$(sh "$WORK/no-tty.sh" 2>&1 | head -1)
			case "$NO" in
				*root*|*OpenWrt*) ok "no terminal: skips the menu and installs" ;;
				*) no "no terminal: skips the menu" "$NO" ;;
			esac

			splice "$SRC" "$MARK" "$WORK/tty.ov" > "$WORK/tty.sh"
			WITH=$(sh "$WORK/tty.sh" 2>&1)
			case "$WITH" in
				*"1) 安装"*"2) 卸载"*) ok "menu lists install and uninstall" ;;
				*) no "menu lists install and uninstall" "$(printf '%s' "$WITH" | head -3 | tr '\n' ' ')" ;;
			esac
			# the root guard is the same message for both actions, so routing
			# beyond the menu is not observable on a non-OpenWrt box; what is
			# observable is that the menu itself appeared before any action ran.
			case "$WITH" in
				*"本机状态"*) ok "menu reports the installed version first" ;;
				*) no "menu reports the installed version" "$(printf '%s' "$WITH" | head -3 | tr '\n' ' ')" ;;
			esac
			;;
		*)
			if has_tty; then
				printf '  SKIP tty assertions (a controlling terminal is present)\n'
			else
				ASKED=$(ask "question" "n")
				[ "$ASKED" = "n" ] && ok "no terminal: ask returns default, never blocks" || no "ask default" "$ASKED"
				PIPED=$(printf 'y' | ask "q" "n")
				[ "$PIPED" = "n" ] && ok "piped stdin is never read" || no "piped stdin" "read '$PIPED'"
			fi
			;;
		esac
	fi

	rm -rf "$WORK"
}

suite "$ROOT/install.sh" "install.sh"
suite "$ROOT/scripts/onekey-template.sh" "onekey-template.sh"

echo
[ "$fails" = 0 ] && echo "all logic checks passed" || { echo "$fails FAILED"; exit 1; }
