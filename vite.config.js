import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";
import fs from 'fs';
import process from 'process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  const env = loadEnv(mode, process.cwd(), "");

  // Use '/' base for production now that we're on our own domain
  const base = '/';

  // Get version from package.json
  const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf-8'));
  const appVersion = packageJson.version;
  console.log(`App version: ${appVersion}`);

  // Filter out sensitive environment variables
  const secureEnv = {};
  for (const key in env) {
    // Only include non-sensitive environment variables
    // Exclude sensitive credentials from the frontend
    if (!key.includes('VITE_SOGNI_APP_ID')) {
      secureEnv[key] = env[key];
    }
  }

  return {
    plugins: [react()],
    base,
    server: {
      host: "0.0.0.0",
      port: 5175,
      strictPort: true,
      https: false,            // disable HTTPS entirely as its handled by nginx
      allowedHosts: ["photobooth-local.sogni.ai", "photobooth.sogni.ai"],
      cors: {
        origin: ["https://photobooth-local.sogni.ai", "http://localhost:5175"],
        methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        credentials: true,
        allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "X-Client-App-ID"]
      },
      proxy: {
        '/api': {
          target: 'http://localhost:3001',
          changeOrigin: true,
          secure: false,
          rewrite: path => path.replace(/^\/api/, ''),
          configure: (proxy) => {
            // Ensure proxy headers are properly passed for CORS
            proxy.on('proxyReq', (proxyReq, req) => {
              // Copy all headers from the original request
              if (req.headers.origin) {
                proxyReq.setHeader('Origin', req.headers.origin);
              }
              if (req.headers['x-client-app-id']) {
                proxyReq.setHeader('X-Client-App-ID', req.headers['x-client-app-id']);
              }
            });
          }
        }
      }
    },
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      // Ensure JSON files and JavaScript configs are included in the build
      assetsInclude: ['**/*.json', 'src/constants/**/*.js'],
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    // Only expose filtered environment variables to the frontend
    define: {
      // Replace sensitive env variables with safe placeholders
      'import.meta.env.VITE_SOGNI_APP_ID': JSON.stringify('***REMOVED***'),
      'import.meta.env.APP_VERSION': JSON.stringify(appVersion),
    },
  };
});
