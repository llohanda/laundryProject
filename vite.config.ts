import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// GitHub Pages serves the app from /<repo>/; CI sets VITE_BASE (GDD 3.1, 19).
const base = process.env.VITE_BASE || '/';

export default defineConfig({
  base,
  plugins: [react()],
  test: {
    include: ['src/tests/**/*.test.ts'],
    environment: 'node',
  },
});
