#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Attempting to terminate existing server and frontend processes...${NC}"

# Kill any processes using port 3001 (backend API)
PORT_3001_PIDS=$(lsof -t -i:3001 2>/dev/null)
if [ ! -z "$PORT_3001_PIDS" ]; then
  echo -e "${YELLOW}Found processes on port 3001 (PIDs: $PORT_3001_PIDS). Killing...${NC}"
  kill -9 $PORT_3001_PIDS
  echo -e "${GREEN}Processes on port 3001 killed.${NC}"
else
  echo -e "${GREEN}No process found using port 3001.${NC}"
fi

# Kill any processes using port 5175 (frontend server)
PORT_5175_PIDS=$(lsof -t -i:5175 2>/dev/null)
if [ ! -z "$PORT_5175_PIDS" ]; then
  echo -e "${YELLOW}Found processes on port 5175 (PIDs: $PORT_5175_PIDS). Killing...${NC}"
  kill -9 $PORT_5175_PIDS
  echo -e "${GREEN}Processes on port 5175 killed.${NC}"
else
  echo -e "${GREEN}No process found using port 5175.${NC}"
fi

# More aggressively kill Node, Nodemon, and Vite processes related to this project
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"

echo -e "${YELLOW}Searching for stray Node/Nodemon/Vite processes in project directory: $PROJECT_ROOT ${NC}"

# Kill nodemon processes associated with the project server
NODEMON_PIDS=$(ps aux | grep "[n]odemon" | grep "${PROJECT_ROOT}/server/index.js" | awk '{print $2}')
if [ ! -z "$NODEMON_PIDS" ]; then
  echo -e "${YELLOW}Found project-specific Nodemon processes (PIDs: $NODEMON_PIDS). Killing...${NC}"
  kill -9 $NODEMON_PIDS
  echo -e "${GREEN}Project-specific Nodemon processes killed.${NC}"
else
  echo -e "${GREEN}No project-specific Nodemon processes found.${NC}"
fi

# Kill node processes directly running the server index.js
NODE_SERVER_PIDS=$(ps aux | grep "[n]ode" | grep "${PROJECT_ROOT}/server/index.js" | awk '{print $2}')
if [ ! -z "$NODE_SERVER_PIDS" ]; then
  echo -e "${YELLOW}Found project-specific Node server processes (PIDs: $NODE_SERVER_PIDS). Killing...${NC}"
  kill -9 $NODE_SERVER_PIDS
  echo -e "${GREEN}Project-specific Node server processes killed.${NC}"
else
  echo -e "${GREEN}No project-specific Node server processes found.${NC}"
fi

# Kill Vite dev server processes associated with the project
VITE_PIDS=$(ps aux | grep "[v]ite" | grep "${PROJECT_ROOT}" | awk '{print $2}')
if [ ! -z "$VITE_PIDS" ]; then
  echo -e "${YELLOW}Found project-specific Vite processes (PIDs: $VITE_PIDS). Killing...${NC}"
  kill -9 $VITE_PIDS
  echo -e "${GREEN}Project-specific Vite processes killed.${NC}"
else
  echo -e "${GREEN}No project-specific Vite processes found.${NC}"
fi

# Kill general nodemon instances that might conflict, if any are left (less targeted)
GENERAL_NODEMON_PIDS=$(ps aux | grep '[n]odemon' | awk '{print $2}')
if [ ! -z "$GENERAL_NODEMON_PIDS" ]; then
  echo -e "${YELLOW}Found general Nodemon processes (PIDs: $GENERAL_NODEMON_PIDS). Killing...${NC}"
  kill -9 $GENERAL_NODEMON_PIDS
  echo -e "${GREEN}General Nodemon processes killed.${NC}"
else
  echo -e "${GREEN}No general Nodemon processes found.${NC}"
fi


echo -e "${GREEN}All identified conflicting processes should now be terminated.${NC}"

# Go to project root directory (already determined as PROJECT_ROOT)
cd "$PROJECT_ROOT"

echo -e "${YELLOW}Starting frontend and backend servers...${NC}"

# Check if concurrently is installed globally or locally
if npm list -g concurrently >/dev/null 2>&1 || npm list concurrently --depth=0 >/dev/null 2>&1; then
  echo -e "${GREEN}Using concurrently to start both servers...${NC}"
  npx concurrently --kill-others-on-fail \
    "cd server && nodemon index.js" \
    "npx vite --host 0.0.0.0 --port 5175 --strictPort"
else
  echo -e "${YELLOW}Concurrently not found. Attempting to start servers in separate terminals...${NC}"
  echo -e "${RED}Warning: This method is less reliable for managing processes. Please install concurrently: npm install concurrently${NC}"
  
  # Check which terminal emulator is available
  if command -v osascript >/dev/null 2>&1 && [[ "$(uname)" == "Darwin" ]]; then
    # macOS
    echo -e "${GREEN}Starting backend server in new Terminal window...${NC}"
    osascript -e "tell application \"Terminal\" to do script \"cd '${PROJECT_ROOT}/server' && echo 'Starting backend...' && nodemon index.js\""
    
    echo -e "${GREEN}Starting frontend server in new Terminal window...${NC}"
    osascript -e "tell application \"Terminal\" to do script \"cd '${PROJECT_ROOT}' && echo 'Starting frontend...' && npx vite --host 0.0.0.0 --port 5175 --strictPort\""
  elif command -v gnome-terminal >/dev/null 2>&1; then
    # Linux with GNOME
    echo -e "${GREEN}Starting backend server in new gnome-terminal...${NC}"
    gnome-terminal -- bash -c "cd '${PROJECT_ROOT}/server' && echo 'Starting backend...' && nodemon index.js; exec bash"
    
    echo -e "${GREEN}Starting frontend server in new gnome-terminal...${NC}"
    gnome-terminal -- bash -c "cd '${PROJECT_ROOT}' && echo 'Starting frontend...' && npx vite --host 0.0.0.0 --port 5175 --strictPort; exec bash"
  else
    # Fallback - start backend in background and frontend in foreground (least robust)
    echo -e "${YELLOW}Compatible terminal emulator not detected for automatic splitting. Starting backend in background and frontend in foreground...${NC}"
    
    echo -e "${GREEN}Starting backend server in background...${NC}"
    (cd "${PROJECT_ROOT}/server" && nodemon index.js) &
    BACKEND_PID=$!
    
    # Give backend a moment to start or fail
    sleep 2 

    echo -e "${GREEN}Starting frontend server in foreground...${NC}"
    (cd "$PROJECT_ROOT" && npx vite --host 0.0.0.0 --port 5175 --strictPort)
    
    # Clean up background backend process if frontend exits
    echo -e "${YELLOW}Frontend server exited. Cleaning up background backend process (PID: $BACKEND_PID)...${NC}"
    kill $BACKEND_PID 2>/dev/null
  fi
fi

echo -e "${GREEN}Script finished.${NC}"