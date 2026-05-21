import { app, BrowserWindow, ipcMain, protocol } from 'electron';
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
  ensureCardImagesCachedBatch,
  ensureCardTileCached,
  ensureCardTilesCachedBatch,
  guessContentType,
} from './card-image-cache';
import { ensureSetLogoCached } from './set-logo-cache';
import { registerAboutIpc } from './about';
import { capPoolCardIds, sanitizeSearchFilter } from './ipc-sanitizers';
import { getHearthMirror } from './hearthmirror';
import {
  getLatestDeckTrackerSnapshot,
  onDeckTrackerPhase,
  onDeckTrackerSnapshotChange,
  registerDeckTrackerIpc,
  setCardDbForDeckTracker,
} from './deck-tracker';
import { createMatchStartSyncTrigger } from './match-start-sync-trigger';
import { registerOpponentDeckPredictionIpc } from './opponent-deck-prediction-ipc';
import { getPopularDecksList } from './popular-decks-ipc';
import type { PopularDeckEnriched } from '@hdt/core';
import { registerHearthWatcherIpc } from './hearthwatcher-host';
import { registerGameProgressNarrationIpc } from './game-progress-narration-host';
import { registerMatchRecordingsIpc } from './match-recordings-ipc';
import { closeStatsHost, registerStatsIpc } from './stats-host';
import {
  closePlayerProfileStore,
  refreshPlayerProfileFromLive,
  registerPlayerProfileIpc,
} from './player-profile-ipc';
import { join } from 'node:path';
import { createDeckStore } from './deck-store';
import { registerDeckIpc } from './deck-ipc';
import { makeCollectibleLookup, makeDeckCodecLookup, makeHeroClassLookup } from './deck-card-lookup';
import { registerCollectionProgressIpc } from './collection-progress';
import { createCollectionSnapshotStore } from './collection-snapshot-store';
import { createDeckSyncService } from './deck-sync-service';
import { createDeckSyncHost } from './deck-sync-host';
import { registerPopularDecksIpc } from './popular-decks-ipc';
import {
  PopularDeckSyncOrchestrator,
  type SyncedSnapshot,
} from './popular-decks-sync';
import { registerPopularDecksSyncIpc } from './popular-decks-sync/ipc';
import { net } from 'electron';
import type { CardPreviewWindow, ExtraPreviewPayload, PreviewAnchor } from './card-preview-window';

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
  ipcMain.handle('appearance:broadcast', (event, payload: unknown) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (win.isDestroyed() || win.webContents.id === event.sender.id) continue;
      win.webContents.send('appearance:changed', payload);
    }
  });

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
        const capped = capPoolCardIds(cardIds);
        void Promise.all(
          capped.map((cardId) =>
            ensureCardImageCached(cardId, {
              root: cardImageRoot,
              primaryLocale: CARD_IMAGE_PRIMARY_LOCALE,
            }).catch(() => undefined),
          ),
        );
        cp.showPool(capped, anchor);
      });
      ipcMain.handle('card-preview:show-enhanced-pool', (_, sourceCardId: string, cardIds: string[], anchor: PreviewAnchor) => {
        const capped = capPoolCardIds(cardIds);
        void Promise.all(
          [sourceCardId, ...capped].map((cardId) =>
            ensureCardImageCached(cardId, {
              root: cardImageRoot,
              primaryLocale: CARD_IMAGE_PRIMARY_LOCALE,
            }).catch(() => undefined),
          ),
        );
        cp.showEnhancedPool(sourceCardId, capped, anchor);
      });
      ipcMain.handle('card-preview:show-extra', (_, payload: ExtraPreviewPayload, anchor: PreviewAnchor) => {
        cp.showExtra(payload, anchor);
      });
      ipcMain.handle('card-preview:show-enhanced-extra', (_, sourceCardId: string, payload: ExtraPreviewPayload, anchor: PreviewAnchor) => {
        void ensureCardImageCached(sourceCardId, {
          root: cardImageRoot,
          primaryLocale: CARD_IMAGE_PRIMARY_LOCALE,
        }).catch(() => undefined);
        cp.showEnhancedExtra(sourceCardId, payload, anchor);
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
      for (const win of BrowserWindow.getAllWindows()) {
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
      const safe = sanitizeSearchFilter(filter);
      if (safe === null) return [];
      const db = await ensureCardDb(toHearthstoneLocale(appLocale));
      return db.search(safe);
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

  ipcMain.handle('card-images:get-batch', async (_, cardIds: string[], appLocale?: string) => {
    try {
      const results = await ensureCardImagesCachedBatch(cardIds, {
        root: cardImageRoot,
        primaryLocale: toHearthstoneLocale(appLocale),
      });
      return results.map((r) =>
        r
          ? {
              url: r.url,
              locale: r.locale,
              size: r.size,
            }
          : null,
      );
    } catch (e) {
      console.error('[ipc card-images:get-batch]', (e as Error).message);
      return cardIds.map(() => null);
    }
  });

  ipcMain.handle('card-images:get-tile-batch', async (_, cardIds: string[]) => {
    try {
      const results = await ensureCardTilesCachedBatch(cardIds, {
        root: cardImageRoot,
      });
      return results.map((r) => (r ? { url: r.url } : null));
    } catch (e) {
      console.error('[ipc card-images:get-tile-batch]', (e as Error).message);
      return cardIds.map(() => null);
    }
  });

  ipcMain.handle('set-logos:get', async (_, setCode: string) => {
    try {
      const cached = await ensureSetLogoCached(setCode, { root: cardImageRoot });
      return cached === null ? null : { url: cached.url };
    } catch (e) {
      console.error('[ipc set-logos:get]', (e as Error).message);
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
  ipcMain.handle('hearthmirror:getBattleTag', async () => {
    const tag = await swallow('getBattleTag', () => hm().getBattleTag(), null);
    if (tag !== null) {
      const accountId = await swallow('getAccountId', () => hm().getAccountId(), null);
      try {
        refreshPlayerProfileFromLive(tag, accountId);
      } catch (err) {
        console.error('[player-profile] refresh failed', err);
      }
    }
    return tag;
  });
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
  ipcMain.handle(
    'hearthmirror:get-collection-diagnostic',
    () => swallow('getCollectionDiagnostic', () => hm().getCollectionDiagnostic(), null),
  );
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
  registerGameProgressNarrationIpc();
  registerMatchRecordingsIpc();
  registerStatsIpc();
  registerPlayerProfileIpc();
  registerAboutIpc();

  // Popular decks (Deck Finder data source). The handler reads from a
  // module-level lazy reference to the active CardDb so it can serve
  // requests both before and after the CardDb finishes loading. The
  // synced snapshot lives in `<userData>/popular-decks/synced.json`
  // and is loaded lazily on boot; if absent or invalid the handler
  // falls back to the bundled `POPULAR_DECKS_SEED`.
  let popularDecksCardDb: import('@hdt/hearthdb').CardDb | null = null;
  let popularDecksSnapshot: SyncedSnapshot | null = null;
  const popularDecksCacheDir = join(app.getPath('userData'), 'popular-decks');
  const popularDecksSync = new PopularDeckSyncOrchestrator({
    fetchImpl: (url, init) => net.fetch(url, init as Parameters<typeof net.fetch>[1]),
    getCardLookup: () =>
      popularDecksCardDb
        ? (dbfId: number) => popularDecksCardDb!.findByDbfId(dbfId) ?? null
        : null,
    cacheDir: popularDecksCacheDir,
  });
  popularDecksSync.onSnapshotChange((snapshot) => {
    popularDecksSnapshot = snapshot;
  });
  void popularDecksSync.loadCacheOnce().then((snapshot) => {
    popularDecksSnapshot = snapshot;
  });
  const popularDecksDataSource = {
    getSyncedDecks: () =>
      popularDecksSnapshot
        ? { decks: popularDecksSnapshot.decks, fetchedAt: popularDecksSnapshot.fetchedAt }
        : null,
    getCardDb: () => popularDecksCardDb,
  };
  registerPopularDecksIpc(popularDecksDataSource);
  const disposePopularDecksSyncIpc = registerPopularDecksSyncIpc(popularDecksSync);

  // Opponent deck prediction: matches each deck-tracker snapshot against
  // the synced popular decks list, broadcasts a top-N ranking. The same
  // data sources as popular-decks:list are reused so a sync immediately
  // refreshes predictions without invalidating any independent cache.
  const disposeOpponentDeckPredictionIpc = registerOpponentDeckPredictionIpc({
    getSnapshot: getLatestDeckTrackerSnapshot,
    getPopularDecks: (): readonly PopularDeckEnriched[] =>
      getPopularDecksList(popularDecksDataSource).decks,
    getCardDb: () => popularDecksCardDb,
    onSnapshotChange: onDeckTrackerSnapshotChange,
  });

  // SQLite store handles closed in the unified `before-quit` disposer
  // below. Tracked here so the `.then` callback that creates the
  // collection cache can register it. Initialized to null and never
  // re-set after construction — `before-quit` reads whatever is set.
  let collectionSnapshotStoreRef: ReturnType<typeof createCollectionSnapshotStore> | null = null;

  // Saved deck management (deck CRUD + deckstring import/export).
  const deckStore = createDeckStore(join(app.getPath('userData'), 'decks.db'));
  // Sync host exists before CardDb is ready so the renderer can call
  // `decks.syncFromLive()` and receive a structured `not-ready` status
  // instead of a thrown error. The real service is installed below once
  // `ensureCardDb()` resolves.
  const deckSyncHost = createDeckSyncHost();
  registerDeckIpc({
    store: deckStore,
    codecLookup: () => {
      throw new Error('codecLookup: card database not yet ready');
    },
    collectibleLookup: () => {
      throw new Error('collectibleLookup: card database not yet ready');
    },
    syncFromLive: () => deckSyncHost.syncFromLive(),
  });
  // Replace lazy lookups once the default-locale CardDb finishes loading.
  void ensureCardDb().then((db) => {
    registerDeckIpc({
      store: deckStore,
      codecLookup: () => makeDeckCodecLookup(db),
      collectibleLookup: () => makeCollectibleLookup(db),
      syncFromLive: () => deckSyncHost.syncFromLive(),
    });
    let collectionSnapshotStore: ReturnType<typeof createCollectionSnapshotStore> | undefined;
    try {
      collectionSnapshotStore = createCollectionSnapshotStore(
        join(app.getPath('userData'), 'collection-snapshot.sqlite'),
      );
      collectionSnapshotStoreRef = collectionSnapshotStore;
    } catch (err) {
      console.error('[collection-progress] cache disabled', err);
    }
    registerCollectionProgressIpc({
      cardDb: db,
      getCollection: () => hm().getCollection(),
      ...(collectionSnapshotStore !== undefined ? { snapshotStore: collectionSnapshotStore } : {}),
    });
    popularDecksCardDb = db;
    setCardDbForDeckTracker(db);
    const heroClassLookup = makeHeroClassLookup(db);

    const deckSync = createDeckSyncService({
      store: deckStore,
      getLiveDecks: () => hm().getDecks(),
      resolveHeroClass: heroClassLookup,
      resolveCardClass: heroClassLookup,
      collectibleLookup: makeCollectibleLookup(db),
    });
    deckSyncHost.setService(deckSync);

    // Sync live decks the moment the player enters a matchmaking queue
    // so deck attribution is fresh even when the user launched straight
    // into a quick-match without visiting My Decks / DeckSelectDialog.
    createMatchStartSyncTrigger({
      onPhase: onDeckTrackerPhase,
      syncFromLive: () => deckSyncHost.syncFromLive(),
      now: Date.now,
    });

    // Best-effort startup sync. Failures must not block IPC registration
    // or renderer startup — the host already swallows errors into a
    // structured result.
    void deckSyncHost.syncFromLive().catch((err) => {
      console.warn('[deck-sync] initial sync failed', err);
    });
  });

  // Close every SQLite store on quit. On normal close the OS would
  // eventually flush WAL frames, but force-quit / task-manager kill
  // paths can leave the latest tiny transactions (e.g. a just-recorded
  // match) stranded in `-wal` until the next launch. Explicit close
  // calls `PRAGMA wal_checkpoint(TRUNCATE)` via better-sqlite3 and
  // releases the lock, so subsequent recovery is unnecessary.
  app.on('before-quit', () => {
    try { deckStore.close(); } catch (err) { console.error('[shutdown] deckStore.close failed', err); }
    try { collectionSnapshotStoreRef?.close(); } catch (err) { console.error('[shutdown] collectionSnapshotStore.close failed', err); }
    try { closeStatsHost(); } catch (err) { console.error('[shutdown] closeStatsHost failed', err); }
    try { closePlayerProfileStore(); } catch (err) { console.error('[shutdown] closePlayerProfileStore failed', err); }
  });
}

const inMemoryImageCache = new InMemoryImageCache({
  maxEntries: 200,
  maxBytes: 32 * 1024 * 1024,
});

function imageResponse(buffer: Buffer, contentType: string): Response {
  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}

function registerCardImageProtocol(root: string): void {
  if (cardImageProtocolRegistered) return;
  cardImageProtocolRegistered = true;

  protocol.handle(CARD_IMAGE_PROTOCOL, async (request) => {
    try {
      const imagePath = cardImageCachePathFromUrl(request.url, root);

      const memHit = inMemoryImageCache.get(request.url);
      if (memHit !== undefined) {
        return imageResponse(memHit.buffer, memHit.contentType);
      }

      const buffer = await readFile(imagePath);
      const contentType = guessContentType(imagePath);
      inMemoryImageCache.set(request.url, { buffer, contentType });
      return imageResponse(buffer, contentType);
    } catch (e) {
      console.error('[protocol card-image]', (e as Error).message);
      return new Response('Not found', { status: 404 });
    }
  });
}
