#!/bin/bash

# Script de déploiement Git uniquement
# Commit + push vers GitHub (inclut le nettoyage Vite)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

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

COMMIT_MSG="${1:-Deploy: $(date '+%Y-%m-%d %H:%M:%S')}"

echo "📦 Commit et push vers GitHub..."
cleanup_vite_temp_files
git add -A
git commit -m "$COMMIT_MSG" || echo "Rien à commiter"
git push
echo "✅ Pushé vers GitHub"
