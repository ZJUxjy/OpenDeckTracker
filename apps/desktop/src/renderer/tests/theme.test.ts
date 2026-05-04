import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const themeCss = readFileSync(
  resolve(__dirname, '../src/styles/theme.css'),
  'utf-8',
);

describe('Console theme tokens', () => {
  it('declares the Console accent', () => {
    expect(themeCss).toMatch(/--accent:\s*#22d3ee;/);
  });

  it('declares the Console background', () => {
    expect(themeCss).toMatch(/--bg:\s*#0b0f14;/);
  });

  it('declares the mono font family with JetBrains Mono', () => {
    expect(themeCss).toMatch(/--font-mono:/);
    expect(themeCss).toContain("'JetBrains Mono'");
  });

  it('declares all required Console tokens', () => {
    const required = [
      /--bg:\s/,
      /--bg-2:\s/,
      /--bg-3:\s/,
      /--border:\s*#1f2731/,
      /--border-hi:\s/,
      /--text:\s/,
      /--text-dim:\s/,
      /--text-mute:\s/,
      /--accent:\s*#22d3ee;/,
      /--accent-dim:\s/,
      /--green:\s/,
      /--red:\s/,
      /--amber:\s/,
      /--font-sans:\s/,
      /--font-mono:\s/,
    ];
    for (const token of required) {
      expect(themeCss).toMatch(token);
    }
  });

  it('declares all rarity color tokens', () => {
    expect(themeCss).toMatch(/--rarity-free:\s*#5b6573;/);
    expect(themeCss).toMatch(/--rarity-common:\s*#cdd5e0;/);
    expect(themeCss).toMatch(/--rarity-rare:\s*#3b82f6;/);
    expect(themeCss).toMatch(/--rarity-epic:\s*#a855f7;/);
    expect(themeCss).toMatch(/--rarity-legendary:\s*#f59e0b;/);
  });
});
