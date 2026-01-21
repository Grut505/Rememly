#!/bin/bash

# Script de déploiement backend uniquement
# Déploie le backend Apps Script et met à jour les .env du frontend

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

DEPLOYMENT_ID="AKfycbyBK-9iXQ7bXvd26EN4qCz6DT2V_Z9pniGS2qrLaBP7pqXIQ29hGtmnQj2PP2LYCPHf"
BACKEND_URL="https://script.google.com/macros/s/${DEPLOYMENT_ID}/exec"

echo "🚀 Déploiement du backend Rememly"
echo ""

# Push code to Apps Script
echo "📤 Push du code vers Google Apps Script..."
cd backend
npx clasp push
echo ""

# Deploy and capture output to get version
echo "🔄 Création d'un nouveau déploiement..."
DEPLOY_OUTPUT=$(npx clasp deploy --deploymentId "$DEPLOYMENT_ID" --description "Deploy $(date '+%Y-%m-%d %H:%M:%S')" 2>&1)
echo "$DEPLOY_OUTPUT"

# Extract version number from output (format: "- AKfycb... @47.")
VERSION=$(echo "$DEPLOY_OUTPUT" | grep -oP '@\K[0-9]+' | head -1)

if [ -z "$VERSION" ]; then
    echo "⚠️  Impossible d'extraire le numéro de version, utilisation manuelle requise"
    # Try to get version from deployments list
    echo "Tentative de récupération depuis la liste des déploiements..."
    VERSION=$(npx clasp deployments 2>&1 | grep "$DEPLOYMENT_ID" | grep -oP '@\K[0-9]+' | head -1)
fi

cd ..

if [ -n "$VERSION" ]; then
    echo ""
    echo "📝 Mise à jour des fichiers .env (version @$VERSION)..."

    # Update .env
    if [ -f "frontend/.env" ]; then
        sed -i "s|^VITE_APPS_SCRIPT_URL=.*|VITE_APPS_SCRIPT_URL=$BACKEND_URL|" frontend/.env
        sed -i "s|^VITE_BACKEND_VERSION=.*|VITE_BACKEND_VERSION=$VERSION|" frontend/.env
        echo "  ✓ frontend/.env"
    fi

    # Update .env.production
    if [ -f "frontend/.env.production" ]; then
        sed -i "s|^VITE_APPS_SCRIPT_URL=.*|VITE_APPS_SCRIPT_URL=$BACKEND_URL|" frontend/.env.production
        sed -i "s|^VITE_BACKEND_VERSION=.*|VITE_BACKEND_VERSION=$VERSION|" frontend/.env.production
        echo "  ✓ frontend/.env.production"
    fi

    echo ""
    echo "✅ Backend déployé @$VERSION"
    echo ""
    echo "URL: $BACKEND_URL"
else
    echo ""
    echo "⚠️  Déploiement effectué mais version non détectée"
    echo "    Mettez à jour manuellement VITE_BACKEND_VERSION dans les fichiers .env"
fi

echo ""
echo "Prochaines étapes :"
echo "  1. cd frontend && npm run build"
echo "  2. Déployer le frontend"
