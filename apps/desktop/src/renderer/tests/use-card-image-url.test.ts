import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import {
  useCardImageUrl,
  getCardImageUrl,
} from '../src/hooks/use-card-image-url';
import { I18nProvider } from '../src/i18n';

function zhCNWrapper({ children }: { children: ReactNode }) {
  return createElement(I18nProvider, { preference: 'zh-CN' }, children);
}

describe('useCardImageUrl', () => {
  beforeEach(() => {
    // Reset module-level cache between tests
    vi.resetModules();
    window.hdt.cardImages.get = vi.fn().mockResolvedValue(null);
  });

  it('returns empty URLs while the cache lookup is pending or unavailable', () => {
    // No CDN fallback — renderer CSP blocks art.hearthstonejson.com,
    // so the hook returns empty strings until the main-process cache
    // resolves. Components handle the empty state via their own
    // loading / placeholder UI.
    const { result } = renderHook(() => useCardImageUrl('EX1_277'), { wrapper: zhCNWrapper });
    expect(result.current.primary).toBe('');
    expect(result.current.fallback).toBe('');
  });

  it('getCardImageUrl still encodes the upstream CDN pattern (test/internal use only)', () => {
    // Helper exposed for the main-process cache layer to download from.
    // Renderer CSP disallows the CDN host, so an <img> src using this
    // URL would fail — it MUST NOT be used directly by components.
    const urls = getCardImageUrl('CS2_029');
    expect(urls.primary).toBe(
      'https://art.hearthstonejson.com/v1/render/latest/zhCN/256x/CS2_029.png',
    );
    expect(urls.fallback).toBe(
      'https://art.hearthstonejson.com/v1/render/latest/enUS/256x/CS2_029.png',
    );
  });

  it('uses the cached URL once the preload API resolves', async () => {
    window.hdt.cardImages.get = vi.fn().mockResolvedValue({
      url: 'hdt-card-image://cache/zhCN/256x/EX1_277.png',
      locale: 'zhCN',
      size: '256x',
    });

    const { result } = renderHook(() => useCardImageUrl('EX1_277'), { wrapper: zhCNWrapper });

    await waitFor(() => {
      expect(result.current.primary).toBe('hdt-card-image://cache/zhCN/256x/EX1_277.png');
    });
    expect(result.current.fallback).toBe('hdt-card-image://cache/zhCN/256x/EX1_277.png');
  });
});
