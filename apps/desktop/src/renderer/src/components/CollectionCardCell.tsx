import { useEffect, useState } from 'react';
import type { CardDef } from '@hdt/hearthdb';
import { dustValueForRarity, maxCopiesForRarity } from '@hdt/core';

import { useTranslation } from '../i18n';

interface CollectionCardCellProps {
  card: CardDef;
  ownedCount: number;
}

export function CollectionCardCell({ card, ownedCount }: CollectionCardCellProps) {
  const { t } = useTranslation();
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (typeof window === 'undefined' || !window.hdt?.cardImages?.get) return;
    void window.hdt.cardImages
      .get(card.id)
      .then((res) => {
        if (cancelled) return;
        setImageUrl(res?.url ?? null);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [card.id]);

  const rarity = card.rarity ?? 'FREE';
  const max = maxCopiesForRarity(rarity);
  const dust = dustValueForRarity(rarity);
  const isOwnedFull = ownedCount >= max;
  const isUnowned = ownedCount === 0;

  const badgeColor = isOwnedFull
    ? 'text-green'
    : isUnowned
      ? 'text-red'
      : 'text-amber';

  return (
    <div className="flex flex-col gap-2">
      <div className="relative rounded-xl overflow-hidden bg-overlay-surface aspect-[5/6]">
        <img
          data-testid="cell-image"
          src={imageUrl ?? ''}
          alt={card.name}
          loading="lazy"
          className="w-full h-full object-cover"
        />
      </div>
      <div className="flex items-center justify-between px-1">
        <span
          data-testid="cell-owned-badge"
          className={`font-semibold text-xs ${badgeColor}`}
        >
          {t('collection.card.ownedBadge', { owned: ownedCount, max })}
        </span>
        <div className="flex items-center gap-1.5">
          <span
            className="inline-block w-2 h-2 bg-[#22D3EE] rotate-45"
            aria-hidden
          />
          <span
            data-testid="cell-dust-value"
            className="text-xs text-text-secondary font-medium tabular-nums"
          >
            {dust}
          </span>
        </div>
      </div>
    </div>
  );
}
