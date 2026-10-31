import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  envPrefix: ['VITE_', 'TAURI_'],
  build: { target: ['es2022', 'chrome105', 'safari13'] },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
