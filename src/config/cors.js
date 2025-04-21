export const CORS_CONFIG = {
  origin: 'https://photobooth-local.sogni.ai',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true,
  maxAge: 86400
};

export const API_CONFIG = {
  baseUrl: '/v1',
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  }
}; 