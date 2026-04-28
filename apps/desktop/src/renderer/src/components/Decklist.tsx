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
      className="w-8 h-8 rounded-full bg-[#225B8D] flex items-center justify-center text-white text-xs font-bold border border-[#153A5A]"
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
        ok ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'
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
      className="flex items-center gap-3 p-3 bg-[#1a1a24] border border-[#2A2A35] hover:border-[#3A3A45] rounded-md"
      data-testid={`deck-row-${deck.id}`}
    >
      <ClassIcon heroClass={deck.class} />
      <div className="flex-1 min-w-0">
        <div className="text-white font-medium truncate flex items-center gap-2">
          <span>{deck.name || t('deckSelect.unnamedDeck')}</span>
          <span className="text-xs text-slate-400 font-normal">v{deck.version}</span>
        </div>
        <div className="text-xs text-slate-400 mt-0.5">
          {CLASS_LABELS[deck.class]} · {deck.format}
        </div>
      </div>
      <CountBadge count={deck.cardCount} />
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            aria-label={t('decks.list.row.edit')}
            className="p-1 rounded hover:bg-[#2A2A35] text-slate-400 hover:text-white"
          >
            <MoreVertical size={18} />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className="z-50 min-w-[8rem] bg-[#14141A] border border-[#2A2A35] rounded-md shadow-xl py-1 text-sm text-slate-200">
            <DropdownMenu.Item
              onSelect={() => onEdit(deck.id)}
              className="px-3 py-1.5 hover:bg-[#2A2A35] outline-none cursor-pointer"
            >
              {t('decks.list.row.edit')}
            </DropdownMenu.Item>
            <DropdownMenu.Item
              onSelect={() => onDuplicate(deck.id)}
              className="px-3 py-1.5 hover:bg-[#2A2A35] outline-none cursor-pointer"
            >
              {t('decks.list.row.duplicate')}
            </DropdownMenu.Item>
            <DropdownMenu.Item
              onSelect={() => onExport(deck.id)}
              className="px-3 py-1.5 hover:bg-[#2A2A35] outline-none cursor-pointer"
            >
              {t('decks.list.row.export')}
            </DropdownMenu.Item>
            <DropdownMenu.Item
              onSelect={() => setConfirmOpen(true)}
              className="px-3 py-1.5 hover:bg-[#2A2A35] outline-none cursor-pointer text-red-400"
            >
              {t('decks.list.row.delete')}
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <AlertDialog.Root open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-40 bg-black/60" />
          <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-[400px] bg-[#14141A] border border-[#2A2A35] rounded-md p-6 text-slate-200">
            <AlertDialog.Title className="text-lg font-bold text-white">
              {t('decks.list.row.deleteConfirm.title')}
            </AlertDialog.Title>
            <AlertDialog.Description className="mt-2 text-sm text-slate-400">
              {t('decks.list.row.deleteConfirm.description')}
            </AlertDialog.Description>
            <div className="mt-6 flex justify-end gap-2">
              <AlertDialog.Cancel asChild>
                <button className="px-4 py-2 rounded text-sm hover:bg-[#2A2A35]">
                  {t('decks.list.row.deleteConfirm.cancel')}
                </button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <button
                  onClick={() => onDelete(deck.id)}
                  className="px-4 py-2 rounded text-sm bg-red-500 hover:bg-red-600 text-white"
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
  const { decks, refresh } = useDecks();
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
        className="flex flex-col items-center justify-center h-full p-12 text-slate-300"
        data-testid="decks-empty-state"
      >
        <h2 className="text-xl font-semibold text-white mb-2">{t('decks.list.empty.title')}</h2>
        <div className="flex gap-3 mt-4">
          <button
            onClick={() => props.onCreate?.()}
            aria-label={t('decks.list.empty.create')}
            className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium rounded inline-flex items-center gap-2"
          >
            <Plus size={16} />
            {t('decks.list.empty.create')}
          </button>
          <button
            onClick={() => props.onImport?.()}
            aria-label={t('decks.list.empty.import')}
            className="px-4 py-2 bg-[#2A2A35] hover:bg-[#3A3A45] text-slate-200 text-sm font-medium rounded inline-flex items-center gap-2"
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
      <h1 className="text-2xl font-bold text-white mb-6">{t('decks.list.title')}</h1>
      <div className="space-y-6">
        {grouped.map(({ class: heroClass, decks: rows }) => (
          <section key={heroClass} data-testid={`group-${heroClass}`}>
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-2">
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
