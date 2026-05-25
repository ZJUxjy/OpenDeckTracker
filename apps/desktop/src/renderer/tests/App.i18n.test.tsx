import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App';
import { routes } from '../src/routes';
import { I18nProvider } from '../src/i18n';
import { LANGUAGE_PREFERENCE_STORAGE_KEY, useI18nStore } from '../src/i18n/i18n-store';

describe('App i18n', () => {
  beforeEach(() => {
    localStorage.removeItem(LANGUAGE_PREFERENCE_STORAGE_KEY);
    useI18nStore.setState({ languagePreference: 'system' });
    window.hdt.hearthmirror.isAlive = vi.fn().mockResolvedValue(true);
    window.hdt.hearthmirror.getBattleTag = vi.fn().mockResolvedValue({
      name: 'Tester',
      number: 1234,
      fullBattleTag: 'Tester#1234',
    });
  });

  it('renders Chinese navigation and game status when locale is zh-CN', async () => {
    const router = createMemoryRouter(
      [{ path: '/', element: <App />, children: routes }],
      { initialEntries: ['/tracker'] },
    );

    render(
      <I18nProvider preference="zh-CN">
        <RouterProvider router={router} />
      </I18nProvider>,
    );

    expect(screen.getAllByText('记牌器').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('统计')).toBeInTheDocument();
    expect(screen.getByText('收藏')).toBeInTheDocument();
    expect(screen.queryByText('炉石智能记牌器 · Pip-Boy 76 主题')).not.toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('游戏运行中')).toBeInTheDocument();
    });
  });

  it('updates the tracker route after choosing Simplified Chinese in settings', async () => {
    const user = userEvent.setup();
    const router = createMemoryRouter(
      [{ path: '/', element: <App />, children: routes }],
      { initialEntries: ['/settings'] },
    );

    render(
      <I18nProvider systemLanguage="en-US">
        <RouterProvider router={router} />
      </I18nProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Simplified Chinese' }));
    await user.click(screen.getByRole('button', { name: /记牌器/ }));

    await waitFor(() => {
      expect(screen.getByText('暂无活动卡组')).toBeInTheDocument();
    });
    expect(screen.getByText('状态：空闲')).toBeInTheDocument();
    expect(screen.queryByText('No Active Deck')).not.toBeInTheDocument();
  });
});
