import urls from '../config/urls';
import { getOrCreateAppId } from '../utils/appId';

export interface CustomPrompt {
  name: string;
  prompt: string;
  negativePrompt: string;
  imageFilename?: string;
}

const API_BASE = `${urls.apiUrl}/api/personalize`;

/**
 * Get user identifier for Personalize API calls.
 * Authenticated users use their wallet address; demo/event mode users fall back to appId.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getPersonalizeAddress(client: any): string {
  return client?.account?.currentAccount?.walletAddress || client?.appId || getOrCreateAppId();
}

/**
 * Fetch saved custom prompts for an account
 */
export async function fetchCustomPrompts(address: string): Promise<CustomPrompt[]> {
  try {
    const response = await fetch(`${API_BASE}/${encodeURIComponent(address)}`, {
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.status}`);
    }

    const data = await response.json();
    return data.prompts || [];
  } catch (error) {
    console.error('[Personalize] Failed to fetch custom prompts:', error);
    return [];
  }
}

/**
 * Expand user input into structured prompts via VLM
 */
export async function expandPrompts(
  address: string,
  input: string,
  modelType: 'sd' | 'image-edit'
): Promise<CustomPrompt[]> {
  const response = await fetch(`${API_BASE}/${encodeURIComponent(address)}/expand`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ input, modelType }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Expansion failed: ${response.status}`);
  }

  const data = await response.json();
  return data.prompts || [];
}

/**
 * Save custom prompts (with optional preview image URLs for server-side fetch)
 */
export async function saveCustomPrompts(
  address: string,
  prompts: CustomPrompt[]
): Promise<CustomPrompt[]> {
  const response = await fetch(`${API_BASE}/${encodeURIComponent(address)}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompts }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Save failed: ${response.status}`);
  }

  const data = await response.json();
  return data.prompts || prompts;
}

/**
 * Reset all custom prompts for an account
 */
export async function resetCustomPrompts(address: string): Promise<void> {
  const response = await fetch(`${API_BASE}/${encodeURIComponent(address)}`, {
    method: 'DELETE',
    credentials: 'include',
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Reset failed: ${response.status}`);
  }
}

/**
 * Get the URL for a preview image
 */
export function getPreviewImageUrl(address: string, filename: string): string {
  return `${API_BASE}/images/${encodeURIComponent(address)}/${encodeURIComponent(filename)}`;
}
