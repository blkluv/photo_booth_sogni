# Sogni Photobooth

This project captures a webcam image, calls the **Sogni** AI generation API, and displays generated images on the screen with support for a thumbnail gallery.

## Features
1. **Realtime Camera Preview**
   - Displays your webcam feed in the background.

2. **Style Prompts**
   - Choose from predefined style prompts (anime, Gorillaz, Disney, pixel art, steampunk, vaporwave) or create your own.

3. **Generation Countdown**
   - When a new thumbnail is generating, it displays a 10-second countdown. If the generation completes sooner, the final image appears right away.

4. **Camera Switching**
   - If multiple cameras are found, you can select which camera to use in the "Settings" panel.

5. **Original Photo Retention**
   - Optionally keep the original photo as a fifth image in the generated stack.

6. **Keyboard Shortcuts**
   - **Escape**: Return to the live camera (if you are viewing a selected photo).
   - **Arrow Left / Right**: Browse to the previous/next photo.
   - **Arrow Up / Down**: Within a selected photo, view different generated images.
   - **Spacebar**: Quickly toggle between the generated image and the original (if original is included).

## Usage

1. **Install & Set Up**
   - Run `npm install` (or `yarn`) to install dependencies.
   - Set up your Sogni credentials in `.env` or environment variables:
     ```bash
     VITE_SOGNI_APP_ID=YourSogniAppID
     VITE_SOGNI_USERNAME=YourUsername
     VITE_SOGNI_PASSWORD=YourPassword
     ```
   - Ensure you have a local dev server environment (e.g., Vite).

2. **Run the App**
   - `npm run dev` (or `yarn dev`) to start the local development server.
   - Open your browser to the indicated URL (commonly `https://photobooth-local.sogni.ai`).

3. **Camera Permissions**
   - The browser will ask for permission to use your webcam.
   - In the "Settings" panel, you can switch to another camera device if multiple are available.

4. **Generate**
   - Click **Take Photo**.
   - A quick 3-second countdown occurs (with an optional flash overlay).
   - A 10-second generation countdown will show on the thumbnail until the result is ready.

5. **Deleting Photos**
   - When viewing a generated photo in the gallery (thumbnail selected), a small **X** button appears at its top-left corner. Clicking it deletes that photo from the list.

## Project Structure

- **/src**
  - **App.jsx**: Core logic handling the webcam, capturing photos, and calling the Sogni API.
  - **index.jsx**: Entry point to mount `App` in React.
  - **index.css**: Tailwind + custom styling.

## Local Development Setup

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

3. Copy Nginx config to your local Nginx folder:
```bash
cp ./configs/local/photobooth-local.sogni.ai.conf /opt/homebrew/etc/nginx/servers/
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

### Development

Start the development server:
```bash
npm run dev
```

Access the app at: https://photobooth-local.sogni.ai:5174

Note: The app requires HTTPS for camera access. Make sure you have:
1. Set up the SSL certificates as described in the "Setup SSL for Local Development" section
2. Added the certificate to your system's trusted certificates
3. Restarted your browser after adding the certificate

### Environment Variables

Create a `.env` file in the root directory with the following variables:
```
VITE_SOGNI_APP_ID=your_app_id
VITE_SOGNI_USERNAME=your_username
VITE_SOGNI_PASSWORD=your_password
VITE_RPC_ENDPOINT=your_rpc_endpoint
```

### Building for Production

```bash
npm run build
```

The build output will be in the `dist` directory.

### Development Workflow & Testing

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

2. **Create New Component**
   - Create component file in appropriate directory
   - Move relevant code from App.jsx
   - Update imports and props

3. **Verify Visual Match**
   ```bash
   npm run test:visual:refactor
   ```

4. **Handle Differences**
   - If differences detected, check the comparison report
   - Fix any styling issues
   - Re-run verification until passing

5. **Update Tests**
   - Add component-specific tests
   - Update existing tests if needed

#### Best Practices

1. **Component Organization**
   - Place components in appropriate directories under `/src/components`
   - Use feature-based organization (e.g., `/camera`, `/photo-grid`)
   - Keep shared components in `/shared`

2. **Style Management**
   - Maintain CSS modules in `/src/styles/components`
   - Use consistent class naming
   - Preserve existing style classes when refactoring

3. **Testing**
   - Add unit tests for new components
   - Maintain visual regression tests
   - Test responsive behavior

4. **Documentation**
   - Update component props documentation
   - Document any new features or changes
   - Keep README up to date

