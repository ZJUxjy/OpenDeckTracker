import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { I18nProvider } from '../src/i18n';
import { LiveDeckPanel } from '../src/components/LiveDeckPanel';
import { useDeckTrackerStore } from '../src/stores/deck-tracker-store';

// `setup.ts` mocks `window.hdt.hearthmirror.isAlive` → false, which is
// the realistic boot state (no game open). LiveDeckPanel surfaces a
// dedicated "Hearthstone not running" copy in that state.
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

    expect(screen.getByText('炉石传说未运行')).toBeInTheDocument();
    expect(screen.getByText('剩余卡牌')).toBeInTheDocument();
  });

  it('renders English empty state labels', () => {
    render(
      <I18nProvider preference="en-US">
        <LiveDeckPanel />
      </I18nProvider>,
    );

    expect(screen.getByText('Hearthstone not running')).toBeInTheDocument();
    expect(screen.getByText('Remaining Cards')).toBeInTheDocument();
  });
});
