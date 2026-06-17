import { describe, expect, it, vi } from 'vitest';
import { loadMacWindowProvider } from './mac-window';

describe('loadMacWindowProvider', () => {
  it('returns null on non-darwin platforms', () => {
    expect(loadMacWindowProvider('win32', () => ({}))).toBeNull();
  });

  it('returns null on darwin when the addon require throws', () => {
    const req = vi.fn(() => {
      throw new Error('not built');
    });
    expect(loadMacWindowProvider('darwin', req)).toBeNull();
  });

  it('returns the addon as the provider on darwin when require succeeds', () => {
    const addon = { getHearthstoneWindow: () => null };
    expect(loadMacWindowProvider('darwin', () => addon)).toBe(addon);
  });
});
