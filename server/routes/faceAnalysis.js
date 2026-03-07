import express from 'express';
import { analyzeImageFaces } from '../services/sogni.js';

const router = express.Router();

// Only allow requests from our own domains (browser Origin header)
// CORS alone isn't enough — it allows no-origin requests (curl, Postman, server-to-server)
const ALLOWED_ORIGINS = [
  'https://photobooth.sogni.ai',
  'https://photobooth-staging.sogni.ai',
  'https://photobooth-local.sogni.ai',
  'http://localhost:5175',
  'http://localhost:3000',
  'http://127.0.0.1:5175',
  'http://127.0.0.1:3000',
];

function requireOrigin(req, res, next) {
  const origin = req.headers.origin || req.headers.referer;
  const isAllowed = origin && (
    ALLOWED_ORIGINS.some(allowed => origin.startsWith(allowed)) ||
    /^https?:\/\/[^/]*\.sogni\.ai(\/|$)/.test(origin)
  );

  if (!isAllowed) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}

// POST /api/face-analysis/analyze
// Accepts { imageDataUri: string } and returns { faceCount: number }
router.post('/analyze', requireOrigin, async (req, res) => {
  const { imageDataUri } = req.body;

  if (!imageDataUri || typeof imageDataUri !== 'string') {
    return res.status(400).json({ error: 'imageDataUri is required' });
  }

  if (!imageDataUri.startsWith('data:image/')) {
    return res.status(400).json({ error: 'Invalid image data URI' });
  }

  try {
    const faceCount = await analyzeImageFaces(imageDataUri);
    console.log(`[FACE_ANALYSIS] Route result: ${faceCount} face(s)`);
    res.json({ faceCount });
  } catch (error) {
    console.error('[FACE_ANALYSIS] Route error:', error?.message || error);
    res.json({ faceCount: 1 });
  }
});

export default router;
