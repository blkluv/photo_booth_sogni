import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";
import fs from 'fs';
import { spawn } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Function to start backend server - REMOVED
/*
function startBackendServer() {
  console.log('Starting backend server...');
  // Use spawn to start the server process
  const serverProcess = spawn('node', ['server/index.js'], {
    stdio: 'inherit', // Pipe stdio to the parent process
    detached: false, // Don't detach the process
  });

  // Handle server process events
  serverProcess.on('error', (err) => {
    console.error('Failed to start server:', err);
  });

  // On Vite exit, kill the server process
  process.on('exit', () => {
    if (serverProcess) {
      console.log('Stopping backend server...');
      // Ensure the server process is killed when Vite exits
      serverProcess.kill();
    }
  });

  // Also handle SIGINT and SIGTERM
  process.on('SIGINT', () => process.exit());
  process.on('SIGTERM', () => process.exit());
}
*/

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  const env = loadEnv(mode, process.cwd(), "");

  // Use '/photobooth/' base for production and '/' for development
  const base = mode === "production" ? "/photobooth/" : "/";
  console.log(`Using base path: ${base} for mode: ${mode}`);

  // Filter out sensitive environment variables
  const secureEnv = {};
  for (const key in env) {
    // Only include non-sensitive environment variables
    // Exclude sensitive credentials from the frontend
    if (!key.includes('VITE_SOGNI_APP_ID')) {
      secureEnv[key] = env[key];
    }
  }

  // Start the backend server when Vite starts (only in development mode) - REMOVED
  /*
  if (mode === 'development') {
    startBackendServer();
  }
  */

  return {
    plugins: [react()],
    base,
    server: {
      host: "0.0.0.0",
      port: 5175,
      strictPort: true,
      https: false,            // disable HTTPS entirely as its handled by nginx
      allowedHosts: ["photobooth-local.sogni.ai", "photobooth.sogni.ai", "superapps.sogni.ai"],
      proxy: {
        '/api': {
          target: 'http://localhost:3001',
          changeOrigin: true,
          secure: false,
          rewrite: path => path.replace(/^\/api/, ''), 
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
    },
  };
});
