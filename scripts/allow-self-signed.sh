#!/bin/bash

# Set environment variable to allow self-signed certificates
export NODE_TLS_REJECT_UNAUTHORIZED=0

# Run the provided command with the environment variable set
echo "⚠️ Allowing self-signed certificates for this session"
echo "⚠️ WARNING: This is insecure and should only be used for local development"

# Execute the command passed as arguments
if [ $# -eq 0 ]; then
  echo "Usage: ./scripts/allow-self-signed.sh <your-command>"
  echo "Example: ./scripts/allow-self-signed.sh npm run dev"
else
  exec "$@"
fi 