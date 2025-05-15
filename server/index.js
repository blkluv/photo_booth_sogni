import express from 'express';
// import cors from 'cors'; // Nginx handles CORS now
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
// import session from 'express-session'; // Original express-session, replaced
import cookieSession from 'cookie-session'; // Using cookie-session
import crypto from 'crypto';
import sogniRoutes from './routes/sogni.js';
import xAuthRoutes from './routes/xAuthRoutes.js';

// Load environment variables FIRST
dotenv.config();

// Automatically allow self-signed certificates when in local environment
if (process.env.SOGNI_ENV === 'local') {
  console.log('⚠️ Local environment detected: Self-signed certificates allowed');
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3001;

// Get allowed origins and other critical env vars
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5174,https://photobooth-local.sogni.ai';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
// FRONTEND_URL is primarily used in xAuthRoutes, sourced from twitterShareService.js which gets it from process.env
const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN || (process.env.NODE_ENV === 'production' ? '.sogni.ai' : 'localhost');

if (!process.env.SESSION_SECRET) {
  console.warn('⚠️ SESSION_SECRET not set in .env, using a random one. Set for production!');
}
if (process.env.NODE_ENV === 'production' && COOKIE_DOMAIN !== '.sogni.ai') {
  console.warn(`⚠️ Production environment detected, but COOKIE_DOMAIN is set to "${COOKIE_DOMAIN}". Ensure this is intended for cross-subdomain cookies like .sogni.ai.`);
}

// Middleware ordering is important
// 1. Trust proxy (if applicable)
app.set('trust proxy', 1); // Trust first proxy if deployed behind one (e.g., Nginx, Heroku)

// 2. Cookie Parser (might not be strictly necessary before cookieSession, but doesn't hurt)
app.use(cookieParser());

// 3. Body Parsers
app.use(express.json({ limit: '50mb' })); 
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 4. Cookie-based session middleware
app.use(cookieSession({
  name: 'sogni-photobooth-session', // Specific name for the session cookie
  secret: SESSION_SECRET,          // Secret used to sign and verify the cookie values
  // keys: [SESSION_SECRET], // Not needed if `secret` is provided and you aren't doing key rotation
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production', // Only send cookie over HTTPS in production
  domain: COOKIE_DOMAIN,                        // e.g., '.sogni.ai' for production
  maxAge: 24 * 60 * 60 * 1000,              // 24 hours
  sameSite: process.env.NODE_ENV === 'production' ? 'lax' : 'lax' // 'lax' is a good default
}));

// Logging middleware (after session to see session data if needed, or before for just path)
app.use((req, res, next) => {
  console.log(`DEBUG - ${new Date().toISOString()} - ${req.method} ${req.path}`);
  // console.log('DEBUG - Request cookies:', req.cookies);
  // console.log('DEBUG - Request session (after cookieSession):', req.session);
  next();
});

// API routes
app.use('/sogni', sogniRoutes);  // Original route
app.use('/api/sogni', sogniRoutes);  // Add this new route for direct API access
app.use('/api/auth/x', xAuthRoutes); // Twitter OAuth routes, prefixed with /api for consistency
app.use('/auth/x', xAuthRoutes); // Also keep /auth/x for the direct callback from Twitter if redirect URI is /auth/x/callback

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'Server is running', environment: process.env.NODE_ENV || 'development' });
});

// Also add the health check at /api/health
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'Server is running', environment: process.env.NODE_ENV || 'development' });
});

// Static routes for production
const isDev = process.env.NODE_ENV !== 'production';
const staticDir = isDev 
  ? path.join(__dirname, '..', 'dist')
  : '/var/www/photobooth.sogni.ai';
  
app.use(express.static(staticDir));

// Catch-all route to serve index.html for SPA routing
app.get('*', (req, res) => {
  res.sendFile(path.join(staticDir, 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: err.message });
});

// Start the server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
}); 