import urls from '../config/urls';

interface FaceAnalysisResult {
  faceCount: number;
}

export interface SubjectAnalysisResult {
  faceCount: number;
  subjectDescription: string;
}

// Max dimension for the thumbnail sent to the LLM — 512px is plenty for counting faces
const ANALYSIS_MAX_DIMENSION = 512;
const ANALYSIS_JPEG_QUALITY = 0.7;
const ANALYSIS_TIMEOUT_MS = 15000;

const SUBJECT_ANALYSIS_MODEL = 'qwen3.5-35b-a3b-gguf-q4km';
const SUBJECT_ANALYSIS_SYSTEM_PROMPT = `You are a subject describer for a photo booth app. Describe ONLY the main subjects who are intentionally posing. Output a JSON object with two fields:
- "count": number of main subjects
- "description": a short phrase for use in image generation prompts

Examples:
{"count": 1, "description": "a young woman with long dark curly hair"}
{"count": 2, "description": "two men, one with a beard and one with glasses"}
{"count": 1, "description": "a man with short gray hair and a mustache"}

Focus on: apparent gender, hair (color/length/style), facial hair, glasses, distinctive visible features. Do NOT mention clothing or background. Keep the description under 25 words.`;

const DEFAULT_SUBJECT_RESULT: SubjectAnalysisResult = { faceCount: 1, subjectDescription: 'the person' };

// Cache analysis results by imageUrl to avoid re-analyzing the same photo
const analysisCache = new Map<string, SubjectAnalysisResult>();

/**
 * Analyze an image for main-subject face count using the backend LLM endpoint.
 * Delegates to analyzeImageSubjects() and returns only { faceCount }.
 * Returns { faceCount: 1 } on any failure so the feature never blocks the user.
 */
export async function analyzeImageFaces(imageUrl: string): Promise<FaceAnalysisResult> {
  const result = await analyzeImageSubjects(imageUrl);
  return { faceCount: result.faceCount };
}

/**
 * Analyze an image for subject count and description using either the SDK directly
 * (when sogniClient is provided for authenticated users) or the backend API.
 *
 * Returns { faceCount: 1, subjectDescription: "the person" } on any failure
 * so the feature never blocks the user.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function analyzeImageSubjects(
  imageUrl: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sogniClient?: any
): Promise<SubjectAnalysisResult> {
  const cached = analysisCache.get(imageUrl);
  if (cached) {
    console.log(`[SUBJECT_ANALYSIS] Cache hit, faceCount: ${cached.faceCount}, description: "${cached.subjectDescription}"`);
    return cached;
  }

  try {
    console.log('[SUBJECT_ANALYSIS] Resizing image for analysis...');
    const imageDataUri = await blobUrlToResizedDataUri(imageUrl);
    const sizeMB = (imageDataUri.length / 1024 / 1024).toFixed(2);
    console.log(`[SUBJECT_ANALYSIS] Thumbnail ready: ${sizeMB}MB`);

    let result: SubjectAnalysisResult;

    if (sogniClient) {
      result = await analyzeViaSDK(sogniClient, imageDataUri);
    } else {
      result = await analyzeViaBackend(imageDataUri);
    }

    console.log(`[SUBJECT_ANALYSIS] Result: ${result.faceCount} main subject(s), description: "${result.subjectDescription}"`);

    analysisCache.set(imageUrl, result);
    return result;
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      console.warn(`[SUBJECT_ANALYSIS] Timed out after ${ANALYSIS_TIMEOUT_MS}ms`);
    } else if (error instanceof Error && error.name === 'AbortError') {
      console.warn('[SUBJECT_ANALYSIS] Aborted');
    } else {
      console.warn('[SUBJECT_ANALYSIS] Failed:', error);
    }
    return DEFAULT_SUBJECT_RESULT;
  }
}

/**
 * Analyze via the Sogni SDK directly (authenticated frontend path).
 * Uses `any` for sogniClient since we don't import the SDK types in the frontend service.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function analyzeViaSDK(sogniClient: any, imageDataUri: string): Promise<SubjectAnalysisResult> {
  console.log('[SUBJECT_ANALYSIS] Using direct SDK path');

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  const stream = await sogniClient.chat.completions.create({
    model: SUBJECT_ANALYSIS_MODEL,
    messages: [
      { role: 'system', content: SUBJECT_ANALYSIS_SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: imageDataUri } },
          { type: 'text', text: 'Describe the main subjects of this photo booth portrait.' },
        ],
      },
    ],
    stream: true,
    tokenType: 'spark',
    temperature: 0.1,
    top_p: 0.9,
    max_tokens: 80,
    think: false,
  });

  let fullContent = '';
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  for await (const chunk of stream as AsyncIterable<{ content?: string }>) {
    if (chunk.content) {
      fullContent += chunk.content;
    }
  }

  return parseSubjectAnalysisResponse(fullContent);
}

/**
 * Analyze via the backend API (demo/unauthenticated path).
 */
async function analyzeViaBackend(imageDataUri: string): Promise<SubjectAnalysisResult> {
  console.log('[SUBJECT_ANALYSIS] Using backend API path');

  const response = await fetch(`${urls.apiUrl}/api/face-analysis/describe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageDataUri }),
    signal: AbortSignal.timeout(ANALYSIS_TIMEOUT_MS),
    credentials: 'include',
  });

  if (!response.ok) {
    console.warn(`[SUBJECT_ANALYSIS] Backend returned ${response.status}`);
    return DEFAULT_SUBJECT_RESULT;
  }

  const result = (await response.json()) as SubjectAnalysisResult;
  return result;
}

/**
 * Parse the LLM JSON response into a SubjectAnalysisResult.
 * Handles markdown-wrapped JSON (```json ... ```) and plain JSON.
 */
function parseSubjectAnalysisResponse(content: string): SubjectAnalysisResult {
  try {
    // Strip markdown code fences if present
    let cleaned = content.trim();
    const jsonBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonBlockMatch) {
      cleaned = jsonBlockMatch[1].trim();
    }

    const parsed = JSON.parse(cleaned) as { count?: unknown; description?: unknown };
    const faceCount = typeof parsed.count === 'number' && parsed.count >= 1 ? parsed.count : 1;
    const subjectDescription =
      typeof parsed.description === 'string' && parsed.description.trim().length > 0
        ? parsed.description.trim()
        : 'the person';

    return { faceCount, subjectDescription };
  } catch {
    console.warn('[SUBJECT_ANALYSIS] Failed to parse LLM response:', content);
    return DEFAULT_SUBJECT_RESULT;
  }
}

/**
 * Convert a blob URL to a resized JPEG data URI.
 * Scales down to ANALYSIS_MAX_DIMENSION on the longest side.
 */
async function blobUrlToResizedDataUri(blobUrl: string): Promise<string> {
  const img = new Image();
  const loaded = new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Failed to load image for face analysis'));
  });
  img.src = blobUrl;
  await loaded;

  // Calculate scaled dimensions (keep aspect ratio, cap longest side)
  let { naturalWidth: w, naturalHeight: h } = img;
  if (w > ANALYSIS_MAX_DIMENSION || h > ANALYSIS_MAX_DIMENSION) {
    const ratio = Math.min(ANALYSIS_MAX_DIMENSION / w, ANALYSIS_MAX_DIMENSION / h);
    w = Math.round(w * ratio);
    h = Math.round(h * ratio);
  }

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, w, h);

  return canvas.toDataURL('image/jpeg', ANALYSIS_JPEG_QUALITY);
}
