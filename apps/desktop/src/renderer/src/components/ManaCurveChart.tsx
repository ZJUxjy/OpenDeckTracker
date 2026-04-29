import type { ReactElement } from 'react';

interface ManaCurveChartProps {
  buckets: readonly number[];
  width?: number;
  height?: number;
  ariaLabel?: string;
}

export function ManaCurveChart({
  buckets,
  width = 300,
  height = 48,
  ariaLabel = 'Mana curve',
}: ManaCurveChartProps): ReactElement {
  const max = Math.max(1, ...buckets);
  const gap = 4;
  const barCount = buckets.length;
  const barWidth = (width - gap * (barCount - 1)) / barCount;

  return (
    <svg
      role="img"
      aria-label={ariaLabel}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="text-accent"
    >
      {buckets.map((value, i) => {
        const ratio = value / max;
        const barHeight = value > 0 ? Math.max(1, ratio * height) : 0;
        const x = i * (barWidth + gap);
        const y = height - barHeight;
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={barWidth}
            height={barHeight}
            fill="currentColor"
            rx={1}
          />
        );
      })}
    </svg>
  );
}
