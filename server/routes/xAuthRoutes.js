import express from 'express';
// import { generateAuthLink, loginWithOAuth2, shareImageToX } from '../services/twitterShareService.js'; // We'll uncomment later
import crypto from 'crypto'; // For generating a random state string
import { generateAuthLink, loginWithOAuth2, shareImageToX, CLIENT_ORIGIN } from '../services/twitterShareService.js';
import { v4 as uuidv4 } from 'uuid';
import process from 'process'; // Add process import for environment variables
import { 
  storeTwitterOAuthData, 
  storeTwitterStateMapping, 
  getTwitterOAuthData, 
  getSessionIdFromState, 
  deleteTwitterOAuthData,
  redisReady,
  listAllTwitterSessions,
  incrementTwitterShares
} from '../services/redisService.js';

const router = express.Router();

// Legacy Map objects - will be used as fallback if Redis is unavailable
const sessionOAuthData = new Map();
const sessionIdIndex = new Map();
const OAUTH_DATA_TTL = 15 * 60 * 1000; // 15 minutes TTL for OAuth data (in-memory fallback)
const OAUTH_DATA_TTL_SECONDS = 15 * 60; // 15 minutes TTL for Redis

// Debug endpoint to verify Redis is working properly
// Only enable in development or when explicitly allowed
router.get('/debug', async (req, res) => {
  const isDebugAllowed = process.env.NODE_ENV !== 'production' || process.env.ALLOW_OAUTH_DEBUG === 'true';
  
  if (!isDebugAllowed) {
    return res.status(403).json({
      message: 'Debug endpoints are disabled in production. Set ALLOW_OAUTH_DEBUG=true to enable.'
    });
  }
  
  try {
    // Get information about Redis connection
    const redisStatus = {
      connected: redisReady(),
      inMemoryFallbackActive: !redisReady(),
      inMemoryStats: {
        sessionCount: sessionOAuthData.size,
        stateIndexCount: sessionIdIndex.size
      }
    };
    
    // Add cookie information for troubleshooting
    const sessionId = req.cookies?.sogni_session_id;
    const cookieInfo = {
      hasSessionCookie: !!sessionId,
      sessionId: sessionId || null
    };
    
    // Check for OAuth data for the current session
    let sessionData = null;
    if (sessionId) {
      if (redisReady()) {
        sessionData = await getTwitterOAuthData(sessionId);
      } else {
        sessionData = sessionOAuthData.get(sessionId) || null;
      }
    }
    
    // Get all active sessions from Redis or in-memory
    let allSessions = { sessions: [], states: [] };
    
    if (redisReady()) {
      allSessions = await listAllTwitterSessions();
    } else {
      allSessions = {
        sessions: Array.from(sessionOAuthData.entries()).map(([id, data]) => ({
          sessionId: id,
          timestamp: data.timestamp,
          ttl: (data.timestamp + OAUTH_DATA_TTL - Date.now()) / 1000
        })),
        states: Array.from(sessionIdIndex.keys())
      };
    }
    
    // Safe version of session data for display
    const safeSessionData = sessionData ? {
      hasAccessToken: !!sessionData.accessToken,
      hasRefreshToken: !!sessionData.refreshToken,
      tokenCreatedAt: sessionData.tokenCreatedAt,
      lastUsed: sessionData.lastUsed,
      expiresIn: sessionData.expiresIn,
      isExpired: sessionData.tokenCreatedAt && 
                sessionData.expiresIn && 
                Date.now() > (sessionData.tokenCreatedAt + (sessionData.expiresIn * 1000)),
      tokenAge: sessionData.tokenCreatedAt ? 
                Math.floor((Date.now() - sessionData.tokenCreatedAt) / 1000) + ' seconds' : 
                'unknown',
      timestamp: sessionData.timestamp,
      scope: sessionData.scope
    } : null;
    
    res.json({
      timestamp: new Date().toISOString(),
      redis: redisStatus,
      cookieInfo,
      currentSession: {
        hasData: !!sessionData,
        dataSizeIfPresent: sessionData ? JSON.stringify(sessionData).length : 0,
        tokenInfo: safeSessionData
      },
      activeSessions: allSessions
    });
  } catch (error) {
    console.error('[Debug] Error in debug endpoint:', error);
    res.status(500).json({ error: 'Error fetching debug information' });
  }
});

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
    const { imageUrl, message } = req.body;
    if (!imageUrl) {
      return res.status(400).json({ message: 'imageUrl is required' });
    }

    // First, check if we have a valid access token stored for this session
    let existingOAuthData = null;
    
    if (redisReady()) {
      console.log('[Twitter OAuth] Checking for existing access token in Redis...');
      existingOAuthData = await getTwitterOAuthData(req.sessionId);
      if (existingOAuthData) {
        console.log('[Twitter OAuth] Found OAuth data in Redis:', JSON.stringify({
          hasAccessToken: !!existingOAuthData.accessToken,
          timestamp: existingOAuthData.timestamp,
          age: (Date.now() - existingOAuthData.timestamp) / 1000 + ' seconds'
        }));
      }
    } else if (sessionOAuthData.has(req.sessionId)) {
      console.log('[Twitter OAuth] Checking for existing access token in memory...');
      existingOAuthData = sessionOAuthData.get(req.sessionId);
      if (existingOAuthData) {
        console.log('[Twitter OAuth] Found OAuth data in memory:', JSON.stringify({
          hasAccessToken: !!existingOAuthData.accessToken,
          timestamp: existingOAuthData.timestamp,
          age: (Date.now() - existingOAuthData.timestamp) / 1000 + ' seconds'
        }));
      }
    }
    
    // If we have a valid access token, use it directly
    if (existingOAuthData && existingOAuthData.accessToken) {
      console.log('[Twitter OAuth] Found existing access token, using it directly');
      
      // Check if token is expired
      const isExpired = existingOAuthData.tokenCreatedAt && 
                       existingOAuthData.expiresIn && 
                       Date.now() > (existingOAuthData.tokenCreatedAt + (existingOAuthData.expiresIn * 1000));
                       
      if (isExpired) {
        console.log('[Twitter OAuth] Existing token is expired, falling back to OAuth flow');
      } else {
        let shareSucceeded = false;
        let shareError = null;
        
        try {
          // Import loggedUserClient from Twitter services
          const { getClientFromToken } = await import('../services/twitterShareService.js');
          
          // Create a client using the stored token
          const loggedUserClient = getClientFromToken(existingOAuthData.accessToken);
          
          // Share the image directly
          console.log(`[Twitter OAuth] Directly sharing image using existing token: ${imageUrl.substring(0, 30)}...`);
          const defaultMessage = "Created in #SogniPhotobooth https://photobooth.sogni.ai";
          await shareImageToX(loggedUserClient, imageUrl, message || defaultMessage);
          
          console.log('[Twitter OAuth] Successfully shared image using existing token');
          shareSucceeded = true;
          
          // Track successful share in metrics
          await incrementTwitterShares();
          
          // Refresh the timestamp on the token
          try {
            if (redisReady()) {
              const updatedData = { 
                ...existingOAuthData, 
                timestamp: Date.now(),
                lastUsed: Date.now()
              };
              await storeTwitterOAuthData(req.sessionId, updatedData, 
                            existingOAuthData.expiresIn ? 
                            Math.min(existingOAuthData.expiresIn, OAUTH_DATA_TTL_SECONDS) : 
                            OAUTH_DATA_TTL_SECONDS);
            } else {
              existingOAuthData.timestamp = Date.now();
              existingOAuthData.lastUsed = Date.now();
              sessionOAuthData.set(req.sessionId, existingOAuthData);
            }
          } catch (storageError) {
            // Log but don't fail if we can't update the token timestamp
            // The share already succeeded, which is what matters
            console.log('[Twitter OAuth] Warning: Could not update token timestamp after successful share:', storageError.message);
          }
        } catch (tokenError) {
          // Capture the error but don't throw yet - we'll decide what to do after
          shareError = tokenError;
          console.log('[Twitter OAuth] Error using existing token:', tokenError.message);
        }
        
        // If sharing succeeded, return success regardless of any token storage errors
        if (shareSucceeded) {
          // Return success even if there were non-critical errors after sharing
          return res.json({ success: true, message: 'Image shared directly with existing token' });
        } else {
          // If there was a sharing error, log and fall back to the OAuth flow
          console.log('[Twitter OAuth] Falling back to OAuth flow due to sharing error:', shareError.message);
        }
      }
    }

    // Normal OAuth flow (if no token or token failed)
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

    // 3. Store OAuth data in Redis (or fallback to in-memory map)
    const oauthData = {
      codeVerifier,
      state: twitterState, 
      imageUrl,
      message,  // Store the custom message if provided
      sessionId: req.sessionId, // Store the original session ID
      timestamp: Date.now() // Add timestamp for TTL with in-memory fallback
    };
    
    // Try to store in Redis first, fall back to in-memory storage
    let storedInRedis = false;
    if (redisReady()) {
      storedInRedis = await storeTwitterOAuthData(req.sessionId, oauthData, OAUTH_DATA_TTL_SECONDS);
      
      // Also store mappings for both the original and Twitter-modified states
      await storeTwitterStateMapping(combinedState, req.sessionId, OAUTH_DATA_TTL_SECONDS);
      if (twitterState !== combinedState) {
        await storeTwitterStateMapping(twitterState, req.sessionId, OAUTH_DATA_TTL_SECONDS);
      }
    }
    
    // Fallback to in-memory storage if Redis storage failed
    if (!storedInRedis) {
      sessionOAuthData.set(req.sessionId, oauthData);
      
      // Index both the combined state and the Twitter state to this session ID
      sessionIdIndex.set(combinedState, req.sessionId);
      sessionIdIndex.set(twitterState, req.sessionId);
      console.log(`Indexed both original state and Twitter state to session ID ${req.sessionId}`);
    }
    
    // Log session data for debugging
    console.log('Twitter OAuth data stored for session:', req.sessionId);
    console.log('OAuth data:', oauthData);
    console.log('Storage method:', storedInRedis ? 'Redis' : 'In-memory fallback');

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
    console.log(`[Twitter OAuth] Callback received with state: ${returnedState?.substring(0, 8)}...`);
    console.log(`[Twitter OAuth] Auth code present: ${!!code}`);

    // Try to extract the session ID from the state parameter first
    let sessionId = null;
    if (returnedState && returnedState.includes('__')) {
      const parts = returnedState.split('__');
      if (parts.length === 2) {
        sessionId = parts[1];
        console.log('[Twitter OAuth] Extracted session ID from state parameter:', sessionId);
      } else {
        console.log(`[Twitter OAuth] Unable to parse session ID from state, found ${parts.length} parts instead of 2`);
      }
    } else {
      console.log(`[Twitter OAuth] State parameter doesn't contain session ID delimiter: ${returnedState}`);
    }
    
    // Fall back to cookie if session ID couldn't be extracted from state
    if (!sessionId) {
      sessionId = req.cookies?.sogni_session_id;
      console.log('[Twitter OAuth] Using session ID from cookie (fallback):', sessionId);
    }
    
    // Verify session ID is present by any means
    if (!sessionId) {
      console.error('[Twitter OAuth] Session ID missing from both state and cookies');
      return res.status(400).send('Session ID missing. Please try initiating the share again.');
    }
    
    console.log(`[Twitter OAuth] Using session ID: ${sessionId} with storage: ${redisReady() ? 'Redis' : 'in-memory'}`);
    
    // Try to get OAuth data from Redis first
    let oauthData = null;
    let sessionIdFromState = null;
    let dataSource = 'none';
    
    if (redisReady()) {
      // Check if we have a direct session match
      console.log('[Twitter OAuth] Attempting to retrieve OAuth data from Redis using session ID:', sessionId);
      oauthData = await getTwitterOAuthData(sessionId);
      
      if (oauthData) {
        dataSource = 'redis-direct';
        console.log('[Twitter OAuth] Found OAuth data directly in Redis with session ID');
      }
      
      // If not found and we have a state parameter, try to look up session ID from state
      if (!oauthData && returnedState) {
        console.log('[Twitter OAuth] Direct Redis lookup failed, trying state mapping...');
        sessionIdFromState = await getSessionIdFromState(returnedState);
        if (sessionIdFromState) {
          console.log(`[Twitter OAuth] Found indexed session ID ${sessionIdFromState} for state ${returnedState?.substring(0, 8)}... in Redis`);
          oauthData = await getTwitterOAuthData(sessionIdFromState);
          
          // Update session ID to the indexed one for further operations
          if (oauthData) {
            dataSource = 'redis-state-mapping';
            console.log('[Twitter OAuth] Found OAuth data in Redis via state mapping');
            sessionId = sessionIdFromState;
          }
        }
      }
    }
    
    // Fall back to in-memory storage if Redis lookup failed
    if (!oauthData) {
      console.log('[Twitter OAuth] Redis lookup failed or unavailable, trying in-memory fallback...');
      
      // First try to get OAuth data directly
      oauthData = sessionOAuthData.get(sessionId);
      if (oauthData) {
        dataSource = 'memory-direct';
        console.log('[Twitter OAuth] Found OAuth data directly in memory with session ID');
      }
      
      // If not found and we have a state parameter, try to use the index
      if (!oauthData && returnedState) {
        console.log('[Twitter OAuth] Direct memory lookup failed, trying state mapping...');
        const indexedSessionId = sessionIdIndex.get(returnedState);
        if (indexedSessionId) {
          console.log(`[Twitter OAuth] Found indexed session ID ${indexedSessionId} for state ${returnedState?.substring(0, 8)}... in memory`);
          oauthData = sessionOAuthData.get(indexedSessionId);
          // Update session ID to the indexed one for further operations
          if (oauthData) {
            dataSource = 'memory-state-mapping';
            console.log('[Twitter OAuth] Found OAuth data in memory via state mapping');
            sessionId = indexedSessionId;
          }
        }
      }
    }
    
    console.log(`[Twitter OAuth] OAuth data retrieval result: ${dataSource}`);
    
    // Check if we found the OAuth data
    if (!oauthData) {
      console.error('[Twitter OAuth] OAuth data not found for session');
      return res.status(400).send('OAuth session data missing. Please try initiating the share again.');
    }
    
    // Check if OAuth data is expired (only for in-memory fallback)
    if (!redisReady()) {
      const now = Date.now();
      if (now - oauthData.timestamp > OAUTH_DATA_TTL) {
        console.error('[Twitter OAuth] OAuth data expired');
        sessionOAuthData.delete(sessionId); // Clean up expired data
        return res.status(400).send('OAuth session expired. Please try initiating the share again.');
      }
    }
    
    const { codeVerifier, imageUrl, message } = oauthData;
    console.log('[Twitter OAuth] Retrieved OAuth data successfully, proceeding with Twitter API call');

    // Validate state to ensure CSRF protection - now we need to check if our combined state was returned correctly
    // We don't need to do exact matching because we're already extracting the session ID from the state
    if (!returnedState || !returnedState.includes('__')) {
      console.error(
        `[Twitter OAuth] Invalid state format. Received: ${returnedState}`
      );
      
      // Clean up invalid data
      if (redisReady()) {
        await deleteTwitterOAuthData(sessionId);
      } else {
        sessionOAuthData.delete(sessionId);
      }
      
      return res.status(400).send('Invalid OAuth state format. Please try again.');
    }

    if (!code) {
      console.error('[Twitter OAuth] Authorization code missing.');
      // Twitter might also return error parameters like error=access_denied
      if (req.query.error) {
        return res.status(403).send(`Twitter authorization failed: ${req.query.error_description || req.query.error}. Please try again.`);
      }
      return res.status(400).send('Authorization code missing from Twitter callback. Please try again.');
    }

    try {
      // 2. Exchange authorization code for access token
      console.log('[Twitter OAuth] Exchanging authorization code for access token...');
      const { client: loggedUserClient, accessToken, refreshToken, expiresIn, scope } = await loginWithOAuth2(code, codeVerifier);
      console.log('[Twitter OAuth] Successfully obtained access token');

      // Store the token immediately after obtaining it, in case the sharing step fails
      // This allows retry without re-authorization
      if (redisReady()) {
        // Update the oauthData to store token data before trying to share
        const tokenData = {
          ...oauthData,
          accessToken, // Store the actual token object
          refreshToken, // Store refresh token for long-term access
          expiresIn, // Store expiration time
          scope, // Store granted scopes
          tokenCreatedAt: Date.now(), // Track when the token was created
          // Delete the code verifier as it's now used
          codeVerifier: undefined,
          // Set a fresh timestamp
          timestamp: Date.now()
        };
        
        console.log('[Twitter OAuth] Storing token data with expiration in', expiresIn, 'seconds');
        
        // Use the expiresIn value from the token if available, or default TTL otherwise
        const tokenTtl = expiresIn ? Math.min(expiresIn, OAUTH_DATA_TTL_SECONDS) : OAUTH_DATA_TTL_SECONDS;
        
        await storeTwitterOAuthData(sessionId, tokenData, tokenTtl);
        console.log('[Twitter OAuth] Stored access token before attempting share');
        
        // Log the token object structure to help with debugging
        console.log('[Twitter OAuth] Token object keys:', Object.keys(accessToken));
      } else {
        // In-memory fallback for token storage
        oauthData.accessToken = accessToken;
        oauthData.refreshToken = refreshToken;
        oauthData.expiresIn = expiresIn;
        oauthData.scope = scope;
        oauthData.tokenCreatedAt = Date.now();
        delete oauthData.codeVerifier;
        oauthData.timestamp = Date.now();
        
        sessionOAuthData.set(sessionId, oauthData);
        console.log('[Twitter OAuth] Stored access token in memory before attempting share');
      }

      // 3. Share the image to Twitter
      console.log(`[Twitter OAuth] Attempting to share image: ${imageUrl?.substring(0, 30)}... with access token`);
      // Pass the loggedUserClient directly to shareImageToX with custom message if provided
      const defaultMessage = "Created in #SogniPhotobooth https://photobooth.sogni.ai";
      await shareImageToX(loggedUserClient, imageUrl, message || defaultMessage);
      console.log('[Twitter OAuth] Successfully shared image to Twitter');
      
      // Track successful share in metrics
      await incrementTwitterShares();

      // Update the stored token with a "lastUsed" timestamp
      if (redisReady()) {
        const currentData = await getTwitterOAuthData(sessionId);
        if (currentData) {
          const updatedData = { 
            ...currentData,
            lastUsed: Date.now(),
            lastSuccess: Date.now(),
          };
          
          await storeTwitterOAuthData(sessionId, updatedData, 
                        updatedData.expiresIn ? 
                        Math.min(updatedData.expiresIn, OAUTH_DATA_TTL_SECONDS) : 
                        OAUTH_DATA_TTL_SECONDS);
          
          console.log('[Twitter OAuth] Updated OAuth data with success timestamp');
        }
      } else {
        oauthData.lastUsed = Date.now();
        oauthData.lastSuccess = Date.now();
        sessionOAuthData.set(sessionId, oauthData);
      }
    } catch (apiError) {
      console.error('[Twitter OAuth] Error during token exchange or sharing:', apiError);
      
      // Don't delete the token on error, as we might want to troubleshoot
      // Instead, mark it as having an error
      if (redisReady()) {
        const currentData = await getTwitterOAuthData(sessionId);
        if (currentData) {
          const updatedData = { 
            ...currentData,
            lastError: Date.now(),
            errorMessage: apiError.message || 'Unknown error',
          };
          
          await storeTwitterOAuthData(sessionId, updatedData, OAUTH_DATA_TTL_SECONDS);
          console.log('[Twitter OAuth] Stored error information with token data');
        }
      }
      
      // Re-throw the error to be handled by the outer catch
      throw apiError;
    }

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
      if (redisReady()) {
        await deleteTwitterOAuthData(sessionId);
      } else {
        sessionOAuthData.delete(sessionId);
      }
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

// No need for regular cleanup with Redis as it handles TTL automatically
// But we'll keep a modified version for the in-memory fallback
const cleanupExpiredOAuthData = () => {
  // Skip if Redis is available as it handles TTL automatically
  if (redisReady()) {
    return;
  }
  
  const now = Date.now();
  let expiredCount = 0;
  let indexCount = 0;
  
  // Clean up expired OAuth data from in-memory storage
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
    console.log(`Cleaned up ${expiredCount} expired OAuth sessions and ${indexCount} session indexes from in-memory storage`);
  }
};

// Run cleanup every 5 minutes for in-memory fallback
setInterval(cleanupExpiredOAuthData, 5 * 60 * 1000);

export default router; 