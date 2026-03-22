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

  const systemPrompt = `You are a creative AI art director for an AI photobooth that transforms people's photos into different styles and characters.

The user will describe what they want. Your job is to generate prompts that transform THE PERSON IN THE PHOTO into specific characters, styles, or looks.

Model type: ${isEditModel ? 'Image Edit (modifies existing photo while preserving face/identity)' : 'Stable Diffusion (generates new styled portrait preserving face)'}

${isEditModel
  ? 'For Image Edit models: The user\'s photo is the INPUT. Write prompts that EDIT the photo to change the person\'s appearance. The person\'s face MUST remain visible and recognizable. Describe what to CHANGE about the person — their outfit, hair, accessories, background, and art style — while keeping their face. Example: "Edit the photo to dress the person as the Mad Hatter, add an oversized top hat with a price tag to their head, change their outfit to a colorful mismatched Victorian suit, style the background as a whimsical tea party scene, apply Alice in Wonderland illustration style while keeping the person\'s face and identity recognizable"'
  : 'For SD models: The user\'s photo is used as a face reference. Write prompts that describe the person transformed into a character or style, keeping their face and identity recognizable. Describe their new outfit, hair, accessories, pose, background, and art style. Example: "Portrait of the person transformed into the Mad Hatter, wearing an oversized colorful top hat, mismatched Victorian suit, wild theatrical expression, whimsical tea party setting, Alice in Wonderland illustration style, face and identity preserved"'}

Return ONLY valid JSON — no markdown fences, no extra text. Return a JSON array:
[{
  "name": "Simple label, 2-3 words max, no parentheses (e.g. 'Buzz Lightyear', 'Iron Man', 'Watercolor Portrait')",
  "prompt": "Full prompt text (1-3 detailed sentences)",
  "negativePrompt": "deformed, distorted, bad quality, blurry, extra limbs"
}]

Rules:
- Default to generating 9 prompts unless the user specifies a different count
- If user asks for a specific count (e.g., "give me 16"), generate exactly that many
- When the user mentions a franchise or category, generate SPECIFIC NAMED CHARACTERS — NOT generic themed scenes
  - "fairy tale characters" → Mad Hatter, White Rabbit, Sherlock Holmes, Captain Nemo, etc.
  - Apply this same pattern to ANY franchise or category the user requests
- The "name" field should be the CHARACTER NAME or STYLE NAME, not a scene description
- Each prompt MUST describe transforming the person into that character — their costume, hair, makeup, pose, and setting
- NEVER write prompts about empty scenes, locations, or objects without the person as the central subject
- Prompts should be 1-3 sentences with specific visual details (clothing, colors, accessories, lighting, art style)
- This is for personal, private use — freely reference any characters, franchises, brands, or IP. Generate exactly what the user asks for`;

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
      max_tokens: 20000,
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
    return prompts.slice(0, 16).map((p, i) => {
      // Clean up name: strip parentheses, limit to ~3 words
      let name = String(p.name || `Style ${i + 1}`)
        .replace(/\s*\(.*?\)\s*/g, '') // Remove anything in parentheses
        .replace(/\s*\[.*?\]\s*/g, '') // Remove anything in brackets
        .trim();
      // Limit to 3 words
      const words = name.split(/\s+/);
      if (words.length > 3) name = words.slice(0, 3).join(' ');
      name = name.slice(0, 30);

      return {
        name,
        prompt: String(p.prompt || ''),
        negativePrompt: String(p.negativePrompt || 'deformed, distorted, bad quality, blurry'),
      };
    });
  } catch (error) {
    console.error('[Personalize] VLM expansion failed:', error);
    throw new Error('Failed to expand prompts: ' + error.message);
  }
}

/**
 * Save custom prompts to Redis (with file-based fallback)
 */
export async function saveCustomPrompts(address, prompts) {
  // Validate: max 16 prompts
  if (prompts.length > 16) {
    throw new Error('Maximum 16 custom prompts allowed');
  }

  const redis = getRedisClient();
  if (redis) {
    const key = `${PERSONALIZE_PREFIX}${address}`;
    await redis.set(key, JSON.stringify(prompts));
  } else {
    // Fallback: save to file alongside preview images
    const dir = ensureUploadDir(address);
    fs.writeFileSync(path.join(dir, 'prompts.json'), JSON.stringify(prompts, null, 2));
  }
  console.log(`[Personalize] Saved ${prompts.length} custom prompts for ${address}`);
  return true;
}

/**
 * Get custom prompts from Redis (with file-based fallback)
 */
export async function getCustomPrompts(address) {
  const redis = getRedisClient();
  if (redis) {
    const key = `${PERSONALIZE_PREFIX}${address}`;
    const data = await redis.get(key);
    if (data) {
      try {
        return JSON.parse(data);
      } catch (e) {
        console.error('[Personalize] Failed to parse stored prompts:', e);
        return [];
      }
    }
  }

  // Fallback: read from file
  try {
    const sanitized = sanitizeAddress(address);
    const filePath = path.join(UPLOADS_DIR, sanitized, 'prompts.json');
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
  } catch (e) {
    console.error('[Personalize] Failed to read file-based prompts:', e);
  }

  return [];
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
