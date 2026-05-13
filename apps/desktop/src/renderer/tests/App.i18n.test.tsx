import { render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App';
import { routes } from '../src/routes';
import { I18nProvider } from '../src/i18n';

describe('App i18n', () => {
  beforeEach(() => {
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

    expect(screen.getByText('记牌器')).toBeInTheDocument();
    expect(screen.getByText('统计')).toBeInTheDocument();
    expect(screen.getByText('收藏')).toBeInTheDocument();
    expect(screen.queryByText('炉石智能记牌器 · Pip-Boy 76 主题')).not.toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('游戏运行中')).toBeInTheDocument();
    });
  });
});
