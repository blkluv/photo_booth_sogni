#!/bin/bash

# Script to run tests with environment variables loaded from .env file

# Get the directory of this script
SCRIPT_DIR=$(dirname "$0")
PROJECT_ROOT=$(cd "$SCRIPT_DIR/../.." && pwd)

# Check if a test file was provided
if [ $# -lt 1 ]; then
  echo "Usage: $0 <test-file> [additional args]"
  echo "Example: $0 test-idle-timeout.js"
  exit 1
fi

TEST_FILE="$1"
shift  # Remove the first argument (TEST_FILE)

# Check if the test file exists
if [[ "$TEST_FILE" != /* ]]; then
  # Relative path provided
  if [[ "$TEST_FILE" != scripts/util/* && "$TEST_FILE" != ./scripts/util/* ]]; then
    # If not already in scripts/util, assume it's relative to scripts/util
    TEST_FILE="$SCRIPT_DIR/$TEST_FILE"
  fi
fi

if [ ! -f "$TEST_FILE" ]; then
  echo "Error: Test file not found: $TEST_FILE"
  exit 1
fi

echo "Running test with environment variables loaded from server/.env file"
echo "Test file: $TEST_FILE"

# Run the test script using the env helper
cd "$PROJECT_ROOT"
node --experimental-vm-modules "$SCRIPT_DIR/test-env-helper.js" "node --experimental-vm-modules $TEST_FILE $*" 