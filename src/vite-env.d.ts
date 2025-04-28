/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SOGNI_ENV: string;
  readonly VITE_SOGNI_API_URL: string;
  readonly VITE_SOGNI_SOCKET_URL: string;
  readonly VITE_SOGNI_APP_ID: string;
  readonly VITE_SOGNI_USERNAME: string;
  readonly VITE_SOGNI_PASSWORD: string;
  // Add other environment variables as needed
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
} 