#!/bin/bash

# Comprehensive staging deployment script for Sogni Photobooth
# This script handles building, deploying, and starting both frontend and backend
#
# Environment file priority:
# 1. server/.env.staging - Used for backend deployment (highest priority)
# 2. .env.staging - Used for environment variables during build
# 3. .env - Fallback if no staging files exist

set -e # Exit immediately if a command exits with a non-zero status

echo "🚀 Starting Sogni Photobooth Staging Deployment"
echo "=================================================="

# Configuration
REMOTE_HOST="sogni-staging"
REMOTE_FRONTEND_PATH="/var/www/photobooth-staging.sogni.ai/frontend"
REMOTE_BACKEND_PATH="/var/www/photobooth-staging.sogni.ai/backend"
LOG_FILE="staging-deployment.log"

# Load environment variables from .env.staging only
if [ -f .env.staging ]; then
  echo "📄 Loading environment variables from .env.staging"
  export $(grep -v '^#' .env.staging | xargs)
else
  echo "❌ No .env.staging file found! Cannot deploy to staging without staging configuration."
  echo "Please create a .env.staging file with the necessary staging credentials."
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

# Build frontend with staging configuration
show_step "Building frontend application for staging"
npm run build -- --mode staging
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

# Copy server/.env.staging to server if it exists
if [ -f server/.env.staging ]; then
  show_step "Copying server/.env.staging to server"
  rsync -ar --progress server/.env.staging $REMOTE_HOST:/tmp/env.staging
  echo "✅ server/.env.staging copied to server"
else
  echo "ℹ️ No server/.env.staging found, will create .env from variables"
fi

# Deploy nginx configuration
show_step "Deploying nginx configuration"
rsync -ar --progress scripts/nginx/staging.conf $REMOTE_HOST:/tmp/sogni-photobooth-staging.conf
if [ $? -ne 0 ]; then
  echo "❌ Nginx configuration deployment failed! Exiting."
  exit 1
fi
echo "✅ Nginx configuration deployed to temp location"

# Setup and start services on remote server
show_step "Setting up and starting services on remote server"
ssh $REMOTE_HOST << EOF
  # Install backend dependencies
  cd $REMOTE_BACKEND_PATH
  echo "📦 Installing backend dependencies..."
  npm install --production
  
  # Setup environment variables
  echo "🔧 Setting up environment variables..."
  
  # Check if server/.env.staging exists locally and copy it to the server
  if [ -f /tmp/env.staging ]; then
    echo "📄 Using server/.env.staging file"
    cp /tmp/env.staging .env
  else
    # Create .env file from variables if no server/.env.staging found
    echo "📄 Creating .env file (no server/.env.staging found)"
    cat > .env << 'ENVFILE'
# Staging environment variables
NODE_ENV=staging
PORT=3002

# Sogni API credentials
SOGNI_USERNAME=${VITE_SOGNI_USERNAME}
SOGNI_PASSWORD=${VITE_SOGNI_PASSWORD}
SOGNI_APP_ID=${VITE_SOGNI_APP_ID}
SOGNI_ENV=staging

# App settings
APP_URL=http://photobooth-staging.sogni.ai
API_URL=http://photobooth-staging.sogni.ai/api
ENVFILE
  fi

  # Ensure permissions are correct
  chmod 600 .env
  
  # Create or update systemd service for backend
  echo "🔧 Setting up systemd service for backend..."
  sudo tee /etc/systemd/system/sogni-photobooth-staging.service > /dev/null << 'SYSTEMDFILE'
[Unit]
Description=Sogni Photobooth Staging Backend
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=${REMOTE_BACKEND_PATH}
ExecStart=/usr/bin/node index.js
Restart=on-failure
Environment=NODE_ENV=staging
# Load all environment variables from the .env file
EnvironmentFile=${REMOTE_BACKEND_PATH}/.env

[Install]
WantedBy=multi-user.target
SYSTEMDFILE

  # Reload systemd, enable and restart service
  sudo systemctl daemon-reload
  sudo systemctl enable sogni-photobooth-staging.service
  sudo systemctl restart sogni-photobooth-staging.service
  
  # Check status of the service
  echo "📊 Backend service status:"
  sudo systemctl status sogni-photobooth-staging.service --no-pager
  
  # Check that nginx is properly configured
  echo "🔍 Verifying nginx configuration..."
  sudo cp /tmp/sogni-photobooth-staging.conf /etc/nginx/sites-available/sogni-photobooth-staging
  sudo ln -sf /etc/nginx/sites-available/sogni-photobooth-staging /etc/nginx/sites-enabled/sogni-photobooth-staging
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
HEALTH_CHECK=$(curl -s -o /dev/null -w "%{http_code}" http://$REMOTE_HOST:3002/health || echo "failed")
if [ "$HEALTH_CHECK" = "200" ]; then
  echo "✅ Backend health check successful"
else
  echo "❌ Backend health check failed with status $HEALTH_CHECK"
  echo "⚠️ Warning: The backend may not be running correctly. Please check logs on the server."
fi

echo "🔍 Checking nginx configuration..."
NGINX_CHECK=$(curl -s -o /dev/null -w "%{http_code}" -I http://$REMOTE_HOST/ || echo "failed")
if [ "$NGINX_CHECK" = "200" ] || [ "$NGINX_CHECK" = "301" ] || [ "$NGINX_CHECK" = "302" ]; then
  echo "✅ Nginx configuration check successful"
else
  echo "❌ Nginx check failed with status $NGINX_CHECK"
  echo "⚠️ Warning: The nginx configuration may not be correct. Please check /etc/nginx/sites-enabled/"
fi

echo ""
echo "✅ Deployment completed at $(date)"
echo "=================================================="
echo "Your staging application should be available at:"
echo "Frontend: http://photobooth-staging.sogni.ai/"
echo "Backend API: http://photobooth-staging.sogni.ai/api/"
if [ -f server/.env.staging ]; then
  echo "✅ Used server/.env.staging for backend configuration"
else
  echo "⚠️ Created .env from environment variables (server/.env.staging not found)"
fi
echo "Logs saved to: $LOG_FILE" 