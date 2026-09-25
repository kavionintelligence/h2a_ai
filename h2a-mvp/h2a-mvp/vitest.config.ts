import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@h2a/contracts': resolve(__dirname, 'packages/contracts/src/index.ts'),
      '@h2a/storage': resolve(__dirname, 'packages/storage/src/index.ts'),
      '@h2a/evidence': resolve(__dirname, 'packages/evidence/src/index.ts'),
      '@h2a/federation': resolve(__dirname, 'packages/federation/src/index.ts'),
      '@h2a/ceremony': resolve(__dirname, 'packages/ceremony/src/index.ts'),
      '@h2a/bootstrap': resolve(__dirname, 'packages/bootstrap/src/index.ts'),
      '@h2a/biometrics': resolve(__dirname, 'packages/biometrics/src/index.ts'),
      '@h2a/identity': resolve(__dirname, 'packages/identity/src/index.ts'),
      '@h2a/organization': resolve(__dirname, 'packages/organization/src/index.ts'),
      '@h2a/mandates': resolve(__dirname, 'packages/mandates/src/index.ts'),
      '@h2a/agents': resolve(__dirname, 'packages/agents/src/index.ts'),
      '@h2a/resources': resolve(__dirname, 'packages/resources/src/index.ts'),
      '@h2a/connectors': resolve(__dirname, 'packages/connectors/src/index.ts'),
      '@h2a/messaging': resolve(__dirname, 'packages/messaging/src/index.ts'),
      '@h2a/sdk-typescript': resolve(__dirname, 'packages/sdk-typescript/src/index.ts'),
      '@h2a/control-plane': resolve(__dirname, 'packages/control-plane/src/index.ts'),
      '@h2a/office': resolve(__dirname, 'packages/office/src/index.ts'),
      '@h2a/operator-experience': resolve(__dirname, 'packages/operator-experience/src/index.ts'),
      '@h2a/projects': resolve(__dirname, 'packages/projects/src/index.ts'),
      '@h2a/ui': resolve(__dirname, 'packages/ui/src/index.ts')
    }
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 15_000
  }
});
