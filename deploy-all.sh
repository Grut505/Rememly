#!/bin/bash

# Script de déploiement complet pour Rememly
# Déploie le backend ET le frontend

set -e

echo "🚀 Déploiement de Rememly"
echo ""

# Backend
echo "📤 Push du backend vers Google Apps Script..."
cd backend
npx clasp push
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
