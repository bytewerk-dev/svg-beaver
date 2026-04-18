#!/usr/bin/env bash
set -euo pipefail

for version in 8 9 10 11 12; do
  defaults write "com.adobe.CSXS.${version}" PlayerDebugMode 1
done

killall cfprefsd >/dev/null 2>&1 || true

echo "Enabled PlayerDebugMode for com.adobe.CSXS.8 through com.adobe.CSXS.12"
echo "Restart Illustrator to pick up the new debug setting."
echo "Remote devtools should then be available at:"
echo "  http://localhost:8088"
