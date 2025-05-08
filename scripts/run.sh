#!/bin/bash

# Main script for running Sogni Photobooth utilities
# This script provides a convenient way to run all scripts

SCRIPT_DIR=$(dirname "$0")
PROJECT_ROOT=$(cd "$SCRIPT_DIR/.." && pwd)

# Display help message
function show_help {
  echo "Sogni Photobooth Utilities"
  echo "=========================="
  echo "Usage: ./scripts/run.sh [command]"
  echo ""
  echo "Available commands:"
  echo "  restart     - Restart the server (ensures ports and kills existing first)"
  echo "  nginx       - Update nginx configuration"
  echo "  fix         - Fix connection issues"
  echo "  integrate   - Integrate with Sogni ecosystem"
  echo "  memory      - Check memory usage"
  echo "  env         - Update environment variables"
  echo "  start       - Start both frontend and backend (ensures ports, kills existing)"
  echo "  backend     - Start only the backend server (ensures port, kills existing)"
  echo "  frontend    - Start only the frontend development server (ensures port, kills existing)"
  echo "  status      - Show status of all services"
  echo "  ports       - Check and ensure required ports are available"
  echo "  test        - Run test scripts with environment variables loaded from .env"
  echo ""
  echo "Examples:"
  echo "  ./scripts/run.sh restart"
  echo "  ./scripts/run.sh nginx"
  echo "  ./scripts/run.sh start"
  echo "  ./scripts/run.sh ports --force"
  echo "  ./scripts/run.sh test connection   # Run the connection test"
  echo "  ./scripts/run.sh test cleanup      # Run the cleanup test"
  echo "  ./scripts/run.sh test idle         # Run the idle timeout test"
  echo ""
}

# Check server status
function check_server_status {
  echo "Checking Sogni Photobooth services status..."
  echo ""
  
  # Check backend server
  if pgrep -f "node.*sogni-photobooth/server" > /dev/null; then
    echo "✅ Backend server: Running"
    backend_port=$(lsof -i :3001 -sTCP:LISTEN -t 2>/dev/null)
    if [ -n "$backend_port" ]; then
      echo "   Port: 3001"
    else
      echo "   Port: Unknown (not using default port 3001)"
    fi
  else
    echo "❌ Backend server: Not running"
  fi
  
  # Check frontend server
  if pgrep -f "vite.*sogni-photobooth" > /dev/null; then
    echo "✅ Frontend server: Running"
    fe_port=$(lsof -i :5175 -sTCP:LISTEN -t 2>/dev/null)
    if [ -n "$fe_port" ]; then
      echo "   Port: 5175"
    else
      echo "   Port: Unknown (not using default port 5175)"
    fi
  else
    echo "❌ Frontend server: Not running"
  fi
  
  # Check nginx
  if pgrep -x "nginx" > /dev/null; then
    echo "✅ Nginx: Running"
  else
    echo "❌ Nginx: Not running"
  fi
  
  # Check SSL certificates
  if [ -f "/opt/homebrew/etc/nginx/ssl/sogni-local.crt" ] && [ -f "/opt/homebrew/etc/nginx/ssl/sogni-local.key" ]; then
    echo "✅ SSL certificates: Present"
  else
    echo "❌ SSL certificates: Missing"
  fi
  
  # Check if hosts file is configured
  if grep -q "photobooth-local.sogni.ai" /etc/hosts; then
    echo "✅ Hosts file: Configured"
  else
    echo "❌ Hosts file: Missing photobooth-local.sogni.ai entry"
  fi
  
  echo ""
  echo "For more detailed diagnostics, run: ./scripts/run.sh fix"
}

# Ensure ports are available before starting servers
function ensure_ports_available {
  echo "Ensuring required ports are available..."
  bash "$SCRIPT_DIR/util/ensure-ports.sh" "$SCRIPT_DIR" "$@"
  local exit_code=$?
  if [ $exit_code -ne 0 ]; then
    echo "ERROR: Failed to ensure required ports are available (Exit code: $exit_code). Cannot start services."
    exit 1
  fi
}

# Start backend server
function start_backend {
  echo "Starting backend server..."
  echo "Starting backend server process in background..."
  mkdir -p "$PROJECT_ROOT/logs"
  cd "$PROJECT_ROOT/server" && (npm run dev > "$PROJECT_ROOT/logs/backend.log" 2>&1 &)
  echo "Backend server started. Check logs at: $PROJECT_ROOT/logs/backend.log"
}

# Start frontend in background
function start_frontend {
  echo "Starting frontend server..."
  echo "Starting frontend server process in background..."
  mkdir -p "$PROJECT_ROOT/logs"
  cd "$PROJECT_ROOT" && (npm run dev > "$PROJECT_ROOT/logs/frontend.log" 2>&1 &)
  echo "Frontend server started. Check logs at: $PROJECT_ROOT/logs/frontend.log"
}

# Start both frontend and backend
function start_all {
  echo "Starting all services..."
  ensure_ports_available --force 
  start_backend
  start_frontend
}

# Run test scripts
function run_test {
  if [ -z "$1" ]; then
    echo "Available tests:"
    echo "  connection - Test Sogni connection with credentials from .env"
    echo "  cleanup    - Test socket cleanup functionality"
    echo "  idle       - Test idle timeout functionality"
    echo ""
    echo "Usage: ./scripts/run.sh test <test-name>"
    exit 1
  fi
  
  case "$1" in
    connection)
      echo "Running Sogni connection test..."
      bash "$SCRIPT_DIR/scripts/util/run-env-test.sh" "$SCRIPT_DIR/scripts/util/test-sogni-connection.js" "${@:2}"
      ;;
    cleanup)
      echo "Running socket cleanup test..."
      bash "$SCRIPT_DIR/scripts/util/run-env-test.sh" "$SCRIPT_DIR/scripts/util/test-socket-cleanup.js" "${@:2}"
      ;;
    idle)
      echo "Running idle timeout test..."
      bash "$SCRIPT_DIR/scripts/util/run-env-test.sh" "$SCRIPT_DIR/scripts/util/test-idle-timeout.js" "${@:2}"
      ;;
    *)
      echo "Unknown test: $1"
      echo "Available tests: connection, cleanup, idle"
      exit 1
      ;;
  esac
}

# Check if command was provided
if [ -z "$1" ]; then
  show_help
  exit 1
fi

# Execute the appropriate script based on the command
case "$1" in
  restart)
    ensure_ports_available --force
    bash "$SCRIPT_DIR/server/restart-server.sh" "${@:2}"
    ;;
  nginx)
    bash "$SCRIPT_DIR/nginx/update-nginx.sh" "${@:2}"
    ;;
  fix)
    bash "$SCRIPT_DIR/util/fix-connection.sh" "${@:2}"
    ;;
  integrate)
    bash "$SCRIPT_DIR/integration/integrate-ecosystem.sh" "${@:2}"
    ;;
  memory)
    bash "$SCRIPT_DIR/util/memory.sh" "${@:2}"
    ;;
  env)
    bash "$SCRIPT_DIR/server/update-env.sh" "${@:2}"
    ;;
  ports)
    ensure_ports_available "${@:2}"
    ;;
  start)
    start_all
    ;;
  backend)
    ensure_ports_available --force
    start_backend
    ;;
  frontend)
    ensure_ports_available --force
    start_frontend
    ;;
  status)
    check_server_status
    ;;
  test)
    run_test "${@:2}"
    ;;
  *)
    echo "Unknown command: $1"
    show_help
    exit 1
    ;;
esac 