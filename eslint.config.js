import js from "@eslint/js";
import globals from "globals";
import pluginReact from "eslint-plugin-react";
import pluginTs from "@typescript-eslint/eslint-plugin";
import parserTs from "@typescript-eslint/parser";

// Helper to trim whitespace from global names
const cleanGlobals = (g) => Object.fromEntries(Object.entries(g).map(([k, v]) => [k.trim(), v]));

/**
 * ESLint Flat Config for Sogni Photobooth
 * - Supports JS, TS, React
 * - Uses recommended rules for all
 */

export default [
  // JavaScript & JSX (js.configs.recommended)
  {
    ...js.configs.recommended,
    files: ["**/*.{js,mjs,cjs,jsx}"],
    languageOptions: {
      ...js.configs.recommended.languageOptions,
      globals: cleanGlobals(globals.browser),
    },
  },
  // TypeScript & TSX
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: parserTs,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
        project: "./tsconfig.json",
      },
      globals: cleanGlobals(globals.browser),
    },
    plugins: { "@typescript-eslint": pluginTs },
    rules: {
      ...pluginTs.configs.recommended.rules,
      ...pluginTs.configs["recommended-type-checked"].rules,
    },
  },
  // React (JSX/TSX)
  {
    files: ["**/*.{jsx,tsx}"],
    plugins: { react: pluginReact },
    ...pluginReact.configs.flat.recommended,
  },
];