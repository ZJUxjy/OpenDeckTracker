import '@testing-library/jest-dom/vitest';

Object.defineProperty(window, 'hdt', {
  value: {
    app: {
      getVersion: async () => Promise.resolve('0.1.0'),
    },
    cards: {
      findByDbfId: async () => Promise.resolve(null),
      findById: async () => Promise.resolve(null),
      search: async () => Promise.resolve([]),
    },
    cardImages: {
      get: async () => Promise.resolve(null),
    },
    deck: {
      encode: async () => Promise.resolve(''),
      decode: async () => Promise.reject(new Error('not stubbed')),
    },
    recordings: {
      list: async () => Promise.resolve([]),
      get: async () => Promise.resolve(null),
    },
    stats: {
      getSummary: async () => Promise.reject(new Error('stats.getSummary not stubbed')),
      listRecent: async () => Promise.resolve([]),
      getSavedDeckMatchups: async () => Promise.resolve([]),
      getDeckLadderWinrate: async () =>
        Promise.resolve({
          wins: 0,
          losses: 0,
          matchesPlayed: 0,
          winrate: null,
        }),
    },
    gameProgressNarration: {
      getRecent: async () => Promise.resolve([]),
      subscribe: () => () => {},
    },
    decks: {
      list: async () => Promise.resolve([]),
      getById: async () => Promise.resolve(null),
      create: async () => Promise.reject(new Error('decks.create not stubbed')),
      update: async () => Promise.reject(new Error('decks.update not stubbed')),
      duplicate: async () => Promise.reject(new Error('decks.duplicate not stubbed')),
      delete: async () => Promise.resolve(undefined),
      importDeckstring: async () => Promise.reject(new Error('decks.importDeckstring not stubbed')),
      importJson: async () => Promise.reject(new Error('decks.importJson not stubbed')),
      exportDeckstring: async () => Promise.reject(new Error('decks.exportDeckstring not stubbed')),
      exportJson: async () => Promise.reject(new Error('decks.exportJson not stubbed')),
      saveFromLive: async () => Promise.reject(new Error('decks.saveFromLive not stubbed')),
      syncFromLive: async () =>
        Promise.resolve({
          ok: false,
          source: 'not-ready' as const,
          synced: 0,
          skippedNonCollectible: 0,
          skippedUnknownClass: 0,
          startedAt: 0,
          finishedAt: 0,
        }),
      setSortIndex: async () => Promise.resolve(undefined),
      getActive: async () => Promise.resolve(null),
      setActive: async () => Promise.resolve(undefined),
    },
    hearthmirror: {
      isAlive: async () => Promise.resolve(false),
      getBattleTag: async () => Promise.resolve(null),
      getAccountId: async () => Promise.resolve(null),
      getGameType: async () => Promise.resolve(0),
      isSpectating: async () => Promise.resolve(false),
      isGameOver: async () => Promise.resolve(false),
      getMatchInfo: async () => Promise.resolve(null),
      getMedalInfo: async () => Promise.resolve(null),
      getDecks: async () => Promise.resolve(null),
      getCollection: async () => Promise.resolve(null),
      getCollectionDiagnostic: async () => Promise.resolve(null),
      getArenaDeck: async () => Promise.resolve(null),
      getBattlegroundRatingInfo: async () => Promise.resolve(null),
      getServerInfo: async () => Promise.resolve(null),
    },
    playerProfile: {
      get: async () => Promise.resolve(null),
    },
  },
  writable: true,
});
