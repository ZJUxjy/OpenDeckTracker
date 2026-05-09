import type { ReactElement } from 'react';

interface ManaCurveChartProps {
  buckets: readonly number[];
  width?: number;
  height?: number;
  ariaLabel?: string;
  /** When true, render `0,1,2,...,7+` labels under each bar. */
  showAxisLabels?: boolean;
}

const DEFAULT_LABELS = ['0', '1', '2', '3', '4', '5', '6', '7+'] as const;
const LABEL_HEIGHT = 12;
const LABEL_GAP = 2;

export function ManaCurveChart({
  buckets,
  width = 300,
  height = 48,
  ariaLabel = 'Mana curve',
  showAxisLabels = false,
}: ManaCurveChartProps): ReactElement {
  const max = Math.max(1, ...buckets);
  const gap = 4;
  const barCount = buckets.length;
  const barWidth = (width - gap * (barCount - 1)) / barCount;
  const reservedLabelHeight = showAxisLabels ? LABEL_HEIGHT + LABEL_GAP : 0;
  const barAreaHeight = height - reservedLabelHeight;

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
        const barHeight = value > 0 ? Math.max(1, ratio * barAreaHeight) : 0;
        const x = i * (barWidth + gap);
        const y = barAreaHeight - barHeight;
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
      {showAxisLabels &&
        buckets.map((_, i) => {
          const x = i * (barWidth + gap) + barWidth / 2;
          const y = barAreaHeight + LABEL_GAP + LABEL_HEIGHT - 2;
          return (
            <text
              key={`label-${i}`}
              x={x}
              y={y}
              textAnchor="middle"
              fontSize={9}
              fontFamily="JetBrains Mono, ui-monospace, monospace"
              fill="currentColor"
              className="opacity-60"
            >
              {DEFAULT_LABELS[i] ?? `${i}`}
            </text>
          );
        })}
    </svg>
  );
}
