/**
 * TwitterShare.js
 * Service for handling Twitter sharing functionality
 */
import config from '../config';

/**
 * Share a photo to Twitter (X) using the popup approach
 * @param {Object} params - Parameters for sharing
 * @param {number} params.photoIndex - Index of the photo to share
 * @param {Array} params.photos - Array of photo objects
 * @param {Function} params.setBackendError - Function to update backend error state
 * @param {number} params.maxRetries - Maximum number of retries for network errors (optional)
 * @returns {Promise<void>}
 */
export const shareToTwitter = async ({
  photoIndex,
  photos,
  setBackendError,
  maxRetries = 2
}) => {
  if (photoIndex === null || !photos[photoIndex] || !photos[photoIndex].images || !photos[photoIndex].images[0]) {
    console.error('No image selected or image URL is missing for sharing.');
    setBackendError('No image available for sharing.');
    return;
  }

  const imageUrl = photos[photoIndex].images[0];
  console.log('Attempting to share image to X:', imageUrl);


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
        body: JSON.stringify({ imageUrl }),
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
};

export default {
  shareToTwitter
}; 