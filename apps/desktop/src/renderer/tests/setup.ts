import '@testing-library/jest-dom/vitest';

Object.defineProperty(window, 'hdt', {
  value: {
    app: {
      getVersion: async () => Promise.resolve('0.1.0'),
    },
  },
  writable: true,
});
