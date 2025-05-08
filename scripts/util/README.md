# Sogni Photobooth Test Utilities

This directory contains test utilities for the Sogni Photobooth application, particularly focused on testing WebSocket connections and client cleanup.

## Test Scripts

### Environment Setup

- **env-loader.js**: Module that loads environment variables from `server/.env` file
- **test-env-helper.js**: Utility for running test scripts with environment variables from `server/.env`

### Test Runners

- **run-env-test.sh**: Bash script to run tests with environment variables loaded
- **mock-connection-test.js**: Tests WebSocket connection tracking without real connections
- **mock-idle-timeout-test.js**: Tests idle connection timeout without real connections
- **socket-cleanup-test.js**: Tests cleanup of WebSocket connections
- **test-idle-timeout.js**: Tests idle connection timeout with real connections
- **test-socket-cleanup.js**: Tests socket cleanup functionality with real connections
- **test-sogni-connection.js**: Tests basic connection to Sogni API with credentials from .env

## How to Use

You can run tests in two main ways:

### 1. Using the main run-scripts.sh

From the project root:

```bash
# Run connection test
./run-scripts.sh test connection

# Run cleanup test
./run-scripts.sh test cleanup

# Run idle timeout test
./run-scripts.sh test idle
```

### 2. Running individual test scripts directly

From the project root:

```bash
# Run with environment variables loaded
./scripts/util/run-env-test.sh scripts/util/test-sogni-connection.js

# Or for mock tests that don't need credentials
node --experimental-vm-modules scripts/util/mock-connection-test.js
node --experimental-vm-modules scripts/util/mock-idle-timeout-test.js
```

### 3. Using env-loader in your own scripts

Create a new test script that imports the env-loader:

```javascript
// Import environment variables first
import './env-loader.js';

// Now you can access environment variables
console.log(process.env.SOGNI_APP_ID);

// Rest of your test code...
```

## Environment Variables

The tests expect the following environment variables to be set in `server/.env`:

- `SOGNI_USERNAME`: Your Sogni API username
- `SOGNI_PASSWORD`: Your Sogni API password
- `SOGNI_APP_ID`: Your Sogni application ID

## Troubleshooting

If tests fail with credential errors:
1. Check that `server/.env` exists and contains the required variables
2. Verify your credentials are correct
3. Check network connectivity to the Sogni API
4. Run `./run-scripts.sh fix` to diagnose and fix connection issues 