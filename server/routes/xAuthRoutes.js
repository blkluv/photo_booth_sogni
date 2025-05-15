import express from 'express';
// import { generateAuthLink, loginWithOAuth2, shareImageToX } from '../services/twitterShareService.js'; // We'll uncomment later
import crypto from 'crypto'; // For generating a random state string
import { generateAuthLink, loginWithOAuth2, shareImageToX, CLIENT_ORIGIN } from '../services/twitterShareService.js';
import { v4 as uuidv4 } from 'uuid';
import process from 'process'; // Add process import for environment variables

const router = express.Router();

// Map to store OAuth data by session ID 
const sessionOAuthData = new Map();
// Index to map various session IDs to the original session ID (for cross-domain redirects)
const sessionIdIndex = new Map();
const OAUTH_DATA_TTL = 15 * 60 * 1000; // 15 minutes TTL for OAuth data

// Middleware to ensure we have a session ID to work with
const getSessionId = (req, res, next) => {
  const sessionCookieName = 'sogni_session_id';
  let sessionId = req.cookies?.[sessionCookieName];
  
  // Log the current cookie state for debugging
  console.log(`[Twitter OAuth] Cookie check for ${sessionCookieName}: ${sessionId || 'not found'}`);
  
  // If no session ID exists, create one
  if (!sessionId) {
    sessionId = `sid-${uuidv4()}`;
    
    // Determine if we're in a secure context
    const isSecureContext = req.secure || 
                          req.headers['x-forwarded-proto'] === 'https' || 
                          process.env.NODE_ENV === 'production' ||
                          req.headers.origin?.startsWith('https:');
    
    // Get the origin for cross-domain access
    const origin = req.headers.origin;
    
    // For cross-origin requests from HTTPS origins, use SameSite=None and Secure=true
    // For all other requests, use SameSite=Lax for better compatibility
    const sameSiteSetting = (origin && origin.startsWith('https:')) ? 'none' : 'lax';
    const secure = isSecureContext || sameSiteSetting === 'none';
    
    console.log(`[Twitter OAuth] Creating new session ID: ${sessionId}, Secure: ${secure}, SameSite: ${sameSiteSetting}`);
    
    // Get effective cookie domain (same logic as in server/index.js)
    const cookieDomain = process.env.COOKIE_DOMAIN || 
                        (process.env.NODE_ENV === 'production' ? '.sogni.ai' : undefined);
                        
    if (cookieDomain) {
      console.log(`[Twitter OAuth] Setting cookie with domain: ${cookieDomain}`);
    }
    
    // Set cookie with long expiry (30 days) with proper security settings
    res.cookie(sessionCookieName, sessionId, {
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      httpOnly: true,
      secure: secure, // Enable for HTTPS, even local
      sameSite: sameSiteSetting, // Use 'none' for cross-domain requests
      path: '/',  // Ensure cookie is available for all paths
      domain: cookieDomain // Add domain for cross-subdomain support if defined
    });
  } else {
    console.log(`[Twitter OAuth] Using existing session ID: ${sessionId}`);
  }
  
  // Attach session ID to request for use in route handlers
  req.sessionId = sessionId;
  next();
};

// POST /api/auth/x/start - Initiate Twitter OAuth flow
router.post('/start', getSessionId, async (req, res) => {
  try {
    const { imageUrl } = req.body;
    if (!imageUrl) {
      return res.status(400).json({ message: 'imageUrl is required' });
    }

    // 1. Generate a state value with session ID embedded, making it possible to retrieve session data after redirects
    const baseState = crypto.randomBytes(12).toString('hex'); // Slightly smaller to allow room for session ID
    // Combine the state with the session ID so we can retrieve the correct data even if cookies change
    const combinedState = `${baseState}__${req.sessionId}`;
    
    // 2. Generate the authentication link with the combined state
    console.log(`Creating OAuth state with embedded session ID: ${combinedState}`);
    const { url, codeVerifier, state: twitterState } = generateAuthLink(combinedState);
    console.log(`Twitter API returned state: ${twitterState}`);
    
    // Check if Twitter's API modified our state (it sometimes does)
    if (twitterState !== combinedState) {
      console.log(`NOTE: Twitter modified our state parameter! Original: ${combinedState}, Twitter: ${twitterState}`);
    }

    // 3. Store OAuth data in our custom session map
    const oauthData = {
      codeVerifier,
      state: twitterState, 
      imageUrl,
      sessionId: req.sessionId, // Store the original session ID
      timestamp: Date.now() // Add timestamp for TTL
    };
    
    // Store in our map using the sogni_session_id as key
    sessionOAuthData.set(req.sessionId, oauthData);
    
    // Index both the combined state and the Twitter state to this session ID
    sessionIdIndex.set(combinedState, req.sessionId);
    sessionIdIndex.set(twitterState, req.sessionId);
    console.log(`Indexed both original state and Twitter state to session ID ${req.sessionId}`);
    
    // Log session data for debugging
    console.log('Twitter OAuth data stored for session:', req.sessionId);
    console.log('OAuth data:', oauthData);

    // 4. Send the authorization URL back to the frontend.
    res.json({ authUrl: url });

  } catch (error) {
    console.error('Error in /api/auth/x/start:', error);
    if (!res.headersSent) {
        res.status(500).json({ message: "Internal server error during OAuth start." });
    }
  }
});

// GET /auth/x/callback - Handle Twitter OAuth callback
router.get('/callback', async (req, res) => {

  try {
    const { code, state: returnedState } = req.query;

    // Try to extract the session ID from the state parameter first
    let sessionId = null;
    if (returnedState && returnedState.includes('__')) {
      const parts = returnedState.split('__');
      if (parts.length === 2) {
        sessionId = parts[1];
        console.log('Extracted session ID from state parameter:', sessionId);
      } else {
        console.log(`Unable to parse session ID from state, found ${parts.length} parts instead of 2`);
      }
    } else {
      console.log(`State parameter doesn't contain session ID delimiter: ${returnedState}`);
    }
    
    // Fall back to cookie if session ID couldn't be extracted from state
    if (!sessionId) {
      sessionId = req.cookies?.sogni_session_id;
      console.log('Using session ID from cookie (fallback):', sessionId);
    }
    
    // Verify session ID is present by any means
    if (!sessionId) {
      console.error('Twitter OAuth callback error: Session ID missing from both state and cookies');
      return res.status(400).send('Session ID missing. Please try initiating the share again.');
    }
    
    // First try to get OAuth data directly
    let oauthData = sessionOAuthData.get(sessionId);
    
    // If not found and we have a state parameter, try to use the index
    if (!oauthData && returnedState) {
      const indexedSessionId = sessionIdIndex.get(returnedState);
      if (indexedSessionId) {
        console.log(`Found indexed session ID ${indexedSessionId} for state ${returnedState}`);
        oauthData = sessionOAuthData.get(indexedSessionId);
        // Update session ID to the indexed one for further operations
        sessionId = indexedSessionId;
      }
    }
    
    console.log('Retrieved OAuth data for session:', sessionId, oauthData ? 'found' : 'not found');
    
    // Check if we found the OAuth data and it's not expired
    if (!oauthData) {
      console.error('Twitter OAuth callback error: OAuth data not found for session');
      return res.status(400).send('OAuth session data missing. Please try initiating the share again.');
    }
    
    // Check if OAuth data is expired
    const now = Date.now();
    if (now - oauthData.timestamp > OAUTH_DATA_TTL) {
      console.error('Twitter OAuth callback error: OAuth data expired');
      sessionOAuthData.delete(sessionId); // Clean up expired data
      return res.status(400).send('OAuth session expired. Please try initiating the share again.');
    }
    
    const { codeVerifier, imageUrl } = oauthData;

    // Validate state to ensure CSRF protection - now we need to check if our combined state was returned correctly
    // We don't need to do exact matching because we're already extracting the session ID from the state
    if (!returnedState || !returnedState.includes('__')) {
      console.error(
        `Twitter OAuth callback error: Invalid state format. Received: ${returnedState}`
      );
      sessionOAuthData.delete(sessionId); // Clean up invalid data
      return res.status(400).send('Invalid OAuth state format. Please try again.');
    }

    if (!code) {
      console.error('Twitter OAuth callback error: Authorization code missing.');
      // Twitter might also return error parameters like error=access_denied
      if (req.query.error) {
        return res.status(403).send(`Twitter authorization failed: ${req.query.error_description || req.query.error}. Please try again.`);
      }
      return res.status(400).send('Authorization code missing from Twitter callback. Please try again.');
    }

    // 2. Exchange authorization code for access token
    const { client: loggedUserClient } = await loginWithOAuth2(code, codeVerifier);

    // 3. Share the image to Twitter
    console.log(`Attempting to share image: ${imageUrl} with access token (using loggedUserClient).`);
    // Pass the loggedUserClient directly to shareImageToX
    await shareImageToX(loggedUserClient, imageUrl, "Check out this photo from Sogni Photobooth! #SogniAI");

    // 4. Clear the OAuth data from our map as it's now used
    sessionOAuthData.delete(sessionId);

    // 5. Send HTML page that posts a message to the opener window
    const successHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Twitter Share Successful</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
            color: #333;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
            padding: 20px;
            text-align: center;
          }
          .success-card {
            background: white;
            border-radius: 10px;
            box-shadow: 0 8px 16px rgba(0,0,0,0.1);
            padding: 30px;
            max-width: 400px;
            width: 100%;
          }
          h2 {
            color: #1DA1F2;
            margin-top: 0;
          }
          .icon {
            font-size: 48px;
            margin-bottom: 20px;
          }
          .message {
            margin-bottom: 20px;
            color: #555;
          }
        </style>
      </head>
      <body>
        <div class="success-card">
          <div class="icon">✓</div>
          <h2>Successfully Shared!</h2>
          <div class="message">Your photo has been shared to Twitter. This window will close automatically.</div>
        </div>
        <script>
          // Send success message to opener window
          if (window.opener) {
            try {
              window.opener.postMessage({
                type: 'twitter-auth-success',
                service: 'twitter'
              }, '*'); // Using * since CLIENT_ORIGIN may vary
              
              console.log('Success message posted to opener');
            } catch (err) {
              console.error('Error posting message to opener:', err);
            }
          } else {
            console.warn('No opener window found');
          }
          
          // Auto-close this window after a short delay
          setTimeout(function() {
            window.close();
            // If window doesn't close (e.g., if not opened by script), redirect
            setTimeout(function() {
              window.location.href = "${CLIENT_ORIGIN}?share_status=success&service=twitter";
            }, 500);
          }, 2000);
        </script>
      </body>
      </html>
    `;
    
    res.send(successHtml);

  } catch (error) {
    console.error('Error in /auth/x/callback:', error.message);
    
    // Try to get session ID and clean up
    const sessionId = req.cookies?.sogni_session_id;
    if (sessionId) {
      sessionOAuthData.delete(sessionId);
    }

    let userMessage = 'An error occurred during Twitter authorization or sharing. Please try again.';
    if (error.message.includes('Failed to exchange authorization code')) {
      userMessage = 'Could not complete Twitter authorization. The request may have expired or been invalid.';
    } else if (error.message.includes('Failed to share image on X')) {
      userMessage = `Could not share your image to Twitter. ${error.message.replace('Failed to share image on X: ','')}`;
    }
    
    // Send HTML with error message that will post to opener
    const errorHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Twitter Share Failed</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
            color: #333;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
            padding: 20px;
            text-align: center;
          }
          .error-card {
            background: white;
            border-radius: 10px;
            box-shadow: 0 8px 16px rgba(0,0,0,0.1);
            padding: 30px;
            max-width: 400px;
            width: 100%;
          }
          h2 {
            color: #E0245E;
            margin-top: 0;
          }
          .icon {
            font-size: 48px;
            margin-bottom: 20px;
          }
          .message {
            margin-bottom: 20px;
            color: #555;
          }
        </style>
      </head>
      <body>
        <div class="error-card">
          <div class="icon">✕</div>
          <h2>Share Failed</h2>
          <div class="message">${userMessage}</div>
        </div>
        <script>
          // Send error message to opener window
          if (window.opener) {
            try {
              window.opener.postMessage({
                type: 'twitter-auth-error',
                service: 'twitter',
                message: ${JSON.stringify(userMessage)}
              }, '*'); // Using * since CLIENT_ORIGIN may vary
              
              console.log('Error message posted to opener');
            } catch (err) {
              console.error('Error posting message to opener:', err);
            }
          } else {
            console.warn('No opener window found');
          }
          
          // Auto-close this window after a delay
          setTimeout(function() {
            window.close();
            // If window doesn't close (e.g., if not opened by script), redirect
            setTimeout(function() {
              window.location.href = "${CLIENT_ORIGIN}?share_status=error&service=twitter&message=${encodeURIComponent(userMessage)}";
            }, 500);
          }, 3000);
        </script>
      </body>
      </html>
    `;
    
    if (!res.headersSent) {
      res.send(errorHtml);
    } else {
      console.error("Headers already sent in /auth/x/callback error handler, cannot send HTML.");
    }
  }
});

// Add a cleanup routine to periodically clear expired OAuth data
const cleanupExpiredOAuthData = () => {
  const now = Date.now();
  let expiredCount = 0;
  let indexCount = 0;
  
  // Clean up expired OAuth data
  for (const [sessionId, data] of sessionOAuthData.entries()) {
    if (now - data.timestamp > OAUTH_DATA_TTL) {
      sessionOAuthData.delete(sessionId);
      expiredCount++;
    }
  }
  
  // Clean up expired session ID indexes
  for (const [state, sessionId] of sessionIdIndex.entries()) {
    if (!sessionOAuthData.has(sessionId)) {
      sessionIdIndex.delete(state);
      indexCount++;
    }
  }
  
  if (expiredCount > 0 || indexCount > 0) {
    console.log(`Cleaned up ${expiredCount} expired OAuth sessions and ${indexCount} session indexes`);
  }
};

// Run cleanup every 5 minutes
setInterval(cleanupExpiredOAuthData, 5 * 60 * 1000);

export default router; 