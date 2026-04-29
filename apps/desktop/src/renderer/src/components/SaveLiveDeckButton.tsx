import { useState, type ReactElement } from 'react';
import { Save } from 'lucide-react';
import type { DeckCard, Format, HeroClass } from '@hdt/core';

import { useTranslation } from '../i18n';
import { useDecks } from '../hooks/use-decks';

export interface SaveLiveDeckButtonProps {
  /** Live deck identity. Treat all four fields as required to be saveable. */
  liveDeck: {
    name: string;
    class: HeroClass;
    format: Format;
    cards: DeckCard[];
  } | null;
}

export function SaveLiveDeckButton({ liveDeck }: SaveLiveDeckButtonProps): ReactElement | null {
  const { t } = useTranslation();
  const { decks: savedDecks, refresh } = useDecks();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedJustNow, setSavedJustNow] = useState(false);

  if (liveDeck === null) return null;

  // Hide the affordance when an exact match (by name + same multiset count) is
  // already saved. Heuristic only — a future revision can compare card-list
  // hash via canonicalCardListHash.
  const alreadySaved = savedDecks.some(
    (d) => d.name === liveDeck.name && d.class === liveDeck.class,
  );
  if (alreadySaved && !savedJustNow) return null;

  const onSave = async (): Promise<void> => {
    setError(null);
    setBusy(true);
    try {
      await window.hdt.decks.saveFromLive({
        name: liveDeck.name,
        class: liveDeck.class,
        format: liveDeck.format,
        cards: liveDeck.cards,
      });
      await refresh();
      setSavedJustNow(true);
    } catch (err) {
      const e = err as Error & { name?: string };
      if (e.name === 'NonCollectibleSnapshotError') {
        setError(t('decks.saveLive.error.nonCollectible'));
      } else {
        setError(e.message);
      }
    } finally {
      setBusy(false);
    }
  };

  if (savedJustNow) {
    return (
      <span
        className="text-xs text-green inline-flex items-center gap-1"
        data-testid="save-live-saved"
      >
        {t('decks.saveLive.saved')}
      </span>
    );
  }

  return (
    <div className="inline-flex flex-col gap-1">
      <button
        onClick={() => void onSave()}
        disabled={busy}
        aria-label={t('decks.saveLive.button')}
        className="px-3 py-1 text-xs bg-bg-3 hover:bg-border-hi text-text rounded inline-flex items-center gap-1.5 disabled:opacity-50"
        data-testid="save-live-button"
      >
        <Save size={12} />
        {t('decks.saveLive.button')}
      </button>
      {error !== null && (
        <span
          className="text-xs text-red max-w-[280px]"
          data-testid="save-live-error"
        >
          {error}
        </span>
      )}
    </div>
  );
}
