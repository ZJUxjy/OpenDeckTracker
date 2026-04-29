// Shared primitives used across all 3 directions.

// Class-tinted card art placeholder. Renders a striped/gradient block with the class glyph.
// Sizes: "xs" (24x32), "sm" (40x52), "md" (60x80), "lg" (80x104).
function CardArt({ cls = "ember", size = "sm", style = {} }) {
  const c = (window.CLASSES[cls] || window.CLASSES.ember);
  const dims = {
    xs: { w: 24,  h: 32  },
    sm: { w: 40,  h: 52  },
    md: { w: 60,  h: 80  },
    lg: { w: 80,  h: 104 },
  }[size];
  const hue = c.hue;
  const bg = `linear-gradient(135deg, oklch(0.32 0.10 ${hue}) 0%, oklch(0.18 0.06 ${hue}) 100%)`;
  const stripe = `repeating-linear-gradient(45deg, transparent 0 6px, oklch(1 0 0 / 0.04) 6px 7px)`;
  return (
    <div style={{
      width: dims.w, height: dims.h, borderRadius: 4,
      background: `${stripe}, ${bg}`,
      border: `1px solid oklch(0.4 0.10 ${hue} / 0.6)`,
      display: "flex", alignItems: "center", justifyContent: "center",
      color: `oklch(0.85 0.12 ${hue})`, fontSize: dims.w * 0.45, fontWeight: 700,
      textShadow: "0 1px 2px rgba(0,0,0,0.6)",
      flexShrink: 0,
      ...style,
    }}>
      {c.glyph}
    </div>
  );
}

// Mana gem — a hexagon-ish blue badge with the cost number. Configurable size.
function ManaGem({ cost, size = 22, depleted = false }) {
  const fontSize = Math.round(size * 0.55);
  return (
    <div style={{
      width: size, height: size, flexShrink: 0,
      borderRadius: 4,
      background: depleted
        ? "linear-gradient(180deg, oklch(0.32 0.04 240) 0%, oklch(0.20 0.04 240) 100%)"
        : "linear-gradient(180deg, oklch(0.55 0.18 245) 0%, oklch(0.32 0.18 250) 100%)",
      border: depleted ? "1px solid oklch(0.4 0.04 240)" : "1px solid oklch(0.65 0.18 245)",
      boxShadow: depleted ? "none" : "inset 0 1px 0 oklch(0.85 0.12 240 / 0.5), 0 0 8px oklch(0.55 0.18 245 / 0.25)",
      display: "flex", alignItems: "center", justifyContent: "center",
      color: depleted ? "oklch(0.55 0 0)" : "white",
      fontFamily: "'JetBrains Mono', ui-monospace, monospace",
      fontSize, fontWeight: 700, letterSpacing: "-0.02em",
      textShadow: depleted ? "none" : "0 1px 2px rgba(0,0,0,0.5)",
    }}>
      {cost}
    </div>
  );
}

// Class crest — the per-class glyph in a small circular chip.
function ClassCrest({ cls = "ember", size = 28, showName = false }) {
  const c = (window.CLASSES[cls] || window.CLASSES.ember);
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <div style={{
        width: size, height: size, borderRadius: "50%",
        background: `radial-gradient(circle at 30% 30%, oklch(0.55 0.16 ${c.hue}), oklch(0.22 0.10 ${c.hue}))`,
        border: `1px solid oklch(0.6 0.14 ${c.hue} / 0.6)`,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        color: `oklch(0.95 0.10 ${c.hue})`, fontSize: size * 0.55, fontWeight: 700,
        boxShadow: `0 0 ${size/2}px oklch(0.55 0.16 ${c.hue} / 0.25)`,
        flexShrink: 0,
      }}>
        {c.glyph}
      </div>
      {showName && (
        <span style={{ fontSize: 12, color: `oklch(0.85 0.06 ${c.hue})`, fontWeight: 600, letterSpacing: "0.02em" }}>
          {c.name}
        </span>
      )}
    </div>
  );
}

// Tiny inline sparkline (SVG). values: array of numbers; w/h in px.
function Sparkline({ values, w = 80, h = 24, stroke = "#22d3ee", fill = "none", strokeWidth = 1.5 }) {
  if (!values || values.length === 0) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = w / (values.length - 1 || 1);
  const points = values.map((v, i) => {
    const x = i * stepX;
    const y = h - ((v - min) / range) * (h - 2) - 1;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return (
    <svg width={w} height={h} style={{ display: "block" }}>
      <polyline points={points} stroke={stroke} fill={fill} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// Bar chart for mana curve. buckets: array of 8 numbers (0..7+).
function ManaCurveChart({ buckets, w = 200, h = 60, accent = "#22d3ee" }) {
  const max = Math.max(...buckets, 1);
  const barW = w / buckets.length;
  return (
    <svg width={w} height={h} style={{ display: "block" }}>
      {buckets.map((v, i) => {
        const bh = (v / max) * (h - 18);
        const x = i * barW + 2;
        const y = h - 14 - bh;
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW - 4} height={bh} fill={accent} opacity={0.75} rx={1} />
            <text x={x + (barW - 4)/2} y={h - 3} fontSize="9" fill="#94a3b8" textAnchor="middle"
              fontFamily="'JetBrains Mono', monospace">
              {i === 7 ? "7+" : i}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// Compute the deck "remaining" view: cards minus drawn count.
function deckRemaining(deck, drawn) {
  return deck.map(c => ({
    ...c,
    drawn: drawn[c.name] || 0,
    remaining: c.count - (drawn[c.name] || 0),
  }));
}

// Cost-then-name sort.
function sortByCost(a, b) {
  if (a.cost !== b.cost) return a.cost - b.cost;
  return a.name.localeCompare(b.name);
}

Object.assign(window, {
  CardArt, ManaGem, ClassCrest, Sparkline, ManaCurveChart,
  deckRemaining, sortByCost,
});
