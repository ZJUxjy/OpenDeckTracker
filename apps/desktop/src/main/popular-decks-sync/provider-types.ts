import type { PopularDeck } from '@hdt/core';
import type { FetchImpl } from './fetcher';
import type { TransformContext } from './transformer';

export type PopularDeckSourceId = 'hsguru' | 'hsreplay' | 'lushi';

export type PopularDeckSourceStatus = 'ok' | 'failed' | 'unsupported' | 'disabled';

export type SyncPhase = 'meta' | 'variants' | 'transform' | 'persist';

export interface SyncProgress {
  phase: SyncPhase;
  completed: number;
  total: number;
  currentLabel?: string;
}

export type ProgressCallback = (progress: SyncProgress) => void;

export interface PopularDeckSourceSnapshot {
  id: PopularDeckSourceId;
  label: string;
  enabled: boolean;
  status: PopularDeckSourceStatus;
  reason?: string;
  fetchedAt?: string;
  deckCount?: number;
  error?: string;
}

export type PopularDeckProviderStatus =
  | { status: 'supported' }
  | { status: 'unsupported'; reason: string };

export interface PopularDeckProviderContext {
  fetchImpl: FetchImpl;
  delay: (ms: number) => Promise<void>;
  findByDbfId: TransformContext['findByDbfId'];
  fetchedAt: string;
  archetypeLimit: number;
  variantLimit: number;
  progressCb: ProgressCallback;
  signal: AbortSignal;
}

export interface PopularDeckProviderResult {
  decks: PopularDeck[];
  source: PopularDeckSourceSnapshot;
}

export interface PopularDeckProvider {
  id: PopularDeckSourceId;
  label: string;
  defaultEnabled: boolean;
  getStatus(): PopularDeckProviderStatus;
  sync(context: PopularDeckProviderContext): Promise<PopularDeckProviderResult>;
}

export class PopularDeckProviderError extends Error {
  readonly code: string;
  readonly reason?: string;

  constructor(code: string, message: string, reason?: string) {
    super(message);
    this.name = 'PopularDeckProviderError';
    this.code = code;
    if (reason !== undefined) {
      this.reason = reason;
    }
  }
}
