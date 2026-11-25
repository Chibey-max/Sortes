#!/usr/bin/env bash
# Export contract ABIs for the daemon and the web app. Run after `forge build`.
set -euo pipefail
cd "$(dirname "$0")"
for c in SortesHouse SortesMint SortesRenderer; do
  forge inspect "$c" abi --json > "abi/$c.json"
done
echo "ABIs written to contracts/abi/"
