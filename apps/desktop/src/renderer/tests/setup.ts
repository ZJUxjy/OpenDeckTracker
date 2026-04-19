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
  },
  writable: true,
});
