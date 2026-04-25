import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import {
  useCardImageUrl,
  getCardImageUrl,
  markFallback,
  markSuccess,
} from '../src/hooks/use-card-image-url';

describe('useCardImageUrl', () => {
  beforeEach(() => {
    // Reset module-level cache between tests
    vi.resetModules();
    window.hdt.cardImages.get = vi.fn().mockResolvedValue(null);
  });

  it('returns zhCN primary URL', () => {
    const { result } = renderHook(() => useCardImageUrl('EX1_277'));
    expect(result.current.primary).toContain('/zhCN/');
    expect(result.current.primary).toContain('EX1_277.png');
  });

  it('returns enUS fallback URL', () => {
    const { result } = renderHook(() => useCardImageUrl('EX1_277'));
    expect(result.current.fallback).toContain('/enUS/');
    expect(result.current.fallback).toContain('EX1_277.png');
  });

  it('uses cached fallback after markFallback', () => {
    markFallback('EX1_277');
    const { result } = renderHook(() => useCardImageUrl('EX1_277'));
    // After fallback was marked, primary should also be fallback
    expect(result.current.primary).toContain('/enUS/');
  });

  it('getCardImageUrl returns correct URLs', () => {
    const urls = getCardImageUrl('CS2_029');
    expect(urls.primary).toBe(
      'https://art.hearthstonejson.com/v1/render/latest/zhCN/256x/CS2_029.png',
    );
    expect(urls.fallback).toBe(
      'https://art.hearthstonejson.com/v1/render/latest/enUS/256x/CS2_029.png',
    );
  });

  it('uses cached URL when preload API resolves', async () => {
    window.hdt.cardImages.get = vi.fn().mockResolvedValue({
      url: 'hdt-card-image://cache/zhCN/256x/EX1_277.png',
      locale: 'zhCN',
      size: '256x',
    });

    const { result } = renderHook(() => useCardImageUrl('EX1_277'));

    await waitFor(() => {
      expect(result.current.primary).toBe('hdt-card-image://cache/zhCN/256x/EX1_277.png');
    });
    expect(result.current.fallback).toBe('hdt-card-image://cache/zhCN/256x/EX1_277.png');
  });
});
