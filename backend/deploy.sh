#!/bin/bash

# Deploy backend and update frontend .env automatically

echo "📤 Pushing backend to Google Apps Script..."
npx clasp push

echo "🚀 Deploying new version..."
DEPLOYMENT_OUTPUT=$(npx clasp deploy --description "Auto-deploy $(date '+%Y-%m-%d %H:%M:%S')")

# Extract deployment ID from output
DEPLOYMENT_ID=$(echo "$DEPLOYMENT_OUTPUT" | grep -oP 'AKfycb[a-zA-Z0-9_-]+' | tail -1)

if [ -z "$DEPLOYMENT_ID" ]; then
  echo "❌ Failed to extract deployment ID"
  exit 1
fi

echo "✅ Deployed with ID: $DEPLOYMENT_ID"

# Update frontend .env
FRONTEND_ENV="../frontend/.env"
NEW_URL="https://script.google.com/macros/s/${DEPLOYMENT_ID}/exec"

echo "🔧 Updating frontend .env with new URL..."
sed -i "s|VITE_APPS_SCRIPT_URL=.*|VITE_APPS_SCRIPT_URL=${NEW_URL}|" "$FRONTEND_ENV"

echo "✅ Frontend .env updated!"
echo ""
echo "🎉 Deployment complete!"
echo "New URL: $NEW_URL"
echo ""
echo "⚠️  Remember to restart your dev server if it's running!"
