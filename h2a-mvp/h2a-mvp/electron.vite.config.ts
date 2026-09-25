import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';

const root = __dirname;

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(root, 'apps/desktop/main/index.ts'),
          phase27ContextAgent: resolve(root, 'packages/sdk-typescript/src/phase27ContextAgent.ts')
        }
      }
    },
    resolve: {
      alias: {
        '@h2a/contracts': resolve(root, 'packages/contracts/src/index.ts'),
        '@h2a/provider-catalogue': resolve(root, 'packages/agents/src/providerRegistry.ts'),
        '@h2a/storage': resolve(root, 'packages/storage/src/index.ts'),
        '@h2a/evidence': resolve(root, 'packages/evidence/src/index.ts'),
        '@h2a/federation': resolve(root, 'packages/federation/src/index.ts'),
        '@h2a/ceremony': resolve(root, 'packages/ceremony/src/index.ts'),
        '@h2a/bootstrap': resolve(root, 'packages/bootstrap/src/index.ts'),
        '@h2a/control-plane': resolve(root, 'packages/control-plane/src/index.ts'),
        '@h2a/office': resolve(root, 'packages/office/src/index.ts'),
        '@h2a/operator-experience': resolve(root, 'packages/operator-experience/src/index.ts'),
        '@h2a/projects': resolve(root, 'packages/projects/src/index.ts'),
        '@h2a/agents': resolve(root, 'packages/agents/src/index.ts'),
        '@h2a/biometrics': resolve(root, 'packages/biometrics/src/index.ts'),
        '@h2a/identity': resolve(root, 'packages/identity/src/index.ts'),
        '@h2a/organization': resolve(root, 'packages/organization/src/index.ts'),
        '@h2a/mandates': resolve(root, 'packages/mandates/src/index.ts'),
        '@h2a/resources': resolve(root, 'packages/resources/src/index.ts'),
        '@h2a/connectors': resolve(root, 'packages/connectors/src/index.ts'),
        '@h2a/messaging': resolve(root, 'packages/messaging/src/index.ts')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(root, 'apps/desktop/preload/index.ts') },
        output: {
          format: 'cjs',
          entryFileNames: '[name].cjs'
        }
      }
    },
    resolve: {
      alias: {
        '@h2a/contracts': resolve(root, 'packages/contracts/src/index.ts')
      }
    }
  },
  renderer: {
    root: resolve(root, 'apps/desktop/renderer'),
    publicDir: resolve(root, 'public'),
    plugins: [react()],
    resolve: {
      alias: {
        '@': resolve(root, 'apps/desktop/renderer/src'),
        '@h2a/contracts': resolve(root, 'packages/contracts/src/index.ts'),
        '@h2a/operator-experience': resolve(root, 'packages/operator-experience/src/index.ts'),
        '@h2a/provider-catalogue': resolve(root, 'packages/agents/src/providerRegistry.ts'),
        '@h2a/ui': resolve(root, 'packages/ui/src/index.ts')
      }
    },
    build: {
      rollupOptions: {
        input: { index: resolve(root, 'apps/desktop/renderer/index.html') }
      }
    }
  }
});
