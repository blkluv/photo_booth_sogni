# Sogni Photobooth Pirate Converter Browser Extension

A Chrome browser extension that automatically converts profile photos on web pages into pirates using the Sogni Photobooth AI API.

## Features

- **Automatic Profile Detection**: Scans web pages for profile photo grids (speakers, team members, etc.)
- **Batch Processing**: Converts up to 16 images simultaneously with progress tracking
- **Individual Conversion**: Right-click any image to convert it to a pirate
- **Real-time Progress**: Visual overlays show conversion progress for each image
- **Smart Resizing**: Automatically resizes large images to optimize processing
- **API Integration**: Seamlessly integrates with your existing Sogni Photobooth backend

## Installation

### Development Installation

1. **Clone/Copy the Extension Files**
   ```bash
   # The extension files are in the browser-extension/ directory
   cd browser-extension/
   ```

2. **Create Icon Files** (Required)
   - Create the following icon files in the `icons/` directory:
     - `icon16.png` (16x16 pixels)
     - `icon32.png` (32x32 pixels) 
     - `icon48.png` (48x48 pixels)
     - `icon128.png` (128x128 pixels)
   - See `icons/create-icons.md` for guidance

3. **Load in Chrome**
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top right)
   - Click "Load unpacked"
   - Select the `browser-extension/` directory
   - The extension should now appear in your extensions list

### Production Installation

1. Package the extension as a `.crx` file or publish to Chrome Web Store
2. Users can install directly from the store or load the `.crx` file

## Usage

### Automatic Page Scanning

1. Navigate to a webpage with profile photos (e.g., speaker listings, team pages)
2. Click the extension icon in the toolbar
3. Click "Scan Page for Profiles"
4. The extension will:
   - Find profile images automatically
   - Show progress overlays on each image
   - Convert them to pirates using AI
   - Replace the original images with pirate versions

### Individual Image Conversion

1. Right-click on any image on a webpage
2. Select "Convert to Pirate" from the context menu
3. Watch the progress overlay as the image is converted
4. The original image will be replaced with the pirate version

### What It Looks For

The extension automatically detects profile photos by looking for:

- **Container Elements**: Sections with "speaker", "profile", "team", or "member" in class/id names
- **Image Characteristics**: Square-ish images between 50x50 and 800x800 pixels
- **Grid Patterns**: Multiple similar-sized images arranged together
- **Visibility**: Only processes visible, non-hidden images

## API Configuration

The extension automatically detects and connects to your Sogni Photobooth API:

- **Production**: `https://photobooth-api.sogni.ai`
- **Local Development**: `https://photobooth-local.sogni.ai`

The extension will try the local endpoint first, then fall back to production if local is unavailable.

## Technical Details

### Architecture

- **Manifest V3**: Uses the latest Chrome extension architecture
- **Content Script**: Handles page scanning and image replacement
- **Background Script**: Manages context menus and extension lifecycle
- **Popup Interface**: Provides user controls and status information
- **API Service**: Handles communication with Sogni Photobooth backend

### Processing Limits

- **Concurrent Processing**: Maximum 1 image at a time
- **Image Size Limit**: Images resized to max 1080x1080 pixels
- **Batch Processing**: Large sets processed in chunks with rate limiting
- **Progress Tracking**: Real-time progress overlays for each image

### Files Structure

```
browser-extension/
├── manifest.json          # Extension configuration
├── background.js          # Service worker for extension lifecycle
├── content.js            # Page scanning and image processing
├── content.css           # Styles for progress overlays
├── popup.html            # Extension popup interface
├── popup.css             # Popup styling
├── popup.js              # Popup functionality
├── api-service.js        # Sogni API integration
├── progress-overlay.js   # Progress tracking system
├── icons/                # Extension icons (16, 32, 48, 128px)
└── README.md            # This file
```

## Development

### Prerequisites

- Chrome browser with Developer mode enabled
- Access to Sogni Photobooth API (local or production)
- Basic understanding of Chrome extension development

### Local Development

1. Make changes to the extension files
2. Go to `chrome://extensions/`
3. Click the refresh icon on your extension
4. Test changes on target websites

### Debugging

- **Console Logs**: Check browser console for extension logs
- **Background Script**: Debug at `chrome://extensions/` → Details → Inspect views: background page
- **Content Script**: Debug in regular browser DevTools on target pages
- **Popup**: Right-click extension icon → Inspect popup

## Troubleshooting

### Common Issues

1. **"API Unavailable" Error**
   - Check internet connection
   - Verify Sogni API is running (local: http://localhost:3001/api/health)
   - Check browser console for detailed error messages

2. **"No Profile Photos Found"**
   - Try right-clicking individual images instead
   - Check if images are in containers with speaker/profile/team keywords
   - Verify images meet size requirements (50x50 to 800x800 pixels)

3. **Extension Won't Load**
   - Ensure all required icon files exist in `icons/` directory
   - Check `chrome://extensions/` for error messages
   - Verify manifest.json syntax is valid

4. **Slow Processing**
   - Large images take longer to process
   - Server load affects processing speed
   - Check network connection quality

### Error Messages

- **"Already processing images"**: Wait for current batch to complete
- **"Failed to fetch image"**: Image URL may be invalid or blocked by CORS
- **"Generation failed"**: API error - check server logs
- **"No final result received"**: API timeout or connection issue

## API Integration

### Required Endpoints

The extension expects these API endpoints to be available:

- `GET /api/health` - Health check
- `POST /api/images/upload` - Image upload
- `POST /api/sogni/generate` - Image generation

### Authentication

The extension uses session-based authentication with automatically generated session IDs and client app IDs.

## Privacy & Security

- **Local Processing**: Images are uploaded to your Sogni API only
- **No Data Storage**: Extension doesn't store images locally
- **Session Management**: Temporary sessions for API communication
- **HTTPS**: All production API calls use encrypted connections

## Contributing

1. Fork the repository
2. Make your changes
3. Test thoroughly on various websites
4. Submit a pull request with detailed description

## License

This extension integrates with the Sogni Photobooth system. Please refer to your Sogni license agreement for usage terms.

## Support

For issues related to:
- **Extension functionality**: Check browser console and extension logs
- **API connectivity**: Verify Sogni Photobooth backend status
- **Image processing**: Check Sogni API logs and server status
