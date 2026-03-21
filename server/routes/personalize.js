import express from 'express';
import multer from 'multer';
import fs from 'fs';
import {
  expandPrompts,
  saveCustomPrompts,
  getCustomPrompts,
  deleteCustomPrompts,
  savePreviewImage,
  getPreviewImagePath
} from '../services/personalizeService.js';
import { initializeSogniClient } from '../services/sogni.js';

const router = express.Router();

// Configure multer for image uploads (memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

/**
 * GET /api/personalize/images/:address/:filename
 * Serve a stored preview image
 * NOTE: Must be defined BEFORE /:address to avoid "images" matching as an address param
 */
router.get('/images/:address/:filename', (req, res) => {
  try {
    const { address, filename } = req.params;

    // Sanitize filename to prevent path traversal
    const sanitizedFilename = filename.replace(/[^a-zA-Z0-9_.-]/g, '');
    const imagePath = getPreviewImagePath(address, sanitizedFilename);

    if (!fs.existsSync(imagePath)) {
      return res.status(404).json({ error: 'Image not found' });
    }

    res.sendFile(imagePath);
  } catch (error) {
    console.error('[Personalize] Error serving image:', error);
    res.status(500).json({ error: 'Failed to serve image' });
  }
});

/**
 * POST /api/personalize/:address/expand
 * Expand user input into structured prompts via VLM
 * NOTE: Must be defined BEFORE /:address POST to avoid route conflicts
 */
router.post('/:address/expand', async (req, res) => {
  try {
    const { address } = req.params;
    const { input, modelType } = req.body;

    if (!input || typeof input !== 'string') {
      return res.status(400).json({ error: 'Input text is required' });
    }
    if (input.length > 2000) {
      return res.status(400).json({ error: 'Input text too long (max 2000 characters)' });
    }

    if (!address) {
      return res.status(400).json({ error: 'Address is required' });
    }

    // Get the global sogni client for VLM access
    const sogniClient = await initializeSogniClient();
    if (!sogniClient) {
      return res.status(503).json({ error: 'Sogni client not available' });
    }

    const prompts = await expandPrompts(input, modelType || 'sd', sogniClient);
    res.json({ success: true, prompts });
  } catch (error) {
    console.error('[Personalize] Error expanding prompts:', error);
    res.status(500).json({ error: 'Failed to expand prompts', details: error.message });
  }
});

/**
 * GET /api/personalize/:address
 * Fetch saved custom prompts for an account
 */
router.get('/:address', async (req, res) => {
  try {
    const { address } = req.params;
    if (!address) {
      return res.status(400).json({ error: 'Address is required' });
    }

    const prompts = await getCustomPrompts(address);
    res.json({ success: true, prompts });
  } catch (error) {
    console.error('[Personalize] Error fetching prompts:', error);
    res.status(500).json({ error: 'Failed to fetch custom prompts', details: error.message });
  }
});

/**
 * POST /api/personalize/:address
 * Save custom prompts (with optional preview images)
 */
router.post('/:address', upload.array('images', 16), async (req, res) => {
  try {
    const { address } = req.params;
    let { prompts } = req.body;

    if (!address) {
      return res.status(400).json({ error: 'Address is required' });
    }

    // Parse prompts if it's a string (from multipart form)
    if (typeof prompts === 'string') {
      try {
        prompts = JSON.parse(prompts);
      } catch (e) {
        return res.status(400).json({ error: 'Invalid prompts JSON format' });
      }
    }

    if (!Array.isArray(prompts) || prompts.length === 0) {
      return res.status(400).json({ error: 'Prompts array is required' });
    }

    if (prompts.length > 16) {
      return res.status(400).json({ error: 'Maximum 16 custom prompts allowed' });
    }

    // Validate individual prompt structure
    for (const p of prompts) {
      if (!p.name || typeof p.name !== 'string') {
        return res.status(400).json({ error: 'Each prompt must have a name string' });
      }
      if (!p.prompt || typeof p.prompt !== 'string') {
        return res.status(400).json({ error: 'Each prompt must have a prompt string' });
      }
      // Truncate to reasonable limits
      p.name = p.name.slice(0, 100);
      p.prompt = p.prompt.slice(0, 2000);
      if (p.negativePrompt) p.negativePrompt = String(p.negativePrompt).slice(0, 500);
    }

    // Save preview images if provided
    // Images are named with their prompt index (e.g., preview_3.jpg for prompts[3])
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        // Use the original filename which encodes the prompt index
        const match = file.originalname?.match(/preview_(\d+)\.jpg/);
        if (match) {
          const promptIdx = parseInt(match[1], 10);
          const filename = `preview_${promptIdx}.jpg`;
          savePreviewImage(address, filename, file.buffer);
          if (prompts[promptIdx]) {
            prompts[promptIdx].imageFilename = filename;
          }
        } else {
          // Fallback: sequential assignment for backwards compatibility
          const idx = req.files.indexOf(file);
          const filename = `preview_${idx}.jpg`;
          savePreviewImage(address, filename, file.buffer);
          if (prompts[idx]) {
            prompts[idx].imageFilename = filename;
          }
        }
      }
    }

    await saveCustomPrompts(address, prompts);
    res.json({ success: true, message: `Saved ${prompts.length} custom prompts`, prompts });
  } catch (error) {
    console.error('[Personalize] Error saving prompts:', error);
    res.status(500).json({ error: 'Failed to save custom prompts', details: error.message });
  }
});

/**
 * DELETE /api/personalize/:address
 * Reset all custom prompts
 */
router.delete('/:address', async (req, res) => {
  try {
    const { address } = req.params;
    if (!address) {
      return res.status(400).json({ error: 'Address is required' });
    }

    await deleteCustomPrompts(address);
    res.json({ success: true, message: 'All custom prompts have been reset' });
  } catch (error) {
    console.error('[Personalize] Error deleting prompts:', error);
    res.status(500).json({ error: 'Failed to reset custom prompts', details: error.message });
  }
});

export default router;
