/**
 * TwitterShare.js
 * Service for handling Twitter sharing functionality
 */
import config from '../config';
import { createPolaroidImage } from '../utils/imageProcessing';

/**
 * Extract hashtag from photo data
 * @param {Object} photo - Photo object containing style information
 * @returns {string|null} - Hashtag or null if not found
 */
export const getPhotoHashtag = (photo) => {
  if (!photo) return null;
  let foundLabel = null;
  // If statusText contains a hashtag, use that
  if (photo.statusText && photo.statusText.includes('#')) {
    const hashtagMatch = photo.statusText.match(/#[a-zA-Z0-9]+/);
    foundLabel = hashtagMatch ? hashtagMatch[0] : null;
  }

  if (!foundLabel || foundLabel.length < 3) {
    foundLabel = '#SogniPhotobooth';
  }
  return foundLabel;
};

/**
 * Share a photo to Twitter (X) using the popup approach
 * @param {Object} params - Parameters for sharing
 * @param {number} params.photoIndex - Index of the photo to share
 * @param {Array} params.photos - Array of photo objects
 * @param {Function} params.setBackendError - Function to update backend error state
 * @param {string} [params.customMessage] - Optional custom message to include in the tweet
 * @param {string} [params.shareUrl] - Optional URL to include in the tweet
 * @param {number} [params.maxRetries=2] - Maximum number of retries for network errors
 * @param {Function} [params.onSuccess] - Callback function for direct share success
 * @returns {Promise<void>}
 */
export const shareToTwitter = async ({
  photoIndex,
  photos,
  setBackendError,
  customMessage,
  shareUrl,
  maxRetries = 2,
  onSuccess = null,
}) => {
  if (photoIndex === null || !photos[photoIndex] || !photos[photoIndex].images || !photos[photoIndex].images[0]) {
    console.error('No image selected or image URL is missing for sharing.');
    setBackendError('No image available for sharing.');
    return;
  }

  // Ensure Permanent Marker font is loaded for consistent polaroid styling
  if (!document.querySelector('link[href*="Permanent+Marker"]')) {
    const fontLink = document.createElement('link');
    fontLink.href = 'https://fonts.googleapis.com/css2?family=Permanent+Marker&display=swap';
    fontLink.rel = 'stylesheet';
    document.head.appendChild(fontLink);
    
    // Wait for font to load to ensure consistent text rendering
    try {
      await document.fonts.ready;
      console.log('Permanent Marker font loaded for polaroid styling');
    } catch (err) {
      console.warn('Could not confirm font loading, continuing anyway:', err);
    }
  }

  const photo = photos[photoIndex];
  const originalImageUrl = photo.images[0];
  
  // Get the hashtag or style to use as the label
  const hashtag = getPhotoHashtag(photo);
  const label = hashtag || photo.label || photo.style || '';
  
  console.log(`Creating polaroid image for sharing to X with label: "${label}"`);
  
  try {
    // Attempt to manually load the Permanent Marker font to ensure it's available
    try {
      const testFont = new FontFace('Permanent Marker', 'url(https://fonts.gstatic.com/s/permanentmarker/v16/Fh4uPib9Iyv2ucM6pGQMWimMp004La2Cfw.woff2)');
      await testFont.load();
      document.fonts.add(testFont);
      console.log('Manually loaded Permanent Marker font');
    } catch (fontError) {
      console.warn('Could not manually load font, using system fallback:', fontError);
    }
    
    // Generate a polaroid-framed version of the image as a data URL
    const polaroidImageDataUrl = await createPolaroidImage(originalImageUrl, label);
    
    // Use the data URL directly instead of creating a blob URL
    // This ensures the server can access the image data directly
    console.log('Successfully created polaroid image for X sharing');
    console.log('Attempting to share polaroid image to X');

    let retries = 0;
    const attemptShare = async () => {
      try {
        setBackendError(null);

        // Use config for API endpoint
        const apiUrl = `${config.API.baseUrl}${config.API.endpoints.twitter.start}`;
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include', // Important! Ensures cookies are sent
          body: JSON.stringify({ 
            imageUrl: polaroidImageDataUrl, // Send the data URL directly instead of blob URL
            message: customMessage, // Include optional custom message
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
            console.log(`Retrying Twitter share (${retries}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retrying
            return attemptShare();
          }
          
          setBackendError(`Error starting share: ${errorMessage}`);
          return;
        }

        const responseData = await response.json();
        
        // Handle direct share - backend used an existing token without requiring auth
        if (responseData.success === true && !responseData.authUrl) {
          console.log('Image shared directly using existing token');
          
          // Create a small notification popup with consistent styling instead of alert
          const width = 400;
          const height = 300;
          const left = window.innerWidth / 2 - width / 2 + window.screenX;
          const top = window.innerHeight / 2 - height / 2 + window.screenY;
          
          const successPopup = window.open(
            '',
            'twitter-success-popup',
            `width=${width},height=${height},left=${left},top=${top},location=no,menubar=no,toolbar=no,status=no`
          );
          
          if (successPopup) {
            // Use the same template as in xAuthRoutes.js for consistency
            successPopup.document.write(`
              <!DOCTYPE html>
              <html>
              <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Sharing to X - Success</title>
                <style>
                  body {
                    font-family: sans-serif;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    height: 100vh;
                    margin: 0;
                    background-color: #f8f9fa;
                  }
                  .success-card {
                    background: white;
                    border-radius: 8px;
                    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                    padding: 2rem;
                    text-align: center;
                    max-width: 90%;
                    width: 400px;
                  }
                  .icon {
                    font-size: 4rem;
                    color: #00acee;
                    margin-bottom: 1rem;
                  }
                  h2 {
                    margin-top: 0;
                    color: #333;
                  }
                  .message {
                    color: #555;
                    margin: 1rem 0;
                  }
                </style>
              </head>
              <body>
                <div class="success-card">
                  <div class="icon">✓</div>
                  <h2>Share Successful!</h2>
                  <div class="message">Your image has been successfully shared to X.</div>
                </div>
                <script>
                  // Auto-close this window after a delay
                  setTimeout(function() {
                    window.close();
                  }, 2000);
                </script>
              </body>
              </html>
            `);
            successPopup.document.close();
          }
          
          // Still call the onSuccess callback if provided
          if (onSuccess && typeof onSuccess === 'function') {
            onSuccess();
          }
          return;
        }
        
        if (!responseData.authUrl) {
          console.error('No authUrl received from backend.');
          setBackendError('Could not get Twitter authorization URL.');
          return;
        }

        // Calculate center position for the popup
        const width = 600;
        const height = 700;
        const left = window.innerWidth / 2 - width / 2 + window.screenX;
        const top = window.innerHeight / 2 - height / 2 + window.screenY;
        
        // Open popup with the Twitter auth URL
        const popup = window.open(
          responseData.authUrl,
          'twitter-auth-popup',
          `width=${width},height=${height},left=${left},top=${top},location=yes,resizable=yes,scrollbars=yes`
        );
        
        if (!popup || popup.closed || typeof popup.closed === 'undefined') {
          console.error('Popup blocked or could not be opened');
          setBackendError('Popup blocked. Please allow popups for this site.');
          return;
        }
        
        // Setup message listener for communication from the popup
        const messageHandler = (event) => {
          // Accept messages from any origin since we're using a wildcard in the callback
          console.log('Received message from popup:', event.data);
          
          if (event.data && event.data.type === 'twitter-auth-success') {
            // Auth succeeded
            window.removeEventListener('message', messageHandler);
            if (onSuccess && typeof onSuccess === 'function') {
              onSuccess();
            }
          } else if (event.data && event.data.type === 'twitter-auth-error') {
            // Auth failed
            window.removeEventListener('message', messageHandler);
            
            const errorMessage = event.data.message || 'Error sharing to Twitter';
            console.error('Twitter share error:', errorMessage);
            setBackendError(`Twitter share failed: ${errorMessage}`);
          }
        };
        
        window.addEventListener('message', messageHandler);
        
        // Also handle the case where user closes the popup without completing auth
        const checkPopupClosed = setInterval(() => {
          if (popup.closed) {
            clearInterval(checkPopupClosed);
            window.removeEventListener('message', messageHandler);
          }
        }, 1000);

      } catch (error) {
        console.error('Error in shareToTwitter:', error);
        
        // For network errors, retry if possible
        if ((error.name === 'TypeError' || error.message.includes('Failed to fetch')) && retries < maxRetries) {
          retries++;
          console.log(`Network error, retrying Twitter share (${retries}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retrying
          return attemptShare();
        }
        
        setBackendError(`Client-side error initiating share: ${error.message}`);
      }
    };
    
    // Start the share process
    await attemptShare();
  } catch (error) {
    console.error('Failed to create polaroid image for sharing:', error);
    setBackendError(`Failed to prepare image for sharing: ${error.message}`);
  }
};

export default {
  shareToTwitter,
  getPhotoHashtag
}; 