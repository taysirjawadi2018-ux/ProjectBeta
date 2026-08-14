import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  // Mirrors the "@/*" alias in jsconfig.json. Vitest does not read jsconfig,
  // so without this every test that imports a component fails to resolve.
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
  // An inline (empty) PostCSS config, which stops Vite searching for
  // postcss.config.js. It has to: Vite rejects the plugin NAMES that Next.js
  // requires ("Invalid PostCSS Plugin found at: plugins[0]") and Next rejects
  // the plugin INSTANCES that Vite wants ("Malformed PostCSS Configuration"),
  // so one file cannot satisfy both. These tests are environment: 'node' and
  // compile no stylesheet, so there is nothing for PostCSS to do here anyway —
  // the real pipeline is verified by `npm run build`.
  css: { postcss: {} },
  test: {
    // node, not jsdom: these are BFF tests. What they exercise is the API
    // client, the session handling and the server-rendered output — the same
    // boundary frontend_flask/tests covered, and none of it needs a DOM.
    environment: 'node',
    setupFiles: ['./tests/setup.js'],
    include: ['tests/**/*.test.js'],
  },
});
