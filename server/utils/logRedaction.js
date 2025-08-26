/**
 * Utility functions for redacting sensitive data from logs
 */

/**
 * Redacts image data from objects to prevent clogging logs
 * @param {Object} obj - Object that might contain image data
 * @returns {Object} - Object with image data redacted
 */
export function redactImageData(obj) {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  const redacted = { ...obj };

  // Common image data fields to redact
  const imageFields = [
    'image', 'imageData', 'startingImage', 'contextImages',
    'images', 'data', 'buffer', 'arrayBuffer'
  ];

  imageFields.forEach(field => {
    if (redacted[field]) {
      if (Array.isArray(redacted[field])) {
        redacted[field] = `<REDACTED: Array with ${redacted[field].length} items>`;
      } else if (redacted[field] instanceof Uint8Array) {
        redacted[field] = `<REDACTED: Uint8Array with ${redacted[field].length} bytes>`;
      } else if (redacted[field] instanceof ArrayBuffer) {
        redacted[field] = `<REDACTED: ArrayBuffer with ${redacted[field].byteLength} bytes>`;
      } else if (typeof redacted[field] === 'object' && redacted[field].length !== undefined) {
        redacted[field] = `<REDACTED: ${redacted[field].length} bytes>`;
      } else if (typeof redacted[field] === 'string' && redacted[field].startsWith('data:image')) {
        redacted[field] = `<REDACTED: Data URL, ${redacted[field].length} chars>`;
      }
    }
  });

  // Handle nested objects like controlNet
  if (redacted.controlNet && typeof redacted.controlNet === 'object') {
    redacted.controlNet = redactImageData(redacted.controlNet);
  }

  return redacted;
}

/**
 * Redacts project result data from logs
 * @param {Object} result - Project result object
 * @returns {Object} - Result with large data redacted
 */
export function redactProjectResult(result) {
  if (!result || typeof result !== 'object') {
    return result;
  }

  const redacted = { ...result };

  if (redacted.images) {
    redacted.images = Array.isArray(redacted.images) 
      ? `<REDACTED: ${redacted.images.length} images>`
      : `<REDACTED: images data>`;
  }

  if (redacted.imageUrls) {
    redacted.imageUrls = Array.isArray(redacted.imageUrls)
      ? `<REDACTED: ${redacted.imageUrls.length} URLs>`
      : `<REDACTED: imageUrls data>`;
  }

  return redacted;
}

/**
 * Redacts request parameters that might contain image data
 * @param {Object} params - Request parameters
 * @returns {Object} - Parameters with image data redacted
 */
export function redactRequestParams(params) {
  if (!params || typeof params !== 'object') {
    return params;
  }

  // Use the general image data redaction function
  return redactImageData(params);
}
