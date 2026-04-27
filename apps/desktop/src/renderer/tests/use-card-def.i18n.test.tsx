import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../src/i18n';
import type { PropsWithChildren } from 'react';
import { useCardDef } from '../src/hooks/use-card-def';

describe('useCardDef i18n', () => {
  beforeEach(() => {
    window.hdt.cards.findById = vi.fn().mockResolvedValue({
      id: 'EX1_277',
      dbfId: 564,
      name: '奥术飞弹',
      cost: 1,
    });
  });

  it('passes active locale to card lookup IPC', async () => {
    const wrapper = ({ children }: PropsWithChildren) => (
      <I18nProvider preference="zh-CN">{children}</I18nProvider>
    );

    renderHook(() => useCardDef('EX1_277'), { wrapper });

    await waitFor(() => {
      expect(window.hdt.cards.findById).toHaveBeenCalledWith('EX1_277', 'zh-CN');
    });
  });
});
