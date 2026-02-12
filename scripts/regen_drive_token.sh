#!/usr/bin/env bash
set -euo pipefail

# Regenerate Google Drive OAuth token.json used by PDF merge.
# Usage:
#   ./scripts/regen_drive_token.sh
#   ./scripts/regen_drive_token.sh --no-browser
#   ./scripts/regen_drive_token.sh --print-base64

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPTS_DIR="${ROOT_DIR}/scripts"
VENV_DIR="${SCRIPTS_DIR}/.venv"

NO_BROWSER="false"
PRINT_B64="false"

for arg in "$@"; do
  case "$arg" in
    --no-browser) NO_BROWSER="true" ;;
    --print-base64) PRINT_B64="true" ;;
    *)
      echo "Unknown argument: $arg"
      echo "Allowed: --no-browser --print-base64"
      exit 1
      ;;
  esac
done

cd "$SCRIPTS_DIR"

if [ ! -f "credentials.json" ]; then
  echo "Missing scripts/credentials.json"
  exit 1
fi

if [ ! -d "$VENV_DIR" ]; then
  python3 -m venv "$VENV_DIR"
fi

source "$VENV_DIR/bin/activate"
pip install -q -r merge_pdf_from_drive.requirements.txt

if [ -f "token.json" ]; then
  cp "token.json" "token.json.bak.$(date +%Y%m%d_%H%M%S)"
fi

CMD=(python merge_pdf_from_drive.py --credentials credentials.json --token token.json --auth-only)
if [ "$NO_BROWSER" = "true" ]; then
  CMD+=(--no-browser)
fi

"${CMD[@]}"

echo "Token regenerated: ${SCRIPTS_DIR}/token.json"

if [ "$PRINT_B64" = "true" ]; then
  echo
  echo "GDRIVE_TOKEN_JSON (base64):"
  base64 -w 0 token.json
  echo
fi

