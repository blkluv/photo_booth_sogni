#!/bin/bash

# ensure-ports.sh
# Utility to ensure required ports are available before starting services
# This script will check if required ports are in use and optionally kill the processes using them

# Accept the root script directory as the first argument
RUN_SCRIPT_DIR=$1
shift # Remove the first argument so $@ refers to subsequent args like --force

# Colors for better output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Define required ports
FRONTEND_PORT=5175
BACKEND_PORT=3001

# Function to check if a port is in use
check_port() {
  local port=$1
  local description=$2
  
  if lsof -i :$port -sTCP:LISTEN >/dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  ${description} port ${port} is already in use${NC}"
    
    # Display process details
    echo "Process using port $port:"
    lsof -i :$port -sTCP:LISTEN
    
    return 1
  else
    echo -e "${GREEN}✅ ${description} port ${port} is available${NC}"
    return 0
  fi
}

# Function to kill process using a port
kill_port_process() {
  local port=$1
  local pid=$(lsof -ti :$port -sTCP:LISTEN)
  
  if [ -n "$pid" ]; then
    echo -e "${YELLOW}Killing process (PID: $pid) using port $port...${NC}"
    kill -9 $pid
    sleep 1
    
    # Verify port is now available
    if lsof -i :$port -sTCP:LISTEN >/dev/null 2>&1; then
      echo -e "${RED}❌ Failed to free port $port${NC}"
      return 1
    else
      echo -e "${GREEN}✅ Successfully freed port $port${NC}"
      return 0
    fi
  fi
}

# Main execution
echo "Checking required ports for Sogni Photobooth..."

# Check frontend port
check_port $FRONTEND_PORT "Frontend"
FRONTEND_PORT_STATUS=$?

# Check backend port
check_port $BACKEND_PORT "Backend"
BACKEND_PORT_STATUS=$?

# If any port is in use, prompt to kill processes
if [ $FRONTEND_PORT_STATUS -eq 1 ] || [ $BACKEND_PORT_STATUS -eq 1 ]; then
  echo ""
  echo -e "${YELLOW}Some required ports are in use.${NC}"
  
  # If running non-interactively, kill processes without asking
  # Use $@ to check for --force among remaining arguments
  FORCE_KILL=0
  for arg in "$@"; do
    if [ "$arg" = "--force" ]; then
      FORCE_KILL=1
      break
    fi
  done
  
  if [ $FORCE_KILL -eq 1 ]; then
    DO_KILL=y
  else
    echo "Would you like to kill the processes using these ports? (y/n)"
    read -r DO_KILL
  fi
  
  if [[ "$DO_KILL" =~ ^([yY][eE][sS]|[yY])$ ]]; then
    echo "Freeing required ports..."
    
    if [ $FRONTEND_PORT_STATUS -eq 1 ]; then
      kill_port_process $FRONTEND_PORT
    fi
    
    if [ $BACKEND_PORT_STATUS -eq 1 ]; then
      kill_port_process $BACKEND_PORT
    fi
    
    # Final check
    echo ""
    echo "Verifying ports are now available..."
    
    check_port $FRONTEND_PORT "Frontend"
    FRONTEND_PORT_STATUS=$?
    
    check_port $BACKEND_PORT "Backend"  
    BACKEND_PORT_STATUS=$?
    
    if [ $FRONTEND_PORT_STATUS -eq 0 ] && [ $BACKEND_PORT_STATUS -eq 0 ]; then
      echo -e "${GREEN}✅ All required ports are now available${NC}"
      exit 0
    else
      echo -e "${RED}❌ Failed to free all required ports${NC}"
      exit 1
    fi
  else
    echo "Exiting without freeing ports"
    exit 1
  fi
else
  echo -e "${GREEN}✅ All required ports are available${NC}"
  exit 0
fi 