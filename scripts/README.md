# Sogni Photobooth Scripts

This directory contains all utility scripts for managing and operating the Sogni Photobooth application.

## Main Script Runner

Use the main script runner (`./scripts/run.sh`) to execute any of the utility scripts. This provides a centralized way to manage the application components.

```bash
./scripts/run.sh [command] [options]
```

## Available Commands

Commands executed via `./scripts/run.sh [command]`:

| Command    | Description                                                                                                                               |
|------------|-------------------------------------------------------------------------------------------------------------------------------------------|
| `start`    | Starts both the frontend (Vite) and backend (Express) servers independently in the background. Ensures required ports (5175, 3001) are free. |
| `backend`  | Starts only the backend server in the background. Ensures port 3001 is free. Logs output to `logs/backend.log`.                              |
| `frontend` | Starts only the frontend development server (Vite) in the background. Ensures port 5175 is free. Logs output to `logs/frontend.log`.        |
| `restart`  | Restarts the backend server. Ensures port 3001 is free and runs the server in the background. Logs output to `logs/backend.log`.         |
| `nginx`    | Updates the Nginx configuration by copying the local config file and reloading Nginx. Requires sudo privileges.                           |
| `fix`      | Runs a comprehensive diagnostic and repair process for common connection issues (hosts file, nginx, SSL, ports, backend/frontend start).  |
| `ports`    | Checks if required ports (5175, 3001) are available. Use `--force` option to kill processes currently using these ports.                   |
| `status`   | Shows the current running status of the backend server, frontend server, Nginx, SSL certificates, and hosts file configuration.            |
| `env`      | Updates server environment variables (used by `restart` and `fix` if `.env` is missing).                                                   |
| `integrate`| Integrates Photobooth with Sogni API and Socket services (placeholder or specific script).                                               |
| `memory`   | Checks memory usage (placeholder or specific script).                                                                                    |

**Note:** The `start`, `backend`, `frontend`, and `restart` commands now ensure the required ports are free before starting and run the services in the background. Check the `logs/` directory for output.

## Directory Structure

- **`run.sh`**: The main entry point for all script commands.
- **server/**: Backend server management scripts.
  - `restart-server.sh`: Restarts the backend server (used by the `restart` command).
  - `update-env.sh`: Updates server environment variables.
- **nginx/**: Nginx configuration scripts.
  - `update-nginx.sh`: Updates Nginx configuration.
- **util/**: Utility scripts.
  - `ensure-ports.sh`: Checks and frees up required network ports.
  - `fix-connection.sh`: Comprehensive connection repair tool.
  - `memory.sh`: Checks memory usage.
- **integration/**: Ecosystem integration scripts.
  - `integrate-ecosystem.sh`: Placeholder for integration tasks. 