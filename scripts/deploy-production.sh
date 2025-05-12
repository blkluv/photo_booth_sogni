#!/bin/bash

# Comprehensive production deployment script for Sogni Photobooth
# This script handles building, deploying, and starting both frontend and backend

set -e # Exit immediately if a command exits with a non-zero status

echo "🚀 Starting Sogni Photobooth Production Deployment"
echo "=================================================="

# Configuration
REMOTE_HOST="sogni-staging"
REMOTE_FRONTEND_PATH="/var/www/photobooth.sogni.ai"
REMOTE_BACKEND_PATH="/var/www/photobooth.sogni.ai-server"
LOG_FILE="deployment.log"

# Check for server/.env.production file. This file will be deployed AS IS to production.
if [ ! -f server/.env.production ]; then
  echo "❌ server/.env.production file not found! This file is required for production deployment."
  echo "   It should contain all necessary production environment variables."
  exit 1
else
  echo "📄 Found server/.env.production. This file will be deployed as the production .env file."
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

# Create necessary directories on the server
show_step "Creating directories on $REMOTE_HOST"
# Construct the base path from REMOTE_FRONTEND_PATH if they share a common parent like /var/www/photobooth.sogni.ai
# Assuming REMOTE_FRONTEND_PATH is /var/www/photobooth.sogni.ai 
# and REMOTE_BACKEND_PATH is /var/www/photobooth.sogni.ai-server
# We need to ensure /var/www exists and is writable, or use sudo mkdir for full paths and chown.

# Using a simpler approach: create each path and chown it to the current user on the remote machine.
# This assumes $USER on the remote machine is the one that should own the files.
ssh $REMOTE_HOST "sudo mkdir -p ${REMOTE_FRONTEND_PATH} && sudo chown -R \$USER:\$USER ${REMOTE_FRONTEND_PATH} && sudo mkdir -p ${REMOTE_BACKEND_PATH} && sudo chown -R \$USER:\$USER ${REMOTE_BACKEND_PATH}"

if [ $? -ne 0 ]; then
  echo "❌ Failed to create directories on $REMOTE_HOST! Check SSH connection and permissions for ${REMOTE_FRONTEND_PATH} and ${REMOTE_BACKEND_PATH}."
  exit 1
fi
echo "✅ Directories created successfully on $REMOTE_HOST"

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

# Deploy the environment file from local server/.env.production
show_step "Deploying production environment file from local server/.env.production"
rsync -ar --progress server/.env.production $REMOTE_HOST:$REMOTE_BACKEND_PATH/.env
if [ $? -ne 0 ]; then
  echo "❌ Production environment file (server/.env.production) deployment failed! Exiting."
  exit 1
fi
echo "✅ Production environment file (server/.env.production) deployed successfully to $REMOTE_BACKEND_PATH/.env"

# Setup and start services on remote server
show_step "Setting up and starting services on remote server"
ssh $REMOTE_HOST << EOF
  # Fix any shell issues by setting up a proper BASH environment
  export BASH_ENV=/dev/null
  export ENV=/dev/null
  
  # Ensure shell works properly with extglob patterns
  shopt -s extglob 2>/dev/null || true
  
  # Bypass problematic .functions file if it exists and contains the error
  if grep -q "rm -i -v !(*.gz)" ~/.functions 2>/dev/null; then
    echo "🔧 Detected problematic shell function, bypassing..."
    BASH_ENV=/dev/null bash -l || true
  fi

  # Check if port 3001 is already in use and kill the process if needed
  if lsof -i:3001 > /dev/null 2>&1; then
    echo "🔧 Port 3001 is already in use. Stopping existing process..."
    # Get the PID of the process using port 3001
    PID=$(lsof -i:3001 -t)
    if [ ! -z "$PID" ]; then
      echo "Stopping process with PID $PID"
      kill -9 $PID 2>/dev/null || true
      sleep 1
    fi
  fi

  # Install backend dependencies
  cd /var/www/photobooth.sogni.ai-server
  echo "📦 Installing backend dependencies..."
  npm install --omit=dev
  
  # Ensure correct permissions for environment file
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
  sudo cp /tmp/sogni-photobooth-nginx.conf /etc/nginx/conf.d/photobooth.sogni.ai.conf
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
echo "🔍 Checking backend health directly on port 3001..."
HEALTH_CHECK_DIRECT=$(curl -s -o /dev/null -w "%{http_code}" http://$REMOTE_HOST:3001/health || echo "failed")
if [ "$HEALTH_CHECK_DIRECT" = "200" ] || [ "$HEALTH_CHECK_DIRECT" = "404" ]; then # 404 if /health is under /api in app
  echo "✅ Backend is running (direct check status code: $HEALTH_CHECK_DIRECT)"
else
  echo "❌ Backend direct health check failed with status $HEALTH_CHECK_DIRECT"
  echo "⚠️ Warning: The backend may not be running correctly. Please check logs with: ssh $REMOTE_HOST 'pm2 logs sogni-photobooth-production'"
fi

echo "🔍 Checking frontend availability via Nginx (photobooth.sogni.ai)..."
FRONTEND_NGINX_CHECK=$(curl -s -o /dev/null -w "%{http_code}" -I http://photobooth.sogni.ai/ || echo "failed") # Check via HTTP as Nginx listens on 80
if [ "$FRONTEND_NGINX_CHECK" = "200" ] || [ "$FRONTEND_NGINX_CHECK" = "301" ] || [ "$FRONTEND_NGINX_CHECK" = "302" ]; then # 30x if Cloudflare redirects to HTTPS
  echo "✅ Frontend Nginx check successful (status code: $FRONTEND_NGINX_CHECK)"
else
  echo "❌ Frontend Nginx check failed with status $FRONTEND_NGINX_CHECK"
fi

echo "🔍 Checking API availability via Nginx (photobooth-api.sogni.ai)..."
API_NGINX_CHECK=$(curl -s -o /dev/null -w "%{http_code}" -I http://photobooth-api.sogni.ai/health || echo "failed") # Check via HTTP
if [ "$API_NGINX_CHECK" = "200" ] || [ "$API_NGINX_CHECK" = "301" ] || [ "$API_NGINX_CHECK" = "302" ]; then # 30x if Cloudflare redirects to HTTPS, 200 if /health is direct
  echo "✅ API Nginx check successful (status code: $API_NGINX_CHECK)"
else
  echo "❌ API Nginx check failed with status $API_NGINX_CHECK"
  echo "⚠️ Warning: The API through Nginx may not be correctly configured."
fi

echo ""
echo "✅ Deployment completed at $(date)"
echo "=================================================="
echo "Your application should be available at:"
echo "Frontend: https://photobooth.sogni.ai/"
echo "Backend API: https://photobooth-api.sogni.ai/"
echo "Logs saved to: $LOG_FILE" 