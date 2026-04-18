#!/usr/bin/env bash
set -euo pipefail

CACHE_DIR="${HOME}/Library/Caches/CSXS/cep_cache"

if [[ ! -d "${CACHE_DIR}" ]]; then
  echo "CEP cache directory not found: ${CACHE_DIR}"
  exit 0
fi

find "${CACHE_DIR}" -maxdepth 1 -type f \( -name '*svgbeaver*' -o -name '*bytewerk*' \) -delete || true

echo "Removed CEP cache files matching svgbeaver/bytewerk from:"
echo "  ${CACHE_DIR}"
