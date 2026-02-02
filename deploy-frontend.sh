#!/bin/bash

# Script de déploiement frontend uniquement
# Build et déploie vers GitHub Pages avec suivi du workflow

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

GITHUB_PAGES_REPO="Grut505/grut505.github.io"
GITHUB_API="https://api.github.com/repos/${GITHUB_PAGES_REPO}/actions/runs"

update_about_date() {
    local date_fr
    date_fr=$(date '+%d/%m/%Y')
    if [ -f "frontend/src/data/about.ts" ]; then
        sed -i "s|^  lastPublished: '.*'|  lastPublished: '${date_fr}'|" frontend/src/data/about.ts
        echo "  ✓ lastPublished mis à jour (${date_fr})"
    fi
}

cleanup_vite_temp_files() {
    echo "🧹 Nettoyage des fichiers Vite temporaires..."
    local tracked
    tracked=$(git ls-files "frontend/vite.config.ts.timestamp-*.mjs")
    if [ -z "$tracked" ]; then
        echo "  ✓ Rien à nettoyer"
        return
    fi
    while IFS= read -r file; do
        if [ -n "$file" ] && [ ! -e "$file" ]; then
            git rm --cached --ignore-unmatch -- "$file" >/dev/null 2>&1 || true
            echo "  ✓ Retiré de l’index: $file"
        fi
    done <<< "$tracked"
}

echo "🚀 Déploiement du frontend Rememly"
echo ""

# Update about date
echo "🗓️  Mise à jour de la date de publication..."
update_about_date
cleanup_vite_temp_files
echo ""

# Build frontend
echo "🔨 Build du frontend..."
cd frontend
npm run build
cd ..
echo "✅ Frontend buildé"
echo ""

# Deploy to GitHub Pages
echo "🌐 Déploiement vers GitHub Pages..."
cd frontend
npm run deploy
cd ..
echo "✅ Push vers GitHub Pages effectué"
echo ""

# Push changes to Rememly repo
echo "📤 Push des changements Rememly..."
git add -A
if git diff --cached --quiet; then
    echo "  ✓ Aucun changement à pousser"
else
    git commit -m "chore: update frontend for deploy"
    git push
    echo "  ✓ Changements poussés"
fi
echo ""

# Wait for workflow and poll status
echo "⏳ Attente du déploiement GitHub Pages..."
sleep 3

# Get the latest workflow run
echo "🔍 Recherche du workflow..."

# Helper functions using jq for reliable JSON parsing
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

RUN_ID=$(get_latest_run)

if [ -z "$RUN_ID" ]; then
    echo "⚠️  Impossible de récupérer le run ID"
    echo "   Vérifiez manuellement: https://github.com/${GITHUB_PAGES_REPO}/actions"
    exit 0
fi

echo ""
echo "   Run ID: $RUN_ID"
echo "   URL: https://github.com/${GITHUB_PAGES_REPO}/actions/runs/${RUN_ID}"
echo ""
echo "🔄 Suivi du workflow en cours..."

# Polling loop
SPINNER=('⠋' '⠙' '⠹' '⠸' '⠼' '⠴' '⠦' '⠧' '⠇' '⠏')
SPIN_IDX=0
ELAPSED=0
MAX_WAIT=300  # 5 minutes max

while [ $ELAPSED -lt $MAX_WAIT ]; do
    STATUS=$(get_run_status "$RUN_ID")

    if [ "$STATUS" = "completed" ]; then
        CONCLUSION=$(get_run_conclusion "$RUN_ID")
        echo ""

        if [ "$CONCLUSION" = "success" ]; then
            echo "✅ Déploiement GitHub Pages terminé avec succès !"
            echo ""
            echo "🎉 Frontend déployé !"
            echo "   URL: https://grut505.github.io/Rememly/"
            exit 0
        else
            echo "❌ Déploiement échoué: $CONCLUSION"
            echo "   Vérifiez: https://github.com/${GITHUB_PAGES_REPO}/actions/runs/${RUN_ID}"
            exit 1
        fi
    fi

    # Show spinner with elapsed time
    printf "\r   ${SPINNER[$SPIN_IDX]} En cours... (%ds)" $ELAPSED
    SPIN_IDX=$(( (SPIN_IDX + 1) % 10 ))

    sleep 2
    ELAPSED=$((ELAPSED + 2))
done

echo ""
echo "⚠️  Timeout après ${MAX_WAIT}s - le workflow est peut-être encore en cours"
echo "   Vérifiez: https://github.com/${GITHUB_PAGES_REPO}/actions/runs/${RUN_ID}"
