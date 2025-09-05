#!/bin/bash

# Quick fix script for Node Among Us theme 403 Forbidden error
# This script fixes file permissions for theme images on the production server

set -e

echo "🔧 Fixing file permissions for Node Among Us theme"
echo "=================================================="

# Configuration
REMOTE_HOST="sogni-staging"
REMOTE_FRONTEND_PATH="/var/www/photobooth.sogni.ai"

# Function to display progress
function show_step() {
  echo ""
  echo "📋 $1"
  echo "------------------------------------------------"
}

show_step "Fixing file permissions on production server"

# Fix permissions for all static assets, focusing on theme images
ssh $REMOTE_HOST << EOF
  echo "🔍 Checking current permissions for Node Among Us theme files..."
  ls -la ${REMOTE_FRONTEND_PATH}/events/nodes-among-us/ || echo "Directory not found"
  
  echo "🔧 Setting correct permissions for all theme images..."
  find ${REMOTE_FRONTEND_PATH}/events -type f \( -name '*.png' -o -name '*.jpg' -o -name '*.jpeg' -o -name '*.gif' -o -name '*.svg' \) -print0 | xargs -0 chmod 644
  
  echo "🔧 Setting correct permissions for theme config files..."
  find ${REMOTE_FRONTEND_PATH}/events -type f -name '*.json' -print0 | xargs -0 chmod 644
  
  echo "🔧 Setting correct directory permissions..."
  find ${REMOTE_FRONTEND_PATH}/events -type d -print0 | xargs -0 chmod 755
  
  echo "✅ Permissions fixed. Checking Node Among Us theme files again..."
  ls -la ${REMOTE_FRONTEND_PATH}/events/nodes-among-us/ || echo "Directory not found"
EOF

if [ $? -eq 0 ]; then
  echo ""
  echo "✅ File permissions fixed successfully!"
  echo "The Node Among Us theme should now work correctly."
  echo ""
  echo "🔍 Test the fix by visiting:"
  echo "https://photobooth.sogni.ai/events/nodes-among-us/narrow_1.png"
else
  echo "❌ Failed to fix permissions. Please check SSH connection and server access."
  exit 1
fi
