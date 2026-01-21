#!/bin/bash

# Script de déploiement complet pour Rememly
# Déploie le backend (Apps Script) ET le frontend (GitHub Pages)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

DEPLOYMENT_ID="AKfycbyBK-9iXQ7bXvd26EN4qCz6DT2V_Z9pniGS2qrLaBP7pqXIQ29hGtmnQj2PP2LYCPHf"
BACKEND_URL="https://script.google.com/macros/s/${DEPLOYMENT_ID}/exec"
GITHUB_PAGES_REPO="Grut505/grut505.github.io"

echo "🚀 Déploiement complet de Rememly"
echo ""

# Backend
echo "📤 Push et déploiement du backend vers Google Apps Script..."
cd backend
npx clasp push

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

echo "✅ Backend déployé @$VERSION"
echo ""

# Frontend
echo "🔨 Build du frontend..."
cd frontend
npm run build
cd ..
echo "✅ Frontend buildé"
echo ""

# Git commit and push
echo "📦 Commit et push vers GitHub..."
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

# Wait for GitHub Pages deployment
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
    echo ""
    echo "   Pour installer gh: sudo apt install gh && gh auth login"
fi

echo ""
echo "🎉 Déploiement terminé !"
echo "   Backend: @$VERSION"
echo "   Frontend: https://grut505.github.io/Rememly/"
