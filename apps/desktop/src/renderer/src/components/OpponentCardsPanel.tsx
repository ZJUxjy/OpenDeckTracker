import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { OpponentCardRecord, OpponentDeckPrediction } from '@hdt/core';
import type { CardDef } from '@hdt/hearthdb';
import { clsx } from 'clsx';
import { useCardPreview } from '../hooks/use-card-preview';
import { useCardTileUrl } from '../hooks/use-card-image-url';
import { useHearthMirrorStatus } from '../hooks/use-hearthmirror-status';
import { useLocale, useTranslation } from '../i18n';
import { OpponentDeckPredictionSection } from './OpponentDeckPredictionSection';

const NAME_TEXT_SHADOW: CSSProperties = { textShadow: '0 1px 2px rgba(0,0,0,0.7)' };

// Mask the portrait's left edge into transparency so it blends smoothly
// with the row background. White compositing borders are stripped at
// cache time (see trimWhiteBorders in main/card-image-cache.ts) — no
// scale-transform needed here.
const ART_MASK_STYLE: CSSProperties = {
  maskImage: 'linear-gradient(to right, transparent 0%, black 55%, black 100%)',
  WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 55%, black 100%)',
};

interface OpponentCardsPanelProps {
  revealed: OpponentCardRecord[];
  graveyard: OpponentCardRecord[];
  /** Total board attack on the opposing side; rendered in the header. */
  boardAttack?: number;
  /**
   * Maximum damage the opposing side can land on the friendly hero this
   * turn under an optimal attack assignment (taunts + divine shields
   * factored in). Defaults to `boardAttack` so the legacy renderer path
   * keeps showing matching numbers when overlay info is missing.
   */
  faceDamage?: number;
  /** Friendly hero health + armor, used to color opposing board attack. */
  targetEffectiveHealth?: number | null;
}

interface CardDisplayDef {
  name: string;
  cost?: number;
  rarity?: string;
}

interface GroupedOpponentCard {
  cardId: string;
  count: number;
  order: number;
}

export function OpponentCardsPanel({
  revealed,
  graveyard,
  boardAttack = 0,
  faceDamage,
  targetEffectiveHealth = null,
}: OpponentCardsPanelProps) {
  const resolvedFaceDamage = faceDamage ?? boardAttack;
  const { t } = useTranslation();
  const cardIds = useMemo(
    () => [...new Set([...revealed, ...graveyard].map((record) => record.cardId))],
    [revealed, graveyard],
  );
  const defs = useOpponentCardDefs(cardIds);
  const revealedGroups = useMemo(() => groupRecords(revealed), [revealed]);
  const graveyardGroups = useMemo(() => groupRecords(graveyard), [graveyard]);
  const isEmpty = revealedGroups.length === 0 && graveyardGroups.length === 0;
  const { isAlive } = useHearthMirrorStatus();
  // Mirror the LiveDeckPanel behaviour: if the game isn't running and
  // there's nothing to show, surface that explicitly so the panel
  // doesn't look broken on a fresh launch with no game.
  const emptyMessage = isEmpty
    ? isAlive
      ? t('opponent.empty')
      : t('deckTracker.hearthstoneNotRunning')
    : '';
  const { onRowEnter, onRowLeave } = useCardPreview();
  const handleRowMouseEnter = useCallback(
    (cardId: string, el: HTMLDivElement) => onRowEnter(cardId, el),
    [onRowEnter],
  );
  const handleRowMouseLeave = useCallback(() => onRowLeave(), [onRowLeave]);

  // Opponent deck prediction: subscribe to push updates and seed with one
  // initial fetch so a freshly-mounted panel doesn't wait for the next
  // tick. Cleared back to [] on every snapshot push that has no opponent
  // observations (handled by main-side `computePredictions`).
  const [predictions, setPredictions] = useState<readonly OpponentDeckPrediction[]>([]);
  useEffect(() => {
    let cancelled = false;
    void window.hdt.opponentDeckPrediction?.get().then((result) => {
      if (!cancelled) setPredictions(result);
    });
    const off = window.hdt.opponentDeckPrediction?.onUpdate?.((updated) => {
      setPredictions(updated);
    });
    return () => {
      cancelled = true;
      off?.();
    };
  }, []);
  const excludedCreatedCount = useMemo(
    () => revealed.filter((r) => r.created).length,
    [revealed],
  );

  return (
    <aside className="w-full bg-bg-2 border border-border flex flex-col h-full shrink-0 shadow-xl rounded-lg overflow-hidden">
      <div
        className="bg-bg-2 p-3 border-b border-border cursor-move"
        style={{ WebkitAppRegion: 'drag' } as CSSProperties}
      >
        <div className="text-xs text-text-dim font-semibold uppercase tracking-wider mb-1">
          {t('opponent.title')}
        </div>
        <div className="text-text font-bold text-sm">{t('opponent.revealed')}</div>
        <OpponentBoardAttackSummary
          attack={boardAttack}
          faceDamage={resolvedFaceDamage}
          targetEffectiveHealth={targetEffectiveHealth}
        />
      </div>

      <div className="flex-1 overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
        <div className="space-y-3">
          <OpponentDeckPredictionSection
            predictions={predictions}
            excludedCount={excludedCreatedCount}
            observedCount={revealed.length}
          />
          {isEmpty ? (
            <div className="h-full flex items-center justify-center text-text-mute text-sm px-4 text-center">
              {emptyMessage}
            </div>
          ) : (
            <>
              <OpponentCardSection
                title={t('opponent.played')}
                cards={revealedGroups}
                defs={defs}
                onMouseEnter={handleRowMouseEnter}
                onMouseLeave={handleRowMouseLeave}
              />
              <OpponentCardSection
                title={t('opponent.graveyard')}
                cards={graveyardGroups}
                defs={defs}
                onMouseEnter={handleRowMouseEnter}
                onMouseLeave={handleRowMouseLeave}
              />
            </>
          )}
        </div>
      </div>
    </aside>
  );
}

function OpponentBoardAttackSummary({
  attack,
  faceDamage,
  targetEffectiveHealth,
}: {
  attack: number;
  faceDamage: number;
  targetEffectiveHealth: number | null;
}) {
  const { t } = useTranslation();
  const hasTarget = targetEffectiveHealth !== null;
  // Lethal coloring tracks face damage — that is what actually compares
  // against the friendly hero's HP after my taunts/divine shields.
  const isLethal = hasTarget && faceDamage >= targetEffectiveHealth;
  const isShort = hasTarget && faceDamage < targetEffectiveHealth;
  const toneClass = isLethal
    ? 'border-red/40 bg-red/15 text-red shadow-sm'
    : isShort
      ? 'border-green/40 bg-green/15 text-green shadow-sm'
      : 'border-accent/30 bg-accent-dim/20 text-accent';
  const isInformationalChip = faceDamage === attack;

  return (
    <div
      data-testid="opposing-board-attack-card"
      className={clsx('mt-3 rounded border px-3 py-2', toneClass)}
      title={t('boardAttack.hint')}
    >
      <div className="text-[11px] font-bold uppercase tracking-wider">
        {t('boardAttack.opposing')}
      </div>
      <div className="mt-1 flex items-end justify-between gap-3">
        <span
          data-testid="opposing-board-attack-value"
          className="font-mono text-3xl font-black leading-none tabular-nums"
        >
          {attack}
        </span>
        <span
          className={clsx(
            'inline-flex items-baseline gap-1.5 rounded-md border border-current/30 bg-current/10 px-2 py-1',
            isInformationalChip ? 'opacity-75' : 'opacity-100',
          )}
          title={t('boardAttack.faceHint')}
        >
          <span className="text-[10px] font-bold uppercase tracking-wider opacity-80">
            {t('boardAttack.face')}
          </span>
          <span
            data-testid="opposing-face-damage-value"
            className="font-mono text-base font-black leading-none tabular-nums"
          >
            {faceDamage}
          </span>
          {hasTarget ? (
            <span className="font-mono text-[11px] font-bold tabular-nums opacity-70">
              / {targetEffectiveHealth}
            </span>
          ) : null}
        </span>
      </div>
    </div>
  );
}

function OpponentCardSection({
  title,
  cards,
  defs,
  onMouseEnter,
  onMouseLeave,
}: {
  title: string;
  cards: GroupedOpponentCard[];
  defs: Map<string, CardDisplayDef>;
  onMouseEnter: (cardId: string, el: HTMLDivElement) => void;
  onMouseLeave: () => void;
}) {
  if (cards.length === 0) return null;

  return (
    <section>
      <h3 className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wider text-text-mute">
        {title}
      </h3>
      <div className="space-y-1">
        {cards.map((card) => {
          const def = defs.get(card.cardId);
          const rarity = (def?.rarity ?? '').toLowerCase();
          return (
            <OpponentCardRow
              key={card.cardId}
              card={card}
              def={def}
              rarity={rarity}
              onMouseEnter={onMouseEnter}
              onMouseLeave={onMouseLeave}
            />
          );
        })}
      </div>
    </section>
  );
}

function OpponentCardRow({
  card,
  def,
  rarity,
  onMouseEnter,
  onMouseLeave,
}: {
  card: GroupedOpponentCard;
  def: CardDisplayDef | undefined;
  rarity: string;
  onMouseEnter: (cardId: string, el: HTMLDivElement) => void;
  onMouseLeave: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const tileUrl = useCardTileUrl(card.cardId);

  return (
    <div
      ref={ref}
      data-testid="opponent-card-row"
      className="relative overflow-hidden rounded text-sm border-b border-border last:border-b-0 transition-colors hover:bg-bg-3 hover:shadow-[inset_3px_0_0_var(--accent)]"
      onMouseEnter={() => ref.current && onMouseEnter(card.cardId, ref.current)}
      onMouseLeave={onMouseLeave}
    >
      <img
        src={tileUrl}
        data-testid="card-row-art"
        alt=""
        aria-hidden
        style={ART_MASK_STYLE}
        className="absolute right-0 top-0 h-full w-3/5 object-cover object-right pointer-events-none select-none z-0"
      />
      <div className="relative z-10 flex items-center px-2 py-1.5 w-full">
        <div className="w-7 h-7 rounded bg-red/15 flex items-center justify-center text-red font-bold text-xs shrink-0">
          {def?.cost ?? 0}
        </div>
        <div className="flex-1 min-w-0 px-2">
          <div
            className={clsx(
              'truncate font-medium',
              rarity === 'legendary' ? 'text-rarity-legendary' : '',
              rarity === 'epic' ? 'text-rarity-epic' : '',
              rarity === 'rare' ? 'text-rarity-rare' : '',
              rarity === 'common' || rarity === 'free' || rarity === '' ? 'text-text' : '',
            )}
            style={NAME_TEXT_SHADOW}
            title={card.cardId}
          >
            {def?.name ?? card.cardId}
          </div>
        </div>
        {card.count > 1 && (
          <div className="text-xs text-text font-bold shrink-0">x{card.count}</div>
        )}
      </div>
    </div>
  );
}

function groupRecords(records: OpponentCardRecord[]): GroupedOpponentCard[] {
  const groups = new Map<string, GroupedOpponentCard>();
  for (const record of records) {
    const existing = groups.get(record.cardId);
    if (existing) {
      existing.count += 1;
      existing.order = Math.min(existing.order, record.order);
    } else {
      groups.set(record.cardId, {
        cardId: record.cardId,
        count: 1,
        order: record.order,
      });
    }
  }
  return [...groups.values()].sort((a, b) => a.order - b.order || a.cardId.localeCompare(b.cardId));
}

function toCardDisplayDef(def: CardDef): CardDisplayDef {
  return {
    name: def.name,
    ...(def.cost !== undefined ? { cost: def.cost } : {}),
    ...(def.rarity !== undefined ? { rarity: def.rarity } : {}),
  };
}

function useOpponentCardDefs(cardIds: string[]): Map<string, CardDisplayDef> {
  const locale = useLocale();
  const [defs, setDefs] = useState<Map<string, CardDisplayDef>>(() => new Map());

  useEffect(() => {
    let alive = true;
    const ids = [...cardIds].sort((a, b) => a.localeCompare(b));
    const api = window.hdt?.cards;

    if (!api || ids.length === 0) {
      setDefs(new Map(ids.map((id) => [id, { name: id }])));
      return () => {
        alive = false;
      };
    }

    void Promise.all(ids.map(async (id) => [id, await api.findById(id, locale)] as const)).then(
      (rows) => {
        if (!alive) return;
        const next = new Map<string, CardDisplayDef>();
        for (const [id, def] of rows) {
          next.set(id, def ? toCardDisplayDef(def) : { name: id });
        }
        setDefs(next);
      },
    );

    return () => {
      alive = false;
    };
  }, [cardIds, locale]);

  return defs;
}
