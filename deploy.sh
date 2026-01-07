#!/bin/bash

# Deployment script for Rememly
# Builds and deploys frontend to Vercel

set -e

echo "🔨 Building frontend..."
cd "$(dirname "$0")/frontend"
npm run build

echo ""
echo "📦 Build complete!"
echo ""
echo "🚀 To deploy to Vercel, run ONE of these options:"
echo ""
echo "Option 1 - Via Vercel Dashboard (RECOMMENDED):"
echo "  1. Go to https://vercel.com/dashboard"
echo "  2. Click on your Rememly project"
echo "  3. Click 'Deployments' tab"
echo "  4. Click '...' on the latest deployment"
echo "  5. Click 'Redeploy' and check 'Use existing Build Cache: NO'"
echo ""
echo "Option 2 - Trigger webhook (may use old code):"
echo "  curl -X POST https://api.vercel.com/v1/integrations/deploy/prj_Imc8xtmeWxZLwaJOxvv0llyP5Ptz/X1fbMxHwHg"
echo ""
echo "Option 3 - Manual upload (if you have dist/ ready):"
echo "  npx vercel --prod --yes --cwd frontend"
echo ""
