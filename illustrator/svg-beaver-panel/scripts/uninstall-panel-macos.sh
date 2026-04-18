#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="${HOME}/Library/Application Support/Adobe/CEP/extensions/com.bytewerk.svgbeaver"

if [[ -d "${INSTALL_DIR}" ]]; then
  rm -rf "${INSTALL_DIR}"
  echo "Removed ${INSTALL_DIR}"
else
  echo "Panel is not installed at ${INSTALL_DIR}"
fi
