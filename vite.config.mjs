import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite builds only the renderer (React) part of the app.
// The Electron main/preload processes are plain CommonJS and are NOT bundled by Vite.
export default defineConfig({
  plugins: [react()],
  // Use relative base so the built index.html works when loaded from file:// in the packaged app.
  base: './',
  root: '.',
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    // Never auto-open a browser: the dev UI is meant to run INSIDE the Electron
    // window (which provides window.api via preload), not in Edge/Chrome.
    open: false,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
