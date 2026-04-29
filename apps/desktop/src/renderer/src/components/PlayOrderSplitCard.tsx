import type { ReactElement } from 'react';
import type { PlayOrderBucket, PlayOrderSplit } from '@hdt/core';

import { useTranslation } from '../i18n';

export interface PlayOrderSplitCardProps {
  split: PlayOrderSplit | null | undefined;
}

function fmtPercent(winrate: number | null): string {
  return winrate === null ? '—' : `${Math.round(winrate)}%`;
}

function Bucket({
  label,
  bucket,
  testid,
}: {
  label: string;
  bucket: PlayOrderBucket;
  testid: string;
}): ReactElement {
  return (
    <div
      className="flex-1 bg-[#14141A] border border-[#2A2A35] rounded-lg p-4"
      data-testid={testid}
    >
      <div className="text-xs text-slate-400 uppercase tracking-wider mb-1">{label}</div>
      <div className="text-2xl font-black text-white">{fmtPercent(bucket.winrate)}</div>
      <div className="text-xs text-slate-400 mt-1">
        {bucket.wins} - {bucket.losses}
      </div>
    </div>
  );
}

export function PlayOrderSplitCard({ split }: PlayOrderSplitCardProps): ReactElement {
  const { t } = useTranslation();
  const safeSplit: PlayOrderSplit = split ?? {
    first: { wins: 0, losses: 0, winrate: null },
    coin: { wins: 0, losses: 0, winrate: null },
    unknown: { wins: 0, losses: 0, winrate: null },
  };
  const showUnknown = safeSplit.unknown.wins + safeSplit.unknown.losses > 0;

  return (
    <div data-testid="play-order-split">
      <h3 className="text-sm font-bold text-white mb-3">{t('stats.playOrder.title')}</h3>
      <div className="flex gap-3">
        <Bucket
          label={t('stats.playOrder.first')}
          bucket={safeSplit.first}
          testid="play-order-first"
        />
        <Bucket label={t('stats.playOrder.coin')} bucket={safeSplit.coin} testid="play-order-coin" />
        {showUnknown && (
          <Bucket
            label={t('stats.playOrder.unknown')}
            bucket={safeSplit.unknown}
            testid="play-order-unknown"
          />
        )}
      </div>
    </div>
  );
}
