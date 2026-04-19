/// <reference types="vite/client" />

import type { HdtApi } from '../../preload/index';

declare global {
  interface Window {
    hdt: HdtApi;
  }
}

export {};
