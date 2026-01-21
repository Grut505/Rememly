#!/bin/bash

# Script de déploiement frontend uniquement
# Build et déploie vers GitHub Pages

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

GITHUB_PAGES_REPO="Grut505/grut505.github.io"

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

echo "⏳ Attente du déploiement GitHub Pages..."
echo "   Actions: https://github.com/${GITHUB_PAGES_REPO}/actions"
echo ""

# Check if gh CLI is available
if command -v gh &> /dev/null; then
    echo "🔄 Suivi du workflow en cours..."

    # Wait a bit for the workflow to start
    sleep 5

    # Get the latest run
    RUN_ID=$(gh run list --repo "$GITHUB_PAGES_REPO" --limit 1 --json databaseId --jq '.[0].databaseId' 2>/dev/null || echo "")

    if [ -n "$RUN_ID" ]; then
        echo "   Run ID: $RUN_ID"
        echo "   URL: https://github.com/${GITHUB_PAGES_REPO}/actions/runs/${RUN_ID}"
        echo ""

        # Watch the run
        gh run watch "$RUN_ID" --repo "$GITHUB_PAGES_REPO" --exit-status && {
            echo ""
            echo "✅ Déploiement GitHub Pages terminé avec succès !"
        } || {
            echo ""
            echo "❌ Erreur lors du déploiement GitHub Pages"
            echo "   Vérifiez: https://github.com/${GITHUB_PAGES_REPO}/actions/runs/${RUN_ID}"
            exit 1
        }
    else
        echo "⚠️  Impossible de récupérer le run ID"
        echo "   Vérifiez manuellement: https://github.com/${GITHUB_PAGES_REPO}/actions"
    fi
else
    echo "ℹ️  gh CLI non installé - impossible de suivre le workflow automatiquement"
    echo "   Vérifiez manuellement: https://github.com/${GITHUB_PAGES_REPO}/actions"
fi

echo ""
echo "🎉 Déploiement frontend terminé !"
echo "   URL: https://grut505.github.io/Rememly/"
