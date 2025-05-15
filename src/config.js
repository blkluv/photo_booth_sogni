/**
 * Application configuration
 * Central place to manage environment-specific settings
 */

// Environment detection - use the safer window approach for browser environments
const isDevelopment = window.location.hostname === 'localhost' || 
                      window.location.hostname === '127.0.0.1';
const isProduction = !isDevelopment;

// Base API URL - can be overridden with environment variables
const getBaseApiUrl = () => {
  // Default environment-specific URLs
  if (isDevelopment) {
    // In local development, use the local API
    return 'http://localhost:3001';
  }
  
  // For production, use the canonical API URL
  return 'https://photobooth-api.sogni.ai';
};

// API endpoints
const API = {
  baseUrl: getBaseApiUrl(),
  endpoints: {
    twitter: {
      start: '/api/auth/x/start',
    },
    sogni: {
      base: '/api/sogni',
    }
  }
};

// Export configuration
export default {
  isDevelopment,
  isProduction,
  API
}; 