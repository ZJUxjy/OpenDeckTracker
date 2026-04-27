import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PropsWithChildren } from 'react';
import { I18nProvider } from '../src/i18n';
import { useCardImageUrl } from '../src/hooks/use-card-image-url';

describe('useCardImageUrl i18n', () => {
  beforeEach(() => {
    window.hdt.cardImages.get = vi.fn().mockResolvedValue(null);
  });

  it('passes active locale to card image IPC', async () => {
    const wrapper = ({ children }: PropsWithChildren) => (
      <I18nProvider preference="zh-CN">{children}</I18nProvider>
    );

    renderHook(() => useCardImageUrl('EX1_277'), { wrapper });

    await waitFor(() => {
      expect(window.hdt.cardImages.get).toHaveBeenCalledWith('EX1_277', 'zh-CN');
    });
  });
});
