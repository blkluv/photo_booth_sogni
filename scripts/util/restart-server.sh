#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Checking for existing node processes...${NC}"

# Kill any processes using port 3001 (backend API)
PORT_3001_PID=$(lsof -t -i:3001 2>/dev/null)
if [ ! -z "$PORT_3001_PID" ]; then
  echo -e "${YELLOW}Found process using port 3001 (PID: $PORT_3001_PID). Killing...${NC}"
  kill -9 $PORT_3001_PID
  echo -e "${GREEN}Process killed.${NC}"
else
  echo -e "${GREEN}No process found using port 3001.${NC}"
fi

# Kill any processes using port 5175 (frontend server)
PORT_5175_PID=$(lsof -t -i:5175 2>/dev/null)
if [ ! -z "$PORT_5175_PID" ]; then
  echo -e "${YELLOW}Found process using port 5175 (PID: $PORT_5175_PID). Killing...${NC}"
  kill -9 $PORT_5175_PID
  echo -e "${GREEN}Process killed.${NC}"
else
  echo -e "${GREEN}No process found using port 5175.${NC}"
fi

# Also find and kill any stray node processes running our server code
NODE_PIDS=$(ps aux | grep '[n]ode.*server/index.js' | awk '{print $2}')
if [ ! -z "$NODE_PIDS" ]; then
  echo -e "${YELLOW}Found stray server processes. Killing...${NC}"
  for pid in $NODE_PIDS; do
    echo -e "${YELLOW}Killing node process: $pid${NC}"
    kill -9 $pid
  done
  echo -e "${GREEN}Node processes killed.${NC}"
else
  echo -e "${GREEN}No stray server processes found.${NC}"
fi

# Also kill any nodemon processes
NODEMON_PIDS=$(ps aux | grep '[n]odemon' | awk '{print $2}')
if [ ! -z "$NODEMON_PIDS" ]; then
  echo -e "${YELLOW}Found nodemon processes. Killing...${NC}"
  for pid in $NODEMON_PIDS; do
    echo -e "${YELLOW}Killing nodemon process: $pid${NC}"
    kill -9 $pid
  done
  echo -e "${GREEN}Nodemon processes killed.${NC}"
else
  echo -e "${GREEN}No nodemon processes found.${NC}"
fi

echo -e "${GREEN}All conflicting processes have been terminated.${NC}"
echo -e "${YELLOW}Starting server...${NC}"

# Change to the server directory
cd "$(dirname "$0")/../../server"

# Start the server
echo -e "${GREEN}Starting server with nodemon...${NC}"
nodemon index.js

# Note: This script doesn't return because nodemon keeps running in the foreground
# To start both frontend and backend, use a different script or terminal window for each 