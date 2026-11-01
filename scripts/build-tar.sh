#!/usr/bin/env bash
# Build dist/lucent-<version>.tar.gz, a plain file-tree archive that can be
# installed without a package manager using ../install.sh.
set -euo pipefail
cd "$(dirname "$0")/.."

VER=$(sed -n 's/^PKG_VERSION:=//p' Makefile)
OUT=dist/lucent-${VER}.tar.gz
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
export COPYFILE_DISABLE=1

DIR=luci-theme-lucent-${VER}
mkdir -p "$TMP/$DIR"
cp -R htdocs ucode root i18n "$TMP/$DIR/"
cp LICENSE README.md CHANGELOG.md uninstall.sh "$TMP/$DIR/" 2>/dev/null || true
# The archive is the offline option: ship the file-copy installer as install.sh.
cp scripts/offline-install.sh "$TMP/$DIR/install.sh"
chmod 755 "$TMP/$DIR/install.sh" "$TMP/$DIR/uninstall.sh"
find "$TMP" -name .DS_Store -delete

mkdir -p dist
( cd "$TMP" && tar --format=gnu --owner=0 --group=0 --numeric-owner -czf "$OLDPWD/$OUT" "$DIR" )
echo "$OUT ($(wc -c < "$OUT" | tr -d ' ') bytes)"
