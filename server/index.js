import express from 'express';
// import cors from 'cors'; // Nginx handles CORS now
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

// Log all requests for debugging
app.use((req, res, next) => {
  console.log(`DEBUG - ${new Date().toISOString()} - ${req.method} ${req.path}`);
  //console.log(`DEBUG - Headers:`, JSON.stringify(req.headers));
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