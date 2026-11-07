import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  root: fileURLToPath(new URL('./web/', import.meta.url)),
  base: './',
  plugins: [react()],
  define: { 'import.meta.env.VITE_PUBLIC_DEMO': JSON.stringify('1') },
  build: { outDir: '../docs', emptyOutDir: true, chunkSizeWarningLimit: 2500 },
});
