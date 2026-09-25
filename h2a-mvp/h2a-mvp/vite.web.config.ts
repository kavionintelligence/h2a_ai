import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  root: resolve(__dirname, 'apps/web'),
  publicDir: resolve(__dirname, 'public'),
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'apps/web/src'),
      '@h2a/contracts': resolve(__dirname, 'packages/contracts/src/index.ts'),
      '@h2a/provider-catalogue': resolve(__dirname, 'packages/agents/src/providerRegistry.ts'),
      '@h2a/ui': resolve(__dirname, 'packages/ui/src/index.ts')
    }
  },
  server: {
    host: '127.0.0.1',
    port: 4173
  },
  preview: {
    host: '127.0.0.1',
    port: 4173
  }
});
