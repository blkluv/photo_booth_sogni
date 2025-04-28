import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  const env = loadEnv(mode, process.cwd(), "");

  // Use '/photobooth/' base for production and '/' for development
  const base = mode === "production" ? "/photobooth/" : "/";
  console.log(`Using base path: ${base} for mode: ${mode}`);

  return {
    plugins: [react()],
    base,
    server: {
      host: "photobooth-local.sogni.ai",
      port: 5174,
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
  };
});
