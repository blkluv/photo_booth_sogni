# Sogni Photobooth Backend Server

This server provides secure API endpoints for the Sogni Photobooth application, protecting sensitive credentials from being exposed in the frontend code.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file in the server directory with your Sogni credentials:
```
# Sogni Client credentials
SOGNI_APP_ID=your-app-id
SOGNI_USERNAME=your-username
SOGNI_PASSWORD=your-password
SOGNI_ENV=production

# Server config
PORT=3001
CLIENT_ORIGIN=https://photobooth-local.sogni.ai
```

3. Start the server:
```bash
npm run dev
```

The server will automatically find an available port if 3001 is already in use.

## API Endpoints

### Health Check
```
GET /api/health
```
Returns a detailed status to confirm the server is running, including environment information.

### Debug Info
```
GET /api/debug
```
Returns detailed debug information about the server environment (for troubleshooting).

### Sogni Status
```
GET /api/sogni/status
```
Tests the connection to Sogni services and returns status information.

### Generate Image
```
POST /api/sogni/generate
```
Initiates image generation with the Sogni API.

**Request Body:**
```json
{
  "selectedModel": "model-id",
  "stylePrompt": "style description",
  "width": 768,
  "height": 768,
  "promptGuidance": 2,
  "numberImages": 4,
  "controlNetStrength": 0.7,
  "controlNetGuidanceEnd": 0.6,
  "imageData": [0, 0, 0, ...] // Array of image bytes
}
```

**Response:**
```json
{
  "status": "processing",
  "projectId": "project-123456789",
  "message": "Image generation started"
}
```

### Progress Updates
```
GET /api/sogni/progress/:projectId
```
Server-Sent Events (SSE) endpoint for real-time progress updates.

## Troubleshooting

### Invalid Credentials Error

If you're seeing an "Invalid credentials" error in the server logs or "Authentication failed" in the API responses, follow these steps:

1. **Check your Sogni credentials:** Verify that the username and password in your `.env` file are correct.

2. **Create or update the .env file:** Make sure you have a file named `.env` (with the dot) in the `server` directory with these contents:
   ```
   # Sogni Client credentials
   SOGNI_APP_ID=your-actual-app-id
   SOGNI_USERNAME=your-actual-username
   SOGNI_PASSWORD=your-actual-password
   SOGNI_ENV=production
   
   # Server config
   PORT=3001
   CLIENT_ORIGIN=https://photobooth-local.sogni.ai
   ```

3. **Restart the server:** After updating the .env file, restart the server to apply the changes:
   ```bash
   npm run dev
   ```

4. **Test the credentials manually:** You can test your Sogni credentials directly using the provided test script:
   ```bash
   node test-auth.js
   ```

### Port Conflicts

The server now automatically finds an available port if the default port (3001) is in use. However, if you need to specify a particular port:

1. Update the `PORT` value in your `.env` file
2. Ensure nginx is configured to proxy to the correct port in `/opt/homebrew/etc/nginx/servers/photobooth-local.sogni.ai.conf`
3. Run `./update-nginx.sh` to update the nginx configuration

### Nginx Configuration

If you see 502 Bad Gateway or 504 Gateway Timeout errors:

1. Make sure the server is running
2. Update the nginx configuration with the latest settings:
   ```bash
   ./scripts/run.sh nginx
   ```
   This will:
   - Configure Nginx to proxy requests from standard ports (80/443) to internal development servers
   - Set appropriate timeout values
   - Add detailed logging

The Nginx configuration handles:
- HTTP to HTTPS redirection (port 80 → 443)
- Proxying HTTPS requests on standard port (443) to internal services:
  - Frontend requests → Vite dev server (port 5175)
  - API requests (/api/*) → Backend server (port 3001)

This means users can access the application at `https://photobooth-local.sogni.ai` without any port numbers.

### CORS Issues

If you're getting CORS errors when the frontend tries to communicate with the backend:

1. Make sure the server is running on the correct port
2. Check that the CORS configuration in `server/index.js` includes your frontend domain
3. Ensure your frontend is configured to send CORS credentials (`credentials: 'include'`)
4. Check the server logs for CORS debugging information

## Testing and Diagnostics

For testing the Sogni API credentials directly:
```bash
cd server
node test-auth.js
```

For updating your environment settings:
```bash
cd server
./update-env.sh
```

## Frontend Integration

The frontend should use the API service to communicate with these endpoints instead of directly using the Sogni SDK. This ensures sensitive credentials are kept secure on the server.

## Deployment

For production deployment, build the frontend with:
```bash
cd ..
npm run build
```

Then deploy both the frontend static files and this backend server to your hosting environment. 