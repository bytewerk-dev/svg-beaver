#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PANEL_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
DIST_DIR="${PANEL_ROOT}/dist"
STAGE_DIR="${DIST_DIR}/com.bytewerk.svgbeaver"
ZIP_PATH="${DIST_DIR}/com.bytewerk.svgbeaver.zip"
ZXP_PATH="${DIST_DIR}/com.bytewerk.svgbeaver.zxp"

rm -rf "${STAGE_DIR}" "${ZIP_PATH}" "${ZXP_PATH}"
mkdir -p "${STAGE_DIR}"

rsync -a \
  --delete \
  --exclude ".debug" \
  --exclude "dist" \
  --exclude ".DS_Store" \
  --exclude "scripts" \
  "${PANEL_ROOT}/" "${STAGE_DIR}/"

(
  cd "${DIST_DIR}"
  zip -qr "$(basename "${ZIP_PATH}")" "$(basename "${STAGE_DIR}")"
)

echo "Created unsigned package:"
echo "  ${ZIP_PATH}"

if [[ -n "${ZXPSIGNCMD:-}" && -n "${P12_CERT:-}" && -n "${P12_PASSWORD:-}" ]]; then
  "${ZXPSIGNCMD}" -sign "${STAGE_DIR}" "${ZXP_PATH}" "${P12_CERT}" "${P12_PASSWORD}"
  echo "Created signed ZXP:"
  echo "  ${ZXP_PATH}"
else
  echo
  echo "ZXP signing skipped."
  echo "Set these env vars to sign automatically:"
  echo "  ZXPSIGNCMD=/path/to/ZXPSignCmd"
  echo "  P12_CERT=/path/to/certificate.p12"
  echo "  P12_PASSWORD=your-password"
fi
