import { SogniClient } from '@sogni-ai/sogni-client';
import { generateUUID } from '../utils';
import { SOGNI_URLS } from '../constants/settings';

export async function initializeSogniClient(): Promise<SogniClient> {
  const appId = import.meta.env.VITE_SOGNI_APP_ID + generateUUID();
  
  const client = await SogniClient.createInstance({
    appId,
    testnet: true,
    network: "fast",
    logLevel: "debug",
    restEndpoint: SOGNI_URLS.api,
    socketEndpoint: SOGNI_URLS.socket,
  });

  await client.account.login(
    import.meta.env.VITE_SOGNI_USERNAME,
    import.meta.env.VITE_SOGNI_PASSWORD,
  );

  return client;
}

export async function generateImage(): Promise<string[]> {
  // Implementation will be moved from App.jsx
  // This is just the interface for now
  return [];
} 