#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

GITHUB_PAGES_REPO="Grut505/grut505.github.io"

update_about_date() {
  local date_fr
  date_fr=$(date '+%d/%m/%Y')
  if [ -f "frontend/src/data/about.ts" ]; then
    sed -i "s|^  lastPublished: '.*'|  lastPublished: '${date_fr}'|" frontend/src/data/about.ts
    echo "  ✓ lastPublished mis à jour (${date_fr})"
  fi
}

cleanup_vite_temp_files() {
  local tracked
  tracked=$(git ls-files "frontend/vite.config.ts.timestamp-*.mjs")
  if [ -z "$tracked" ]; then
    return
  fi
  while IFS= read -r file; do
    if [ -n "$file" ] && [ ! -e "$file" ]; then
      git rm --cached --ignore-unmatch -- "$file" >/dev/null 2>&1 || true
    fi
  done <<< "$tracked"
}

echo "🚀 Déploiement Rememly → GitHub Pages"

echo "🗓️  Mise à jour de la date de publication..."
update_about_date
cleanup_vite_temp_files

echo "🔨 Build du frontend..."
cd frontend
npm run build
cd ..

echo "🌐 Push vers ${GITHUB_PAGES_REPO} (branch main)..."
cd frontend

TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

cp -R dist/* "$TMP_DIR"/
mkdir -p "$TMP_DIR/.github/workflows"
cat > "$TMP_DIR/.github/workflows/pages.yml" <<'YAML'
name: Deploy Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Configure Pages
        uses: actions/configure-pages@v5

      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: .

      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
YAML
cd "$TMP_DIR"
git init -q
git checkout -b main >/dev/null 2>&1
git add -A
git commit -m "Deploy: $(date '+%Y-%m-%d %H:%M:%S')" >/dev/null 2>&1
git remote add origin git@github-grut505:${GITHUB_PAGES_REPO}.git
git push -f origin main

cd "$SCRIPT_DIR"

echo "✅ Déploiement déclenché via GitHub Pages"

echo "⏳ Suivi du déploiement GitHub Pages..."

GITHUB_API="https://api.github.com/repos/${GITHUB_PAGES_REPO}/actions/runs"

if ! command -v curl >/dev/null 2>&1 || ! command -v jq >/dev/null 2>&1; then
  echo "⚠️  curl/jq non disponibles, suivi automatique impossible."
  echo "   Vérifiez: https://github.com/${GITHUB_PAGES_REPO}/actions"
  exit 0
fi

get_latest_run() {
  curl -s "${GITHUB_API}?per_page=1" | jq -r '.workflow_runs[0].id // empty'
}

get_run_status() {
  local run_id=$1
  curl -s "${GITHUB_API}/${run_id}" | jq -r '.status // empty'
}

get_run_conclusion() {
  local run_id=$1
  curl -s "${GITHUB_API}/${run_id}" | jq -r '.conclusion // empty'
}

sleep 3
RUN_ID=$(get_latest_run)

if [ -z "$RUN_ID" ]; then
  echo "⚠️  Impossible de récupérer le run ID"
  echo "   Vérifiez manuellement: https://github.com/${GITHUB_PAGES_REPO}/actions"
  exit 0
fi

echo "   Run ID: $RUN_ID"
echo "   URL: https://github.com/${GITHUB_PAGES_REPO}/actions/runs/${RUN_ID}"
echo "🔄 Suivi du workflow en cours..."

SPINNER=('⠋' '⠙' '⠹' '⠸' '⠼' '⠴' '⠦' '⠧' '⠇' '⠏')
SPIN_IDX=0
ELAPSED=0
MAX_WAIT=300

while [ $ELAPSED -lt $MAX_WAIT ]; do
  STATUS=$(get_run_status "$RUN_ID")

  if [ "$STATUS" = "completed" ]; then
    CONCLUSION=$(get_run_conclusion "$RUN_ID")
    echo ""
    if [ "$CONCLUSION" = "success" ]; then
      echo "✅ Déploiement GitHub Pages terminé avec succès !"
      exit 0
    else
      echo "❌ Déploiement échoué: $CONCLUSION"
      echo "   Vérifiez: https://github.com/${GITHUB_PAGES_REPO}/actions/runs/${RUN_ID}"
      exit 1
    fi
  fi

  printf "\r   ${SPINNER[$SPIN_IDX]} En cours... (%ds)" $ELAPSED
  SPIN_IDX=$(( (SPIN_IDX + 1) % 10 ))
  sleep 2
  ELAPSED=$((ELAPSED + 2))
done

echo ""
echo "⚠️  Déploiement toujours en cours après ${MAX_WAIT}s"
echo "   Vérifiez: https://github.com/${GITHUB_PAGES_REPO}/actions/runs/${RUN_ID}"
