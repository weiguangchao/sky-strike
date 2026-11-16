import { defineConfig } from 'vite';
import { rm } from 'node:fs/promises';

export default defineConfig({
  root: 'game',
  plugins: [{ name: 'package-2d-assets', apply: 'build', closeBundle: () => rm(new URL('./dist/assets/models/', import.meta.url), { recursive: true, force: true }) }],
  server: { host: '0.0.0.0', port: 5173, strictPort: true },
  preview: { host: '0.0.0.0', port: 5173, strictPort: true },
  build: { outDir: '../dist', emptyOutDir: true, target: 'es2022' },
});
