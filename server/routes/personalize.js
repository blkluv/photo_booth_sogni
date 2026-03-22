import express from 'express';
import multer from 'multer';
import crypto from 'crypto';
import fs from 'fs';
import {
  expandPrompts,
  saveCustomPrompts,
  getCustomPrompts,
  deleteCustomPrompts,
  savePreviewImage,
  getPreviewImagePath,
  cleanupOrphanedImages,
  getModelType,
  saveModelType
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

    const [prompts, modelType] = await Promise.all([
      getCustomPrompts(address),
      getModelType(address)
    ]);
    res.json({ success: true, prompts, modelType });
  } catch (error) {
    console.error('[Personalize] Error fetching prompts:', error);
    res.status(500).json({ error: 'Failed to fetch custom prompts', details: error.message });
  }
});

/**
 * POST /api/personalize/:address
 * Save custom prompts (with optional preview images)
 */
router.post('/:address', async (req, res) => {
  try {
    const { address } = req.params;
    let { prompts, modelType } = req.body;

    if (!address) {
      return res.status(400).json({ error: 'Address is required' });
    }

    if (!Array.isArray(prompts) || prompts.length === 0) {
      return res.status(400).json({ error: 'Prompts array is required' });
    }

    if (prompts.length > 999) {
      return res.status(400).json({ error: 'Maximum 999 custom prompts allowed' });
    }

    // Validate individual prompt structure
    for (const p of prompts) {
      if (!p.name || typeof p.name !== 'string') {
        return res.status(400).json({ error: 'Each prompt must have a name string' });
      }
      if (!p.prompt || typeof p.prompt !== 'string') {
        return res.status(400).json({ error: 'Each prompt must have a prompt string' });
      }
      p.name = p.name.slice(0, 100);
      p.prompt = p.prompt.slice(0, 2000);
      if (p.negativePrompt) p.negativePrompt = String(p.negativePrompt).slice(0, 500);
    }

    // Fetch preview images from URLs (server-side, no CORS issues)
    // Use content-based hash for filenames to prevent collisions when prompts are
    // reordered after remove/add operations (fixes duplicate preview image bug)
    for (let i = 0; i < prompts.length; i++) {
      const p = prompts[i];
      if (p.imageFilename || !p.previewImageUrl) continue;
      try {
        // Generate a unique filename from prompt content hash
        // This ensures each prompt gets its own stable image file regardless of array position
        const hash = crypto.createHash('sha256')
          .update(p.name + '|' + p.prompt)
          .digest('hex')
          .slice(0, 12);

        if (p.previewImageUrl.startsWith('data:')) {
          // Handle data: URLs (e.g. from imported prompts) by decoding base64 directly
          const matches = p.previewImageUrl.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
          if (matches) {
            const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
            const base64Data = matches[2];
            const filename = `preview_${hash}.${ext}`;
            savePreviewImage(address, filename, Buffer.from(base64Data, 'base64'));
            p.imageFilename = filename;
          }
        } else {
          // Handle HTTP(S) URLs by fetching the image server-side
          const imgResponse = await fetch(p.previewImageUrl);
          if (imgResponse.ok) {
            const arrayBuffer = await imgResponse.arrayBuffer();
            const filename = `preview_${hash}.jpg`;
            savePreviewImage(address, filename, Buffer.from(arrayBuffer));
            p.imageFilename = filename;
          }
        }
      } catch (err) {
        console.warn(`[Personalize] Could not fetch preview image ${i}:`, err.message);
      }
      // Clean up the temporary URL field before saving to Redis
      delete p.previewImageUrl;
    }

    await saveCustomPrompts(address, prompts);

    // Save model type preference if provided
    if (modelType === 'sd' || modelType === 'image-edit') {
      await saveModelType(address, modelType);
    }

    // Clean up orphaned image files that are no longer referenced by any prompt
    const activeFilenames = prompts.map(p => p.imageFilename).filter(Boolean);
    cleanupOrphanedImages(address, activeFilenames);

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
