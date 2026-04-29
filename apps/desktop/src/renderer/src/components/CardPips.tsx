export interface CardPipsProps {
  remaining: number;
  max: number;
}

export function CardPips({ remaining, max }: CardPipsProps) {
  const filled = Math.max(0, Math.min(remaining, max));
  return (
    <div className="flex items-center gap-1 shrink-0">
      {Array.from({ length: max }, (_, i) =>
        i < filled ? (
          <span
            key={i}
            data-testid="pip-filled"
            className="w-1.5 h-1.5 rounded-full bg-accent transition-colors"
          />
        ) : (
          <span
            key={i}
            data-testid="pip-hollow"
            className="w-1.5 h-1.5 rounded-full border border-border transition-colors"
          />
        ),
      )}
    </div>
  );
}
