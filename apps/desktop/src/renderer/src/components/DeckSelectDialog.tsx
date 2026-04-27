import { useEffect, useMemo, useState } from 'react';
import { useDeckTrackerStore } from '../stores/deck-tracker-store';
import { useTranslation } from '../i18n';

const STORAGE_KEY_LAST_PICK = 'hdt:deck-tracker:last-deck-id';

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
  const [chosen, setChosen] = useState<number | null>(null);

  const lastPickedId = useMemo<number | null>(() => {
    try {
      const v = localStorage.getItem(STORAGE_KEY_LAST_PICK);
      return v === null ? null : Number(v);
    } catch {
      return null;
    }
  }, []);

  // Pre-select last-used deck if available in this set.
  useEffect(() => {
    if (!pendingSelection) {
      setChosen(null);
      return;
    }
    if (lastPickedId !== null && pendingSelection.decks.some((d) => d.id === lastPickedId)) {
      setChosen(lastPickedId);
    } else {
      setChosen(pendingSelection.decks[0]?.id ?? null);
    }
  }, [pendingSelection, lastPickedId]);

  if (!pendingSelection) return null;

  const handleConfirm = async (): Promise<void> => {
    if (chosen === null) return;
    try {
      localStorage.setItem(STORAGE_KEY_LAST_PICK, String(chosen));
    } catch {
      // ignore storage errors (private mode etc.)
    }
    await window.hdt?.deckTracker.selectDeck(chosen);
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
      <div className="bg-[#1C1C24] border border-[#2A2A35] rounded-lg shadow-2xl w-[440px] max-h-[80vh] flex flex-col">
        <div className="px-6 py-4 border-b border-[#2A2A35]">
          <h2 id="deck-select-title" className="text-lg font-bold text-white">
            {t('deckSelect.title')}
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            {t('deckSelect.description')}
          </p>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {pendingSelection.decks.length === 0 ? (
            <div className="text-slate-400 text-sm text-center py-8">
              {t('deckSelect.empty')}
            </div>
          ) : (
            <ul className="space-y-1">
              {pendingSelection.decks.map((deck) => (
                <li key={deck.id}>
                  <button
                    type="button"
                    onClick={() => setChosen(deck.id)}
                    className={
                      'w-full text-left px-3 py-2 rounded transition-colors flex items-center justify-between ' +
                      (chosen === deck.id
                        ? 'bg-orange-600 text-white'
                        : 'bg-[#12121A] hover:bg-[#2A2A35] text-slate-200')
                    }
                  >
                    <span className="font-medium truncate">{deck.name || t('deckSelect.unnamedDeck')}</span>
                    <span className="text-xs opacity-70 ml-2 shrink-0">{deck.hero}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="px-6 py-3 border-t border-[#2A2A35] flex justify-end gap-2">
          <button
            type="button"
            onClick={handleCancel}
            className="px-4 py-2 text-slate-300 hover:text-white text-sm"
          >
            {t('deckSelect.cancel')}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={chosen === null}
            className="px-4 py-2 bg-orange-600 hover:bg-orange-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded text-sm font-medium"
          >
            {t('deckSelect.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
