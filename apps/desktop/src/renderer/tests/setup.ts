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
    deck: {
      encode: async () => Promise.resolve(''),
      decode: async () => Promise.reject(new Error('not stubbed')),
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
      getArenaDeck: async () => Promise.resolve(null),
      getBattlegroundRatingInfo: async () => Promise.resolve(null),
      getServerInfo: async () => Promise.resolve(null),
    },
  },
  writable: true,
});
