import express from 'express';
import { analyzeImageFaces, analyzeImageSubjects } from '../services/sogni.js';

const router = express.Router();

// Only allow requests from *.sogni.ai subdomains
// CORS alone isn't enough — it allows no-origin requests (curl, Postman, server-to-server)
function requireOrigin(req, res, next) {
  const origin = req.headers.origin || req.headers.referer;
  if (!origin || !/^https:\/\/[^/]*\.sogni\.ai(\/|$)/.test(origin)) {
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

// POST /api/face-analysis/describe
// Accepts { imageDataUri: string } and returns { faceCount: number, subjectDescription: string }
router.post('/describe', requireOrigin, async (req, res) => {
  const { imageDataUri } = req.body;

  if (!imageDataUri || typeof imageDataUri !== 'string') {
    return res.status(400).json({ error: 'imageDataUri is required' });
  }

  if (!imageDataUri.startsWith('data:image/')) {
    return res.status(400).json({ error: 'Invalid image data URI' });
  }

  try {
    const result = await analyzeImageSubjects(imageDataUri);
    console.log(`[SUBJECT_ANALYSIS] Route result: ${result.faceCount} face(s), description: "${result.subjectDescription}"`);
    res.json(result);
  } catch (error) {
    console.error('[SUBJECT_ANALYSIS] Route error:', error?.message || error);
    res.json({ faceCount: 1, subjectDescription: 'the person' });
  }
});

export default router;
