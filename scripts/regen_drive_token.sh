#!/usr/bin/env bash
set -euo pipefail

# Regenerate Google Drive OAuth token.json used by PDF merge.
# Browser-only flow: this script intentionally avoids --no-browser so OAuth
# happens in a real browser session.
# Usage:
#   ./scripts/regen_drive_token.sh
#   ./scripts/regen_drive_token.sh --print-base64
#   ./scripts/regen_drive_token.sh --print-secrets

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPTS_DIR="${ROOT_DIR}/scripts"
VENV_DIR="${SCRIPTS_DIR}/.venv"

PRINT_B64="false"
PRINT_SECRETS="false"

for arg in "$@"; do
  case "$arg" in
    --print-base64) PRINT_B64="true" ;;
    --print-secrets) PRINT_SECRETS="true" ;;
    *)
      echo "Unknown argument: $arg"
      echo "Allowed: --print-base64 --print-secrets"
      exit 1
      ;;
  esac
done

cd "$SCRIPTS_DIR"

if [ "${DISPLAY:-}" = "" ] && [ "${WAYLAND_DISPLAY:-}" = "" ]; then
  echo "No graphical browser session detected."
  echo "Run this script from a machine with a real browser."
  echo "If you are on SSH/headless, run it locally and copy token.json back."
  exit 1
fi

if [ -n "${BROWSER:-}" ]; then
  case "${BROWSER}" in
    *w3m*|*lynx*|*links*|*elinks*|*www-browser*)
      echo "BROWSER is set to a CLI browser (${BROWSER})."
      echo "Unset BROWSER or set it to a graphical browser (e.g. firefox/chrome)."
      exit 1
      ;;
  esac
fi

pick_graphical_browser() {
  if command -v wslview >/dev/null 2>&1; then
    echo "wslview"
    return 0
  fi
  for candidate in \
    google-chrome \
    chromium \
    chromium-browser \
    firefox \
    brave-browser \
    microsoft-edge
  do
    if command -v "$candidate" >/dev/null 2>&1; then
      echo "$candidate"
      return 0
    fi
  done
  return 1
}

if [ -z "${BROWSER:-}" ]; then
  if GUI_BROWSER="$(pick_graphical_browser)"; then
    export BROWSER="$GUI_BROWSER"
  elif [ -n "${WSL_INTEROP:-}" ] && command -v powershell.exe >/dev/null 2>&1; then
    WSL_BROWSER_WRAPPER="${SCRIPTS_DIR}/.wsl_browser_open.sh"
    cat > "${WSL_BROWSER_WRAPPER}" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
URL="${1:-}"
if [ -z "${URL}" ]; then
  exit 1
fi
powershell.exe -NoProfile -Command "Start-Process '$URL'" >/dev/null 2>&1
SH
    chmod +x "${WSL_BROWSER_WRAPPER}"
    export BROWSER="${WSL_BROWSER_WRAPPER}"
  else
    echo "No supported graphical browser found on this machine."
    echo "Install one (firefox/chromium/chrome), or on WSL install wslu (wslview)."
    echo "You can also run this script directly on your local desktop."
    exit 1
  fi
fi

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

python merge_pdf_from_drive.py --credentials credentials.json --token token.json --auth-only

echo "Token regenerated: ${SCRIPTS_DIR}/token.json"
echo
echo "Apps Script property:"
echo "  Key: GDRIVE_TOKEN_JSON"
echo "  Value: raw JSON from scripts/token.json (NOT base64)"

if [ "$PRINT_B64" = "true" ]; then
  echo
  echo "GDRIVE_TOKEN_JSON (base64):"
  if base64 -w 0 token.json >/dev/null 2>&1; then
    base64 -w 0 token.json
  else
    base64 token.json | tr -d '\n'
  fi
  echo
fi

if [ "$PRINT_SECRETS" = "true" ]; then
  echo
  "${SCRIPTS_DIR}/encode_github_secrets.sh" --credentials "${SCRIPTS_DIR}/credentials.json" --token "${SCRIPTS_DIR}/token.json"
  echo
fi
