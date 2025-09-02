import express from 'express';
import fs from 'fs';
import path from 'path';
const router = express.Router();

// File-based persistent storage for share data
const SHARE_DATA_FILE = path.join(process.cwd(), 'mobile-shares.json');

// Load existing share data from file
let shareData = new Map();

const loadShareData = () => {
  try {
    if (fs.existsSync(SHARE_DATA_FILE)) {
      const data = fs.readFileSync(SHARE_DATA_FILE, 'utf8');
      const parsed = JSON.parse(data);
      shareData = new Map(Object.entries(parsed));
    }
  } catch (error) {
    console.error(`[Mobile Share] Error loading share data:`, error);
    shareData = new Map(); // Fallback to empty storage
  }
};

const saveShareData = () => {
  try {
    const dataToSave = Object.fromEntries(shareData.entries());
    fs.writeFileSync(SHARE_DATA_FILE, JSON.stringify(dataToSave, null, 2));
  } catch (error) {
    console.error(`[Mobile Share] Error saving share data:`, error);
  }
};

// Load data on startup
loadShareData();

// Cleanup old shares (older than 1 hour)
const cleanupOldShares = () => {
  const oneHourAgo = Date.now() - (60 * 60 * 1000);
  let deletedCount = 0;
  for (const [shareId, data] of shareData.entries()) {
    if (data.timestamp < oneHourAgo) {
      shareData.delete(shareId);
      deletedCount++;
    }
  }
  if (deletedCount > 0) {
    saveShareData(); // Save after cleanup
  }
};

// Run cleanup every 15 minutes
setInterval(cleanupOldShares, 15 * 60 * 1000);

// Create a new mobile share
router.post('/create', (req, res) => {
  try {
    const { shareId, photoIndex, imageUrl, tezdevTheme, aspectRatio, outputFormat, timestamp } = req.body;
    
    if (!shareId || !imageUrl) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Store the share data
    const shareDataObj = {
      photoIndex,
      imageUrl,
      tezdevTheme,
      aspectRatio,
      outputFormat,
      timestamp
    };
    
    shareData.set(shareId, shareDataObj);
    
    // Save to persistent storage
    saveShareData();

    res.json({ success: true, shareId });
  } catch (error) {
    console.error('Error creating mobile share:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Serve the mobile sharing page
router.get('/:shareId', async (req, res) => {
  
  try {
    const { shareId } = req.params;
    const data = shareData.get(shareId);
    if (!data) {

      return res.status(404).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Share Not Found - Sogni Photobooth</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              height: 100vh;
              margin: 0;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              text-align: center;
              padding: 20px;
            }
            .container {
              max-width: 400px;
            }
            h1 { margin-bottom: 20px; }
            p { margin-bottom: 30px; opacity: 0.9; }
            .btn {
              background: white;
              color: #667eea;
              padding: 12px 24px;
              border: none;
              border-radius: 25px;
              font-weight: 600;
              text-decoration: none;
              display: inline-block;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>🔗 Share Not Found</h1>
            <p>This sharing link has expired or doesn't exist.</p>
            <a href="https://photobooth.sogni.ai" class="btn">Visit Sogni Photobooth</a>
          </div>
        </body>
        </html>
      `);
    }

    // Check if share is expired
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    if (data.timestamp < oneHourAgo) {
      shareData.delete(shareId);
      saveShareData(); // Save after deletion
      return res.status(404).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Share Expired - Sogni Photobooth</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              height: 100vh;
              margin: 0;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              text-align: center;
              padding: 20px;
            }
            .container {
              max-width: 400px;
            }
            h1 { margin-bottom: 20px; }
            p { margin-bottom: 30px; opacity: 0.9; }
            .btn {
              background: white;
              color: #667eea;
              padding: 12px 24px;
              border: none;
              border-radius: 25px;
              font-weight: 600;
              text-decoration: none;
              display: inline-block;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>⏰ Share Expired</h1>
            <p>This sharing link has expired. Sharing links are valid for 1 hour.</p>
            <a href="https://photobooth.sogni.ai" class="btn">Visit Sogni Photobooth</a>
          </div>
        </body>
        </html>
      `);
    }

    // Verify the image URL is accessible before serving the page
    try {
      if (!data.imageUrl) {
        return res.status(404).send(`
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Photo Not Available - Sogni Photobooth</title>
            <style>
              body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                display: flex;
                justify-content: center;
                align-items: center;
                height: 100vh;
                margin: 0;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                text-align: center;
                padding: 20px;
              }
              .container {
                max-width: 400px;
              }
              h1 { margin-bottom: 20px; }
              p { margin-bottom: 30px; opacity: 0.9; }
              .btn {
                background: white;
                color: #667eea;
                padding: 12px 24px;
                border: none;
                border-radius: 25px;
                font-weight: 600;
                text-decoration: none;
                display: inline-block;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>📸 Photo Not Available</h1>
              <p>No image URL was provided for this share.</p>
              <a href="https://photobooth.sogni.ai" class="btn">Visit Sogni Photobooth</a>
            </div>
          </body>
          </html>
        `);
      }
      
      // Create a timeout promise
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Image verification timeout')), 10000);
        });
        
        // Race between fetch and timeout
        const imageResponse = await Promise.race([
          fetch(data.imageUrl, { method: 'HEAD' }),
          timeoutPromise
        ]);
      
      if (!imageResponse.ok) {
        return res.status(404).send(`
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Photo Not Available - Sogni Photobooth</title>
            <style>
              body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                display: flex;
                justify-content: center;
                align-items: center;
                height: 100vh;
                margin: 0;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                text-align: center;
                padding: 20px;
              }
              .container {
                max-width: 400px;
              }
              h1 { margin-bottom: 20px; }
              p { margin-bottom: 30px; opacity: 0.9; }
              .btn {
                background: white;
                color: #667eea;
                padding: 12px 24px;
                border: none;
                border-radius: 25px;
                font-weight: 600;
                text-decoration: none;
                display: inline-block;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>📸 Photo Not Available</h1>
              <p>The photo you're trying to share is no longer available. This may happen if the photo has expired or was removed.</p>
              <a href="https://photobooth.sogni.ai" class="btn">Visit Sogni Photobooth</a>
            </div>
          </body>
          </html>
        `);
      }

    } catch (imageError) {
      console.error(`[Mobile Share] Error verifying image:`, imageError);
      console.error(`[Mobile Share] Error name:`, imageError.name);
      console.error(`[Mobile Share] Error message:`, imageError.message);
      console.error(`[Mobile Share] Error stack:`, imageError.stack);
      
      return res.status(404).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Photo Not Available - Sogni Photobooth</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              height: 100vh;
              margin: 0;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              text-align: center;
              padding: 20px;
            }
            .container {
              max-width: 400px;
            }
            h1 { margin-bottom: 20px; }
            p { margin-bottom: 30px; opacity: 0.9; }
            .btn {
              background: white;
              color: #667eea;
              padding: 12px 24px;
              border: none;
              border-radius: 25px;
              font-weight: 600;
              text-decoration: none;
              display: inline-block;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>📸 Photo Not Available</h1>
            <p>The photo you're trying to share is no longer available. Please try creating a new share link.</p>
            <a href="https://photobooth.sogni.ai" class="btn">Visit Sogni Photobooth</a>
          </div>
        </body>
        </html>
      `);
    }

    // Generate the mobile sharing page
    // Use the custom Twitter message if provided, otherwise use default
    const twitterMessage = data.twitterMessage || "From my latest photoshoot in Sogni Photobooth! #MadeWithSogni #SogniPhotobooth ✨";
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Share Your Photo - Sogni Photobooth</title>
        <meta property="og:title" content="My Sogni Photobooth Creation">
        <meta property="og:description" content="Check out my AI-generated photo from Sogni Photobooth!">
        <meta property="og:image" content="${data.imageUrl}">
        <meta property="og:type" content="website">
        <meta name="twitter:card" content="summary_large_image">
        <meta name="twitter:title" content="My Sogni Photobooth Creation">
        <meta name="twitter:description" content="Check out my AI-generated photo from Sogni Photobooth!">
        <meta name="twitter:image" content="${data.imageUrl}">
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            color: white;
            margin: 0;
            padding: 0;
          }
          
          .container {
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 10px 10px 60px 10px;
            box-sizing: border-box;
          }
          
          .header {
            text-align: center;
            flex-shrink: 0;
            margin-bottom: 10px;
          }
          
          .header h1 {
            font-size: 22px;
            margin: 0 0 5px 0;
            font-weight: 700;
          }
          
          .header p {
            opacity: 0.9;
            font-size: 13px;
            margin: 0;
          }
          
          .content {
            display: flex;
            flex-direction: column;
            align-items: center;
            width: 100%;
            max-width: 400px;
            flex: 1;
            min-height: 0;
          }
          
          .photo-container {
            margin-bottom: 15px;
            width: 100%;
            display: flex;
            justify-content: center;
          }
          
          .photo {
            width: 100%;
            max-width: 100%;
            height: auto;
            max-height: 60vh;
            display: block;
            object-fit: contain;
            border-radius: 8px;
          }
          
          .actions {
            display: flex;
            flex-direction: row;
            gap: 10px;
            width: 100%;
            flex-shrink: 0;
            margin-top: auto;
          }
          
          .btn {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            padding: 12px 16px;
            border: none;
            border-radius: 50px;
            font-size: 14px;
            font-weight: 600;
            text-decoration: none;
            transition: all 0.3s ease;
            cursor: pointer;
            flex: 1;
          }
          
          .btn-twitter {
            background: #1DA1F2;
            color: white;
          }
          
          .btn-twitter:hover {
            background: #0d8bd9;
            transform: translateY(-2px);
          }
          
          .btn-twitter:disabled {
            background: #999;
            cursor: not-allowed;
            transform: none;
          }
          
          .btn-download {
            background: white;
            color: #667eea;
            border: 2px solid rgba(255, 255, 255, 0.3);
          }
          
          .btn-download:hover {
            background: rgba(255, 255, 255, 0.1);
            color: white;
          }
          
          .footer {
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            text-align: center;
            opacity: 0.9;
            font-size: 14px;
            background: rgba(0, 0, 0, 0.1);
            backdrop-filter: blur(10px);
            padding: 12px 16px;
            z-index: 1000;
            border-top: 1px solid rgba(255, 255, 255, 0.1);
          }
          
          .loading {
            display: inline-block;
            width: 16px;
            height: 16px;
            border: 2px solid #ffffff;
            border-radius: 50%;
            border-top-color: transparent;
            animation: spin 1s ease-in-out infinite;
          }
          
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
          
          .error-message {
            background: rgba(255, 0, 0, 0.1);
            border: 1px solid rgba(255, 0, 0, 0.3);
            color: #ff6b6b;
            padding: 12px;
            border-radius: 8px;
            margin-bottom: 15px;
            font-size: 14px;
            text-align: center;
          }
          
          .success-message {
            background: rgba(0, 255, 0, 0.1);
            border: 1px solid rgba(0, 255, 0, 0.3);
            color: #51cf66;
            padding: 12px;
            border-radius: 8px;
            margin-bottom: 15px;
            font-size: 14px;
            text-align: center;
          }
          
          .footer a {
            color: white;
            text-decoration: none;
            font-weight: 500;
          }
          
          @media (max-width: 480px) {
            .header h1 {
              font-size: 24px;
            }
            
            .photo-container {
              margin: 0 10px 20px;
            }
            
            .actions {
              margin: 0 10px;
            }
          }
        </style>
      </head>
              <body>
        <div class="container">
          <div class="header">
            <h1>📸 Your Sogni Creation</h1>
            <p>Share your AI-generated masterpiece!</p>
          </div>
          
          <div class="content">
            <div class="photo-container">
              <img src="${data.imageUrl}" alt="Your Sogni Photobooth creation" class="photo" />
            </div>
            
            <div id="messages"></div>
            
            <div class="actions">
              <button onclick="handleTwitterShare()" class="btn btn-twitter" id="twitterBtn">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M22.46 6c-.77.35-1.6.58-2.46.67.9-.53 1.59-1.37 1.92-2.38-.84.5-1.78.86-2.79 1.07C18.27 4.49 17.01 4 15.63 4c-2.38 0-4.31 1.94-4.31 4.31 0 .34.04.67.11.99C7.83 9.09 4.16 7.19 1.69 4.23-.07 6.29.63 8.43 2.49 9.58c-.71-.02-1.38-.22-1.97-.54v.05c0 2.09 1.49 3.83 3.45 4.23-.36.1-.74.15-1.14.15-.28 0-.55-.03-.81-.08.55 1.71 2.14 2.96 4.03 3-1.48 1.16-3.35 1.85-5.37 1.85-.35 0-.69-.02-1.03-.06 1.92 1.23 4.2 1.95 6.67 1.95 8.01 0 12.38-6.63 12.38-12.38 0-.19 0-.38-.01-.56.85-.61 1.58-1.37 2.16-2.24z"/>
                </svg>
                Twitter
              </button>
              
              <button onclick="handleSaveToPhone()" class="btn btn-download">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
                </svg>
                Save
              </button>
            </div>
            
            <div class="footer">
              <p>Created with <a href="https://photobooth.sogni.ai">Sogni Photobooth</a></p>
            </div>
          </div>
        </div>
        
        <script>
          // Import and use the exact same Twitter sharing logic as the main app
          let isSharing = false;
          
          function showMessage(message, type = 'info') {
            const messagesDiv = document.getElementById('messages');
            messagesDiv.innerHTML = \`<div class="\${type}-message">\${message}</div>\`;
            
            // Auto-hide success messages after 3 seconds
            if (type === 'success') {
              setTimeout(() => {
                messagesDiv.innerHTML = '';
              }, 3000);
            }
          }
          
          function setButtonLoading(loading) {
            const btn = document.getElementById('twitterBtn');
            if (loading) {
              btn.disabled = true;
              btn.innerHTML = \`
                <div class="loading"></div>
                Sharing...
              \`;
            } else {
              btn.disabled = false;
              btn.innerHTML = \`
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M22.46 6c-.77.35-1.6.58-2.46.67.9-.53 1.59-1.37 1.92-2.38-.84.5-1.78.86-2.79 1.07C18.27 4.49 17.01 4 15.63 4c-2.38 0-4.31 1.94-4.31 4.31 0 .34.04.67.11.99C7.83 9.09 4.16 7.19 1.69 4.23-.07 6.29.63 8.43 2.49 9.58c-.71-.02-1.38-.22-1.97-.54v.05c0 2.09 1.49 3.83 3.45 4.23-.36.1-.74.15-1.14.15-.28 0-.55-.03-.81-.08.55 1.71 2.14 2.96 4.03 3-1.48 1.16-3.35 1.85-5.37 1.85-.35 0-.69-.02-1.03-.06 1.92 1.23 4.2 1.95 6.67 1.95 8.01 0 12.38-6.63 12.38-12.38 0-.19 0-.38-.01-.56.85-.61 1.58-1.37 2.16-2.24z"/>
                </svg>
                Twitter
              \`;
            }
          }
          
          // Use the exact same shareToTwitter function as the main app
          async function shareToTwitter(params) {
            const {
              photoIndex = 0,
              photos = [{ images: ["${data.imageUrl}"] }],
              setBackendError = (err) => console.error('Backend error:', err),
              customMessage = "${twitterMessage}",
              shareUrl = window.location.href,
              maxRetries = 2,
              onSuccess = () => showMessage('Successfully shared to Twitter! 🎉', 'success'),
              tezdevTheme = 'off',
              aspectRatio = null,
              outputFormat = 'jpg'
            } = params;
            
            console.log('shareToTwitter called with params:', { photoIndex, customMessage, shareUrl });
            
            // Get the image data URL (same logic as main app)
            const photo = photos[photoIndex];
            if (!photo || !photo.images || !photo.images[0]) {
              throw new Error('No image available for sharing');
            }
            
            const imageDataUrl = photo.images[0];
            const twitterMessage = customMessage;
            
            console.log('Attempting to share image to X');
            
            let retries = 0;
            const attemptShare = async () => {
              try {
                setBackendError(null);
                
                // Use config for API endpoint (same as main app)
                const apiBaseUrl = window.location.hostname.includes('localhost')
                  ? 'http://localhost:3001'
                  : 'https://photobooth-api.sogni.ai';
                const apiUrl = \`\${apiBaseUrl}/api/auth/x/start\`;
                
                const response = await fetch(apiUrl, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  credentials: 'include', // Important! Ensures cookies are sent
                  body: JSON.stringify({ 
                    imageUrl: imageDataUrl, // Send the data URL directly instead of blob URL
                    message: twitterMessage, // Use the appropriate message format
                    shareUrl: shareUrl // Include the share URL if provided
                  }),
                });
                
                if (!response.ok) {
                  // Try to get error message from response
                  let errorMessage = 'Failed to start Twitter share process.';
                  try {
                    const errorData = await response.json();
                    errorMessage = errorData.message || errorMessage;
                  } catch (e) {
                    // If we can't parse response body, use status text
                    errorMessage = response.statusText || errorMessage;
                  }
                  
                  console.error('Failed to initiate Twitter share:', response.status, errorMessage);
                  
                  // For specific status codes that might be transient, retry
                  if ((response.status >= 500 || response.status === 429) && retries < maxRetries) {
                    retries++;
                    console.log(\`Retrying Twitter share (\${retries}/\${maxRetries})\`);
                    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retrying
                    return attemptShare();
                  }
                  
                  setBackendError({
                    type: 'connection_error',
                    title: '🌐 Connection Issue',
                    message: 'Having trouble connecting to our sharing service. Please check your internet connection and try again.',
                    details: errorMessage,
                    canRetry: true
                  });
                  return;
                }
                
                const responseData = await response.json();
                console.log('Twitter API response:', responseData);
                
                if (responseData.success) {
                  if (responseData.authUrl) {
                    // Need to authenticate first
                    console.log('Redirecting to Twitter auth:', responseData.authUrl);
                    window.location.href = responseData.authUrl;
                  } else if (responseData.message) {
                    // Already authenticated and shared successfully
                    console.log('Twitter share successful:', responseData.message);
                    onSuccess();
                  }
                } else {
                  throw new Error(responseData.message || 'Twitter sharing failed');
                }
                
              } catch (error) {
                console.error('Twitter share error:', error);
                throw error;
              }
            };
            
            return attemptShare();
          }
          
          // Show custom Twitter share modal (same as main app)
          function handleTwitterShare() {
            if (isSharing) return;
            showTwitterModal();
          }
          
          // Custom Twitter share modal (same as main app)
          function showTwitterModal() {
            // Create modal overlay
            const overlay = document.createElement('div');
            overlay.className = 'twitter-modal-overlay';
            overlay.style.cssText = \`
              position: fixed;
              top: 0;
              left: 0;
              width: 100%;
              height: 100%;
              background-color: rgba(0, 0, 0, 0.75);
              display: flex;
              align-items: center;
              justify-content: center;
              z-index: 10000;
              animation: fadeIn 0.2s ease-out;
            \`;
            
            // Create modal
            const modal = document.createElement('div');
            modal.className = 'twitter-modal';
            modal.style.cssText = \`
              background-color: white;
              border-radius: 16px;
              box-shadow: 0 5px 20px rgba(0, 0, 0, 0.3);
              width: 95%;
              max-width: 460px;
              max-height: 85vh;
              overflow: hidden;
              display: flex;
              flex-direction: column;
              animation: slideIn 0.25s ease-out;
              position: relative;
            \`;
            
            modal.innerHTML = \`
              <button class="twitter-modal-close" style="
                position: absolute;
                top: 12px;
                right: 12px;
                background: rgba(0, 0, 0, 0.1);
                border: none;
                color: #333;
                width: 30px;
                height: 30px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 20px;
                cursor: pointer;
                z-index: 1;
              ">×</button>
              
              <div class="twitter-modal-header" style="
                padding: 16px 20px;
                border-bottom: 1px solid #eee;
                display: flex;
                align-items: center;
                gap: 12px;
              ">
                <svg class="twitter-logo" fill="#1DA1F2" viewBox="0 0 24 24" style="width: 22px; height: 22px;">
                  <path d="M22.46 6c-.77.35-1.6.58-2.46.67.9-.53 1.59-1.37 1.92-2.38-.84.5-1.78.86-2.79 1.07C18.27 4.49 17.01 4 15.63 4c-2.38 0-4.31 1.94-4.31 4.31 0 .34.04.67.11.99C7.83 9.09 4.16 7.19 1.69 4.23-.07 6.29.63 8.43 2.49 9.58c-.71-.02-1.38-.22-1.97-.54v.05c0 2.09 1.49 3.83 3.45 4.23-.36.1-.74.15-1.14.15-.28 0-.55-.03-.81-.08.55 1.71 2.14 2.96 4.03 3-1.48 1.16-3.35 1.85-5.37 1.85-.35 0-.69-.02-1.03-.06 1.92 1.23 4.2 1.95 6.67 1.95 8.01 0 12.38-6.63 12.38-12.38 0-.19 0-.38-.01-.56.85-.61 1.58-1.37 2.16-2.24z"/>
                </svg>
                <h2 style="font-size: 18px; margin: 0; font-weight: 600; color: #333;">Share to X</h2>
              </div>
              
              <div class="twitter-modal-content" style="
                display: flex;
                flex-direction: column;
                gap: 16px;
                padding: 16px 20px;
                overflow-y: auto;
                max-height: calc(85vh - 140px);
              ">
                <div class="twitter-message-container" style="position: relative;">
                  <textarea class="twitter-message" style="
                    width: 100%;
                    min-height: 120px;
                    padding: 12px;
                    border: 1px solid #ddd;
                    border-radius: 8px;
                    font-size: 16px;
                    resize: vertical;
                    font-family: inherit;
                    box-sizing: border-box;
                    color: #000000;
                  " placeholder="What would you like to say about this photo?" maxlength="280">${twitterMessage}</textarea>
                  <div class="twitter-char-counter" style="
                    position: absolute;
                    bottom: 8px;
                    right: 12px;
                    font-size: 12px;
                    color: #666;
                  "><span id="char-count">${twitterMessage.length}</span>/280</div>
                </div>
                
                <div class="twitter-image-preview" style="
                  padding: 12px;
                  background: #f8f8f8;
                  margin-top: 12px;
                  display: flex;
                  justify-content: center;
                  align-items: center;
                  min-height: 150px;
                  border-radius: 12px;
                  overflow: hidden;
                  position: relative;
                ">
                  <img src="${data.imageUrl}" alt="Preview" style="
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                    object-fit: contain;
                    max-height: 40vh;
                    max-width: 100%;
                  " />
                </div>
              </div>
              
              <div class="twitter-modal-footer" style="
                padding: 16px 20px;
                border-top: 1px solid #eee;
                display: flex;
                justify-content: flex-end;
              ">
                <button class="twitter-share-btn" style="
                  background-color: #1DA1F2;
                  color: white;
                  border: none;
                  border-radius: 50px;
                  padding: 10px 24px;
                  font-size: 16px;
                  font-weight: 500;
                  cursor: pointer;
                  display: flex;
                  align-items: center;
                  gap: 8px;
                ">
                  <svg class="twitter-icon" fill="white" viewBox="0 0 24 24" style="width: 18px; height: 18px;">
                    <path d="M22.46 6c-.77.35-1.6.58-2.46.67.9-.53 1.59-1.37 1.92-2.38-.84.5-1.78.86-2.79 1.07C18.27 4.49 17.01 4 15.63 4c-2.38 0-4.31 1.94-4.31 4.31 0 .34.04.67.11.99C7.83 9.09 4.16 7.19 1.69 4.23-.07 6.29.63 8.43 2.49 9.58c-.71-.02-1.38-.22-1.97-.54v.05c0 2.09 1.49 3.83 3.45 4.23-.36.1-.74.15-1.14.15-.28 0-.55-.03-.81-.08.55 1.71 2.14 2.96 4.03 3-1.48 1.16-3.35 1.85-5.37 1.85-.35 0-.69-.02-1.03-.06 1.92 1.23 4.2 1.95 6.67 1.95 8.01 0 12.38-6.63 12.38-12.38 0-.19 0-.38-.01-.56.85-.61 1.58-1.37 2.16-2.24z"/>
                  </svg>
                  Post
                </button>
              </div>
            \`;
            
            // Add CSS animations
            const style = document.createElement('style');
            style.textContent = \`
              @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
              }
              @keyframes slideIn {
                from { transform: translateY(20px); opacity: 0.8; }
                to { transform: translateY(0); opacity: 1; }
              }
            \`;
            document.head.appendChild(style);
            
            overlay.appendChild(modal);
            document.body.appendChild(overlay);
            
            // Get elements
            const closeBtn = modal.querySelector('.twitter-modal-close');
            const shareBtn = modal.querySelector('.twitter-share-btn');
            const textarea = modal.querySelector('.twitter-message');
            const charCount = modal.querySelector('#char-count');
            
            // Close modal function
            const closeModal = () => {
              document.body.removeChild(overlay);
              document.head.removeChild(style);
            };
            
            // Event listeners
            closeBtn.addEventListener('click', closeModal);
            overlay.addEventListener('click', (e) => {
              if (e.target === overlay) closeModal();
            });
            
            // Character counter
            textarea.addEventListener('input', () => {
              charCount.textContent = textarea.value.length;
            });
            
            // Share button
            shareBtn.addEventListener('click', async () => {
              if (isSharing) return;
              
              isSharing = true;
              shareBtn.disabled = true;
              shareBtn.innerHTML = \`
                <span style="display: flex; align-items: center; gap: 8px;">
                  <span style="display: flex; gap: 4px;">
                    <span style="width: 6px; height: 6px; background: white; border-radius: 50%; animation: dotFade 1.4s infinite ease-in-out both; animation-delay: -0.32s;"></span>
                    <span style="width: 6px; height: 6px; background: white; border-radius: 50%; animation: dotFade 1.4s infinite ease-in-out both; animation-delay: -0.16s;"></span>
                    <span style="width: 6px; height: 6px; background: white; border-radius: 50%; animation: dotFade 1.4s infinite ease-in-out both;"></span>
                  </span>
                  <span>Sharing...</span>
                </span>
              \`;
              
              // Add dot animation
              const dotStyle = document.createElement('style');
              dotStyle.textContent = \`
                @keyframes dotFade {
                  0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
                  40% { opacity: 1; transform: scale(1); }
                }
              \`;
              document.head.appendChild(dotStyle);
              
              try {
                const apiBaseUrl = window.location.hostname.includes('localhost')
                  ? 'http://localhost:3001'
                  : 'https://photobooth-api.sogni.ai';
                
                const response = await fetch(\`\${apiBaseUrl}/api/auth/x/start\`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  credentials: 'include',
                  body: JSON.stringify({
                    imageUrl: "${data.imageUrl}",
                    message: textarea.value,
                    shareUrl: 'https://photobooth.sogni.ai'
                  }),
                });
                
                if (!response.ok) {
                  throw new Error('Failed to share');
                }
                
                const responseData = await response.json();
                
                if (responseData.success === true && !responseData.authUrl) {
                  // Direct share success
                  showMessage('Successfully shared to Twitter! 🎉', 'success');
                  closeModal();
                } else if (responseData.authUrl) {
                  // Need to authenticate - open popup
                  const popup = window.open(responseData.authUrl, 'twitter-auth', 'width=600,height=700');
                  
                  const messageHandler = (event) => {
                    if (event.data && event.data.type === 'twitter-auth-success') {
                      window.removeEventListener('message', messageHandler);
                      showMessage('Successfully shared to Twitter! 🎉', 'success');
                      closeModal();
                    } else if (event.data && event.data.type === 'twitter-auth-error') {
                      window.removeEventListener('message', messageHandler);
                      showMessage(\`Failed to share: \${event.data.message}\`, 'error');
                      closeModal();
                    }
                  };
                  
                  window.addEventListener('message', messageHandler);
                  
                  // Check if popup was closed
                  const checkClosed = setInterval(() => {
                    if (popup.closed) {
                      clearInterval(checkClosed);
                      window.removeEventListener('message', messageHandler);
                      showMessage('Twitter authorization was cancelled', 'error');
                      closeModal();
                    }
                  }, 1000);
                } else {
                  throw new Error('Unexpected response from server');
                }
              } catch (error) {
                console.error('Twitter share error:', error);
                showMessage(\`Failed to share: \${error.message}\`, 'error');
                closeModal();
              } finally {
                isSharing = false;
                document.head.removeChild(dotStyle);
              }
            });
            
            // Focus textarea
            setTimeout(() => {
              textarea.focus();
              textarea.select();
            }, 100);
          }
          
          // Smart save functionality - same logic as main app
          function handleSaveToPhone() {
            const imageUrl = "${data.imageUrl}";
            const userAgent = navigator.userAgent.toLowerCase();
            const isIOS = /iphone|ipad|ipod/.test(userAgent);
            const isAndroid = /android/.test(userAgent);
            const isSafari = /safari/.test(userAgent) && !/chrome/.test(userAgent);
            
            console.log('Save to phone - Device detection:', { isIOS, isAndroid, isSafari });
            
            if (isIOS) {
              // iOS: Use the share API if available, otherwise fallback to download
              if (navigator.share) {
                fetch(imageUrl)
                  .then(response => response.blob())
                  .then(blob => {
                    const file = new File([blob], 'sogni-photobooth-creation.jpg', { type: 'image/jpeg' });
                    return navigator.share({
                      title: 'My Sogni Photobooth Creation',
                      text: 'Check out my AI-generated photo!',
                      files: [file]
                    });
                  })
                  .catch(error => {
                    console.log('Share API failed, using fallback:', error);
                    fallbackSave();
                  });
              } else {
                fallbackSave();
              }
            } else if (isAndroid) {
              // Android: Try share API first, then fallback
              if (navigator.share) {
                fetch(imageUrl)
                  .then(response => response.blob())
                  .then(blob => {
                    const file = new File([blob], 'sogni-photobooth-creation.jpg', { type: 'image/jpeg' });
                    return navigator.share({
                      title: 'My Sogni Photobooth Creation',
                      files: [file]
                    });
                  })
                  .catch(error => {
                    console.log('Share API failed, using fallback:', error);
                    fallbackSave();
                  });
              } else {
                fallbackSave();
              }
            } else {
              // Desktop or other devices: direct download
              fallbackSave();
            }
          }
          
          function fallbackSave() {
            // Create a temporary link and trigger download
            const link = document.createElement('a');
            link.href = "${data.imageUrl}";
            link.download = 'sogni-photobooth-creation.jpg';
            link.style.display = 'none';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
          }
          
          // Auto-focus on Twitter button for better UX
          document.addEventListener('DOMContentLoaded', function() {
            const twitterBtn = document.querySelector('.btn-twitter');
            if (twitterBtn) {
              twitterBtn.focus();
            }
          });
        </script>
      </body>
      </html>
    `;

    res.send(html);
  } catch (error) {
    console.error(`[Mobile Share] FATAL ERROR serving mobile share page:`, error);
    console.error(`[Mobile Share] Error name:`, error.name);
    console.error(`[Mobile Share] Error message:`, error.message);
    console.error(`[Mobile Share] Error stack:`, error.stack);

    res.status(500).send('Internal server error');
  }
});

export default router;
