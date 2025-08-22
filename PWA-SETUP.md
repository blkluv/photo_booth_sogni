# PWA Setup Guide - Sogni AI Photobooth

Your Sogni AI Photobooth app is now configured as a Progressive Web App (PWA) that can be installed on mobile devices and run in full-screen mode.

## What's Been Added

### 1. Web App Manifest (`/public/manifest.json`)
- Defines app name, icons, display mode, and behavior
- Set to `"display": "fullscreen"` for immersive experience
- Portrait orientation optimized for mobile photography
- Black theme matching your app's design

### 2. PWA Meta Tags in `index.html`
- iOS-specific meta tags for proper home screen behavior
- Apple Touch Icons for various device sizes
- Theme colors for status bar and UI integration
- Microsoft Tile configuration for Windows devices

### 3. App Icons (`/public/icons/`)
- Generated from your `polaroid-camera.png` image
- Multiple sizes: 72x72, 96x96, 128x128, 144x144, 152x152, 192x192, 384x384, 512x512
- Optimized for different devices and contexts
- Black background to match your app theme

### 4. Service Worker (`/public/sw.js`)
- Enables offline functionality
- Caches static assets for faster loading
- Required for PWA installation
- Handles background sync for future enhancements

### 5. Vite Configuration Updates
- Properly copies PWA assets during build
- Service worker served as static asset
- All PWA files included in production builds

## How to Test PWA Installation

### On iOS (Safari):
1. Open the app in Safari
2. Tap the Share button (square with arrow up)
3. Scroll down and tap "Add to Home Screen"
4. The app icon will appear on your home screen
5. Tap the icon to launch in full-screen mode

### On Android (Chrome):
1. Open the app in Chrome
2. Tap the three dots menu (⋮)
3. Select "Add to Home screen" or "Install app"
4. Confirm the installation
5. The app will appear in your app drawer and home screen

### Desktop (Chrome/Edge):
1. Open the app in Chrome or Edge
2. Look for the install icon (⊕) in the address bar
3. Click it and confirm installation
4. The app will be available in your applications

## Testing PWA Features

### 1. Development Testing
```bash
npm run dev
# Open http://localhost:5175 in your browser
# Check browser dev tools > Application > Manifest
# Verify Service Worker registration in Application > Service Workers
```

### 2. Production Testing
```bash
npm run build
npm run preview
# Open http://localhost:4173 in your browser
# Test PWA installation from this URL
```

### 3. Browser DevTools Verification
- **Chrome DevTools**: Application tab > Manifest, Service Workers
- **Lighthouse**: Run PWA audit to check compliance
- **Network tab**: Verify service worker caching

## PWA Features Enabled

✅ **Full-screen display** - No browser UI when launched from home screen  
✅ **App-like experience** - Behaves like a native mobile app  
✅ **Offline support** - Basic caching for static assets  
✅ **Install prompts** - Browser will suggest installation  
✅ **Custom app icon** - Uses your polaroid camera image  
✅ **Portrait orientation** - Optimized for mobile photography  
✅ **Splash screen** - iOS devices show app icon during launch  
✅ **Status bar styling** - Black translucent for iOS  

## Deployment Notes

When deploying to production:

1. **HTTPS Required**: PWAs require HTTPS in production
2. **Service Worker Scope**: Served from root domain for full app coverage
3. **Icon Sizes**: All required sizes are generated and included
4. **Manifest Validation**: Use Chrome DevTools to verify manifest

## Future Enhancements

The PWA setup includes infrastructure for:
- **Background Sync**: Queue photo uploads when offline
- **Push Notifications**: Notify users of new features
- **Advanced Caching**: Smart caching strategies for AI-generated images
- **Offline Queue**: Save photos locally when internet is unavailable

## Troubleshooting

### Service Worker Not Registering
- Check browser console for errors
- Ensure HTTPS in production
- Verify `/sw.js` is accessible

### Install Prompt Not Showing
- PWA criteria must be met (HTTPS, manifest, service worker)
- Some browsers have different triggers
- Use Chrome DevTools > Application > Manifest to debug

### Icons Not Displaying
- Verify icon files exist in `/public/icons/`
- Check manifest.json icon paths
- Clear browser cache and retry

---

Your Sogni AI Photobooth is now ready to be installed as a mobile app! Users can save it to their home screen and enjoy a full-screen, app-like photography experience.
