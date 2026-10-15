import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('.', import.meta.url));
export default defineConfig({
  root,
  envDir: fileURLToPath(new URL('./.no-env', import.meta.url)),
  envPrefix: [],
  esbuild: { jsx: 'automatic' },
  build: { outDir: 'dist', emptyOutDir: true, sourcemap: false },
  server: { host: '127.0.0.1', allowedHosts: ['localhost', '127.0.0.1'], fs: { strict: true, allow: [root, fileURLToPath(new URL('../node_modules', import.meta.url))] } }
});
