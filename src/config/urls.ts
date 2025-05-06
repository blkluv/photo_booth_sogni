/**
 * URL configurations for different environments
 */

// Get the base URL from environment variables if available
const BASE_URL = import.meta.env.VITE_PUBLIC_URL || 
  (import.meta.env.MODE === 'production' 
    ? 'https://superapps.sogni.ai/photobooth'
    : import.meta.env.MODE === 'staging'
      ? 'http://photobooth-staging.sogni.ai'
      : 'http://localhost:5175');

// API URL can be explicitly set or derived from the base URL  
const API_URL = import.meta.env.VITE_API_URL || 
  (import.meta.env.MODE === 'production'
    ? 'https://superapps.sogni.ai/photobooth/api'
    : import.meta.env.MODE === 'staging'
      ? 'http://photobooth-staging.sogni.ai/api'
      : '/api'); // In development, use relative path for the API

export const URLS = {
  base: BASE_URL,
  api: API_URL,
};

export default URLS; 