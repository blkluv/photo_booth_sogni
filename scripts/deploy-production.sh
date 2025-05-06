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

# Check for server/.env file for credentials
if [ -f server/.env ]; then
  echo "📄 Using credentials from server/.env file"
  # Extract credentials from server/.env file
  SOGNI_USERNAME=$(grep SOGNI_USERNAME server/.env | cut -d= -f2)
  SOGNI_PASSWORD=$(grep SOGNI_PASSWORD server/.env | cut -d= -f2)
  SOGNI_APP_ID=$(grep SOGNI_APP_ID server/.env | cut -d= -f2)
  
  if [ -z "$SOGNI_USERNAME" ] || [ -z "$SOGNI_PASSWORD" ] || [ -z "$SOGNI_APP_ID" ]; then
    echo "⚠️ Warning: Some credentials are missing from server/.env"
  else
    echo "✅ Credentials found in server/.env"
  fi
else
  echo "❌ server/.env file not found! Deployment may fail due to missing credentials."
  
  # Try root .env as fallback
  if [ -f .env ]; then
    echo "📄 Using credentials from root .env file as fallback"
    export $(grep -v '^#' .env | xargs)
  else
    echo "❌ No .env files found! Deployment will likely fail."
    exit 1
  fi
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

# Create a temporary production .env file locally with proper variable substitution
show_step "Creating production environment file"
TEMP_ENV_FILE=$(mktemp)
cat > $TEMP_ENV_FILE << EOF
# Production environment variables
NODE_ENV=production
PORT=3001

# Sogni API credentials
SOGNI_USERNAME=$SOGNI_USERNAME
SOGNI_PASSWORD=$SOGNI_PASSWORD
SOGNI_APP_ID=$SOGNI_APP_ID
SOGNI_ENV=production

# App settings
APP_URL=https://superapps.sogni.ai/photobooth
API_URL=https://superapps.sogni.ai/photobooth/api
CLIENT_ORIGIN=https://superapps.sogni.ai
EOF

# Deploy the environment file
show_step "Deploying environment file"
echo "Debug: Credentials being deployed (username partly redacted):"
echo "SOGNI_USERNAME=${SOGNI_USERNAME:0:3}****"
echo "SOGNI_APP_ID=$SOGNI_APP_ID"
echo "SOGNI_ENV=production"

rsync -ar --progress $TEMP_ENV_FILE $REMOTE_HOST:$REMOTE_BACKEND_PATH/.env
if [ $? -ne 0 ]; then
  echo "❌ Environment file deployment failed! Exiting."
  rm -f $TEMP_ENV_FILE
  exit 1
fi
rm -f $TEMP_ENV_FILE
echo "✅ Environment file deployed successfully"

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
  cd /var/www/superapps.sogni.ai/photobooth-server
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
# Try both API endpoints for thoroughness
API_CHECK=$(curl -s -o /dev/null -w "%{http_code}" https://superapps.sogni.ai/photobooth/health || echo "failed")
if [ "$API_CHECK" = "200" ]; then
  echo "✅ API health check successful"
else
  echo "❌ API health check failed with status $API_CHECK"
  echo "⚠️ Warning: The API health endpoint may not be accessible."
fi

API_STATUS_CHECK=$(curl -s -o /dev/null -w "%{http_code}" https://superapps.sogni.ai/photobooth/api/sogni/status || echo "failed")
echo "API status check returned code: $API_STATUS_CHECK"
if [ "$API_STATUS_CHECK" = "200" ] || [ "$API_STATUS_CHECK" = "401" ]; then
  # 401 is acceptable as it means auth is required but endpoint is accessible
  echo "✅ API sogni/status endpoint accessible"
else
  echo "❌ API sogni/status check failed with status $API_STATUS_CHECK"
  echo "⚠️ Warning: The API endpoints may not be correctly configured."
fi

echo ""
echo "✅ Deployment completed at $(date)"
echo "=================================================="
echo "Your application should be available at:"
echo "Frontend: https://superapps.sogni.ai/photobooth/"
echo "Backend API: https://superapps.sogni.ai/photobooth/api/"
echo "Logs saved to: $LOG_FILE" 