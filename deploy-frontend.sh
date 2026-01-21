#!/bin/bash

# Script de déploiement frontend uniquement
# Build et déploie vers GitHub Pages avec suivi du workflow

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

GITHUB_PAGES_REPO="Grut505/grut505.github.io"
GITHUB_API="https://api.github.com/repos/${GITHUB_PAGES_REPO}/actions/runs"

echo "🚀 Déploiement du frontend Rememly"
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

# Wait for workflow and poll status
echo "⏳ Attente du déploiement GitHub Pages..."
sleep 3

# Get the latest workflow run
echo "🔍 Recherche du workflow..."

# Try to get run ID using curl (works without gh CLI)
get_latest_run() {
    curl -s "${GITHUB_API}?per_page=1" | grep -o '"id":[0-9]*' | head -1 | grep -o '[0-9]*'
}

get_run_status() {
    local run_id=$1
    curl -s "${GITHUB_API}/${run_id}" | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4
}

get_run_conclusion() {
    local run_id=$1
    curl -s "${GITHUB_API}/${run_id}" | grep -o '"conclusion":"[^"]*"' | head -1 | cut -d'"' -f4
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
