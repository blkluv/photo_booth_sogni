import JSZip from 'jszip';
import { getPreviewImageUrl } from '../services/personalizeService';
import { fetchWithRetry } from './index';

import type { CustomPrompt } from '../services/personalizeService';

interface ExportPrompt {
  name: string;
  prompt: string;
  imageFilename?: string;
}

interface ExportManifest {
  version: number;
  modelType: string;
  prompts: ExportPrompt[];
}

interface ImportedPrompt {
  name: string;
  prompt: string;
  previewImageUrl?: string;
}

interface ImportResult {
  modelType: string;
  prompts: ImportedPrompt[];
}

/**
 * Export Personalize prompts as a zip file containing prompts.json and preview images.
 *
 * @param prompts - Array of saved custom prompts
 * @param modelType - The model type (e.g., 'sd', 'image-edit')
 * @param address - User address for constructing preview image URLs
 * @returns true on success, false on error
 */
export async function exportPersonalizeZip(
  prompts: CustomPrompt[],
  modelType: string,
  address: string
): Promise<boolean> {
  try {
    const zip = new JSZip();

    // Build the prompts array for the manifest (only name, prompt, imageFilename)
    const exportPrompts: ExportPrompt[] = prompts.map((p) => {
      const entry: ExportPrompt = {
        name: p.name,
        prompt: p.prompt,
      };
      if (p.imageFilename) {
        entry.imageFilename = p.imageFilename;
      }
      return entry;
    });

    // Write prompts.json manifest
    const manifest: ExportManifest = {
      version: 1,
      modelType,
      prompts: exportPrompts,
    };
    zip.file('prompts.json', JSON.stringify(manifest, null, 2));

    // Fetch and add each preview image to the zip
    for (const prompt of prompts) {
      if (!prompt.imageFilename) continue;

      try {
        const url = getPreviewImageUrl(address, prompt.imageFilename);
        const response = await fetchWithRetry(url, undefined, {
          context: 'Preview image',
          maxRetries: 2,
          initialDelay: 1000,
        });
        if (!response.ok) {
          console.warn(`Failed to fetch preview image: ${prompt.imageFilename}`);
          continue;
        }

        const blob = await response.blob();
        zip.file(prompt.imageFilename, blob);
      } catch (error) {
        console.error(`Error adding preview image ${prompt.imageFilename} to ZIP:`, error);
        // Continue with other images even if one fails
      }
    }

    // Generate the zip with DEFLATE compression level 6
    const zipBlob = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: {
        level: 6,
      },
    });

    // Trigger download
    const blobUrl = URL.createObjectURL(zipBlob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = 'sogni-personalize-vibes.zip';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);

    return true;
  } catch (error) {
    console.error('Error creating Personalize export ZIP:', error);
    return false;
  }
}

/**
 * Import Personalize prompts from a zip file.
 *
 * @param file - The zip File object from a file input
 * @returns Object with modelType and prompts array (each with name, prompt, and optional previewImageUrl)
 */
export async function importPersonalizeZip(file: File): Promise<ImportResult> {
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);

  // Extract and parse prompts.json
  const manifestFile = zip.file('prompts.json');
  if (!manifestFile) {
    throw new Error('Invalid zip: missing prompts.json');
  }

  const manifestText = await manifestFile.async('string');
  const manifest = JSON.parse(manifestText) as ExportManifest;

  // Validate version
  if (typeof manifest.version !== 'number' || manifest.version < 1) {
    throw new Error('Invalid zip: missing or invalid version');
  }
  if (manifest.version > 1) {
    throw new Error('This export was created by a newer version. Please update the app.');
  }

  // Validate prompts
  if (!Array.isArray(manifest.prompts)) {
    throw new Error('Invalid zip: prompts must be an array');
  }

  // Validate modelType
  if (manifest.modelType !== 'sd' && manifest.modelType !== 'image-edit') {
    throw new Error('Invalid zip: modelType must be "sd" or "image-edit"');
  }

  // Truncate to 999 prompts max
  const sourcePrompts = manifest.prompts.slice(0, 999);

  // Process each prompt, extracting preview images as data URLs
  const importedPrompts: ImportedPrompt[] = [];

  for (const prompt of sourcePrompts) {
    const imported: ImportedPrompt = {
      name: prompt.name,
      prompt: prompt.prompt,
    };

    if (prompt.imageFilename) {
      const imageFile = zip.file(prompt.imageFilename);
      if (imageFile) {
        try {
          const base64 = await imageFile.async('base64');
          const ext = prompt.imageFilename.split('.').pop()?.toLowerCase() || 'jpeg';
          const mimeType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
          imported.previewImageUrl = `data:${mimeType};base64,${base64}`;
        } catch (error) {
          console.error(`Error extracting preview image ${prompt.imageFilename}:`, error);
          // Continue without the preview image
        }
      }
    }

    importedPrompts.push(imported);
  }

  return {
    modelType: manifest.modelType,
    prompts: importedPrompts,
  };
}
