/**
 * IPC channel names shared between the main process and the preload bridge.
 *
 * IMPORTANT: this module is bundled into the *sandboxed* preload script
 * (`sandbox: true`, see src/main/window.ts). A sandboxed preload may only
 * require a tiny Electron whitelist — any Node builtin (fs/path/…) that
 * leaks into the preload bundle makes the whole script throw before
 * `contextBridge.exposeInMainWorld('hdt', …)` runs, leaving
 * `window.hdt` undefined in every window. This module must therefore stay
 * completely dependency-free: plain string constants only, no imports.
 */

export const ADVISOR_STATE_CHANNEL = 'advisor:state';
export const ADVISOR_ASK_CHANNEL = 'advisor:ask';
export const ADVISOR_ASK_CHUNK_CHANNEL = 'advisor:ask:chunk';
export const ADVISOR_CONFIG_GET_CHANNEL = 'advisor:config:get';
export const ADVISOR_CONFIG_SET_CHANNEL = 'advisor:config:set';
export const ADVISOR_API_KEY_SET_CHANNEL = 'advisor:api-key:set';

export const CARD_IMAGE_BULK_DOWNLOAD_START_CHANNEL = 'card-image-bulk-download:start';
export const CARD_IMAGE_BULK_DOWNLOAD_PAUSE_CHANNEL = 'card-image-bulk-download:pause';
export const CARD_IMAGE_BULK_DOWNLOAD_RESUME_CHANNEL = 'card-image-bulk-download:resume';
export const CARD_IMAGE_BULK_DOWNLOAD_ABORT_CHANNEL = 'card-image-bulk-download:abort';
export const CARD_IMAGE_BULK_DOWNLOAD_STATUS_CHANNEL = 'card-image-bulk-download:status';
export const CARD_IMAGE_BULK_DOWNLOAD_PROGRESS_CHANNEL = 'card-image-bulk-download:progress';
