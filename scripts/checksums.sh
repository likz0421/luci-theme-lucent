#!/usr/bin/env bash
# Write dist/SHA256SUMS for every built artifact.
set -euo pipefail
cd "$(dirname "$0")/../dist"

find . -maxdepth 1 -type f ! -name SHA256SUMS ! -name 'latest*' -printf '%P\n' |
	sort | xargs -r sha256sum > SHA256SUMS
cat SHA256SUMS
