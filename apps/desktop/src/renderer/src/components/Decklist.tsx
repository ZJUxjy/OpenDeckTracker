import { useMemo, useState, type ReactElement } from 'react';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { MoreVertical, Plus, Upload } from 'lucide-react';
import type { DeckSummary, HeroClass } from '@hdt/core';

import { useDecks } from '../hooks/use-decks';
import { useTranslation } from '../i18n';

const CLASS_ORDER: HeroClass[] = [
  'DEATHKNIGHT',
  'DEMONHUNTER',
  'DRUID',
  'HUNTER',
  'MAGE',
  'PALADIN',
  'PRIEST',
  'ROGUE',
  'SHAMAN',
  'WARLOCK',
  'WARRIOR',
  'NEUTRAL',
];

const CLASS_LABELS: Record<HeroClass, string> = {
  DEATHKNIGHT: 'Death Knight',
  DEMONHUNTER: 'Demon Hunter',
  DRUID: 'Druid',
  HUNTER: 'Hunter',
  MAGE: 'Mage',
  PALADIN: 'Paladin',
  PRIEST: 'Priest',
  ROGUE: 'Rogue',
  SHAMAN: 'Shaman',
  WARLOCK: 'Warlock',
  WARRIOR: 'Warrior',
  NEUTRAL: 'Neutral',
};

function ClassIcon({ heroClass }: { heroClass: HeroClass }): ReactElement {
  return (
    <div
      className="w-8 h-8 rounded-full bg-overlay-elevated flex items-center justify-center text-text text-xs font-bold border border-border-hi"
      aria-hidden="true"
    >
      {heroClass.slice(0, 2)}
    </div>
  );
}

function CountBadge({ count }: { count: number }): ReactElement {
  const ok = count === 30;
  return (
    <span
      className={`text-xs font-semibold px-2 py-0.5 rounded ${
        ok ? 'bg-green/15 text-green' : 'bg-amber/15 text-amber'
      }`}
      data-testid="card-count-badge"
    >
      {count} / 30
    </span>
  );
}

function DeckRow({
  deck,
  onEdit,
  onDuplicate,
  onExport,
  onDelete,
}: {
  deck: DeckSummary;
  onEdit: (id: string) => void;
  onDuplicate: (id: string) => void;
  onExport: (id: string) => void;
  onDelete: (id: string) => void;
}): ReactElement {
  const { t } = useTranslation();
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <div
      className="flex items-center gap-3 p-3 bg-overlay-surface border border-border hover:border-border-hi rounded-md"
      data-testid={`deck-row-${deck.id}`}
    >
      <ClassIcon heroClass={deck.class} />
      <div className="flex-1 min-w-0">
        <div className="text-text font-medium truncate flex items-center gap-2">
          <span>{deck.name || t('deckSelect.unnamedDeck')}</span>
          <span className="text-xs text-text-dim font-normal">v{deck.version}</span>
        </div>
        <div className="text-xs text-text-dim mt-0.5">
          {CLASS_LABELS[deck.class]} · {deck.format}
        </div>
      </div>
      <CountBadge count={deck.cardCount} />
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            aria-label={t('decks.list.row.edit')}
            className="p-1 rounded hover:bg-overlay-elevated text-text-dim hover:text-text"
          >
            <MoreVertical size={18} />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className="z-50 min-w-[8rem] bg-overlay-elevated backdrop-blur-xl border border-border rounded-md shadow-xl py-1 text-sm text-text">
            <DropdownMenu.Item
              onSelect={() => onEdit(deck.id)}
              className="px-3 py-1.5 hover:bg-overlay-elevated outline-none cursor-pointer"
            >
              {t('decks.list.row.edit')}
            </DropdownMenu.Item>
            <DropdownMenu.Item
              onSelect={() => onDuplicate(deck.id)}
              className="px-3 py-1.5 hover:bg-overlay-elevated outline-none cursor-pointer"
            >
              {t('decks.list.row.duplicate')}
            </DropdownMenu.Item>
            <DropdownMenu.Item
              onSelect={() => onExport(deck.id)}
              className="px-3 py-1.5 hover:bg-overlay-elevated outline-none cursor-pointer"
            >
              {t('decks.list.row.export')}
            </DropdownMenu.Item>
            <DropdownMenu.Item
              onSelect={() => setConfirmOpen(true)}
              className="px-3 py-1.5 hover:bg-overlay-elevated outline-none cursor-pointer text-red"
            >
              {t('decks.list.row.delete')}
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <AlertDialog.Root open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-40 bg-overlay-dialog" />
          <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-[400px] bg-overlay-elevated backdrop-blur-xl border border-border rounded-md p-6 text-text">
            <AlertDialog.Title className="text-lg font-bold text-text">
              {t('decks.list.row.deleteConfirm.title')}
            </AlertDialog.Title>
            <AlertDialog.Description className="mt-2 text-sm text-text-dim">
              {t('decks.list.row.deleteConfirm.description')}
            </AlertDialog.Description>
            <div className="mt-6 flex justify-end gap-2">
              <AlertDialog.Cancel asChild>
                <button className="px-4 py-2 rounded text-sm hover:bg-overlay-elevated">
                  {t('decks.list.row.deleteConfirm.cancel')}
                </button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <button
                  onClick={() => onDelete(deck.id)}
                  className="px-4 py-2 rounded text-sm bg-red hover:bg-red/90 text-bg"
                >
                  {t('decks.list.row.deleteConfirm.confirm')}
                </button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </div>
  );
}

export interface SavedDecksListProps {
  onCreate?: () => void;
  onImport?: () => void;
  onEdit?: (id: string) => void;
  onExport?: (id: string) => void;
}

export function SavedDecksList(props: SavedDecksListProps = {}): ReactElement {
  // Sync live Hearthstone decks into the store before rendering, so My
  // Decks reflects in-game edits without requiring an app restart.
  const { decks, refresh } = useDecks({ sync: true });
  const { t } = useTranslation();

  const grouped = useMemo(() => {
    const map = new Map<HeroClass, DeckSummary[]>();
    for (const d of decks) {
      const list = map.get(d.class) ?? [];
      list.push(d);
      map.set(d.class, list);
    }
    return CLASS_ORDER.filter((c) => map.has(c)).map((c) => ({
      class: c,
      decks: map.get(c) ?? [],
    }));
  }, [decks]);

  const onDelete = async (id: string): Promise<void> => {
    await window.hdt.decks.delete(id);
    await refresh();
  };

  const onDuplicate = async (id: string): Promise<void> => {
    await window.hdt.decks.duplicate(id);
    await refresh();
  };

  if (decks.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center h-full p-12 text-text"
        data-testid="decks-empty-state"
      >
        <h2 className="text-xl font-semibold text-text mb-2">{t('decks.list.empty.title')}</h2>
        <div className="flex gap-3 mt-4">
          <button
            onClick={() => props.onCreate?.()}
            aria-label={t('decks.list.empty.create')}
            className="px-4 py-2 bg-accent hover:bg-accent/90 text-bg text-sm font-medium rounded inline-flex items-center gap-2"
          >
            <Plus size={16} />
            {t('decks.list.empty.create')}
          </button>
          <button
            onClick={() => props.onImport?.()}
            aria-label={t('decks.list.empty.import')}
            className="px-4 py-2 bg-overlay-elevated hover:bg-border-hi text-text text-sm font-medium rounded inline-flex items-center gap-2"
          >
            <Upload size={16} />
            {t('decks.list.empty.import')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 overflow-y-auto h-full">
      <h1 className="text-2xl font-bold text-text mb-6">{t('decks.list.title')}</h1>
      <div className="space-y-6">
        {grouped.map(({ class: heroClass, decks: rows }) => (
          <section key={heroClass} data-testid={`group-${heroClass}`}>
            <h2 className="text-sm font-semibold text-text-dim uppercase tracking-wider mb-2">
              {CLASS_LABELS[heroClass]}
            </h2>
            <div className="space-y-2">
              {rows.map((d) => (
                <DeckRow
                  key={d.id}
                  deck={d}
                  onEdit={(id) => props.onEdit?.(id)}
                  onExport={(id) => props.onExport?.(id)}
                  onDuplicate={onDuplicate}
                  onDelete={onDelete}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
