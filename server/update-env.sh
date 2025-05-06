#!/bin/bash

# Create a new .env file with working test credentials
cat > .env << 'EOL'
# Sogni Client credentials
SOGNI_APP_ID=photobooth-test
SOGNI_USERNAME=DemoUser
SOGNI_PASSWORD=Demo123!
SOGNI_ENV=production

# Server config
PORT=3001
CLIENT_ORIGIN=https://photobooth-local.sogni.ai
EOL

echo "✅ Created new .env file with demo credentials"
echo ""
echo "ℹ️  .env file contents (credentials redacted):"
cat .env | sed 's/PASSWORD=.*/PASSWORD=[REDACTED]/g'
echo ""
echo "⚠️  Note: These are example credentials. You need to replace them with valid credentials."
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