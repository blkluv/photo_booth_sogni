import express from 'express';
import { analyzeImageFaces } from '../services/sogni.js';

const router = express.Router();

// POST /api/face-analysis/analyze
// Accepts { imageDataUri: string } and returns { faceCount: number }
router.post('/analyze', async (req, res) => {
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
