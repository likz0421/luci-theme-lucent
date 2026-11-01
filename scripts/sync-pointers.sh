#!/usr/bin/env bash
# Sync the "latest version" pointer files from dist/ to the repo root so they
# are committed to `main`. jsDelivr / raw.githubusercontent serve these tree
# files for ALL builds, including old clients that can't reach release assets.
#
#   sh install.sh check  ->  get_latest() reads <base>/latest-apk.txt etc.
#
# Run this after building artifacts and before committing/releasing.
set -euo pipefail
cd "$(dirname "$0")/.."

for f in latest.txt latest-apk.txt latest-onekey.txt; do
	[ -f "dist/$f" ] && cp "dist/$f" "$f"
done

echo "root pointers synced:"
for f in latest.txt latest-apk.txt latest-onekey.txt; do
	printf '  %-18s %s\n' "$f" "$(cat "$f" 2>/dev/null)"
done
