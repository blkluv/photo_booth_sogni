import express from 'express';
// import { generateAuthLink, loginWithOAuth2, shareImageToX } from '../services/twitterShareService.js'; // We'll uncomment later
import crypto from 'crypto'; // For generating a random state string
import { generateAuthLink, loginWithOAuth2, shareImageToX, CLIENT_ORIGIN } from '../services/twitterShareService.js';

const router = express.Router();

// POST /api/auth/x/start - Initiate Twitter OAuth flow
router.post('/start', async (req, res) => {
  try {
    const { imageUrl } = req.body;
    if (!imageUrl) {
      return res.status(400).json({ message: 'imageUrl is required' });
    }

    // 1. Generate a unique state value for CSRF protection and to pass data.
    // We'll store the imageUrl within the session, associated with this state or a session ID.
    // The `twitter-api-v2` library also generates a state, we should use that primarily for the link.
    const csrfState = crypto.randomBytes(16).toString('hex');
    
    // 2. Generate the authentication link.
    // The state from generateAuthLink is what we need to verify at callback.
    const { url, codeVerifier, state: twitterState } = generateAuthLink(csrfState); // Pass our csrfState to be included if library supports it, or just use twitterState.

    // 3. Store the codeVerifier and any other necessary info (like imageUrl and the state used in the link) in the session.
    // This state needs to be verified when Twitter redirects back to the callback URL.
    req.session.twitterOAuth = {
      codeVerifier,
      state: twitterState, // This is the state string that will be returned by Twitter in the callback URL
      imageUrl, // Store the image URL to be used after successful authentication
      csrfFromClient: csrfState // Optional: if you want to verify this too, though twitterState is primary for OAuth CSRF
    };
    
    // Log session data for debugging
    console.log('Session data set for Twitter OAuth:', req.session.twitterOAuth);

    // 4. Send the authorization URL back to the frontend.
    res.json({ authUrl: url });

  } catch (error) {
    console.error('Error in /api/auth/x/start:', error);
    // Ensure a response is sent even if an error occurs before res.json typically would
    if (!res.headersSent) {
        res.status(500).json({ message: "Internal server error during OAuth start." });
    }
    // No next(error) here if we send a response, otherwise it might try to send another.
    // If using a global error handler, then next(error) is appropriate if no response sent yet.
  }
});

// GET /auth/x/callback - Handle Twitter OAuth callback
router.get('/callback', async (req, res) => {
  try {
    const { code, state: returnedState } = req.query;

    // 1. Validate state and ensure session data exists
    if (!req.session.twitterOAuth || !req.session.twitterOAuth.state) {
      console.error('Twitter OAuth callback error: Session data missing or invalid.');
      return res.status(400).send('OAuth session error. Please try initiating the share again.');
    }

    const { codeVerifier, state: expectedState, imageUrl } = req.session.twitterOAuth;

    if (expectedState !== returnedState) {
      console.error(
        `Twitter OAuth callback error: State mismatch. Expected: ${expectedState}, Received: ${returnedState}`
      );
      return res.status(400).send('OAuth state mismatch. CSRF attack suspected or session error. Please try again.');
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
    const { accessToken } = await loginWithOAuth2(code, codeVerifier); // Using function from twitterShareService

    // At this point, we have the user's access token. We can store it more permanently if needed (e.g., for a multi-user app)
    // For this photobooth, we might just use it immediately and not store it long-term in session beyond this request.
    // Or, if you want to allow multiple shares without re-authing immediately, store it in session:
    // req.session.twitterUserAccessToken = accessToken;

    // 3. Share the image to Twitter
    console.log(`Attempting to share image: ${imageUrl} with access token.`);
    await shareImageToX(accessToken, imageUrl, "Check out this photo from Sogni Photobooth! #SogniAI"); // Using function from twitterShareService

    // 4. Clear the OAuth state from the session as it's now used
    delete req.session.twitterOAuth;

    // 5. Redirect user back to the frontend
    // Construct a success URL, e.g., back to the gallery with a success message
    const frontendRedirectUrl = `${CLIENT_ORIGIN}?share_status=success&service=twitter`; 
    res.redirect(frontendRedirectUrl);

  } catch (error) {
    console.error('Error in /auth/x/callback:', error.message);
    // Clear potentially sensitive OAuth session data on error too
    if (req.session) delete req.session.twitterOAuth;

    let userMessage = 'An error occurred during Twitter authorization or sharing. Please try again.';
    if (error.message.includes('Failed to exchange authorization code')) {
      userMessage = 'Could not complete Twitter authorization. The request may have expired or been invalid.';
    } else if (error.message.includes('Failed to share image on X')) {
      userMessage = `Could not share your image to Twitter. ${error.message.replace('Failed to share image on X: ','')}`;
    }
    
    // Redirect to frontend with an error message
    const frontendErrorRedirectUrl = `${CLIENT_ORIGIN}?share_status=error&service=twitter&message=${encodeURIComponent(userMessage)}`;
    // Ensure response is sent if not already
    if (!res.headersSent) {
      res.redirect(frontendErrorRedirectUrl);
    } else {
      // If headers already sent, this indicates a deeper issue, log it.
      console.error("Headers already sent in /auth/x/callback error handler, cannot redirect.");
      // Fallback if redirect fails or isn't appropriate
      // next(error); // Or send a generic JSON error if frontend expects it and can handle no-redirect.
    }
  }
});

export default router; 