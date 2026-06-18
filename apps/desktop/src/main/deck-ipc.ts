import { ipcMain } from 'electron';

import {
  type CreateDeckInput,
  type DeckDetail,
  type DeckSummary,
  type UpdateDeckPatch,
} from '@hdt/core';
import {
  type DeckCodecLookup,
  fromDeckstring,
  fromJson,
  toDeckstring,
  toJson,
} from './deck-codec';

import {
  type DeckStore,
  type LiveDeckSnapshotInput,
  type SaveFromLiveCardLookup,
} from './deck-store';
import type { LiveDeckSyncResult } from './deck-sync-host';

export interface DeckIpcOptions {
  store: DeckStore;
  /** Lazy resolver for the codec lookup (card data may load asynchronously after boot). */
  codecLookup: () => DeckCodecLookup;
  /** Lazy resolver for collectibility lookups used by saveFromLive. */
  collectibleLookup: () => SaveFromLiveCardLookup;
  /**
   * Optional live deck sync entry point. When provided, the renderer can
   * call `window.hdt.decks.syncFromLive()`. Omitted in tests that don't
   * exercise sync; the channel is then simply not registered.
   */
  syncFromLive?: () => Promise<LiveDeckSyncResult>;
}

const CHANNELS = {
  list: 'decks:list',
  getById: 'decks:get-by-id',
  create: 'decks:create',
  update: 'decks:update',
  duplicate: 'decks:duplicate',
  delete: 'decks:delete',
  importDeckstring: 'decks:import-deckstring',
  importJson: 'decks:import-json',
  exportDeckstring: 'decks:export-deckstring',
  exportJson: 'decks:export-json',
  saveFromLive: 'decks:save-from-live',
  syncFromLive: 'decks:sync-from-live',
  setSortIndex: 'decks:set-sort-index',
  getActive: 'decks:get-active',
  setActive: 'decks:set-active',
} as const;

/**
 * Wrap a thrown value into an Electron-friendly Error preserving the
 * original `name` and `message` so `error.name`-based discrimination on the
 * renderer side still works.
 */
function preserveError(err: unknown): never {
  if (err instanceof Error) {
    const out = new Error(err.message);
    Object.defineProperty(out, 'name', { value: err.name });
    throw out;
  }
  throw err;
}

export function registerDeckIpc(options: DeckIpcOptions): void {
  const { store, codecLookup, collectibleLookup, syncFromLive } = options;

  // Idempotency: clear any previous handlers so hot-reload in dev doesn't
  // throw "second handler" errors.
  for (const channel of Object.values(CHANNELS)) {
    ipcMain.removeHandler(channel);
  }

  ipcMain.handle(CHANNELS.list, (): DeckSummary[] => store.list());

  ipcMain.handle(CHANNELS.getById, (_e, id: string): DeckDetail | null => store.getById(id));

  ipcMain.handle(CHANNELS.create, (_e, input: CreateDeckInput): DeckDetail => {
    try {
      return store.create(input);
    } catch (err) {
      preserveError(err);
    }
  });

  ipcMain.handle(CHANNELS.update, (_e, id: string, patch: UpdateDeckPatch): DeckDetail => {
    try {
      return store.update(id, patch);
    } catch (err) {
      preserveError(err);
    }
  });

  ipcMain.handle(CHANNELS.duplicate, (_e, id: string): DeckDetail => {
    try {
      return store.duplicate(id);
    } catch (err) {
      preserveError(err);
    }
  });

  ipcMain.handle(CHANNELS.delete, (_e, id: string): void => store.delete(id));

  ipcMain.handle(CHANNELS.importDeckstring, (_e, text: string): DeckDetail => {
    try {
      const decoded = fromDeckstring(text, codecLookup());
      return store.create({
        name: decoded.name || 'Imported Deck',
        class: decoded.class,
        format: decoded.format,
        cards: decoded.cards,
      });
    } catch (err) {
      preserveError(err);
    }
  });

  ipcMain.handle(CHANNELS.importJson, (_e, text: string): DeckDetail => {
    try {
      const deck = fromJson(text);
      return store.create({
        name: deck.name || 'Imported Deck',
        class: deck.class,
        format: deck.format,
        cards: deck.cards,
        notes: deck.notes,
        tags: deck.tags,
        ...(deck.coverCardId !== undefined ? { coverCardId: deck.coverCardId } : {}),
      });
    } catch (err) {
      preserveError(err);
    }
  });

  ipcMain.handle(CHANNELS.exportDeckstring, (_e, id: string): string => {
    try {
      const deck = store.getById(id);
      if (!deck) throw new Error(`exportDeckstring: deck not found: ${id}`);
      return toDeckstring(deck, codecLookup());
    } catch (err) {
      preserveError(err);
    }
  });

  ipcMain.handle(CHANNELS.exportJson, (_e, id: string): string => {
    try {
      const deck = store.getById(id);
      if (!deck) throw new Error(`exportJson: deck not found: ${id}`);
      return toJson(deck);
    } catch (err) {
      preserveError(err);
    }
  });

  ipcMain.handle(CHANNELS.saveFromLive, (_e, input: LiveDeckSnapshotInput): DeckDetail => {
    try {
      return store.saveFromLive(input, collectibleLookup());
    } catch (err) {
      preserveError(err);
    }
  });

  ipcMain.handle(CHANNELS.setSortIndex, (_e, id: string, sortIndex: number): void => {
    store.setSortIndex(id, sortIndex);
  });

  ipcMain.handle(CHANNELS.getActive, (): string | null => store.getActiveDeckId());
  ipcMain.handle(CHANNELS.setActive, (_e, id: string | null): void => store.setActiveDeckId(id));

  if (syncFromLive !== undefined) {
    ipcMain.handle(CHANNELS.syncFromLive, (): Promise<LiveDeckSyncResult> => syncFromLive());
  }
}
