#!/usr/bin/env bash
# Build dist/lucent-onekey-install.sh — a self-contained installer that embeds
# the apk, the ipk and the file tree, so it works without network access.
set -euo pipefail
cd "$(dirname "$0")/.."

VER=$(sed -n 's/^PKG_VERSION:=//p' Makefile)-r$(sed -n 's/^PKG_RELEASE:=//p' Makefile)
APK=dist/luci-theme-lucent-${VER}.apk
IPK=dist/luci-theme-lucent_${VER}_all.ipk
OUT=dist/lucent-onekey-install.sh

[ -s "$APK" ] || { echo "Missing $APK — run build-apk.sh first." >&2; exit 1; }
[ -s "$IPK" ] || { echo "Missing $IPK — run build-ipk.sh first." >&2; exit 1; }
[ -s i18n/lucent.zh-cn.lmo ] || { echo "Missing i18n/lucent.zh-cn.lmo." >&2; exit 1; }

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/payload/files"

cp "$APK" "$IPK" "$TMP/payload/"
cp -R htdocs ucode root i18n "$TMP/payload/files/"

( cd "$TMP/payload" && tar --format=gnu --owner=0 --group=0 --numeric-owner -czf "$TMP/payload.tar.gz" . )
base64 -w 76 "$TMP/payload.tar.gz" > "$TMP/payload.b64"

python3 - "$OUT" "$TMP/payload.b64" "$VER" <<'PY'
import sys
out = sys.argv[1]
payload = open(sys.argv[2], encoding="ascii").read().strip()
tpl = open('scripts/onekey-template.sh', encoding='utf-8').read()
if '__PAYLOAD__' not in tpl:
    raise SystemExit('onekey-template.sh has no __PAYLOAD__ marker')
open(out, 'w', encoding='utf-8').write(tpl.replace('__VER__', sys.argv[3]).replace('__PAYLOAD__', payload))
PY
chmod 755 "$OUT"
printf '%s\n' "$(basename "$OUT")" > dist/latest-onekey.txt
echo "$OUT ($(wc -c < "$OUT" | tr -d ' ') bytes)"
