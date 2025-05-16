#!/bin/bash

# Create a new .env file with working test credentials
cat > .env << 'EOL'
# Sogni Client credentials
SOGNI_APP_ID=photobooth-test
SOGNI_USERNAME=your_sogni_username
SOGNI_PASSWORD=your_sogni_password
SOGNI_ENV=production

# Server config
PORT=3001
CLIENT_ORIGIN=http://localhost:5173

# Redis config
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB_INDEX=1
REDIS_VERBOSE_LOGGING=true

# Debug options 
# Enable debug endpoints for Twitter OAuth (set to true to enable in production)
ALLOW_OAUTH_DEBUG=true
EOL

echo "✅ Created new .env file with demo credentials"
echo ""
echo "ℹ️  .env file contents (credentials redacted):"
cat .env | sed 's/PASSWORD=.*/PASSWORD=[REDACTED]/g'
echo ""

echo "ℹ️  If you're using Twitter/X sharing, add these to your .env file:"
echo "TWITTER_CLIENT_ID=your_twitter_client_id"
echo "TWITTER_CLIENT_SECRET=your_twitter_client_secret"
echo "TWITTER_REDIRECT_URI=http://localhost:3001/auth/x/callback"
echo ""

echo "🔄 Testing connection to Sogni API..."

# Test if the credentials work
node test-auth.js
EXIT_CODE=$?

if [ $EXIT_CODE -ne 0 ]; then
  echo ""
  echo "❌ Authentication failed with the current credentials."
  echo "🔑 Please edit the .env file with your valid Sogni credentials."
  echo ""
  echo "ℹ️  To restart the server after making changes:"
  echo "    npm run dev"
else
  echo ""
  echo "✅ Authentication successful!"
  echo ""
  echo "ℹ️  To restart the server with these credentials:"
  echo "    npm run dev"
fi

# Check if nginx configuration needs updating
FRONTEND_PORT=$(curl -s http://localhost:5175 >/dev/null 2>&1 && echo "5175")

echo ""
echo "ℹ️  Detected frontend running on port: $FRONTEND_PORT"
echo "ℹ️  To update nginx configuration for this port:"
echo "    cd .. && ./update-nginx.sh"
echo "" 