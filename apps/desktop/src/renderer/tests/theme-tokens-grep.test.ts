import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

/**
 * Renderer source files that must consume Console theme tokens, not raw
 * color literals. Per `add-console-theme-tokens` capability requirement.
 */
const IN_SCOPE_FILES = [
  'src/App.tsx',
  'src/routes.tsx',
  'src/components/Dashboard.tsx',
  'src/components/LiveDeckPanel.tsx',
  'src/components/OpponentCardsPanel.tsx',
  'src/components/DeckSelectDialog.tsx',
  'src/components/Stats.tsx',
  'src/components/Collection.tsx',
  'src/components/Settings.tsx',
  'src/components/OverlayView.tsx',
  'src/components/Decklist.tsx',
  'src/components/DecksPage.tsx',
  'src/components/DeckEditor.tsx',
  'src/components/DeckImportDialog.tsx',
  'src/components/DeckExportDialog.tsx',
  'src/components/SaveLiveDeckButton.tsx',
  'src/components/CardImagePopover.tsx',
  'src/components/FormatFilterPills.tsx',
  'src/components/MatchupMatrix.tsx',
  'src/components/WinrateTimeSeriesChart.tsx',
  'src/components/PlayOrderSplitCard.tsx',
  'src/components/MatchRecordingViewer.tsx',
];

/**
 * Patterns that MUST NOT appear in renderer source.
 *
 * - Old hard-coded hex chrome literals from the pre-Console palette.
 * - Tailwind palette utilities that should be tokens (orange/slate/zinc/emerald).
 * - Numeric Tailwind palette utilities for red / amber / green / blue / purple
 *   chrome use cases. The legitimate domain-color exceptions (rarity tints,
 *   mana gem chip) are explicitly allow-listed below.
 *
 * Each entry: { pattern, name, allow? }. `allow` is a list of substring
 * predicates that suppress matches whose surrounding line includes one.
 */
const FORBIDDEN: Array<{
  pattern: RegExp;
  name: string;
  allow?: string[];
}> = [
  { pattern: /#0E0E14/, name: 'old chrome bg literal #0E0E14' },
  { pattern: /#1C1C24/, name: 'old chrome surface literal #1C1C24' },
  { pattern: /#14141A/, name: 'old chrome surface literal #14141A' },
  { pattern: /#2A2A35/, name: 'old chrome border literal #2A2A35' },
  { pattern: /#F97316/, name: 'old orange brand literal #F97316' },
  { pattern: /#64748B/, name: 'recharts slate-500 stroke literal — use var(--text-mute)' },
  { pattern: /bg-orange-/, name: 'orange Tailwind palette utility (use bg-accent)' },
  { pattern: /text-orange-/, name: 'orange Tailwind palette utility (use text-accent)' },
  { pattern: /border-orange-/, name: 'orange Tailwind palette utility (use border-accent)' },
  { pattern: /text-slate-/, name: 'slate Tailwind palette utility (use text-text-dim / text-text-mute)' },
  { pattern: /bg-slate-/, name: 'slate Tailwind palette utility' },
  { pattern: /text-zinc-/, name: 'zinc Tailwind palette utility' },
  { pattern: /bg-zinc-/, name: 'zinc Tailwind palette utility' },
  { pattern: /text-emerald-/, name: 'emerald Tailwind palette utility (use text-green)' },
  { pattern: /bg-emerald-/, name: 'emerald Tailwind palette utility (use bg-green)' },
  { pattern: /text-red-\d/, name: 'red Tailwind palette utility (use text-red)' },
  { pattern: /bg-red-\d/, name: 'red Tailwind palette utility (use bg-red)' },
  { pattern: /border-red-\d/, name: 'red Tailwind palette utility (use border-red)' },
  { pattern: /text-amber-\d/, name: 'amber Tailwind palette utility (use text-amber)' },
  { pattern: /bg-amber-\d/, name: 'amber Tailwind palette utility (use bg-amber)' },
  { pattern: /border-amber-\d/, name: 'amber Tailwind palette utility (use border-amber)' },
  { pattern: /text-green-\d/, name: 'green Tailwind palette utility (use text-green)' },
  { pattern: /bg-green-\d/, name: 'green Tailwind palette utility (use bg-green)' },
  // Blue / purple are allow-listed for two domain cases:
  //   1. Rarity tints in card-row components.
  //   2. The mana-gem chip in LiveDeckPanel — Hearthstone mana gems are
  //      blue across all themes per the design's ManaGem primitive.
  {
    pattern: /text-blue-\d/,
    name: 'blue Tailwind palette utility',
    allow: ["rarity === 'rare'", 'rounded bg-blue-700/40'],
  },
  {
    pattern: /bg-blue-\d/,
    name: 'blue Tailwind palette utility',
    allow: ['rounded bg-blue-700/40'],
  },
  {
    pattern: /text-purple-\d/,
    name: 'purple Tailwind palette utility',
    allow: ["rarity === 'epic'"],
  },
  {
    pattern: /bg-purple-\d/,
    name: 'purple Tailwind palette utility',
    allow: ["rarity === 'epic'"],
  },
];

interface Violation {
  file: string;
  line: number;
  text: string;
  rule: string;
}

function scan(): Violation[] {
  const out: Violation[] = [];
  for (const rel of IN_SCOPE_FILES) {
    const abs = resolve(root, rel);
    const content = readFileSync(abs, 'utf-8');
    const lines = content.split(/\r?\n/);
    lines.forEach((text, i) => {
      for (const rule of FORBIDDEN) {
        if (!rule.pattern.test(text)) continue;
        if (rule.allow?.some((needle) => text.includes(needle))) continue;
        out.push({ file: rel, line: i + 1, text: text.trim(), rule: rule.name });
      }
    });
  }
  return out;
}

describe('Console theme token enforcement', () => {
  it('renderer surfaces contain no forbidden color literals', () => {
    const violations = scan();
    if (violations.length > 0) {
      const lines = violations.map(
        (v) => `  ${v.file}:${v.line}  [${v.rule}]\n    ${v.text}`,
      );
      throw new Error(
        `Found ${violations.length} forbidden color literal(s):\n${lines.join('\n')}\n\nAdd a token utility (bg-bg-2, text-accent, etc.) or, if this is a design-intent domain color, extend the allow-list in theme-tokens-grep.test.ts.`,
      );
    }
    expect(violations).toEqual([]);
  });
});
