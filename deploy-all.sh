#!/bin/bash

# Script de déploiement complet pour Rememly
# Déploie le backend (Apps Script) ET le frontend (GitHub Pages)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

DEPLOYMENT_ID="AKfycbyBK-9iXQ7bXvd26EN4qCz6DT2V_Z9pniGS2qrLaBP7pqXIQ29hGtmnQj2PP2LYCPHf"
BACKEND_URL="https://script.google.com/macros/s/${DEPLOYMENT_ID}/exec"
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

echo "🚀 Déploiement complet de Rememly"
echo ""

# Backend
echo "📤 Push et déploiement du backend vers Google Apps Script..."
cd backend
npx clasp push --force

DEPLOY_OUTPUT=$(npx clasp deploy --deploymentId "$DEPLOYMENT_ID" --description "Deploy $(date '+%Y-%m-%d %H:%M:%S')" 2>&1)
echo "$DEPLOY_OUTPUT"

# Extract version number
VERSION=$(echo "$DEPLOY_OUTPUT" | grep -oP '@\K[0-9]+' | head -1)
cd ..

if [ -n "$VERSION" ]; then
    echo ""
    echo "📝 Mise à jour des fichiers .env (version @$VERSION)..."

    # Update .env files
    sed -i "s|^VITE_APPS_SCRIPT_URL=.*|VITE_APPS_SCRIPT_URL=$BACKEND_URL|" frontend/.env
    sed -i "s|^VITE_BACKEND_VERSION=.*|VITE_BACKEND_VERSION=$VERSION|" frontend/.env
    sed -i "s|^VITE_APPS_SCRIPT_URL=.*|VITE_APPS_SCRIPT_URL=$BACKEND_URL|" frontend/.env.production
    sed -i "s|^VITE_BACKEND_VERSION=.*|VITE_BACKEND_VERSION=$VERSION|" frontend/.env.production

    echo "  ✓ .env et .env.production mis à jour"
fi

echo ""
echo "🗓️  Mise à jour de la date de publication..."
update_about_date

echo "✅ Backend déployé @$VERSION"
echo ""

# Git commit and push
echo "📦 Commit et push vers GitHub..."
cleanup_vite_temp_files
git add -A
git commit -m "Deploy: $(date '+%Y-%m-%d %H:%M:%S')" || echo "Rien à commiter"
git push
echo "✅ Pushé vers GitHub"
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

GITHUB_API="https://api.github.com/repos/${GITHUB_PAGES_REPO}/actions/runs"

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

echo "🔍 Recherche du workflow..."
RUN_ID=$(get_latest_run)

if [ -z "$RUN_ID" ]; then
    echo "⚠️  Impossible de récupérer le run ID"
    echo "   Vérifiez manuellement: https://github.com/${GITHUB_PAGES_REPO}/actions"
    echo ""
    echo "🎉 Déploiement terminé !"
    echo "   Backend: @$VERSION"
    echo "   Frontend: https://grut505.github.io/Rememly/"
    exit 0
fi

echo ""
echo "   Run ID: $RUN_ID"
echo "   URL: https://github.com/${GITHUB_PAGES_REPO}/actions/runs/${RUN_ID}"
echo ""
echo "🔄 Suivi du workflow en cours..."

# Polling loop with spinner
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
            echo "🎉 Déploiement complet terminé !"
            echo "   Backend: @$VERSION"
            echo "   Frontend: https://grut505.github.io/Rememly/"
            exit 0
        else
            echo "❌ Déploiement GitHub Pages échoué: $CONCLUSION"
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
echo ""
echo "   Backend: @$VERSION"
