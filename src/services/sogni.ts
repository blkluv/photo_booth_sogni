import { BackendSogniClient, initializeSogniClient as initBackendClient } from './sogniBackend';

/**
 * Initialize the Sogni client through the backend
 * This provides the same interface as the original function but uses the backend
 */
export async function initializeSogniClient(): Promise<BackendSogniClient> {
  return initBackendClient();
}

/**
 * Generate image using the backend
 * This is a placeholder matching the original interface
 */
export function generateImage(): Promise<string[]> {
  // This function is maintained for API compatibility
  // The actual implementation now occurs in App.jsx with the backend client
  return Promise.resolve([]);
} 