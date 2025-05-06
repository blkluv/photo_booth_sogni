#!/bin/bash

# Comprehensive production deployment script for Sogni Photobooth
# This script handles building, deploying, and starting both frontend and backend

set -e # Exit immediately if a command exits with a non-zero status

echo "🚀 Starting Sogni Photobooth Production Deployment"
echo "=================================================="

# Configuration
REMOTE_HOST="sogni-api"
REMOTE_FRONTEND_PATH="/var/www/superapps.sogni.ai/photobooth"
REMOTE_BACKEND_PATH="/var/www/superapps.sogni.ai/photobooth-server"
LOG_FILE="deployment.log"

# Load environment variables from .env
if [ -f .env ]; then
  echo "📄 Loading environment variables from .env"
  export $(grep -v '^#' .env | xargs)
else
  echo "❌ .env file not found! Deployment may fail due to missing credentials."
  echo "Please create a .env file with the necessary credentials."
  exit 1
fi

# Start logging
exec > >(tee -a $LOG_FILE) 2>&1
echo "Deployment started at $(date)"

# Function to display progress
function show_step() {
  echo ""
  echo "📋 $1"
  echo "------------------------------------------------"
}

# Build frontend
show_step "Building frontend application"
npm run build
if [ $? -ne 0 ]; then
  echo "❌ Frontend build failed! Exiting."
  exit 1
fi
echo "✅ Frontend built successfully"

# Deploy frontend
show_step "Deploying frontend to $REMOTE_HOST:$REMOTE_FRONTEND_PATH"
rsync -ar --progress dist/ $REMOTE_HOST:$REMOTE_FRONTEND_PATH/
if [ $? -ne 0 ]; then
  echo "❌ Frontend deployment failed! Exiting."
  exit 1
fi
echo "✅ Frontend deployed successfully"

# Deploy backend
show_step "Deploying backend to $REMOTE_HOST:$REMOTE_BACKEND_PATH"
rsync -ar --progress server/ $REMOTE_HOST:$REMOTE_BACKEND_PATH/ --exclude node_modules
if [ $? -ne 0 ]; then
  echo "❌ Backend deployment failed! Exiting."
  exit 1
fi
echo "✅ Backend files deployed successfully"

# Deploy nginx configuration
show_step "Deploying nginx configuration"
rsync -ar --progress scripts/nginx/production.conf $REMOTE_HOST:/tmp/sogni-photobooth-nginx.conf
if [ $? -ne 0 ]; then
  echo "❌ Nginx configuration deployment failed! Exiting."
  exit 1
fi
echo "✅ Nginx configuration deployed to temp location"

# Setup and start services on remote server
show_step "Setting up and starting services on remote server"
ssh $REMOTE_HOST << EOF
  # Install backend dependencies
  cd /var/www/superapps.sogni.ai/photobooth-server
  echo "📦 Installing backend dependencies..."
  npm install --production
  
  # Setup environment variables
  echo "🔧 Setting up environment variables..."
  cat > .env << 'ENVFILE'
# Production environment variables
NODE_ENV=production
PORT=3001

# Sogni API credentials
SOGNI_USERNAME=
SOGNI_PASSWORD=
SOGNI_APP_ID=
SOGNI_ENV=production

# App settings
APP_URL=https://superapps.sogni.ai/photobooth
API_URL=https://superapps.sogni.ai/photobooth/api
ENVFILE

  # Ensure permissions are correct
  chmod 600 .env
  
  # Install PM2 if not already installed
  if ! command -v pm2 &> /dev/null; then
    echo "Installing PM2 process manager..."
    npm install -g pm2
  fi
  
  # Start or restart the backend using PM2
  echo "🔧 Starting backend service with PM2..."
  pm2 delete sogni-photobooth-production 2>/dev/null || true
  PORT=3001 pm2 start index.js --name sogni-photobooth-production
  pm2 save
  
  # Setup PM2 to start on system boot
  echo "🔧 Configuring PM2 to start on system boot..."
  pm2 startup | tail -1 | bash || echo "PM2 startup command failed, may need manual configuration"
  
  # Check service status
  echo "📊 Backend service status:"
  pm2 status sogni-photobooth-production
  
  # Check that nginx is properly configured
  echo "🔍 Verifying nginx configuration..."
  sudo cp /tmp/sogni-photobooth-nginx.conf /etc/nginx/conf.d/superapps.sogni.ai.conf
  sudo nginx -t
  if [ $? -eq 0 ]; then
    sudo systemctl reload nginx
    echo "✅ Nginx configuration is valid and reloaded"
  else
    echo "❌ Nginx configuration test failed!"
  fi
EOF

if [ $? -ne 0 ]; then
  echo "❌ Remote setup failed! Please check the logs for details."
  exit 1
fi

# Verify deployment
show_step "Verifying deployment"
echo "🔍 Checking backend health..."
HEALTH_CHECK=$(curl -s -o /dev/null -w "%{http_code}" https://superapps.sogni.ai/photobooth/health || echo "failed")
if [ "$HEALTH_CHECK" = "200" ]; then
  echo "✅ Backend health check successful"
else
  echo "❌ Backend health check failed with status $HEALTH_CHECK"
  echo "⚠️ Warning: The backend may not be running correctly. Please check logs with: ssh $REMOTE_HOST 'pm2 logs sogni-photobooth-production'"
fi

echo "🔍 Checking frontend..."
FRONTEND_CHECK=$(curl -s -o /dev/null -w "%{http_code}" -I https://superapps.sogni.ai/photobooth/ || echo "failed")
if [ "$FRONTEND_CHECK" = "200" ] || [ "$FRONTEND_CHECK" = "301" ] || [ "$FRONTEND_CHECK" = "302" ]; then
  echo "✅ Frontend check successful"
else
  echo "❌ Frontend check failed with status $FRONTEND_CHECK"
  echo "⚠️ Warning: The frontend may not be accessible. Please check nginx configuration."
fi

echo "🔍 Checking API access..."
API_CHECK=$(curl -s -o /dev/null -w "%{http_code}" https://superapps.sogni.ai/photobooth/api/sogni/status || echo "failed")
if [ "$API_CHECK" = "200" ]; then
  echo "✅ API access check successful"
else
  echo "❌ API access check failed with status $API_CHECK"
  echo "⚠️ Warning: The API may not be accessible. Please check nginx configuration and backend logs."
fi

echo ""
echo "✅ Deployment completed at $(date)"
echo "=================================================="
echo "Your application should be available at:"
echo "Frontend: https://superapps.sogni.ai/photobooth/"
echo "Backend API: https://superapps.sogni.ai/photobooth/api/"
echo "Logs saved to: $LOG_FILE" 