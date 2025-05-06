#!/bin/bash

# Script to update Nginx configuration for Sogni Photobooth
# This script copies the local.conf file to the nginx configuration directory
# and reloads nginx to apply the changes

set -e  # Exit immediately if a command exits with a non-zero status

SCRIPT_DIR=$(dirname "$0")
PROJECT_ROOT=$(cd "$SCRIPT_DIR/../.." && pwd)

# Config paths
NGINX_CONFIG_SRC="$PROJECT_ROOT/scripts/nginx/local.conf"
NGINX_CONFIG_DEST="/opt/homebrew/etc/nginx/servers/photobooth-local.conf"
SSL_DIR="/opt/homebrew/etc/nginx/ssl"

# Function to show usage
function show_usage {
  echo "Usage: $0 [--help]"
  echo ""
  echo "Updates the Nginx configuration for Sogni Photobooth local development."
  echo "Requires sudo privileges to copy files and reload Nginx."
  echo ""
  echo "Options:"
  echo "  --help    Show this help message"
}

# Check for help parameter
if [[ "$1" == "--help" ]]; then
  show_usage
  exit 0
fi

echo "===== Sogni Photobooth Nginx Configuration Update ====="

# Check if Nginx is installed
if ! command -v nginx &> /dev/null; then
  echo "❌ ERROR: Nginx is not installed or not found in PATH"
  echo "   Please install Nginx first (e.g., 'brew install nginx')"
  exit 1
fi

# Create SSL directory if it doesn't exist
echo "Creating SSL directory if needed..."
sudo mkdir -p "$SSL_DIR"

# Check if SSL certificates exist
if [[ ! -f "$PROJECT_ROOT/ssl/local.cert" ]] || [[ ! -f "$PROJECT_ROOT/ssl/local.key" ]]; then
  echo "⚠️ WARNING: SSL certificates not found in $PROJECT_ROOT/ssl/"
  echo "   You may need to create self-signed certificates for secure local development."
else
  # Copy SSL certificates
  echo "Copying SSL certificates..."
  sudo cp "$PROJECT_ROOT/ssl/local.cert" "$SSL_DIR/sogni-local.crt"
  sudo cp "$PROJECT_ROOT/ssl/local.key" "$SSL_DIR/sogni-local.key"
  sudo chmod 644 "$SSL_DIR/sogni-local.crt"
  sudo chmod 600 "$SSL_DIR/sogni-local.key"
  echo "✅ SSL certificates copied successfully"
fi

# Create servers directory if it doesn't exist
echo "Creating Nginx servers directory if needed..."
sudo mkdir -p "$(dirname "$NGINX_CONFIG_DEST")"

# Copy config file
echo "Copying Nginx configuration..."
sudo cp "$NGINX_CONFIG_SRC" "$NGINX_CONFIG_DEST"
echo "✅ Nginx configuration copied to $NGINX_CONFIG_DEST"

# Test Nginx configuration
echo "Testing Nginx configuration..."
sudo nginx -t
if [ $? -ne 0 ]; then
  echo "❌ ERROR: Nginx configuration test failed"
  echo "   Please check the errors above and fix the configuration"
  exit 1
fi

# Reload Nginx
echo "Reloading Nginx..."
sudo nginx -s reload
if [ $? -ne 0 ]; then
  echo "❌ ERROR: Failed to reload Nginx"
  exit 1
fi

echo "✅ Nginx configuration updated and reloaded successfully"
echo ""
echo "You should now be able to access the application at:"
echo "  https://photobooth-local.sogni.ai"
echo ""
echo "If you cannot access the site, please check:"
echo "1. Your /etc/hosts file includes '127.0.0.1 photobooth-local.sogni.ai'"
echo "2. Both frontend and backend servers are running"
echo "   Run: ./scripts/run.sh start"
echo "3. Check for any error messages in the Nginx error log"
echo "   Run: tail -f /opt/homebrew/var/log/nginx/error.log" 