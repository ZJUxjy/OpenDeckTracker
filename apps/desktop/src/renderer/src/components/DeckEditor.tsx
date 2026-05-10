import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Plus, Trash2, X } from 'lucide-react';
import type {
  DeckCard,
  DeckDetail,
  Format,
  HeroClass,
  ValidityIssue,
} from '@hdt/core';

import { aggregateCardCount, validateDeck } from '@hdt/core';
import { useLocale, useTranslation } from '../i18n';

const CLASSES: HeroClass[] = [
  'DRUID',
  'HUNTER',
  'MAGE',
  'PALADIN',
  'PRIEST',
  'ROGUE',
  'SHAMAN',
  'WARLOCK',
  'WARRIOR',
  'DEMONHUNTER',
  'DEATHKNIGHT',
];

const FORMATS: Format[] = ['Standard', 'Wild', 'Classic', 'Twist'];

const DEBOUNCE_MS = 400;

export interface DeckEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deck: DeckDetail;
  /** Called once per debounced edit and again on Save & Close. */
  onSave?: (id: string, patch: PatchInput) => Promise<void>;
}

export interface PatchInput {
  name?: string;
  class?: HeroClass;
  format?: Format;
  cards?: DeckCard[];
  notes?: string;
  tags?: string[];
}

interface CardSearchHit {
  id: string;
  name: string;
  cost: number;
  cardClass: string;
  rarity: string;
  type: string;
}

function localizeIssue(issue: ValidityIssue, t: (k: string, v?: Record<string, string | number>) => string): string {
  switch (issue.kind) {
    case 'under-card-limit':
      return t('decks.editor.validity.underCardLimit', { required: issue.required, actual: issue.actual });
    case 'over-card-limit':
      return t('decks.editor.validity.overCardLimit', { required: issue.required, actual: issue.actual });
    case 'over-copy-limit':
      return t('decks.editor.validity.overCopyLimit', { cardId: issue.cardId, count: issue.count });
    case 'legendary-over-limit':
      return t('decks.editor.validity.legendaryOverLimit', { cardId: issue.cardId, count: issue.count });
    case 'off-class-card':
      return t('decks.editor.validity.offClassCard', {
        cardId: issue.cardId,
        cardClass: issue.cardClass,
        deckClass: issue.deckClass,
      });
    case 'hero-in-main-deck':
      return t('decks.editor.validity.heroInMainDeck', { cardId: issue.cardId });
  }
}

export function DeckEditor({ open, onOpenChange, deck, onSave }: DeckEditorProps): ReactElement {
  const { t } = useTranslation();
  const locale = useLocale();
  const [name, setName] = useState(deck.name);
  const [heroClass, setHeroClass] = useState<HeroClass>(deck.class);
  const [format, setFormat] = useState<Format>(deck.format);
  const [notes, setNotes] = useState(deck.notes);
  const [tagsInput, setTagsInput] = useState(deck.tags.join(', '));
  const [cards, setCards] = useState<DeckCard[]>([...deck.cards]);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<CardSearchHit[]>([]);
  const [cardLookup, setCardLookup] = useState<Map<string, CardSearchHit>>(new Map());
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset state when the prop changes (different deck loaded).
  useEffect(() => {
    setName(deck.name);
    setHeroClass(deck.class);
    setFormat(deck.format);
    setNotes(deck.notes);
    setTagsInput(deck.tags.join(', '));
    setCards([...deck.cards]);
  }, [deck]);

  // Debounced auto-save.
  const queueSave = (patch: PatchInput): void => {
    if (debounceTimer.current !== null) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      void onSave?.(deck.id, patch);
    }, DEBOUNCE_MS);
  };

  const flushSave = async (): Promise<void> => {
    if (debounceTimer.current !== null) {
      clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
    }
    await onSave?.(deck.id, {
      name,
      class: heroClass,
      format,
      cards,
      notes,
      tags: tagsInput
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    });
  };

  const validity = useMemo(() => {
    const lookup = (cardId: string) => {
      const hit = cardLookup.get(cardId);
      if (!hit) return null;
      return {
        class: ((hit.cardClass as HeroClass) ?? 'NEUTRAL') as HeroClass,
        rarity: hit.rarity ?? 'COMMON',
        type: hit.type,
      };
    };
    return validateDeck(
      { ...deck, name, class: heroClass, format, cards, notes, tags: [] },
      lookup,
    );
  }, [deck, name, heroClass, format, cards, notes, cardLookup]);

  const totalCount = aggregateCardCount(cards);

  const onSearchChange = (value: string): void => {
    setSearch(value);
    if (value.trim() === '') {
      setResults([]);
      return;
    }
    void window.hdt.cards
      .search({ query: value, collectible: true, limit: 10 }, locale)
      .then((defs) => {
        const hits: CardSearchHit[] = defs.map((d) => ({
          id: d.id,
          name: d.name,
          cost: d.cost ?? 0,
          cardClass: d.cardClass,
          rarity: d.rarity ?? 'COMMON',
          type: d.type,
        }));
        setResults(hits);
        setCardLookup((prev) => {
          const next = new Map(prev);
          for (const h of hits) next.set(h.id, h);
          return next;
        });
      })
      .catch(() => setResults([]));
  };

  const addCard = (cardId: string): void => {
    setCards((prev) => {
      const idx = prev.findIndex((c) => c.cardId === cardId);
      let next: DeckCard[];
      if (idx >= 0) {
        next = [...prev];
        next[idx] = { cardId, count: Math.min(2, next[idx]!.count + 1) };
      } else {
        next = [...prev, { cardId, count: 1 }];
      }
      queueSave({ cards: next });
      return next;
    });
  };

  const onSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter' && results.length > 0) {
      e.preventDefault();
      addCard(results[0]!.id);
      setSearch('');
      setResults([]);
    }
  };

  const removeCard = (cardId: string): void => {
    setCards((prev) => {
      const next = prev
        .map((c) => (c.cardId === cardId ? { ...c, count: c.count - 1 } : c))
        .filter((c) => c.count > 0);
      queueSave({ cards: next });
      return next;
    });
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-[800px] max-w-[95vw] max-h-[90vh] bg-white/10 backdrop-blur-xl border border-border rounded-md text-text flex flex-col">
          <div className="flex items-center justify-between p-4 border-b border-border">
            <Dialog.Title className="text-lg font-bold text-text">
              {t('decks.editor.title')}
            </Dialog.Title>
            <Dialog.Description className="sr-only">
              {t('decks.editor.title')}
            </Dialog.Description>
            <Dialog.Close asChild>
              <button aria-label={t('decks.editor.cancel')} className="p-1 hover:bg-white/10 rounded">
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>

          <div className="grid grid-cols-2 gap-4 p-4 overflow-y-auto flex-1">
            {/* Left column: metadata */}
            <div className="space-y-3">
              <div>
                <label className="text-xs text-text-dim uppercase">{t('decks.editor.name')}</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    queueSave({ name: e.target.value });
                  }}
                  placeholder={t('decks.editor.namePlaceholder')}
                  className="w-full mt-1 px-3 py-2 bg-white/5 border border-border rounded text-text"
                />
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-xs text-text-dim uppercase">{t('decks.editor.class')}</label>
                  <select
                    value={heroClass}
                    onChange={(e) => {
                      setHeroClass(e.target.value as HeroClass);
                      queueSave({ class: e.target.value as HeroClass });
                    }}
                    className="w-full mt-1 px-3 py-2 bg-white/5 border border-border rounded text-text"
                  >
                    {CLASSES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="text-xs text-text-dim uppercase">{t('decks.editor.format')}</label>
                  <select
                    value={format}
                    onChange={(e) => {
                      setFormat(e.target.value as Format);
                      queueSave({ format: e.target.value as Format });
                    }}
                    className="w-full mt-1 px-3 py-2 bg-white/5 border border-border rounded text-text"
                  >
                    {FORMATS.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-text-dim uppercase">{t('decks.editor.notes')}</label>
                <textarea
                  value={notes}
                  onChange={(e) => {
                    setNotes(e.target.value);
                    queueSave({ notes: e.target.value });
                  }}
                  rows={4}
                  className="w-full mt-1 px-3 py-2 bg-white/5 border border-border rounded text-text text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-text-dim uppercase">{t('decks.editor.tags')}</label>
                <input
                  type="text"
                  value={tagsInput}
                  onChange={(e) => {
                    setTagsInput(e.target.value);
                    queueSave({
                      tags: e.target.value
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean),
                    });
                  }}
                  className="w-full mt-1 px-3 py-2 bg-white/5 border border-border rounded text-text text-sm"
                />
              </div>
            </div>

            {/* Right column: card list editor */}
            <div className="flex flex-col">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-text-dim uppercase">
                  {t('decks.list.row.cardCount', { count: totalCount })}
                </span>
              </div>
              <input
                type="text"
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                onKeyDown={onSearchKeyDown}
                placeholder={t('decks.editor.search.placeholder')}
                className="w-full px-3 py-2 bg-white/5 border border-border rounded text-text text-sm"
                data-testid="card-search-input"
              />
              {results.length > 0 && (
                <div
                  className="mt-1 bg-white/5 border border-border rounded max-h-48 overflow-y-auto"
                  role="listbox"
                  data-testid="card-search-results"
                >
                  {results.map((r) => (
                    <button
                      key={r.id}
                      role="option"
                      aria-selected={false}
                      onClick={() => addCard(r.id)}
                      className="w-full text-left px-3 py-1.5 text-sm hover:bg-white/10 flex justify-between"
                    >
                      <span>{r.name}</span>
                      <span className="text-text-dim">{r.cost} mana</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="mt-3 space-y-1 overflow-y-auto" data-testid="deck-cards-list">
                {cards.map((c) => {
                  const hit = cardLookup.get(c.cardId);
                  return (
                    <div
                      key={c.cardId}
                      className="flex items-center gap-2 px-2 py-1 bg-white/5 rounded text-sm"
                    >
                      <span className="text-text-dim w-6">{hit?.cost ?? '?'}</span>
                      <span className="flex-1 truncate">{hit?.name ?? c.cardId}</span>
                      <span className="text-accent font-bold">×{c.count}</span>
                      <button
                        onClick={() => addCard(c.cardId)}
                        className="p-1 hover:bg-white/10 rounded text-text-dim"
                        aria-label={`add ${c.cardId}`}
                      >
                        <Plus size={14} />
                      </button>
                      <button
                        onClick={() => removeCard(c.cardId)}
                        className="p-1 hover:bg-white/10 rounded text-text-dim"
                        aria-label={`remove ${c.cardId}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Validity panel */}
          <div className="px-4 py-2 border-t border-border text-xs" data-testid="validity-panel">
            {validity.ok ? (
              <span className="text-green">{t('decks.editor.validity.ok')}</span>
            ) : (
              <ul className="text-amber space-y-0.5">
                {validity.issues.map((issue, i) => (
                  <li key={i}>{localizeIssue(issue, t)}</li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex justify-end gap-2 p-4 border-t border-border">
            <Dialog.Close asChild>
              <button className="px-4 py-2 rounded text-sm hover:bg-white/10">
                {t('decks.editor.cancel')}
              </button>
            </Dialog.Close>
            <button
              onClick={async () => {
                await flushSave();
                onOpenChange(false);
              }}
              className="px-4 py-2 rounded text-sm bg-accent hover:bg-accent/90 text-bg"
            >
              {t('decks.editor.save')}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
