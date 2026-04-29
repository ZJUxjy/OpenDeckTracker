import { useEffect, useMemo, useState } from 'react';
import { useDeckTrackerStore } from '../stores/deck-tracker-store';
import { useDecks } from '../hooks/use-decks';
import { useTranslation } from '../i18n';

const STORAGE_KEY_LAST_PICK = 'hdt:deck-tracker:last-deck-id';

type Choice =
  | { kind: 'saved'; id: string; version: number }
  | { kind: 'live'; id: number };

function choiceKey(c: Choice): string {
  return c.kind === 'saved' ? `s:${c.id}` : `l:${c.id}`;
}

/**
 * Dialog shown when the in-game DeckIdentifier can't auto-detect the
 * active deck (Practice / Tavern Brawl / unmapped). User picks one
 * of their saved decks; the choice is forwarded to the main process
 * via `window.hdt.deckTracker.selectDeck(deckId)`.
 *
 * Per design D5 the choice is persisted to `localStorage` so the next
 * occurrence pre-selects it.
 */
export function DeckSelectDialog() {
  const { t } = useTranslation();
  const pendingSelection = useDeckTrackerStore((s) => s.pendingSelection);
  const markDialogDismissed = useDeckTrackerStore((s) => s.markDialogDismissed);
  const { decks: savedDecks } = useDecks();
  const [chosen, setChosen] = useState<Choice | null>(null);

  const lastPickedId = useMemo<number | null>(() => {
    try {
      const v = localStorage.getItem(STORAGE_KEY_LAST_PICK);
      return v === null ? null : Number(v);
    } catch {
      return null;
    }
  }, []);

  // Pre-select default ONLY on first open or when nothing is chosen yet.
  // After the user clicks, `chosen` becomes non-null and subsequent runs of
  // this effect (which fire every snapshot tick — the store re-emits
  // `pendingSelection` as a fresh reference each poll) short-circuit
  // without clobbering the user's selection. Reset everything when the
  // dialog closes (`pendingSelection` becomes null).
  useEffect(() => {
    if (!pendingSelection) {
      setChosen(null);
      return;
    }
    setChosen((prev) => {
      if (prev !== null) return prev;
      if (lastPickedId !== null && pendingSelection.decks.some((d) => d.id === lastPickedId)) {
        return { kind: 'live', id: lastPickedId };
      }
      if (savedDecks.length > 0 && savedDecks[0]) {
        return { kind: 'saved', id: savedDecks[0].id, version: savedDecks[0].version };
      }
      if (pendingSelection.decks[0]) {
        return { kind: 'live', id: pendingSelection.decks[0].id };
      }
      return null;
    });
  }, [pendingSelection, lastPickedId, savedDecks]);

  if (!pendingSelection) return null;

  const handleConfirm = async (): Promise<void> => {
    if (chosen === null) return;
    if (chosen.kind === 'saved') {
      await window.hdt?.deckTracker.selectSavedDeck?.(chosen.id, chosen.version);
      // Saved decks don't have a numeric live-deck id to persist.
    } else {
      try {
        localStorage.setItem(STORAGE_KEY_LAST_PICK, String(chosen.id));
      } catch {
        // ignore storage errors (private mode etc.)
      }
      await window.hdt?.deckTracker.selectDeck(chosen.id);
    }
    markDialogDismissed();
  };

  const handleCancel = async (): Promise<void> => {
    await window.hdt?.deckTracker.cancelSelection();
    markDialogDismissed();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="deck-select-title"
    >
      <div className="bg-bg-2 border border-border rounded-lg shadow-2xl w-[440px] max-h-[80vh] flex flex-col">
        <div className="px-6 py-4 border-b border-border">
          <h2 id="deck-select-title" className="text-lg font-bold text-text">
            {t('deckSelect.title')}
          </h2>
          <p className="text-xs text-text-dim mt-1">
            {t('deckSelect.description')}
          </p>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {pendingSelection.decks.length === 0 && savedDecks.length === 0 ? (
            <div className="text-text-dim text-sm text-center py-8">
              {t('deckSelect.empty')}
            </div>
          ) : (
            <>
              {savedDecks.length > 0 && (
                <ul className="space-y-1 mb-3" data-testid="saved-deck-list">
                  {savedDecks.map((deck) => {
                    const choice: Choice = { kind: 'saved', id: deck.id, version: deck.version };
                    const active = chosen !== null && choiceKey(chosen) === choiceKey(choice);
                    return (
                      <li key={`saved-${deck.id}`}>
                        <button
                          type="button"
                          onClick={() => setChosen(choice)}
                          data-testid={`saved-deck-row-${deck.id}`}
                          className={
                            'w-full text-left px-3 py-2 rounded transition-colors flex items-center justify-between ' +
                            (active
                              ? 'bg-accent text-text'
                              : 'bg-bg-2 hover:bg-bg-3 text-text')
                          }
                        >
                          <span className="font-medium truncate">
                            {deck.name || t('deckSelect.unnamedDeck')}
                          </span>
                          <span
                            className="text-xs ml-2 shrink-0 px-1.5 py-0.5 rounded bg-green/20 text-green"
                            data-testid="saved-badge"
                          >
                            {t('decks.select.savedBadge')}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              {pendingSelection.decks.length > 0 && (
                <>
                  {savedDecks.length > 0 && (
                    <div className="text-xs text-text-mute uppercase tracking-wider px-1 pb-1">
                      {t('decks.select.detected')}
                    </div>
                  )}
                  <ul className="space-y-1" data-testid="live-deck-list">
                    {pendingSelection.decks.map((deck) => {
                      const choice: Choice = { kind: 'live', id: deck.id };
                      const active = chosen !== null && choiceKey(chosen) === choiceKey(choice);
                      return (
                        <li key={`live-${deck.id}`}>
                          <button
                            type="button"
                            onClick={() => setChosen(choice)}
                            data-testid={`live-deck-row-${deck.id}`}
                            className={
                              'w-full text-left px-3 py-2 rounded transition-colors flex items-center justify-between ' +
                              (active
                                ? 'bg-accent text-text'
                                : 'bg-bg-2 hover:bg-bg-3 text-text')
                            }
                          >
                            <span className="font-medium truncate">
                              {deck.name || t('deckSelect.unnamedDeck')}
                            </span>
                            <span className="text-xs opacity-70 ml-2 shrink-0">{deck.hero}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </>
          )}
        </div>
        <div className="px-6 py-3 border-t border-border flex justify-end gap-2">
          <button
            type="button"
            onClick={handleCancel}
            className="px-4 py-2 text-text hover:text-text text-sm"
          >
            {t('deckSelect.cancel')}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={chosen === null}
            className="px-4 py-2 bg-accent hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed text-bg rounded text-sm font-medium"
          >
            {t('deckSelect.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
