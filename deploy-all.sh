#!/bin/bash

# Script de déploiement complet pour Rememly
# Déploie le backend ET le frontend

set -e

echo "🚀 Déploiement de Rememly"
echo ""

# Backend
echo "📤 Push et déploiement du backend vers Google Apps Script..."
cd backend
npx clasp push
npx clasp deploy --deploymentId AKfycbyBK-9iXQ7bXvd26EN4qCz6DT2V_Z9pniGS2qrLaBP7pqXIQ29hGtmnQj2PP2LYCPHf --description "Auto-deploy $(date '+%Y-%m-%d %H:%M:%S')"
cd ..
echo "✅ Backend déployé"
echo ""

# Frontend
echo "🔨 Build du frontend..."
cd frontend
npm run build
echo "✅ Frontend buildé"
cd ..
echo ""

echo "📦 Commit et push vers GitHub (Netlify déploiera automatiquement)..."
git add -A
git commit -m "Deploy: $(date '+%Y-%m-%d %H:%M:%S')" || echo "Rien à commiter"
git push
echo "✅ Pushé vers GitHub"
echo ""

echo "🎉 Déploiement terminé !"
echo "Attendez 1-2 minutes que Netlify déploie la nouvelle version."
