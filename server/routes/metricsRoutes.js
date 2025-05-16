import express from 'express';
import { getAllMetrics } from '../services/redisService.js';

const router = express.Router();

// Add OPTIONS handler for CORS preflight requests
router.options('/', (req, res) => {
  // Set CORS headers
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Accept');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.status(204).end();
});

/**
 * GET /api/metrics
 * Returns all metrics for today and lifetime
 */
router.get('/', async (req, res) => {
  //console.log('[Metrics] GET request received');
  
  try {
    const metrics = await getAllMetrics();
    
    // Set CORS headers for the actual response
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header('Access-Control-Allow-Credentials', 'true');
    
    if (!metrics) {
      console.log('[Metrics] No metrics from Redis, returning fallback data');
      // Return empty metrics if Redis is not available
      return res.json({
        today: {
          batches_generated: 0,
          photos_generated: 0,
          photos_enhanced: 0,
          photos_taken_camera: 0,
          photos_uploaded_browse: 0,
          twitter_shares: 0
        },
        lifetime: {
          batches_generated: 0,
          photos_generated: 0,
          photos_enhanced: 0,
          photos_taken_camera: 0,
          photos_uploaded_browse: 0,
          twitter_shares: 0
        },
        date: new Date().toISOString().split('T')[0],
        source: 'fallback'
      });
    }
    
    // Add source information
    metrics.source = 'redis';
    // console.log('[Metrics] Returning data:', metrics);
    
    res.json(metrics);
  } catch (error) {
    console.error('[Metrics API] Error fetching metrics:', error);
    res.status(500).json({ 
      error: 'Failed to fetch metrics',
      message: error.message,
      fallback: {
        today: {
          batches_generated: 0,
          photos_generated: 0,
          photos_enhanced: 0,
          photos_taken_camera: 0,
          photos_uploaded_browse: 0,
          twitter_shares: 0
        },
        lifetime: {
          batches_generated: 0,
          photos_generated: 0,
          photos_enhanced: 0,
          photos_taken_camera: 0,
          photos_uploaded_browse: 0,
          twitter_shares: 0
        },
        date: new Date().toISOString().split('T')[0],
        source: 'error-fallback'
      }
    });
  }
});

export default router; 