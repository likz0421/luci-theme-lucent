#!/usr/bin/env bash
# Build dist/luci-theme-lucent-<version>-src.zip — the complete source tree.
set -euo pipefail
cd "$(dirname "$0")/.."

VER=$(sed -n 's/^PKG_VERSION:=//p' Makefile)
NAME=luci-theme-lucent-${VER}-src
OUT=dist/${NAME}.zip
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
export COPYFILE_DISABLE=1

mkdir -p "$TMP/$NAME"
tar --exclude=dist --exclude=.git -cf - . | ( cd "$TMP/$NAME" && tar -xf - )
find "$TMP" -name .DS_Store -delete

mkdir -p dist
( cd "$TMP" && zip -qr "$OLDPWD/$OUT" "$NAME" )
echo "$OUT ($(wc -c < "$OUT" | tr -d ' ') bytes)"
