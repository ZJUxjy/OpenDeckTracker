import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';

import type { DeckDetail } from '@hdt/core';

import { DeckEditor } from '../src/components/DeckEditor';
import { DeckExportDialog } from '../src/components/DeckExportDialog';
import { DeckImportDialog } from '../src/components/DeckImportDialog';
import { SavedDecksList } from '../src/components/Decklist';
import { SaveLiveDeckButton } from '../src/components/SaveLiveDeckButton';
import { I18nProvider } from '../src/i18n';
import { useDecksStore } from '../src/stores/decks-store';

const fakeDeck: DeckDetail = {
  id: 'd-1',
  name: 'Test',
  class: 'DRUID',
  format: 'Standard',
  version: 1,
  cards: [],
  notes: '',
  tags: [],
  createdAt: 0,
  updatedAt: 0,
};

const liveDeck = {
  name: 'Live',
  class: 'DRUID' as const,
  format: 'Standard' as const,
  cards: [{ cardId: 'A', count: 2 }],
};

describe('decks UI i18n smoke test (en-US + zh-CN)', () => {
  beforeEach(() => {
    useDecksStore.setState({ decks: [], loading: false, error: null });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    ['en-US', /No saved decks yet|My Decks/],
    ['zh-CN', /尚无已保存的卡组|我的卡组/],
  ] as const)('SavedDecksList renders localized title under %s', async (preference, pattern) => {
    await act(async () => {
      render(
        <I18nProvider preference={preference}>
          <SavedDecksList />
        </I18nProvider>,
      );
    });
    await waitFor(() => {
      const text = document.body.textContent ?? '';
      expect(text).toMatch(pattern);
    });
  });

  it.each([
    ['en-US', 'Deck Editor'],
    ['zh-CN', '卡组编辑器'],
  ] as const)('DeckEditor renders localized title under %s', async (preference, expectedTitle) => {
    await act(async () => {
      render(
        <I18nProvider preference={preference}>
          <DeckEditor open onOpenChange={() => undefined} deck={fakeDeck} />
        </I18nProvider>,
      );
    });
    expect(screen.getAllByText(expectedTitle).length).toBeGreaterThan(0);
  });

  it.each([
    ['en-US', 'Import Deck'],
    ['zh-CN', '导入卡组'],
  ] as const)('DeckImportDialog renders localized title under %s', async (preference, expectedTitle) => {
    await act(async () => {
      render(
        <I18nProvider preference={preference}>
          <DeckImportDialog open onOpenChange={() => undefined} />
        </I18nProvider>,
      );
    });
    expect(screen.getAllByText(expectedTitle).length).toBeGreaterThan(0);
  });

  it.each([
    ['en-US', 'Export Deck'],
    ['zh-CN', '导出卡组'],
  ] as const)('DeckExportDialog renders localized title under %s', async (preference, expectedTitle) => {
    await act(async () => {
      render(
        <I18nProvider preference={preference}>
          <DeckExportDialog open onOpenChange={() => undefined} deckId="d-1" />
        </I18nProvider>,
      );
    });
    expect(screen.getAllByText(expectedTitle).length).toBeGreaterThan(0);
  });

  it.each([
    ['en-US', 'Save this deck'],
    ['zh-CN', '保存此卡组'],
  ] as const)('SaveLiveDeckButton renders localized text under %s', async (preference, expectedText) => {
    await act(async () => {
      render(
        <I18nProvider preference={preference}>
          <SaveLiveDeckButton liveDeck={liveDeck} />
        </I18nProvider>,
      );
    });
    expect(screen.getAllByText(expectedText).length).toBeGreaterThan(0);
  });
});
