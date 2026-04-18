#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PANEL_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
EXTENSIONS_DIR="${HOME}/Library/Application Support/Adobe/CEP/extensions"
INSTALL_DIR="${EXTENSIONS_DIR}/com.bytewerk.svgbeaver"
CACHE_DIR="${HOME}/Library/Caches/CSXS/cep_cache"

mkdir -p "${EXTENSIONS_DIR}"
rm -rf "${INSTALL_DIR}"
mkdir -p "${INSTALL_DIR}"

rsync -a \
  --delete \
  --exclude "dist" \
  --exclude ".DS_Store" \
  --exclude "scripts" \
  "${PANEL_ROOT}/" "${INSTALL_DIR}/"

if [[ -d "${CACHE_DIR}" ]]; then
  find "${CACHE_DIR}" -maxdepth 1 -type f \( -name '*svgbeaver*' -o -name '*bytewerk*' \) -delete || true
fi

echo "Installed panel to:"
echo "  ${INSTALL_DIR}"
echo
echo "Next steps:"
echo "  1. Enable CEP debug mode if needed: ./scripts/enable-cep-debug-macos.sh"
echo "  2. Restart Illustrator."
echo "  3. Open Window > Extensions > SVG Beaver."
echo
echo "CEP cache entries matching svgbeaver/bytewerk were removed."
