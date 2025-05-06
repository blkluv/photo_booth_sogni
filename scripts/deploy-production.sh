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
SOGNI_USERNAME=${VITE_SOGNI_USERNAME}
SOGNI_PASSWORD=${VITE_SOGNI_PASSWORD}
SOGNI_APP_ID=${VITE_SOGNI_APP_ID}
SOGNI_ENV=production

# App settings
APP_URL=https://superapps.sogni.ai/photobooth
API_URL=https://superapps.sogni.ai/photobooth/api
ENVFILE

  # Ensure permissions are correct
  chmod 600 .env
  
  # Create or update systemd service for backend
  echo "🔧 Setting up systemd service for backend..."
  sudo tee /etc/systemd/system/sogni-photobooth.service > /dev/null << 'SYSTEMDFILE'
[Unit]
Description=Sogni Photobooth Backend
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/superapps.sogni.ai/photobooth-server
ExecStart=/usr/bin/node index.js
Restart=on-failure
Environment=NODE_ENV=production
# Load all environment variables from the .env file
EnvironmentFile=/var/www/superapps.sogni.ai/photobooth-server/.env

[Install]
WantedBy=multi-user.target
SYSTEMDFILE

  # Reload systemd, enable and restart service
  sudo systemctl daemon-reload
  sudo systemctl enable sogni-photobooth.service
  sudo systemctl restart sogni-photobooth.service
  
  # Check status of the service
  echo "📊 Backend service status:"
  sudo systemctl status sogni-photobooth.service --no-pager
  
  # Check that nginx is properly configured
  echo "🔍 Verifying nginx configuration..."
  sudo cp /tmp/sogni-photobooth-nginx.conf /etc/nginx/sites-available/sogni-photobooth
  sudo ln -sf /etc/nginx/sites-available/sogni-photobooth /etc/nginx/sites-enabled/sogni-photobooth
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
curl -s https://superapps.sogni.ai/photobooth/api/health || echo "❌ Backend health check failed"

echo "🔍 Checking frontend access..."
curl -s -I https://superapps.sogni.ai/photobooth/ | head -n 1 || echo "❌ Frontend access check failed"

echo ""
echo "✅ Deployment completed at $(date)"
echo "=================================================="
echo "Frontend: https://superapps.sogni.ai/photobooth/"
echo "Backend API: https://superapps.sogni.ai/photobooth/api/"
echo "Logs saved to: $LOG_FILE" 