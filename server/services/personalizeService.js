import { getRedisClient } from './redisService.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PERSONALIZE_PREFIX = 'personalize:prompts:';
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads', 'personalize');

/**
 * Sanitize wallet address for safe filesystem use
 */
function sanitizeAddress(address) {
  // Only allow alphanumeric, dots, hyphens, underscores
  const sanitized = address.replace(/[^a-zA-Z0-9_.-]/g, '');
  if (!sanitized) throw new Error('Invalid address');
  return sanitized;
}

// Ensure uploads directory exists
function ensureUploadDir(address) {
  const sanitized = sanitizeAddress(address);
  const dir = path.join(UPLOADS_DIR, sanitized);
  const resolved = path.resolve(dir);
  if (!resolved.startsWith(path.resolve(UPLOADS_DIR))) {
    throw new Error('Invalid address path');
  }
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Expand user input into structured prompts via Sogni SDK VLM
 */
export async function expandPrompts(userInput, modelType, sogniClient) {
  const isEditModel = modelType === 'image-edit';

  const systemPrompt = `You are a creative AI art director specializing in portrait transformation styles for an AI photobooth.
Given the user's description and target model type, generate structured prompts.

Model type: ${isEditModel ? 'Image Edit (modifies existing photo while preserving face/identity)' : 'Stable Diffusion (generates new styled portrait preserving face)'}

${isEditModel
  ? 'For Image Edit models: Write edit instructions that modify the photo while preserving the person\'s identity. Focus on changing clothes, backgrounds, props, artistic styles applied to the existing photo.'
  : 'For SD models: Write detailed scene/style descriptions that work with face-preserving portrait generation. Describe the artistic style, scene, clothing, mood, lighting.'}

Return ONLY valid JSON — no markdown fences, no extra text. Return a JSON array:
[{
  "name": "Short display name (2-4 words)",
  "prompt": "Full prompt text optimized for the target model (1-3 detailed sentences)",
  "negativePrompt": "deformed, distorted, bad quality, blurry, extra limbs"
}]

Rules:
- Default to generating 9 prompts unless the user specifies a different count
- If user asks for a specific count (e.g., "give me 16"), generate exactly that many
- If user describes a single style, still generate 9 varied interpretations of it
- Each prompt should be distinct and varied
- Names should be catchy and memorable (2-4 words max)
- Prompts should be 1-3 sentences, detailed and specific
- Always include face/identity preservation language in prompts
- Make prompts fun, creative, and photobooth-appropriate`;

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userInput }
  ];

  try {
    let fullContent = '';
    const stream = await sogniClient.chat.completions.create({
      model: 'qwen3.5-35b-a3b-gguf-q4km',
      messages,
      stream: true,
      tokenType: 'spark',
      temperature: 0.8,
      max_tokens: 4000,
      think: false,
    });

    for await (const chunk of stream) {
      if (chunk.content) fullContent += chunk.content;
    }

    // Parse the response
    let cleaned = fullContent.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) cleaned = fenceMatch[1].trim();

    const parsed = JSON.parse(cleaned);
    const prompts = Array.isArray(parsed) ? parsed : (parsed.prompts || []);

    // Validate and normalize
    return prompts.slice(0, 16).map((p, i) => ({
      name: String(p.name || `Style ${i + 1}`).slice(0, 50),
      prompt: String(p.prompt || ''),
      negativePrompt: String(p.negativePrompt || 'deformed, distorted, bad quality, blurry'),
    }));
  } catch (error) {
    console.error('[Personalize] VLM expansion failed:', error);
    throw new Error('Failed to expand prompts: ' + error.message);
  }
}

/**
 * Save custom prompts to Redis
 */
export async function saveCustomPrompts(address, prompts) {
  const redis = getRedisClient();
  if (!redis) {
    throw new Error('Redis not available');
  }

  // Validate: max 16 prompts
  if (prompts.length > 16) {
    throw new Error('Maximum 16 custom prompts allowed');
  }

  const key = `${PERSONALIZE_PREFIX}${address}`;
  await redis.set(key, JSON.stringify(prompts));
  console.log(`[Personalize] Saved ${prompts.length} custom prompts for ${address}`);
  return true;
}

/**
 * Get custom prompts from Redis
 */
export async function getCustomPrompts(address) {
  const redis = getRedisClient();
  if (!redis) {
    return [];
  }

  const key = `${PERSONALIZE_PREFIX}${address}`;
  const data = await redis.get(key);

  if (!data) return [];

  try {
    return JSON.parse(data);
  } catch (e) {
    console.error('[Personalize] Failed to parse stored prompts:', e);
    return [];
  }
}

/**
 * Delete all custom prompts and preview images for an address
 */
export async function deleteCustomPrompts(address) {
  const redis = getRedisClient();
  if (redis) {
    const key = `${PERSONALIZE_PREFIX}${address}`;
    await redis.del(key);
  }

  // Delete preview images
  const sanitized = sanitizeAddress(address);
  const dir = path.join(UPLOADS_DIR, sanitized);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
    console.log(`[Personalize] Deleted preview images for ${address}`);
  }

  console.log(`[Personalize] Cleared all custom prompts for ${address}`);
  return true;
}

/**
 * Save a preview image to disk
 */
export function savePreviewImage(address, filename, imageBuffer) {
  const dir = ensureUploadDir(address);
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, imageBuffer);
  console.log(`[Personalize] Saved preview image: ${filePath}`);
  return filename;
}

/**
 * Get the path to a preview image
 */
export function getPreviewImagePath(address, filename) {
  const sanitized = sanitizeAddress(address);
  const imagePath = path.join(UPLOADS_DIR, sanitized, filename);
  const resolved = path.resolve(imagePath);
  if (!resolved.startsWith(path.resolve(UPLOADS_DIR))) {
    throw new Error('Invalid path');
  }
  return imagePath;
}
