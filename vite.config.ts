import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import pkg from './package.json' with { type: 'json' };

// GitHub Pages serves the app from /<repo>/; CI sets VITE_BASE (GDD 3.1, 19).
const base = process.env.VITE_BASE || '/';

export default defineConfig({
  base,
  plugins: [react()],
  // The game version shown in settings and stamped on recorded runs (GDD 15, 17).
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  test: {
    include: ['src/tests/**/*.test.ts'],
    environment: 'node',
  },
});
