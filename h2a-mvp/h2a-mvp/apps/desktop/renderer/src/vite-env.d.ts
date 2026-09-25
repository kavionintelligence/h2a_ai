/// <reference types="vite/client" />

import type { H2ADesktopApi } from '@h2a/contracts';

declare global {
  interface Window {
    h2a?: H2ADesktopApi;
  }
}

export {};
