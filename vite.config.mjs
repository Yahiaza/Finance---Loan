import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Electron loads dist/index.html with file:// in the portable build.
  // Relative asset paths are required; absolute /assets paths cause a white window.
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
});
