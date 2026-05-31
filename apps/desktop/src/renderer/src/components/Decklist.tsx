import { useEffect, useMemo, useState, type ReactElement, type ReactNode } from 'react';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  ChevronDown,
  ChevronRight,
  Copy,
  MoreVertical,
  Plus,
  RefreshCw,
  Search,
  Upload,
} from 'lucide-react';
import type {
  DeckCard,
  DeckDetail,
  DeckSource,
  DeckSummary,
  Format,
  HeroClass,
} from '@hdt/core';
import type { CardDef } from '@hdt/hearthdb';

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

type TFunction = ReturnType<typeof useTranslation>['t'];

const CLASS_LABEL_KEYS: Record<HeroClass, string> = {
  DEATHKNIGHT: 'decks.finder.classDeathKnight',
  DEMONHUNTER: 'decks.finder.classDemonHunter',
  DRUID: 'decks.finder.classDruid',
  HUNTER: 'decks.finder.classHunter',
  MAGE: 'decks.finder.classMage',
  PALADIN: 'decks.finder.classPaladin',
  PRIEST: 'decks.finder.classPriest',
  ROGUE: 'decks.finder.classRogue',
  SHAMAN: 'decks.finder.classShaman',
  WARLOCK: 'decks.finder.classWarlock',
  WARRIOR: 'decks.finder.classWarrior',
  NEUTRAL: 'decks.finder.classNeutral',
};

const CLASS_ICON_STYLES: Record<HeroClass, string> = {
  DEATHKNIGHT: 'bg-class-deathknight/15 text-class-deathknight border-class-deathknight/35',
  DEMONHUNTER: 'bg-class-demonhunter/15 text-class-demonhunter border-class-demonhunter/35',
  DRUID: 'bg-class-druid/15 text-class-druid border-class-druid/35',
  HUNTER: 'bg-class-hunter/15 text-class-hunter border-class-hunter/35',
  MAGE: 'bg-class-mage/15 text-class-mage border-class-mage/35',
  PALADIN: 'bg-class-paladin/15 text-class-paladin border-class-paladin/35',
  PRIEST: 'bg-class-priest/15 text-class-priest border-class-priest/35',
  ROGUE: 'bg-class-rogue/15 text-class-rogue border-class-rogue/35',
  SHAMAN: 'bg-class-shaman/15 text-class-shaman border-class-shaman/35',
  WARLOCK: 'bg-class-warlock/15 text-class-warlock border-class-warlock/35',
  WARRIOR: 'bg-class-warrior/15 text-class-warrior border-class-warrior/35',
  NEUTRAL: 'bg-class-neutral/15 text-class-neutral border-class-neutral/35',
};

const FORMAT_OPTIONS: Format[] = ['Standard', 'Wild', 'Classic', 'Twist'];

const FORMAT_LABEL_KEYS: Record<Format, string> = {
  Standard: 'decks.list.formats.standard',
  Wild: 'decks.list.formats.wild',
  Classic: 'decks.list.formats.classic',
  Twist: 'decks.list.formats.twist',
};

const SYNC_SOURCE_LABEL_KEYS: Record<string, string> = {
  live: 'decks.list.sync.sourceLive',
  unavailable: 'decks.list.sync.sourceUnavailable',
  'not-ready': 'decks.list.sync.sourceNotReady',
  error: 'decks.list.sync.sourceError',
};

type ClassFilter = 'ALL' | HeroClass;
type FormatFilter = 'ALL' | Format;
type SourceFilter = 'ALL' | DeckSource;
type CopyState = 'idle' | 'copied' | 'error';

type ManualSyncStatus = {
  ok: boolean;
  source: string;
  synced: number;
  skippedNonCollectible: number;
  skippedUnknownClass: number;
  finishedAt: number;
};

function getClassLabel(t: TFunction, heroClass: HeroClass): string {
  return t(CLASS_LABEL_KEYS[heroClass]);
}

function getClassAbbreviation(t: TFunction, heroClass: HeroClass): string {
  const label = getClassLabel(t, heroClass);
  const parts = label.split(/\s+/).filter(Boolean);
  if (parts.length > 1) {
    return parts
      .map((part) => part[0] ?? '')
      .join('')
      .slice(0, 2)
      .toUpperCase();
  }
  return Array.from(label).slice(0, 2).join('').toUpperCase();
}

function getFormatLabel(t: TFunction, format: Format): string {
  return t(FORMAT_LABEL_KEYS[format]);
}

function getDeckSourceLabel(t: TFunction, source: DeckSource): string {
  return source === 'hearthstone-live'
    ? t('decks.list.row.sourceLive')
    : t('decks.list.row.sourceManual');
}

function getSyncSourceLabel(t: TFunction, source: string): string {
  const key = SYNC_SOURCE_LABEL_KEYS[source];
  return key === undefined ? t('generic.unknown') : t(key);
}

function ClassIcon({ heroClass }: { heroClass: HeroClass }): ReactElement {
  const { t } = useTranslation();
  return (
    <div
      className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold border ${CLASS_ICON_STYLES[heroClass]}`}
      aria-hidden="true"
    >
      {getClassAbbreviation(t, heroClass)}
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

function getDeckSource(deck: Pick<DeckSummary, 'source'>): DeckSource {
  return deck.source ?? 'manual';
}

function formatTimestamp(value: number, locale: string): string {
  if (value <= 0) return '-';
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function cardName(card: DeckCard, defs: Map<string, CardDef | null>): string {
  return defs.get(card.cardId)?.name ?? card.cardId;
}

function cardCost(card: DeckCard, defs: Map<string, CardDef | null>): number {
  const cost = defs.get(card.cardId)?.cost;
  return typeof cost === 'number' && Number.isFinite(cost) ? Math.max(0, cost) : 0;
}

function rarityWeight(def: CardDef | null | undefined): number {
  switch (def?.rarity) {
    case 'LEGENDARY':
      return 5;
    case 'EPIC':
      return 4;
    case 'RARE':
      return 3;
    case 'COMMON':
      return 2;
    case 'FREE':
      return 1;
    default:
      return 0;
  }
}

function sortDeckCards(cards: readonly DeckCard[], defs: Map<string, CardDef | null>): DeckCard[] {
  return [...cards].sort((a, b) => {
    const costDelta = cardCost(a, defs) - cardCost(b, defs);
    if (costDelta !== 0) return costDelta;
    return cardName(a, defs).localeCompare(cardName(b, defs));
  });
}

function selectKeyCards(cards: readonly DeckCard[], defs: Map<string, CardDef | null>): DeckCard[] {
  return [...cards]
    .sort((a, b) => {
      const rarityDelta = rarityWeight(defs.get(b.cardId)) - rarityWeight(defs.get(a.cardId));
      if (rarityDelta !== 0) return rarityDelta;
      const costDelta = cardCost(b, defs) - cardCost(a, defs);
      if (costDelta !== 0) return costDelta;
      return cardName(a, defs).localeCompare(cardName(b, defs));
    })
    .slice(0, 6);
}

function buildManaCurve(cards: readonly DeckCard[], defs: Map<string, CardDef | null>): number[] {
  const curve = Array.from({ length: 8 }, () => 0);
  for (const card of cards) {
    const bucket = Math.min(7, Math.floor(cardCost(card, defs)));
    curve[bucket] = (curve[bucket] ?? 0) + card.count;
  }
  return curve;
}

function averageCost(cards: readonly DeckCard[], defs: Map<string, CardDef | null>): string {
  const totalCards = cards.reduce((sum, card) => sum + card.count, 0);
  if (totalCards === 0) return '-';
  const totalCost = cards.reduce((sum, card) => sum + cardCost(card, defs) * card.count, 0);
  return (totalCost / totalCards).toFixed(1);
}

function SourceBadge({ source }: { source: DeckSource }): ReactElement {
  const { t } = useTranslation();
  const isLive = source === 'hearthstone-live';
  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-[11px] font-semibold ${
        isLive ? 'bg-green/15 text-green' : 'bg-overlay-elevated text-text-dim'
      }`}
    >
      {getDeckSourceLabel(t, source)}
    </span>
  );
}

function ManaCurve({
  cards,
  defs,
}: {
  cards: readonly DeckCard[];
  defs: Map<string, CardDef | null>;
}): ReactElement {
  const { t } = useTranslation();
  const curve = buildManaCurve(cards, defs);
  const max = Math.max(1, ...curve);

  return (
    <div>
      <div className="text-xs font-semibold text-text mb-3">
        {t('decks.list.row.manaCurve')}
      </div>
      <div
        className="grid grid-cols-8 gap-2 items-end h-24"
        role="img"
        aria-label={t('decks.list.row.manaCurve')}
      >
        {curve.map((value, index) => (
          <div key={index} className="flex h-full flex-col items-center justify-end gap-1">
            <div className="text-[11px] text-text-dim">{value}</div>
            <div className="w-full h-16 flex items-end">
              <div
                className="w-full rounded-sm bg-accent"
                style={{ height: `${Math.max(8, Math.round((value / max) * 64))}px` }}
              />
            </div>
            <div className="text-[11px] text-text-mute">{index === 7 ? '7+' : index}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DeckCardList({
  title,
  cards,
  defs,
  emptyLabel,
}: {
  title: string;
  cards: readonly DeckCard[];
  defs: Map<string, CardDef | null>;
  emptyLabel: string;
}): ReactElement {
  const sorted = sortDeckCards(cards, defs);
  return (
    <div>
      <div className="text-xs font-semibold text-text mb-2">{title}</div>
      {sorted.length === 0 ? (
        <div className="text-sm text-text-dim py-3">{emptyLabel}</div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-1">
          {sorted.map((card) => (
            <div
              key={card.cardId}
              className="min-w-0 flex items-center gap-2 rounded bg-overlay-input border border-border px-2 py-1.5 text-sm"
            >
              <span className="w-5 h-5 rounded bg-accent text-bg text-[11px] font-bold flex items-center justify-center">
                {cardCost(card, defs)}
              </span>
              <span className="flex-1 min-w-0 truncate text-text">{cardName(card, defs)}</span>
              <span className="text-xs text-text-dim">x{card.count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DeckDetailPanel({
  deck,
  detail,
  defs,
  loading,
  error,
  copyState,
  onCopyCode,
  onExport,
}: {
  deck: DeckSummary;
  detail: DeckDetail | null;
  defs: Map<string, CardDef | null>;
  loading: boolean;
  error: string | null;
  copyState: CopyState;
  onCopyCode: () => void;
  onExport: (id: string) => void;
}): ReactElement {
  const { locale, t } = useTranslation();
  const cards = detail?.cards ?? [];
  const keyCards = selectKeyCards(cards, defs);
  const totalCards = cards.reduce((sum, card) => sum + card.count, 0);

  if (loading && detail === null) {
    return (
      <div className="border-t border-border px-4 py-5 text-sm text-text-dim">
        {t('decks.list.row.loading')}
      </div>
    );
  }

  if (error !== null) {
    return (
      <div className="border-t border-border px-4 py-5 text-sm text-red">
        {t('decks.list.row.loadFailed')}
      </div>
    );
  }

  if (detail === null) {
    return (
      <div className="border-t border-border px-4 py-5 text-sm text-text-dim">
        {t('decks.list.row.noPreview')}
      </div>
    );
  }

  return (
    <div className="border-t border-border px-4 pb-4 pt-3">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-4">
        <div className="rounded bg-overlay-input border border-border p-3">
          <div className="text-[11px] uppercase text-text-mute">
            {t('decks.list.row.totalCards')}
          </div>
          <div className="mt-1 text-lg font-bold text-text">{totalCards}</div>
        </div>
        <div className="rounded bg-overlay-input border border-border p-3">
          <div className="text-[11px] uppercase text-text-mute">
            {t('decks.list.row.uniqueCards')}
          </div>
          <div className="mt-1 text-lg font-bold text-text">{cards.length}</div>
        </div>
        <div className="rounded bg-overlay-input border border-border p-3">
          <div className="text-[11px] uppercase text-text-mute">
            {t('decks.list.row.avgCost')}
          </div>
          <div className="mt-1 text-lg font-bold text-text">{averageCost(cards, defs)}</div>
        </div>
        <div className="rounded bg-overlay-input border border-border p-3">
          <div className="text-[11px] uppercase text-text-mute">
            {t('decks.list.row.updated')}
          </div>
          <div className="mt-1 text-sm font-semibold text-text">
            {formatTimestamp(deck.updatedAt, locale)}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[360px_1fr] gap-4">
        <div className="space-y-4">
          <ManaCurve cards={cards} defs={defs} />
          <DeckCardList
            title={t('decks.list.row.keyCards')}
            cards={keyCards}
            defs={defs}
            emptyLabel={t('decks.list.row.noCards')}
          />
        </div>
        <div className="space-y-3">
          <DeckCardList
            title={t('decks.list.row.cards')}
            cards={cards}
            defs={defs}
            emptyLabel={t('decks.list.row.noCards')}
          />
          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onCopyCode}
              className="px-3 py-2 rounded bg-overlay-elevated hover:bg-border-hi text-text text-sm inline-flex items-center gap-2"
            >
              <Copy size={15} />
              {copyState === 'copied'
                ? t('decks.list.row.copied')
                : copyState === 'error'
                  ? t('decks.list.row.copyFailed')
                  : t('decks.list.row.copyCode')}
            </button>
            <button
              type="button"
              onClick={() => onExport(deck.id)}
              className="px-3 py-2 rounded bg-overlay-elevated hover:bg-border-hi text-text text-sm"
            >
              {t('decks.list.row.export')}
            </button>
          </div>
        </div>
      </div>
    </div>
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
  const { locale, t } = useTranslation();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<DeckDetail | null>(null);
  const [defs, setDefs] = useState<Map<string, CardDef | null>>(() => new Map());
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<CopyState>('idle');

  useEffect(() => {
    if (!expanded) return;
    let alive = true;
    setLoadingDetail(true);
    setDetailError(null);

    void (async () => {
      try {
        const loaded = await window.hdt.decks.getById(deck.id);
        if (!alive) return;
        if (loaded === null) {
          setDetail(null);
          setDefs(new Map());
          setDetailError('not-found');
          return;
        }

        const uniqueCardIds = Array.from(new Set(loaded.cards.map((card) => card.cardId)));
        const entries = await Promise.all(
          uniqueCardIds.map(async (cardId) => {
            const def = await window.hdt.cards.findById(cardId, locale);
            return [cardId, def] as const;
          }),
        );
        if (!alive) return;
        setDetail(loaded);
        setDefs(new Map(entries));
      } catch (err) {
        if (alive) {
          console.error('[decks-list] failed to load deck detail', err);
          setDetailError('failed');
        }
      } finally {
        if (alive) setLoadingDetail(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [deck.id, deck.updatedAt, deck.version, expanded, locale]);

  const handleCopyDeckCode = async (): Promise<void> => {
    try {
      const code = await window.hdt.decks.exportDeckstring(deck.id);
      if (navigator.clipboard?.writeText === undefined) {
        throw new Error('clipboard unavailable');
      }
      await navigator.clipboard.writeText(code);
      setCopyState('copied');
      window.setTimeout(() => setCopyState('idle'), 1500);
    } catch (err) {
      console.error('[decks-list] failed to copy deck code', err);
      setCopyState('error');
      window.setTimeout(() => setCopyState('idle'), 1500);
    }
  };

  const source = getDeckSource(deck);

  return (
    <div
      className="bg-overlay-surface border border-border hover:border-border-hi rounded-md overflow-hidden"
      data-testid={`deck-row-${deck.id}`}
    >
      <div className="flex items-center gap-3 p-3">
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-label={expanded ? t('decks.list.row.collapse') : t('decks.list.row.expand')}
          className="p-1 rounded hover:bg-overlay-elevated text-text-dim hover:text-text"
        >
          {expanded ? <ChevronDown size={17} /> : <ChevronRight size={17} />}
        </button>
        <ClassIcon heroClass={deck.class} />
        <div className="flex-1 min-w-0">
          <div className="text-text font-medium truncate flex items-center gap-2">
            <span className="truncate">{deck.name || t('deckSelect.unnamedDeck')}</span>
            <span className="text-xs text-text-dim font-normal">
              {t('decks.list.row.version', { version: deck.version })}
            </span>
            <SourceBadge source={source} />
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-dim mt-1">
            <span>
              {getClassLabel(t, deck.class)} · {getFormatLabel(t, deck.format)}
            </span>
            <span>
              {t('decks.list.row.updated')}: {formatTimestamp(deck.updatedAt, locale)}
            </span>
            {deck.liveDeckId !== undefined && deck.liveDeckId !== null ? (
              <span>
                {t('decks.list.row.liveId')}: {deck.liveDeckId}
              </span>
            ) : null}
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
      </div>

      {expanded ? (
        <DeckDetailPanel
          deck={deck}
          detail={detail}
          defs={defs}
          loading={loadingDetail}
          error={detailError}
          copyState={copyState}
          onCopyCode={() => {
            void handleCopyDeckCode();
          }}
          onExport={onExport}
        />
      ) : null}

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

function SyncDecksButton({
  syncing,
  onClick,
}: {
  syncing: boolean;
  onClick: () => void;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={syncing}
      data-testid="manual-deck-sync-button"
      aria-label={t('decks.list.sync.ariaLabel')}
      className="px-4 py-2 bg-overlay-elevated hover:bg-border-hi disabled:opacity-60 disabled:cursor-not-allowed text-text text-sm font-medium rounded inline-flex items-center gap-2"
    >
      <RefreshCw size={16} className={syncing ? 'animate-spin' : ''} />
      {syncing ? t('decks.list.sync.syncing') : t('decks.list.sync.button')}
    </button>
  );
}

function FilterSelect({
  value,
  onChange,
  children,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  label: string;
}): ReactElement {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.currentTarget.value)}
      className="h-9 rounded border border-border bg-overlay-input px-3 text-sm text-text outline-none hover:border-border-hi"
    >
      {children}
    </select>
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
  const { locale, t } = useTranslation();
  const [manualSyncing, setManualSyncing] = useState(false);
  const [lastSyncStatus, setLastSyncStatus] = useState<ManualSyncStatus | null>(null);
  const [query, setQuery] = useState('');
  const [classFilter, setClassFilter] = useState<ClassFilter>('ALL');
  const [formatFilter, setFormatFilter] = useState<FormatFilter>('ALL');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('ALL');

  const filteredDecks = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return decks.filter((deck) => {
      const source = getDeckSource(deck);
      const matchesQuery =
        normalizedQuery.length === 0 ||
        deck.name.toLowerCase().includes(normalizedQuery) ||
        getClassLabel(t, deck.class).toLowerCase().includes(normalizedQuery) ||
        deck.class.toLowerCase().includes(normalizedQuery) ||
        getFormatLabel(t, deck.format).toLowerCase().includes(normalizedQuery) ||
        deck.format.toLowerCase().includes(normalizedQuery) ||
        getDeckSourceLabel(t, source).toLowerCase().includes(normalizedQuery) ||
        String(deck.liveDeckId ?? '').includes(normalizedQuery);
      return (
        matchesQuery &&
        (classFilter === 'ALL' || deck.class === classFilter) &&
        (formatFilter === 'ALL' || deck.format === formatFilter) &&
        (sourceFilter === 'ALL' || source === sourceFilter)
      );
    });
  }, [classFilter, decks, formatFilter, query, sourceFilter, t]);

  const grouped = useMemo(() => {
    const map = new Map<HeroClass, DeckSummary[]>();
    for (const d of filteredDecks) {
      const list = map.get(d.class) ?? [];
      list.push(d);
      map.set(d.class, list);
    }
    return CLASS_ORDER.filter((c) => map.has(c)).map((c) => ({
      class: c,
      decks: map.get(c) ?? [],
    }));
  }, [filteredDecks]);

  const onDelete = async (id: string): Promise<void> => {
    await window.hdt.decks.delete(id);
    await refresh();
  };

  const onDuplicate = async (id: string): Promise<void> => {
    await window.hdt.decks.duplicate(id);
    await refresh();
  };

  const handleManualSync = async (): Promise<void> => {
    if (manualSyncing) return;
    setManualSyncing(true);
    const startedAt = Date.now();
    console.log('[decks-sync:manual] start');
    try {
      const syncResult = await window.hdt.decks.syncFromLive();
      setLastSyncStatus(syncResult);
      console.log('[decks-sync:manual] sync result', syncResult);
      const refreshed = await refresh();
      console.log('[decks-sync:manual] refreshed decks', {
        count: refreshed.length,
        decks: refreshed.map((deck) => ({
          id: deck.id,
          name: deck.name,
          class: deck.class,
          format: deck.format,
          cardCount: deck.cardCount,
        })),
      });
    } catch (err) {
      console.error('[decks-sync:manual] failed', err);
    } finally {
      console.log('[decks-sync:manual] elapsed', Date.now() - startedAt, 'ms');
      setManualSyncing(false);
    }
  };

  if (decks.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center h-full min-h-0 overflow-y-auto p-12 text-text"
        data-testid="decks-empty-state"
      >
        <h2 className="text-xl font-semibold text-text mb-2">{t('decks.list.empty.title')}</h2>
        <div className="flex gap-3 mt-4">
          <SyncDecksButton syncing={manualSyncing} onClick={() => { void handleManualSync(); }} />
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
    <div className="p-6 overflow-y-auto h-full min-h-0">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-text">{t('decks.list.title')}</h1>
          <div className="mt-1 text-xs text-text-dim">
            {t('decks.list.filters.count', {
              shown: filteredDecks.length,
              total: decks.length,
            })}
            {lastSyncStatus !== null ? (
              <span className="ml-3">
                {t('decks.list.sync.lastResult', {
                  synced: lastSyncStatus.synced,
                  skipped:
                    lastSyncStatus.skippedNonCollectible + lastSyncStatus.skippedUnknownClass,
                  source: getSyncSourceLabel(t, lastSyncStatus.source),
                  time: formatTimestamp(lastSyncStatus.finishedAt, locale),
                })}
              </span>
            ) : null}
          </div>
        </div>
        <SyncDecksButton syncing={manualSyncing} onClick={() => { void handleManualSync(); }} />
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[240px] flex-1">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-text-mute"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            aria-label={t('decks.list.filters.searchLabel')}
            placeholder={t('decks.list.filters.searchPlaceholder')}
            className="h-9 w-full rounded border border-border bg-overlay-input pl-9 pr-3 text-sm text-text outline-none placeholder:text-text-mute hover:border-border-hi focus:border-accent"
          />
        </div>
        <FilterSelect
          value={classFilter}
          onChange={(value) => setClassFilter(value as ClassFilter)}
          label={t('decks.list.filters.classLabel')}
        >
          <option value="ALL">{t('decks.list.filters.allClasses')}</option>
          {CLASS_ORDER.filter((heroClass) => heroClass !== 'NEUTRAL').map((heroClass) => (
            <option key={heroClass} value={heroClass}>
              {getClassLabel(t, heroClass)}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect
          value={formatFilter}
          onChange={(value) => setFormatFilter(value as FormatFilter)}
          label={t('decks.list.filters.formatLabel')}
        >
          <option value="ALL">{t('decks.list.filters.allFormats')}</option>
          {FORMAT_OPTIONS.map((format) => (
            <option key={format} value={format}>
              {getFormatLabel(t, format)}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect
          value={sourceFilter}
          onChange={(value) => setSourceFilter(value as SourceFilter)}
          label={t('decks.list.filters.sourceLabel')}
        >
          <option value="ALL">{t('decks.list.filters.allSources')}</option>
          <option value="hearthstone-live">{t('decks.list.row.sourceLive')}</option>
          <option value="manual">{t('decks.list.row.sourceManual')}</option>
        </FilterSelect>
      </div>

      {filteredDecks.length === 0 ? (
        <div className="rounded-md border border-border bg-overlay-surface px-4 py-8 text-center text-sm text-text-dim">
          {t('decks.list.filters.noResults')}
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(({ class: heroClass, decks: rows }) => (
            <section key={heroClass} data-testid={`group-${heroClass}`}>
              <h2 className="text-sm font-semibold text-text-dim uppercase tracking-wider mb-2">
                {getClassLabel(t, heroClass)}
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
      )}
    </div>
  );
}
