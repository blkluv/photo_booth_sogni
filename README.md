# Sogni Photobooth

This project is a demo Sogni Node Client SDK application that leverages the Sogni Supernet to power a Photobooth application using Sogni's Instant ID Controlnet for accurate facial likeness transfer. It captures a webcam image or allows the user to upoad a photo, calls the **Sogni** AI generation API, and displays generated images on the screen with support for a thumbnail gallery. It supports desktop and mobile browser. Use of the Sogni API is secured by a back-end service that secures the Sogni account credentials.

## Features
1. **Realtime Camera Preview**
   - Displays your webcam feed in a polaroid style frame.

2. **Style Prompts**
   - Choose from predefined style prompts (anime, Gorillaz, Disney, pixel art, steampunk, vaporwave) or create your own.

3. **Worker Assignement and Progress Events**
   - Up to 64 prompt variations can be submitted at one time and as jobs are assigned to workers their worker node names are incorporated into the progress update events displayed in each loading polaroid. 

7. **Secure Backend**
   - Uses a Node.js backend to handle sensitive API credentials
   - Prevents credentials from being exposed in the frontend code

## Security Setup

The application uses a secure architecture:

1. **Frontend-Backend Separation**:
   - The frontend (React) never directly accesses Sogni credentials
   - All sensitive API calls are proxied through the backend server

2. **HTTPS Support**:
   - Secure HTTPS connection for local development using SSL certificates
   - CORS is properly configured to allow only trusted domains
   - Works with custom domains like `photobooth-local.sogni.ai`

## Usage

### 1. Install & Set Up

- Run `npm install` in the root directory to install dependencies for both frontend and backend.
- Set up your Sogni credentials by copying `server/.env.example` to `server/.env` and editing the values:
  ```bash
  # server/.env
  SOGNI_APP_ID=YourSogniAppID
  SOGNI_USERNAME=YourUsername
  SOGNI_PASSWORD=YourPassword
  SOGNI_ENV=production # or staging/local
  PORT=3001 # Port for the backend server
  CLIENT_ORIGIN=https://photobooth-local.sogni.ai # Allowed frontend origin
  ```
- **Local Domain (Optional but Recommended):** Ensure Nginx and local SSL are set up (see "Local Development Setup" below) to use the clean URL `https://photobooth-local.sogni.ai`. Otherwise, you may need to access the frontend directly via `http://localhost:5175` (if Nginx isn't running/configured).

### 2. Run the App (Development Mode)

For local development, you need **two separate terminal windows/tabs** running simultaneously: one for the backend server and one for the frontend development server. This allows you to see live logs from both independently.

**Terminal 1: Start the Backend Server (Node.js/Express)**

```bash
# Navigate to the server directory
cd server

# Start the backend development server (uses nodemon for auto-restarts)
npm run dev

# Keep this terminal open. Logs will appear here.
# Press CTRL+C to stop the server.
```
*This server listens on port 3001 (or the `PORT` in `server/.env`).*

**Terminal 2: Start the Frontend Server (Vite)**

```bash
# Make sure you are in the project root directory (sogni-photobooth)

# Start the frontend development server (provides Hot Module Replacement)
npm run dev
# OR if you use yarn:
# yarn dev

# Keep this terminal open. Logs will appear here.
# Press CTRL+C to stop the server.
```
*This server listens on port 5175.*

**Accessing the App:**

*   **With Nginx Setup (Recommended):** Open `https://photobooth-local.sogni.ai` in your browser.
*   **Without Nginx:** Open `http://localhost:5175`. Note that API calls might fail due to CORS unless you update `CLIENT_ORIGIN` in `server/.env` to `http://localhost:5175`.

**Alternative (Using Script Runner - Background Processes):**

If you prefer not to keep terminals open, you can use the script runner. This will start the services in the background and log to files in the `logs/` directory.

```bash
# Ensure ports are free and start both services in the background
./scripts/run.sh start 

# Check status
./scripts/run.sh status

# View logs
tail -f logs/frontend.log
tail -f logs/backend.log
```
*(See `scripts/README.md` for more script runner commands)*.

### 3. Utility Scripts

The project includes several utility scripts managed by `./scripts/run.sh`. See `scripts/README.md` for details on all commands (`status`, `ports`, `fix`, `nginx`, `restart`, etc.).

### 4. Camera Permissions
   - The browser will ask for permission to use your webcam.
   - In the "Settings" panel, you can switch to another camera device if multiple are available.

### 5. Generate
   - Click **Take Photo**.
   - A quick 3-second countdown occurs (with an optional flash overlay).
   - Generation progress will show on the thumbnail placeholders.

## Project Structure

- **/src**: Frontend React application code.
  - **App.jsx**: Core UI logic.
  - **/components**: Reusable UI components.
  - **/services**: Frontend services (API communication, Sogni mock client).
  - **/utils**: Frontend utility functions.
- **/server**: Backend Express server code.
  - **index.js**: Server entry point.
  - **/routes**: API route definitions.
  - **/services**: Server-side logic (Sogni client interaction).
- **/scripts**: Utility scripts for development and management.
  - **run.sh**: Main script runner.
  - **/server, /nginx, /util, /integration**: Subdirectories for specific script types.
- **/configs**: Configuration files (e.g., Nginx local config).
- **/logs**: Log files generated by backend and frontend servers.

## Local Development Setup

This setup uses Nginx as a reverse proxy for a cleaner development experience with HTTPS and a custom local domain (`photobooth-local.sogni.ai`).

### Install Nginx

Nginx is used to make development cleaner by hosting the app from a local domain with SSL.

1. Install Nginx:
```bash
brew install nginx
```

2. Add the following to your computer's `/etc/hosts`:
```
# Photobooth
127.0.0.1 photobooth-local.sogni.ai
::1 photobooth-local.sogni.ai
```

3. Update Nginx configuration:
```bash
./scripts/run.sh nginx
```

4. Start Nginx:
```bash
brew services start nginx
```

If you have any trouble with the proxy you can tail the logs to see whats going on:
```bash
tail -f /opt/homebrew/var/log/nginx/error.log
tail -f /opt/homebrew/var/log/nginx/access.log
```

### Setup SSL for Local Development

1. Create a directory for your SSL certificates:
```bash
mkdir -p /opt/homebrew/etc/nginx/ssl
cd /opt/homebrew/etc/nginx/ssl
```

2. Create an OpenSSL configuration file for the certificate:
```bash
cat > sogni-local.conf << EOF
[req]
default_bits = 2048
prompt = no
default_md = sha256
distinguished_name = dn
req_extensions = v3_req

[dn]
C = US
ST = State
L = City
O = Sogni Local Dev
OU = Development
CN = api-local.sogni.ai

[v3_req]
basicConstraints = CA:FALSE
keyUsage = nonRepudiation, digitalSignature, keyEncipherment
subjectAltName = @alt_names

[alt_names]
DNS.1 = api-local.sogni.ai
DNS.2 = socket-local.sogni.ai
DNS.3 = app-local.sogni.ai
DNS.4 = photobooth-local.sogni.ai
EOF
```

3. Generate self-signed SSL certificate with the configuration:
```bash
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout sogni-local.key -out sogni-local.crt \
  -config sogni-local.conf -extensions v3_req
```

4. Trust the certificate in macOS Keychain:
```bash
sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain sogni-local.crt
```

5. Restart Nginx:
```bash
brew services restart nginx
```

Note: After adding the certificate to your keychain, you might need to:
1. Open Keychain Access
2. Find the certificate (search for "api-local")
3. Double click it
4. Expand the "Trust" section
5. Set "When using this certificate" to "Always Trust"
6. Close the certificate window (you'll be prompted for your password)
7. Restart your browser

### Install Dependencies

```bash
npm install
```

### Environment Variables

Create a `.env` file in the **`server/`** directory (copy from `server/.env.example`) with your Sogni credentials and configuration:

```dotenv
# server/.env
SOGNI_APP_ID=YourSogniAppID
SOGNI_USERNAME=YourUsername
SOGNI_PASSWORD=YourPassword
SOGNI_ENV=production # or staging/local
PORT=3001
CLIENT_ORIGIN=https://photobooth-local.sogni.ai
```
*Note: Frontend environment variables (prefixed with `VITE_`) are generally not needed for this setup as sensitive configuration is handled by the backend.* 

## Building for Production

```bash
npm run build
```

The build output will be in the `dist` directory.

## Deploying with Backend Server

For production deployment with the secure backend:

1. Build the frontend:
```bash
npm run build
```

2. Set up the backend server:
```bash
# Install server dependencies
npm run server:install

# Create server/.env file with production credentials
cp server/.env.example server/.env
# Edit the .env file with your actual credentials
```

3. Deploy both components:
   - Deploy the `/dist` directory to your static file hosting (e.g., Nginx, S3)
   - Deploy the `/server` directory to your Node.js hosting (e.g., VM, container)
   - Ensure your frontend can reach the backend API endpoints

4. For a simple combined deployment:
```bash
# Start the backend server and serve the frontend files
npm run start:prod
```

This approach ensures your Sogni credentials remain secure on the server and are not exposed in the frontend code.

## Development Workflow & Testing

#### Visual Testing

The project uses Playwright for visual regression testing. Here are the key testing commands:

```bash
# Run visual tests with HTML report (interactive development)
npm run test:visual

# Run visual tests with list reporter (CI/automation)
npm run test:visual:ci

# Update visual test snapshots
npm run test:visual:update
```

##### Visual Test Structure
- `/tests/visual/`: Main test directory
  - `camera-view.spec.ts`: Camera UI component tests
  - `components.spec.ts`: Shared component tests
  - `photo-grid.spec.ts`: Photo gallery tests
  - `reference.spec.ts`: Captures reference states
  - `verify.spec.ts`: Verifies component states against references

##### Test Utilities
- `/tests/helpers/`:
  - `test-utils.ts`: Common test helpers (camera mocking, waiting functions)
  - `component-test-utils.ts`: Component-specific test utilities

##### Best Practices
1. **Running Tests**
   - Use `test:visual:ci` for automation/CI to avoid hanging on HTML report server
   - Use `test:visual` for local development when you need the HTML report
   - Always check selector existence before running visual tests

2. **Maintaining Tests**
   - Keep reference snapshots up to date with `test:visual:update`
   - Ensure unique, specific selectors for components
   - Handle loading states and animations appropriately
   - Mock external dependencies (camera, API calls)

3. **Common Issues & Solutions**
   - Selector not found: Check component class names and wait for render
   - Multiple elements matching selector: Use more specific selectors
   - Timeout on animations: Use `waitForAnimations` helper
   - Camera permission issues: Use `mockCameraPermissions` helper

4. **Visual Test Guidelines**
   - Test both desktop and mobile layouts
   - Verify component states (default, hover, active)
   - Check responsive behavior
   - Validate layout measurements
   - Test user interaction flows

### Refactoring Workflow

#### Visual Regression Testing

The project uses a comprehensive visual regression testing system to ensure refactoring doesn't introduce visual changes:

```bash
# Before refactoring:
npm run test:visual:baseline  # Capture current state

# After refactoring:
npm run test:visual:refactor  # Run full comparison workflow
```

The comparison workflow:
1. Captures baseline snapshots of the current UI state
2. Updates test snapshots after refactoring
3. Compares snapshots with pixel-perfect precision (0.1% tolerance)
4. Generates a report of any visual differences

#### Component Extraction Process

When extracting components from `App.jsx`:

1. **Capture Baseline**
   ```bash
   npm run test:visual:baseline
   ```