import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { I18nProvider } from '../src/i18n';
import { LiveDeckPanel } from '../src/components/LiveDeckPanel';
import { useDeckTrackerStore } from '../src/stores/deck-tracker-store';

describe('LiveDeckPanel i18n', () => {
  beforeEach(() => {
    useDeckTrackerStore.setState({
      snapshot: null,
      pendingSelection: null,
      dialogDismissed: false,
    });
  });

  it('renders Chinese empty state labels', () => {
    render(
      <I18nProvider preference="zh-CN">
        <LiveDeckPanel />
      </I18nProvider>,
    );

    expect(screen.getByText('等待对局开始...')).toBeInTheDocument();
    expect(screen.getByText('剩余卡牌')).toBeInTheDocument();
  });

  it('renders English empty state labels', () => {
    render(
      <I18nProvider preference="en-US">
        <LiveDeckPanel />
      </I18nProvider>,
    );

    expect(screen.getByText('Waiting for match to start...')).toBeInTheDocument();
    expect(screen.getByText('Remaining Cards')).toBeInTheDocument();
  });
});
