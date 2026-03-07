import urls from '../config/urls';

interface FaceAnalysisResult {
  faceCount: number;
}

// Max dimension for the thumbnail sent to the LLM — 512px is plenty for counting faces
const ANALYSIS_MAX_DIMENSION = 512;
const ANALYSIS_JPEG_QUALITY = 0.7;
const ANALYSIS_TIMEOUT_MS = 15000;

// Cache analysis results by imageUrl to avoid re-analyzing the same photo
const analysisCache = new Map<string, FaceAnalysisResult>();

/**
 * Analyze an image for main-subject face count using the backend LLM endpoint.
 * Resizes the image to a small thumbnail before sending (face counting doesn't need high res).
 * Returns { faceCount: 1 } on any failure so the feature never blocks the user.
 */
export async function analyzeImageFaces(imageUrl: string): Promise<FaceAnalysisResult> {
  const cached = analysisCache.get(imageUrl);
  if (cached) {
    console.log(`[FACE_ANALYSIS] Cache hit, faceCount: ${cached.faceCount}`);
    return cached;
  }

  try {
    console.log('[FACE_ANALYSIS] Resizing image for analysis...');
    const imageDataUri = await blobUrlToResizedDataUri(imageUrl);
    const sizeMB = (imageDataUri.length / 1024 / 1024).toFixed(2);
    console.log(`[FACE_ANALYSIS] Thumbnail ready: ${sizeMB}MB`);

    const response = await fetch(`${urls.apiUrl}/api/face-analysis/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageDataUri }),
      signal: AbortSignal.timeout(ANALYSIS_TIMEOUT_MS),
      credentials: 'include',
    });

    if (!response.ok) {
      console.warn(`[FACE_ANALYSIS] Backend returned ${response.status}`);
      return { faceCount: 1 };
    }

    const result = (await response.json()) as FaceAnalysisResult;
    console.log(`[FACE_ANALYSIS] Result: ${result.faceCount} main subject face(s)`);

    analysisCache.set(imageUrl, result);
    return result;
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      console.warn(`[FACE_ANALYSIS] Timed out after ${ANALYSIS_TIMEOUT_MS}ms`);
    } else if (error instanceof Error && error.name === 'AbortError') {
      console.warn('[FACE_ANALYSIS] Aborted');
    } else {
      console.warn('[FACE_ANALYSIS] Failed:', error);
    }
    return { faceCount: 1 };
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
