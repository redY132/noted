import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  build: { target: 'es2022', outDir: '../../output/editor-comparison-build', emptyOutDir: true },
  server: { host: '127.0.0.1', port: 1421, strictPort: true },
  preview: { host: '127.0.0.1', port: 1421, strictPort: true },
});
