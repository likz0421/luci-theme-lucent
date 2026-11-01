#!/usr/bin/env bash
# Build the one-key installers:
#   dist/lucent-install.sh         — online bootstrap (downloads from GitHub/mirrors)
#   dist/lucent-offline-install.sh — self-contained (embeds apk+ipk+file tree, no network)
set -euo pipefail
cd "$(dirname "$0")/.."

PKG_V=$(sed -n 's/^PKG_VERSION:=//p' Makefile)
PKG_R=$(sed -n 's/^PKG_RELEASE:=//p' Makefile)
VER="${PKG_V}-r${PKG_R}"
TAG="v${PKG_V}"
REPO=$(sed -n 's/^PKG_REPO:=//p' Makefile)
[ -n "$REPO" ] || REPO="likz0421/luci-theme-lucent"

APK=dist/luci-theme-lucent-${VER}.apk
IPK=dist/luci-theme-lucent_${VER}_all.ipk
[ -s "$APK" ] || { echo "Missing $APK — run build-apk.sh first." >&2; exit 1; }
[ -s "$IPK" ] || { echo "Missing $IPK — run build-ipk.sh first." >&2; exit 1; }
[ -s i18n/lucent.zh-cn.lmo ] || { echo "Missing i18n/lucent.zh-cn.lmo." >&2; exit 1; }

mkdir -p dist

# ---- online bootstrap ------------------------------------------------------
# Copy the repo-root install.sh and keep its version/repo defaults in sync
# with the Makefile, so the curl-able script always points at the right tag.
sed -e "s|^LUCENT_VERSION_DEFAULT=.*|LUCENT_VERSION_DEFAULT=\"${VER}\"|" \
	-e "s|^LUCENT_TAG_DEFAULT=.*|LUCENT_TAG_DEFAULT=\"${TAG}\"|" \
	-e "s|^LUCENT_REPO=.*|LUCENT_REPO=\"${REPO}\"|" \
	install.sh > dist/lucent-install.sh
chmod 755 dist/lucent-install.sh
echo "dist/lucent-install.sh ($(wc -c < dist/lucent-install.sh | tr -d ' ') bytes)"

# ---- self-contained offline installer --------------------------------------
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/payload/files"
cp "$APK" "$IPK" "$TMP/payload/"
cp -R htdocs ucode root i18n "$TMP/payload/files/"
( cd "$TMP/payload" && tar --format=gnu --owner=0 --group=0 --numeric-owner -czf "$TMP/payload.tar.gz" . )
base64 -w 76 "$TMP/payload.tar.gz" > "$TMP/payload.b64"

python3 - "$TMP/payload.b64" "$VER" <<'PY'
import sys
payload = open(sys.argv[1], encoding="ascii").read().strip()
tpl = open('scripts/onekey-template.sh', encoding='utf-8').read()
if '__PAYLOAD__' not in tpl:
    raise SystemExit('onekey-template.sh has no __PAYLOAD__ marker')
out = tpl.replace('__VER__', sys.argv[2]).replace('__PAYLOAD__', payload)
open('dist/lucent-offline-install.sh', 'w', encoding='utf-8').write(out)
PY
chmod 755 dist/lucent-offline-install.sh
echo "dist/lucent-offline-install.sh ($(wc -c < dist/lucent-offline-install.sh | tr -d ' ') bytes)"

printf '%s\n' "lucent-install.sh" > dist/latest-onekey.txt
