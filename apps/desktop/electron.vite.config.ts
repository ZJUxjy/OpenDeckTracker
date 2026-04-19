import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Workspace packages whose TS sources should be inlined into the bundle
// (instead of left as external requires that Node would fail to import).
const WORKSPACE_INLINE = ['@hdt/hearthdb', '@hdt/shared', '@hdt/hearthmirror'];

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: WORKSPACE_INLINE })],
    resolve: {
      alias: {
        '@hdt/shared': resolve(__dirname, '../../packages/shared/src/index.ts'),
        '@hdt/hearthdb': resolve(__dirname, '../../packages/hearthdb/src/index.ts'),
        '@hdt/hearthmirror': resolve(__dirname, '../../packages/hearthmirror/src/index.ts'),
      },
    },
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/main/index.ts') },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: WORKSPACE_INLINE })],
    resolve: {
      alias: {
        '@hdt/shared': resolve(__dirname, '../../packages/shared/src/index.ts'),
        '@hdt/hearthdb': resolve(__dirname, '../../packages/hearthdb/src/index.ts'),
        '@hdt/hearthmirror': resolve(__dirname, '../../packages/hearthmirror/src/index.ts'),
      },
    },
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/preload/index.ts') },
        // Electron sandbox: true requires CommonJS preload. Force .js + cjs.
        output: { format: 'cjs', entryFileNames: '[name].js' },
      },
    },
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src/renderer/src'),
        '@hdt/shared': resolve(__dirname, '../../packages/shared/src/index.ts'),
        '@hdt/hearthdb': resolve(__dirname, '../../packages/hearthdb/src/index.ts'),
      },
    },
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'src/renderer/index.html'),
      },
    },
  },
});
