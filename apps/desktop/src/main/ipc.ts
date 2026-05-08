import { app, ipcMain, protocol } from 'electron';
import { readFile } from 'node:fs/promises';
import {
  encodeDeck,
  decodeDeck,
  type DeckBlueprint,
  type SearchFilter,
} from '@hdt/hearthdb';
import { ensureCardDb } from './cards';
import {
  CARD_IMAGE_PRIMARY_LOCALE,
  CARD_IMAGE_PROTOCOL,
  DEFAULT_CARD_IMAGE_CACHE_CAP_BYTES,
  InMemoryImageCache,
  cardImageCachePathFromUrl,
  cleanLegacyTileCacheDirs,
  defaultCardImageCacheRoot,
  enforceCardImageCacheCap,
  ensureCardImageCached,
  ensureCardTileCached,
  guessContentType,
} from './card-image-cache';
import { registerAboutIpc } from './about';
import { getHearthMirror } from './hearthmirror';
import { registerDeckTrackerIpc } from './deck-tracker';
import { registerHearthWatcherIpc } from './hearthwatcher-host';
import { registerMatchRecordingsIpc } from './match-recordings-ipc';
import { registerStatsIpc } from './stats-host';
import { join } from 'node:path';
import { createDeckStore } from './deck-store';
import { registerDeckIpc } from './deck-ipc';
import { makeCollectibleLookup, makeDeckCodecLookup } from './deck-card-lookup';
import { registerCollectionProgressIpc } from './collection-progress';
import { registerPopularDecksIpc } from './popular-decks-ipc';
import type { CardPreviewWindow, PreviewAnchor } from './card-preview-window';

export interface OverlayControllers {
  enablePlayerOverlay: () => void;
  disablePlayerOverlay: () => void;
  enableOpponentOverlay: () => void;
  disableOpponentOverlay: () => void;
  cardPreview?: CardPreviewWindow;
}

let cardImageProtocolRegistered = false;

function toHearthstoneLocale(appLocale?: string): 'enUS' | 'zhCN' {
  return appLocale === 'zh-CN' ? 'zhCN' : 'enUS';
}

export function registerIpc(overlay?: OverlayControllers): void {
  ipcMain.handle('app:getVersion', () => app.getVersion());

  if (overlay) {
    ipcMain.handle('overlay:set-enabled', (_, enabled: boolean) => {
      if (enabled) overlay.enablePlayerOverlay();
      else overlay.disablePlayerOverlay();
    });
    ipcMain.handle('overlay:set-enabled-opponent', (_, enabled: boolean) => {
      if (enabled) overlay.enableOpponentOverlay();
      else overlay.disableOpponentOverlay();
    });
    if (overlay.cardPreview) {
      const cp = overlay.cardPreview;
      ipcMain.handle('card-preview:show', (_, cardId: string, anchor: PreviewAnchor) => {
        // Fire-and-forget render preload: the popup will need the full
        // 256x image shortly; starting the download now eliminates the
        // blank flash when the window actually opens.
        void ensureCardImageCached(cardId, {
          root: cardImageRoot,
          primaryLocale: CARD_IMAGE_PRIMARY_LOCALE,
        }).catch(() => undefined);
        cp.show(cardId, anchor);
      });
      ipcMain.handle('card-preview:show-pool', (_, cardIds: string[], anchor: PreviewAnchor) => {
        for (const cardId of cardIds) {
          void ensureCardImageCached(cardId, {
            root: cardImageRoot,
            primaryLocale: CARD_IMAGE_PRIMARY_LOCALE,
          }).catch(() => undefined);
        }
        cp.showPool(cardIds, anchor);
      });
      ipcMain.handle('card-preview:hide', () => {
        cp.hide();
      });
    }
    // Close-from-window: the overlay route's close button calls this.
    // We disable the overlay via the same path the Settings toggle uses,
    // then broadcast `overlay:disabled-by-window` so every renderer
    // (including the main window's Settings page) can update its
    // appearance store without firing a redundant IPC back.
    ipcMain.handle('overlay:close-from-window', (_, which: 'player' | 'opponent') => {
      if (which === 'player') overlay.disablePlayerOverlay();
      else if (which === 'opponent') overlay.disableOpponentOverlay();
      const { BrowserWindow: BW } = require('electron') as typeof import('electron');
      for (const win of BW.getAllWindows()) {
        if (!win.isDestroyed()) {
          win.webContents.send('overlay:disabled-by-window', which);
        }
      }
    });
  }
  const cardImageRoot = defaultCardImageCacheRoot(app.getPath('userData'));
  registerCardImageProtocol(cardImageRoot);

  // One-shot cleanup of older tile-cache directory versions (pre-trim
  // baseline + any past versioned dirs). Fire-and-forget: cache reads
  // don't depend on completion, and failures just leave orphaned dirs.
  void cleanLegacyTileCacheDirs(cardImageRoot)
    .then((removed) => {
      if (removed.length > 0) {
        console.log(`[card-image-cache] cleaned legacy tile dirs: ${removed.join(', ')}`);
      }
    })
    .catch((e) => {
      console.error('[card-image-cache] failed to clean legacy tile dirs', e);
    });

  // LRU sweep against the disk-cache cap. Runs once at startup, then
  // every 30 minutes so long-running sessions don't drift past the cap.
  function runDiskCacheSweep(): void {
    void enforceCardImageCacheCap(cardImageRoot, DEFAULT_CARD_IMAGE_CACHE_CAP_BYTES)
      .then(({ freedBytes, removedCount }) => {
        if (removedCount > 0) {
          const mb = (freedBytes / (1024 * 1024)).toFixed(1);
          console.log(
            `[card-image-cache] LRU sweep removed ${removedCount} files, freed ${mb} MB`,
          );
        }
      })
      .catch((e) => {
        console.error('[card-image-cache] LRU sweep failed', e);
      });
  }
  runDiskCacheSweep();
  const sweepInterval = setInterval(runDiskCacheSweep, 30 * 60 * 1000);
  app.on('before-quit', () => clearInterval(sweepInterval));

  ipcMain.handle('cards:findByDbfId', async (_, dbfId: number, appLocale?: string) => {
    try {
      const db = await ensureCardDb(toHearthstoneLocale(appLocale));
      return db.findByDbfId(dbfId) ?? null;
    } catch (e) {
      console.error('[ipc cards:findByDbfId]', (e as Error).message);
      return null;
    }
  });

  ipcMain.handle('cards:findById', async (_, id: string, appLocale?: string) => {
    try {
      const db = await ensureCardDb(toHearthstoneLocale(appLocale));
      return db.findById(id) ?? null;
    } catch (e) {
      console.error('[ipc cards:findById]', (e as Error).message);
      return null;
    }
  });

  ipcMain.handle('cards:search', async (_, filter: SearchFilter, appLocale?: string) => {
    try {
      const db = await ensureCardDb(toHearthstoneLocale(appLocale));
      return db.search(filter);
    } catch (e) {
      console.error('[ipc cards:search]', (e as Error).message);
      return [];
    }
  });

  ipcMain.handle('card-images:get', async (_, cardId: string, appLocale?: string) => {
    try {
      const cached = await ensureCardImageCached(cardId, {
        root: cardImageRoot,
        primaryLocale: toHearthstoneLocale(appLocale),
      });
      return {
        url: cached.url,
        locale: cached.locale,
        size: cached.size,
      };
    } catch (e) {
      console.error('[ipc card-images:get]', (e as Error).message);
      return null;
    }
  });

  ipcMain.handle('card-images:getTile', async (_, cardId: string) => {
    try {
      const cached = await ensureCardTileCached(cardId, {
        root: cardImageRoot,
      });
      return { url: cached.url };
    } catch (e) {
      console.error('[ipc card-images:getTile]', (e as Error).message);
      return null;
    }
  });

  ipcMain.handle('deck:encode', (_, blueprint: DeckBlueprint) => encodeDeck(blueprint));
  ipcMain.handle('deck:decode', (_, deckstring: string) => decodeDeck(deckstring));

  const hm = () => getHearthMirror();
  const swallow = async <T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> => {
    try { return await fn(); }
    catch (e) { console.error(`[hearthmirror:${label}]`, e); return fallback; }
  };

  ipcMain.handle('hearthmirror:isAlive', () => swallow('isAlive', () => hm().isAlive(), false));
  ipcMain.handle('hearthmirror:get-window', () => swallow('getHearthstoneWindow', () => hm().getHearthstoneWindow(), null));
  ipcMain.handle('hearthmirror:getBattleTag', () => swallow('getBattleTag', () => hm().getBattleTag(), null));
  ipcMain.handle('hearthmirror:getAccountId', () => swallow('getAccountId', () => hm().getAccountId(), null));
  // getGameType now returns a composite { gameType, formatType, missionId } | null
  // (was a single number before R-17). null fallback covers IPC errors / Hearthstone
  // closed.
  ipcMain.handle('hearthmirror:getGameType', () => swallow('getGameType', () => hm().getGameType(), null));
  ipcMain.handle('hearthmirror:isSpectating', () => swallow('isSpectating', () => hm().isSpectating(), false));
  ipcMain.handle('hearthmirror:isGameOver', () => swallow('isGameOver', () => hm().isGameOver(), false));
  ipcMain.handle('hearthmirror:isMulligan',
    () => swallow('isMulligan', () => hm().isMulligan(), { mulligan: null }));
  ipcMain.handle('hearthmirror:getMatchInfo', () => swallow('getMatchInfo', () => hm().getMatchInfo(), null));
  ipcMain.handle('hearthmirror:getMedalInfo', () => swallow('getMedalInfo', () => hm().getMedalInfo(), null));
  ipcMain.handle('hearthmirror:getDecks', () => swallow('getDecks', () => hm().getDecks(), null));
  ipcMain.handle('hearthmirror:getEditedDeck',
    () => swallow('getEditedDeck', () => hm().getEditedDeck(), null));
  ipcMain.handle('hearthmirror:getCollection', () => swallow('getCollection', () => hm().getCollection(), null));
  ipcMain.handle('hearthmirror:getArenaDeck', () => swallow('getArenaDeck', () => hm().getArenaDeck(), null));
  ipcMain.handle('hearthmirror:getBattlegroundRatingInfo',
    () => swallow('getBattlegroundRatingInfo', () => hm().getBattlegroundRatingInfo(), null));
  ipcMain.handle('hearthmirror:getServerInfo', () => swallow('getServerInfo', () => hm().getServerInfo(), null));

  // Phase 7 in-match observability
  ipcMain.handle('hearthmirror:getBoardState',
    () => swallow('getBoardState', () => hm().getBoardState(), null));
  ipcMain.handle('hearthmirror:getHandState',
    () => swallow('getHandState', () => hm().getHandState(), null));
  ipcMain.handle('hearthmirror:getDeckState',
    () => swallow('getDeckState', () => hm().getDeckState(), null));
  ipcMain.handle('hearthmirror:getOpponentSecrets',
    () => swallow('getOpponentSecrets', () => hm().getOpponentSecrets(), null));
  ipcMain.handle('hearthmirror:getChoices',
    () => swallow('getChoices', () => hm().getChoices(), null));
  ipcMain.handle('hearthmirror:getSelectedDeckId',
    () => swallow('getSelectedDeckId', () => hm().getSelectedDeckId(), null));

  // Deck-tracker host (M2)
  registerDeckTrackerIpc();
  registerHearthWatcherIpc();
  registerMatchRecordingsIpc();
  registerStatsIpc();
  registerAboutIpc();

  // Popular decks (Deck Finder data source). The handler reads from a
  // module-level lazy reference to the active CardDb so it can serve
  // requests both before and after the CardDb finishes loading.
  let popularDecksCardDb: import('@hdt/hearthdb').CardDb | null = null;
  registerPopularDecksIpc(() => popularDecksCardDb);

  // Saved deck management (deck CRUD + deckstring import/export).
  const deckStore = createDeckStore(join(app.getPath('userData'), 'decks.db'));
  registerDeckIpc({
    store: deckStore,
    codecLookup: () => {
      throw new Error('codecLookup: card database not yet ready');
    },
    collectibleLookup: () => {
      throw new Error('collectibleLookup: card database not yet ready');
    },
  });
  // Replace lazy lookups once the default-locale CardDb finishes loading.
  void ensureCardDb().then((db) => {
    registerDeckIpc({
      store: deckStore,
      codecLookup: () => makeDeckCodecLookup(db),
      collectibleLookup: () => makeCollectibleLookup(db),
    });
    registerCollectionProgressIpc({
      cardDb: db,
      getCollection: () => hm().getCollection(),
    });
    popularDecksCardDb = db;
  });
}

const inMemoryImageCache = new InMemoryImageCache({
  maxEntries: 200,
  maxBytes: 32 * 1024 * 1024,
});

function registerCardImageProtocol(root: string): void {
  if (cardImageProtocolRegistered) return;
  cardImageProtocolRegistered = true;

  protocol.handle(CARD_IMAGE_PROTOCOL, async (request) => {
    try {
      const imagePath = cardImageCachePathFromUrl(request.url, root);

      // 1. In-memory cache hit — fastest path, avoids every disk read
      // for cards that are already hot (same card in multiple panels or
      // re-rendered on snapshot updates).
      const memHit = inMemoryImageCache.get(request.url);
      if (memHit !== undefined) {
        return new Response(new Uint8Array(memHit.buffer), {
          headers: {
            'Content-Type': memHit.contentType,
            'Cache-Control': 'public, max-age=31536000, immutable',
          },
        });
      }

      // 2. Disk read → populate memory cache → return
      const buffer = await readFile(imagePath);
      const contentType = guessContentType(imagePath);
      inMemoryImageCache.set(request.url, { buffer, contentType });
      return new Response(new Uint8Array(buffer), {
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      });
    } catch (e) {
      console.error('[protocol card-image]', (e as Error).message);
      return new Response('Not found', { status: 404 });
    }
  });
}
