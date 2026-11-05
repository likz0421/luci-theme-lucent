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
		extract ver_advance
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

	# the retired-3.x / new-0.x line, which plain ordering gets backwards
	if ! command -v ver_advance >/dev/null 2>&1; then
		printf '  SKIP line-reset rules (%s has no ver_advance)\n' "$label"
	else
		ver_advance 0.1-r1 3.12.1-r1 && ok "line reset moves 3.x onto 0.1" || no "line reset" "refused the switch"
		ver_advance 0.2 0.1 && ok "newer within the new line" || no "newer within line" "refused"
		ver_advance 0.1 0.2 && no "still refuses a real downgrade" "accepted 0.1 over 0.2" || ok "still refuses a real downgrade"
		ver_advance 3.12.1 0.1 && no "3.x over 0.x is a downgrade" "accepted" || ok "3.x over 0.x is a downgrade"
	fi

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

echo "--- packaging ownership"
# luci.mk turns po/<BCP-47>/*.po into luci-i18n-lucent-<lang>, which installs
# $(LUCI_LIBRARYDIR)/i18n/lucent.<lang>.lmo and DEPENDS on the theme. If the
# theme also ships that exact file, two packages own one path: apk refuses the
# install ("trying to overwrite") and refuses the removal. Feed builds must
# therefore leave the translations to the generated package; only the
# standalone CI packages, which never run luci.mk, bundle them.
# only the recipe lines count — the comment above them explains why they must
# not come back
PREPARE_BODY=$(awk '/^define Build\/Prepare\/luci-theme-lucent/{on=1;next} /^endef/{on=0} on && !/^[[:space:]]*#/' "$ROOT/Makefile")
if printf '%s\n' "$PREPARE_BODY" | grep -q 'i18n'; then
	no "Makefile Build/Prepare does not bundle translations" "luci-i18n-lucent-* would collide with the theme"
else
	ok "Makefile Build/Prepare does not bundle translations"
fi
for f in scripts/build-ipk.sh scripts/build-apk.sh; do
	if grep -q 'i18n/\*\.lmo\|i18n/lucent' "$ROOT/$f"; then
		ok "$f ships translations (no luci.mk involved)"
	else
		no "$f ships translations" "standalone package would install without Chinese"
	fi
done

suite "$ROOT/install.sh" "install.sh"
suite "$ROOT/scripts/onekey-template.sh" "onekey-template.sh"

echo "--- download payload validation"
# The 0.4 check used od, which BusyBox builds vary in supporting; a real
# router then rejected the genuine 171 KB package. The check must accept any
# package shape with no od at all, and still refuse an HTML page.
W=$(mktemp -d)
awk -v fn=is_package '$0 ~ "^"fn"\\(\\) *\\{" { infn=1 } infn { print } infn && /^}/ { infn=0 }' "$ROOT/install.sh" > "$W/is_package.sh"
. "$W/is_package.sh"

printf '\037\213\010\000payload' > "$W/gzip.apk"
printf '\050\265\057\375payload' > "$W/zstd.apk"
printf '<!DOCTYPE html><html>portal</html>' > "$W/portal.html"
: > "$W/empty.apk"

is_package "$W/gzip.apk" && ok "gzip package accepted" || no "gzip package accepted" "rejected a real package"
is_package "$W/zstd.apk" && ok "zstd package accepted" || no "zstd package accepted" "rejected"
is_package "$W/portal.html" && no "html page rejected" "accepted a portal page" || ok "html page rejected"
is_package "$W/empty.apk" && no "empty file rejected" "accepted" || ok "empty file rejected"

# and it must not consult od at all
SAV=$PATH
mkdir -p "$W/bin"
for t in od hexdump xxd; do printf '#!/bin/sh\necho "%s must not be used" >&2\nexit 127\n' "$t" > "$W/bin/$t"; done
chmod +x "$W/bin"/*
PATH="$W/bin:$PATH"
is_package "$W/gzip.apk" && ok "works without od" || no "works without od" "rejected"
PATH="$SAV"

rm -rf "$W"

echo "--- radio parsing"
# Both of these were real bugs caught by the harness: HE40 carries the width
# with no "MHz" suffix, and 5180 MHz is channel 36 on 5 GHz, not 6 GHz.
RW=$(mktemp -d)
{
	printf 'var L={resolveDefault:function(){return Promise.resolve(null)}};var rpc={declare:function(){return function(){return Promise.resolve({})}}};\n'
	awk '/^function wifiGeneration/,/^}$/' "$ROOT/htdocs/luci-static/resources/lucent/util.js"
	awk '/^function wifiWidth/,/^}$/' "$ROOT/htdocs/luci-static/resources/lucent/util.js"
	awk '/^function wifiBand/,/^}$/' "$ROOT/htdocs/luci-static/resources/lucent/util.js"
	printf 'module.exports={wifiGeneration:wifiGeneration,wifiWidth:wifiWidth,wifiBand:wifiBand};\n'
} > "$RW/radio.js"
node -e '
const r = require(process.argv[1]);
const eq = (got, want, what) => console.log((String(got) === String(want) ? "PASS " : "FAIL ") + what + " — got " + got + " want " + want);
eq(r.wifiWidth("HE40"), 40, "HE40 width");
eq(r.wifiWidth("VHT160"), 160, "VHT160 width");
eq(r.wifiWidth("HT20"), 20, "HT20 width");
eq(r.wifiWidth("160 MHz"), 160, "spaced MHz");
eq(r.wifiWidth(""), null, "empty htmode");
eq(r.wifiBand(2412), "2.4 GHz", "2.4 band");
eq(r.wifiBand(5180), "5 GHz", "5 GHz at channel 36");
eq(r.wifiBand(5955), "6 GHz", "6 GHz starts at 5925");
eq(r.wifiBand(0), "", "missing frequency");
eq(r.wifiGeneration("HE160"), "Wi-Fi 6", "HE is ax");
eq(r.wifiGeneration("EHT320"), "Wi-Fi 7", "EHT is be");
eq(r.wifiGeneration("VHT80"), "Wi-Fi 5", "VHT is ac");
eq(r.wifiGeneration("HT40"), "Wi-Fi 4", "HT is n");
eq(r.wifiGeneration(""), "", "unknown mode");
' "$RW/radio.js" 2>&1 | tee "$RW/out"
fails=$((fails + $(grep -c '^FAIL' "$RW/out" || true)))
rm -rf "$RW"

echo
[ "$fails" = 0 ] && echo "all logic checks passed" || { echo "$fails FAILED"; exit 1; }
