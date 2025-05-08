import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import sogniRoutes from './routes/sogni.js';

// Load environment variables
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

// Get allowed origins from environment variables or use defaults
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5174,https://photobooth-local.sogni.ai';
console.log('DEBUG - CLIENT_ORIGIN from .env:', CLIENT_ORIGIN);

// CORS configuration with options handling
app.use((req, res, next) => {
  const origin = req.headers.origin;
  
  // Log origin for debugging
  console.log(`DEBUG - CORS request from origin:`, origin);
  
  // Allow localhost access for development
  if (!origin || origin.includes('localhost') || origin.includes('127.0.0.1')) {
    console.log('DEBUG - CORS: Allowing localhost request');
    res.header('Access-Control-Allow-Origin', origin || '*');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    
    // Special handling for SSE endpoints
    if (req.path.includes('/progress/')) {
      // Set SSE headers
      res.header('Content-Type', 'text/event-stream');
      res.header('Cache-Control', 'no-cache');
      res.header('Connection', 'keep-alive');
      res.header('X-Accel-Buffering', 'no'); // For nginx proxy buffering
    }
    
    // Handle preflight
    if (req.method === 'OPTIONS') {
      return res.status(200).send();
    }
    
    return next();
  }
  
  // Check if origin is allowed
  if (CLIENT_ORIGIN.includes(origin) || origin.includes('sogni.ai')) {
    console.log('DEBUG - Allowed CORS for:', origin);
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    
    // Special handling for SSE endpoints
    if (req.path.includes('/progress/')) {
      // Set SSE headers
      res.header('Content-Type', 'text/event-stream');
      res.header('Cache-Control', 'no-cache');
      res.header('Connection', 'keep-alive');
      res.header('X-Accel-Buffering', 'no'); // For nginx proxy buffering
    }
    
    // Handle preflight
    if (req.method === 'OPTIONS') {
      return res.status(200).send();
    }
    
    return next();
  }
  
  // Log denied requests
  console.log('DEBUG - CORS: Request denied from:', origin);
  return next(new Error('Not allowed by CORS'));
});

// Log all requests for debugging
app.use((req, res, next) => {
  console.log(`DEBUG - ${new Date().toISOString()} - ${req.method} ${req.path}`);
  console.log(`DEBUG - Headers:`, JSON.stringify(req.headers));
  next();
});

// Cookie parser middleware
app.use(cookieParser());

// Body parser middleware
app.use(bodyParser.json({ limit: '50mb' })); // Increased limit for larger images
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

// API routes
app.use('/sogni', sogniRoutes);  // Original route
app.use('/api/sogni', sogniRoutes);  // Add this new route for direct API access

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'Server is running', environment: process.env.NODE_ENV || 'development' });
});

// Also add the health check at /api/health
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'Server is running', environment: process.env.NODE_ENV || 'development' });
});

// Static routes for production
const staticDir = path.join(__dirname, '..', 'dist');
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