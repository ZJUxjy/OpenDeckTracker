import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = resolve(__dirname, '../src');

function read(rel: string): string {
  return readFileSync(resolve(srcRoot, rel), 'utf-8');
}

const themeCss = read('styles/theme.css');

describe('compact density CSS rules', () => {
  it('declares a [data-density="compact"] selector', () => {
    expect(themeCss).toMatch(/\[data-density=['"]compact['"]\]/);
  });

  it('targets settings rows, KPI cards, and recent-match rows', () => {
    expect(themeCss).toMatch(/\[data-density=['"]compact['"]\]\s*\.settings-row/);
    expect(themeCss).toMatch(/\[data-density=['"]compact['"]\]\s*\.kpi-card/);
    expect(themeCss).toMatch(/\[data-density=['"]compact['"]\]\s*\.recent-match-row/);
  });

  it('does NOT target gameplay-critical surfaces (LiveDeckPanel, OpponentCardsPanel, Decklist)', () => {
    expect(themeCss).not.toMatch(/\[data-density=['"]compact['"]\].*LiveDeckPanel/i);
    expect(themeCss).not.toMatch(/\[data-density=['"]compact['"]\].*OpponentCardsPanel/i);
    expect(themeCss).not.toMatch(/\[data-density=['"]compact['"]\].*Decklist/i);
  });
});

/**
 * Without these, the compact-density CSS rules above match nothing.
 * This guards against the failure mode where the rules exist but no
 * component carries the marker class.
 */
describe('compact density marker classes are wired into components', () => {
  it('Settings rows carry the .settings-row class', () => {
    expect(read('components/Settings.tsx')).toMatch(/className="settings-row\b/);
  });

  it('Stats KPI cards carry the .kpi-card class', () => {
    expect(read('components/Stats.tsx')).toMatch(/className="kpi-card\b/);
  });

  it('Stats recent-match rows carry the .recent-match-row class', () => {
    expect(read('components/Stats.tsx')).toMatch(/className="recent-match-row\b/);
  });

  it('gameplay-critical components do NOT carry density marker classes', () => {
    const gameplayFiles = [
      'components/LiveDeckPanel.tsx',
      'components/OpponentCardsPanel.tsx',
      'components/Decklist.tsx',
    ];
    for (const rel of gameplayFiles) {
      const src = read(rel);
      expect(src, `${rel} should not use settings-row`).not.toMatch(/settings-row/);
      expect(src, `${rel} should not use kpi-card`).not.toMatch(/kpi-card/);
      expect(src, `${rel} should not use recent-match-row`).not.toMatch(/recent-match-row/);
    }
  });
});
