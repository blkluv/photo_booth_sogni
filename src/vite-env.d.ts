/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SOGNI_APP_ID: string;
  // Add other environment variables as needed
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
} 