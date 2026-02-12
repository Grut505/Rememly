#!/usr/bin/env bash
set -euo pipefail

# Encode Google Drive OAuth files for GitHub Actions secrets.
# Usage:
#   ./scripts/encode_github_secrets.sh
#   ./scripts/encode_github_secrets.sh --credentials path/to/credentials.json --token path/to/token.json
#   ./scripts/encode_github_secrets.sh --with-apps-script

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CREDENTIALS_PATH="${ROOT_DIR}/scripts/credentials.json"
TOKEN_PATH="${ROOT_DIR}/scripts/token.json"
WITH_APPS_SCRIPT="false"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --credentials)
      CREDENTIALS_PATH="${2:-}"
      shift 2
      ;;
    --token)
      TOKEN_PATH="${2:-}"
      shift 2
      ;;
    --with-apps-script)
      WITH_APPS_SCRIPT="true"
      shift
      ;;
    *)
      echo "Unknown argument: $1"
      echo "Allowed: --credentials <path> --token <path> --with-apps-script"
      exit 1
      ;;
  esac
done

if [ ! -f "$CREDENTIALS_PATH" ]; then
  echo "Missing credentials file: $CREDENTIALS_PATH"
  exit 1
fi

if [ ! -f "$TOKEN_PATH" ]; then
  echo "Missing token file: $TOKEN_PATH"
  exit 1
fi

encode_base64_single_line() {
  local file="$1"
  if base64 -w 0 "$file" >/dev/null 2>&1; then
    base64 -w 0 "$file"
  else
    base64 "$file" | tr -d '\n'
  fi
}

echo "GDRIVE_CREDENTIALS_JSON="
encode_base64_single_line "$CREDENTIALS_PATH"
echo
echo
echo "GDRIVE_TOKEN_JSON="
encode_base64_single_line "$TOKEN_PATH"
echo

if [ "$WITH_APPS_SCRIPT" = "true" ]; then
  echo
  echo "Apps Script property (raw JSON, NOT base64):"
  echo "GDRIVE_TOKEN_JSON="
  cat "$TOKEN_PATH"
  echo
fi
