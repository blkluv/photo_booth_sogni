/**
 * Image Upload Utility
 * Handles uploading blob URLs to our image hosting service
 */

/**
 * Upload a blob URL to our image hosting service
 * @param {string} blobUrl - The blob URL to upload
 * @param {string} filename - Optional filename (will be auto-generated if not provided)
 * @returns {Promise<string>} - Promise that resolves to the permanent image URL
 */
export const uploadBlobImage = async (blobUrl, filename = null) => {
  console.log(`[Image Upload] Starting upload for blob URL (${blobUrl.length} chars)`);
  
  try {
    // Fetch the blob data
    const response = await fetch(blobUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch blob: ${response.status} ${response.statusText}`);
    }
    
    const blob = await response.blob();
    console.log(`[Image Upload] Blob fetched successfully, size: ${blob.size} bytes, type: ${blob.type}`);
    
    // Create FormData for upload
    const formData = new FormData();
    
    // Generate filename if not provided
    if (!filename) {
      const timestamp = Date.now();
      const extension = blob.type.includes('png') ? '.png' : '.jpg';
      filename = `mobile-share-${timestamp}${extension}`;
    }
    
    formData.append('image', blob, filename);
    
    console.log(`[Image Upload] Uploading to server with filename: ${filename}`);
    
    // Upload to our image hosting service
    // Use the API domain for uploads to ensure correct URL generation
    const apiBaseUrl = window.location.hostname.includes('localhost') 
      ? 'http://localhost:3001' 
      : 'https://photobooth-api.sogni.ai';
    
    const uploadResponse = await fetch(`${apiBaseUrl}/api/images/upload`, {
      method: 'POST',
      body: formData
    });
    
    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      throw new Error(`Upload failed: ${uploadResponse.status} ${uploadResponse.statusText} - ${errorText}`);
    }
    
    const uploadResult = await uploadResponse.json();
    console.log(`[Image Upload] Upload successful:`, uploadResult);
    
    if (!uploadResult.success || !uploadResult.imageUrl) {
      throw new Error('Upload response missing imageUrl');
    }
    
    console.log(`[Image Upload] Permanent URL created successfully`);
    return uploadResult.imageUrl;
    
  } catch (error) {
    console.error('[Image Upload] Error uploading image:', error);
    throw new Error(`Failed to upload image: ${error.message}`);
  }
};

/**
 * Upload multiple blob URLs to our image hosting service
 * @param {string[]} blobUrls - Array of blob URLs to upload
 * @returns {Promise<string[]>} - Promise that resolves to array of permanent image URLs
 */
export const uploadMultipleBlobImages = async (blobUrls) => {
  console.log(`[Image Upload] Starting batch upload for ${blobUrls.length} images`);
  
  const uploadPromises = blobUrls.map((blobUrl, index) => 
    uploadBlobImage(blobUrl, `mobile-share-${Date.now()}-${index}.jpg`)
  );
  
  try {
    const results = await Promise.all(uploadPromises);
    console.log(`[Image Upload] Batch upload completed: ${results.length} images uploaded`);
    return results;
  } catch (error) {
    console.error('[Image Upload] Batch upload failed:', error);
    throw error;
  }
};

/**
 * Check if a URL is a blob URL
 * @param {string} url - URL to check
 * @returns {boolean} - True if it's a blob URL
 */
export const isBlobUrl = (url) => {
  return typeof url === 'string' && url.startsWith('blob:');
};

/**
 * Convert blob URL to permanent URL if needed
 * @param {string} url - URL to process
 * @returns {Promise<string>} - Promise that resolves to permanent URL
 */
export const ensurePermanentUrl = async (url) => {
  if (isBlobUrl(url)) {
    console.log(`[Image Upload] Converting blob URL to permanent URL`);
    return await uploadBlobImage(url);
  }
  
  console.log(`[Image Upload] URL is already permanent`);
  return url;
};

export default {
  uploadBlobImage,
  uploadMultipleBlobImages,
  isBlobUrl,
  ensurePermanentUrl
};
