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

