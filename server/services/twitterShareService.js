import { TwitterApi } from 'twitter-api-v2';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config(); // To load environment variables from .env file

// Initialize a base client for app-only actions or to generate auth links
// User-specific actions will need a client initialized with user's accessToken
const appOnlyClient = new TwitterApi({
  clientId: process.env.TWITTER_CLIENT_ID,
  clientSecret: process.env.TWITTER_CLIENT_SECRET,
});

const TWITTER_REDIRECT_URI = process.env.TWITTER_REDIRECT_URI;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || '/'; // For redirecting after share

/**
 * Generates the OAuth2 authorization link for users to authorize the app.
 * @param {string} state - A unique string to prevent CSRF, also used to pass data.
 * @returns {object} { url: string, codeVerifier: string, state: string }
 */
export const generateAuthLink = (state) => {
  const { url, codeVerifier, state: generatedState } = appOnlyClient.generateOAuth2AuthLink(
    TWITTER_REDIRECT_URI,
    {
      scope: ['tweet.read', 'tweet.write', 'users.read', 'offline.access'],
      state: state, // Use the passed state
    }
  );
  // The state returned by generateOAuth2AuthLink is the one to verify on callback
  return { url, codeVerifier, state: generatedState }; 
};

/**
 * Exchanges the authorization code for an access token.
 * @param {string} code - The authorization code from Twitter callback.
 * @param {string} codeVerifier - The PKCE code verifier.
 * @returns {Promise<object>} Twitter access token object { client: TwitterApi, accessToken: string, refreshToken?: string, expiresIn?: number, scope?: string[] }
 */
export const loginWithOAuth2 = async (code, codeVerifier) => {
  try {
    const { client: loggedClient, accessToken, refreshToken, expiresIn, scope } = await appOnlyClient.loginWithOAuth2({
      code,
      codeVerifier,
      redirectUri: TWITTER_REDIRECT_URI,
    });
    return { client: loggedClient, accessToken, refreshToken, expiresIn, scope };
  } catch (error) {
    console.error('Error logging in with OAuth2:', error.message);
    if (error.response && error.response.data) {
      console.error('Twitter API error details:', error.response.data);
    }
    throw new Error('Failed to exchange authorization code for token.');
  }
};

/**
 * Shares an image to Twitter on behalf of the user.
 * @param {string} accessToken - The user's access token.
 * @param {string} imageUrl - The URL of the image to share.
 * @param {string} [tweetText="Check out this photo from Sogni Photobooth!"] - Optional text for the tweet.
 * @returns {Promise<object>} The result of the tweet posting (data part).
 */
export const shareImageToX = async (accessToken, imageUrl, tweetText = "Check out this photo from Sogni Photobooth!") => {
  try {
    const userClient = new TwitterApi(accessToken);

    console.log(`Downloading image from: ${imageUrl}`);
    const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    const imageBuffer = Buffer.from(imageResponse.data);
    console.log('Image downloaded successfully.');

    let mimeType = 'image/jpeg'; // Default
    const extensionMatch = imageUrl.match(/\.(\w+)$/);
    if (extensionMatch) {
      const ext = extensionMatch[1].toLowerCase();
      if (ext === 'png') mimeType = 'image/png';
      else if (ext === 'gif') mimeType = 'image/gif';
      else if (ext === 'jpg' || ext === 'jpeg') mimeType = 'image/jpeg';
    }

    console.log(`Uploading media to Twitter (MIME type: ${mimeType})...`);
    const mediaId = await userClient.v1.uploadMedia(imageBuffer, { mimeType });
    console.log(`Media uploaded successfully. Media ID: ${mediaId}`);

    console.log('Posting tweet...');
    const tweetResult = await userClient.v2.tweet({
      text: tweetText,
      media: { media_ids: [mediaId] },
    });
    console.log('Tweet posted successfully:', tweetResult.data);
    return tweetResult.data;

  } catch (error) {
    console.error('Error sharing image to X:', error.message);
    let errorMessage = `Failed to share image on X: ${error.message}`;
    if (error.isAxiosError && error.response && error.response.data) {
      console.error('Axios error details during share:', error.response.data);
      errorMessage = `Failed to download image for sharing. Server responded with ${error.response.status}`;
    } else if (error.response && error.response.data) { // Twitter API error
      console.error('Twitter API error details during share:', error.response.data);
      const twitterError = error.response.data.errors?.[0]?.message || error.response.data.detail || JSON.stringify(error.response.data);
      errorMessage = `Twitter API error during share: ${twitterError}`;
    }
    throw new Error(errorMessage);
  }
};

// Export CLIENT_ORIGIN as well if needed by other parts of the server for redirects
export { CLIENT_ORIGIN }; 