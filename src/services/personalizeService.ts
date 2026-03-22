import urls from '../config/urls';
import { getOrCreateAppId } from '../utils/appId';
import { getEventThemeForDomain } from '../utils/eventDomains';

export interface CustomPrompt {
  name: string;
  prompt: string;
  negativePrompt: string;
  imageFilename?: string;
}

const API_BASE = `${urls.apiUrl}/api/personalize`;

/**
 * Get user identifier for Personalize API calls.
 * Event domains use a deterministic address so all visitors share personalized content.
 * Authenticated users use their wallet address; demo users fall back to appId.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getPersonalizeAddress(client: any): string {
  // On event domains, use a deterministic address tied to the event theme
  // so all browsers/sessions share the same personalized content
  const eventTheme = getEventThemeForDomain();
  if (eventTheme) {
    return `event:${eventTheme}`;
  }
  return client?.account?.currentAccount?.walletAddress || client?.appId || getOrCreateAppId();
}

export interface PersonalizeData {
  prompts: CustomPrompt[];
  modelType: 'sd' | 'image-edit';
}

/**
 * Fetch saved custom prompts and model type preference for an account
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
 * Fetch saved custom prompts along with the server-side model type preference.
 * Use this on startup/init to sync the model type across kiosks on event domains.
 */
export async function fetchPersonalizeData(address: string): Promise<PersonalizeData> {
  try {
    const response = await fetch(`${API_BASE}/${encodeURIComponent(address)}`, {
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.status}`);
    }

    const data = await response.json();
    const modelType = (data.modelType === 'sd' || data.modelType === 'image-edit')
      ? data.modelType
      : 'image-edit';
    return { prompts: data.prompts || [], modelType };
  } catch (error) {
    console.error('[Personalize] Failed to fetch personalize data:', error);
    return { prompts: [], modelType: 'image-edit' };
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
 * Optionally saves the model type preference alongside prompts.
 */
export async function saveCustomPrompts(
  address: string,
  prompts: CustomPrompt[],
  modelType?: 'sd' | 'image-edit'
): Promise<CustomPrompt[]> {
  const body: Record<string, unknown> = { prompts };
  if (modelType) body.modelType = modelType;

  const response = await fetch(`${API_BASE}/${encodeURIComponent(address)}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
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
