import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { I18nProvider } from '../src/i18n';
import { LiveDeckPanel } from '../src/components/LiveDeckPanel';
import { useDeckTrackerStore } from '../src/stores/deck-tracker-store';
import type { DeckTrackerSnapshot } from '@hdt/core';

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

  it('renders Chinese friendly hand labels and empty message', () => {
    useDeckTrackerStore.setState({
      snapshot: {
        phase: 'IN_MATCH',
        matchInfo: null,
        deck: {
          id: 1,
          name: '测试卡组',
          original: [{ cardId: 'CS2_029', count: 1 }],
          remaining: [{ cardId: 'CS2_029', count: 1 }],
          extras: [],
        },
        pendingDeckSelection: null,
        friendlyHand: [],
        opposingHandCount: 0,
        opponent: { revealed: [], graveyard: [] },
        opponentClass: null,
        friendlyGraveyard: [],
        friendlyDeckCount: 1,
        friendlyEffects: [],
        opposingEffects: [],
        boardAttack: { friendly: 0, opposing: 0 },
        boardAttackToFace: { friendly: 0, opposing: 0 },
        error: null,
        updatedAt: 0,
      } satisfies DeckTrackerSnapshot,
    });

    render(
      <I18nProvider preference="zh-CN">
        <LiveDeckPanel />
      </I18nProvider>,
    );

    expect(screen.getByText('当前手牌')).toBeInTheDocument();
    expect(screen.getByText('当前没有手牌')).toBeInTheDocument();
  });
});
