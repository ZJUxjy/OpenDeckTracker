import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const themeCss = readFileSync(
  resolve(__dirname, '../src/styles/theme.css'),
  'utf-8',
);

describe('macOS Liquid Glass theme tokens', () => {
  it('declares macOS System Blue as default light accent', () => {
    expect(themeCss).toMatch(/--accent:\s*#007aff;/i);
  });

  it('declares macOS Dark mode accent in .dark scope', () => {
    expect(themeCss).toMatch(/\.dark\s*\{[\s\S]*--accent:\s*#0A84FF;/i);
  });

  it('declares the macOS surface ladder in :root (light) and .dark', () => {
    // Light defaults — true light mode
    expect(themeCss).toMatch(/--surface-window:\s*#F4F4F6;/i);
    expect(themeCss).toMatch(/--surface-content:\s*#FFFFFF;/i);
    // Dark overrides
    expect(themeCss).toMatch(/\.dark\s*\{[\s\S]*--surface-window:\s*#1C1C1E;/i);
    expect(themeCss).toMatch(/\.dark\s*\{[\s\S]*--surface-content:\s*#242427;/i);
  });

  it('declares light-mode text as dark (for true light backgrounds)', () => {
    expect(themeCss).toMatch(/--text-primary:\s*#1C1C1E;/i);
    expect(themeCss).toMatch(/--text-secondary:\s*rgba\(0,\s*0,\s*0,/);
  });

  it('declares dark-mode text as light', () => {
    expect(themeCss).toMatch(/\.dark\s*\{[\s\S]*--text-primary:\s*#F4F4F8;/i);
  });

  it('declares dark-mode borders (dark-with-alpha for light mode)', () => {
    expect(themeCss).toMatch(/--border-hairline:\s*rgba\(0,\s*0,\s*0,/);
  });

  it('declares light-mode borders (white-with-alpha for dark mode)', () => {
    expect(themeCss).toMatch(/\.dark\s*\{[\s\S]*--border-hairline:\s*rgba\(255,/);
  });

  it('declares glass overlay for in-game vibrancy', () => {
    expect(themeCss).toMatch(/--glass-overlay:\s*rgba\(/);
    expect(themeCss).toMatch(/--glass-blur:/);
  });

  it('declares overlay variables for mode-aware component backgrounds', () => {
    expect(themeCss).toMatch(/--overlay-surface:\s*rgba\(/);
    expect(themeCss).toMatch(/--overlay-hover:\s*rgba\(/);
    expect(themeCss).toMatch(/--overlay-elevated:\s*rgba\(/);
    expect(themeCss).toMatch(/--overlay-input:\s*rgba\(/);
    expect(themeCss).toMatch(/--overlay-dialog:\s*rgba\(/);
  });

  it('exposes overlay colors to Tailwind via @theme inline', () => {
    expect(themeCss).toMatch(/--color-overlay-surface:\s*var\(--overlay-surface\)/);
    expect(themeCss).toMatch(/--color-overlay-hover:\s*var\(--overlay-hover\)/);
  });

  it('declares mono font family with JetBrains Mono fallback', () => {
    expect(themeCss).toMatch(/--font-mono:/);
    expect(themeCss).toContain("'JetBrains Mono'");
  });

  it('declares SF Pro / system font stack', () => {
    expect(themeCss).toMatch(/--font-sans:/);
    expect(themeCss).toContain("'SF Pro Display'");
  });

  it('declares all required macOS-aligned tokens', () => {
    const required = [
      /--surface-window:\s/,
      /--surface-sidebar:\s/,
      /--surface-toolbar:\s/,
      /--surface-content:\s/,
      /--surface-elevated:\s/,
      /--surface-popover:\s/,
      /--border-hairline:\s/,
      /--border-separator:\s/,
      /--text-primary:\s/,
      /--text-secondary:\s/,
      /--text-tertiary:\s/,
      /--accent:\s/,
      /--accent-translucent:\s/,
      /--semantic-success:\s/,
      /--semantic-warning:\s/,
      /--semantic-danger:\s/,
      /--shadow-window:\s/,
      /--shadow-popover:\s/,
      /--shadow-elevated:\s/,
    ];
    for (const token of required) {
      expect(themeCss).toMatch(token);
    }
  });

  it('keeps backward-compat aliases for legacy components', () => {
    // Old token names alias to new tokens — components written before the
    // redesign keep working without a sweeping refactor.
    expect(themeCss).toMatch(/--bg:\s*var\(--surface-window\);/);
    expect(themeCss).toMatch(/--text:\s*var\(--text-primary\);/);
    expect(themeCss).toMatch(/--border:\s*var\(--border-hairline\);/);
    expect(themeCss).toMatch(/--green:\s*var\(--semantic-success\);/);
    expect(themeCss).toMatch(/--red:\s*var\(--semantic-danger\);/);
    expect(themeCss).toMatch(/--amber:\s*var\(--semantic-warning\);/);
  });

  it('declares all rarity color tokens', () => {
    expect(themeCss).toMatch(/--rarity-free:\s/);
    expect(themeCss).toMatch(/--rarity-common:\s/);
    expect(themeCss).toMatch(/--rarity-rare:\s/);
    expect(themeCss).toMatch(/--rarity-epic:\s/);
    expect(themeCss).toMatch(/--rarity-legendary:\s/);
  });

  it('declares Hearthstone class color tokens', () => {
    const classes = [
      'mage', 'hunter', 'priest', 'rogue', 'warlock', 'warrior',
      'druid', 'shaman', 'paladin', 'demonhunter', 'deathknight', 'neutral',
    ];
    for (const cls of classes) {
      expect(themeCss).toMatch(new RegExp(`--class-${cls}:\\s`));
    }
  });

  it('exposes a .macos-glass utility class with backdrop-filter and fallback', () => {
    expect(themeCss).toMatch(/\.macos-glass\s*\{[\s\S]*backdrop-filter:\s*blur/);
    // Fallback for browsers without backdrop-filter support
    expect(themeCss).toMatch(/@supports not \(backdrop-filter/);
  });

  it('declares Tahoe chrome utilities (tahoe-sidebar, tahoe-topbar, tahoe-card)', () => {
    expect(themeCss).toMatch(/\.tahoe-sidebar\s*\{/);
    expect(themeCss).toMatch(/\.tahoe-topbar\s*\{/);
    expect(themeCss).toMatch(/\.tahoe-card\s*\{/);
    expect(themeCss).toMatch(/\.tahoe-active-pill\s*\{/);
  });

  it('declares the macOS skin over the shared top-navigation layout', () => {
    expect(themeCss).toMatch(/:root\[data-ui-style='macos'\]\s+\.tavern-app-shell\s*\{/);
    expect(themeCss).toMatch(/:root\[data-ui-style='macos'\]\s+\.tavern-topbar\s*\{/);
    expect(themeCss).toMatch(/:root\[data-ui-style='macos'\]\s+\.tavern-app-frame\s*\{/);
  });

  it('declares the reference (Arcane) skin over the shared top-navigation layout', () => {
    expect(themeCss).toMatch(/:root\[data-ui-style='reference'\]\s+\.tavern-app-shell\s*\{/);
    expect(themeCss).toMatch(/:root\[data-ui-style='reference'\]\s+\.tavern-topbar\s*\{/);
  });

  it('no longer ships the removed wechat / fallout76 / tavern skins', () => {
    expect(themeCss).not.toMatch(/:root\[data-ui-style='wechat'\]/);
    expect(themeCss).not.toMatch(/:root\[data-ui-style='fallout76'\]/);
    expect(themeCss).not.toMatch(/:root\[data-ui-style='tavern'\]/);
    expect(themeCss).not.toMatch(/--wechat-/);
    expect(themeCss).not.toMatch(/--pip-/);
  });

  it('uses shared desktop control positions across every skin', () => {
    expect(themeCss).toMatch(/\.tavern-topbar\s*\{[\s\S]*height:\s*86px;[\s\S]*grid-template-columns:\s*minmax\(180px,\s*260px\)\s+minmax\(0,\s*1fr\)\s+minmax\(248px,\s*max-content\);/);
    expect(themeCss).toMatch(/\.tavern-brand-plaque\s*\{[\s\S]*height:\s*52px;/);
    expect(themeCss).toMatch(/\.tavern-main-tabs\s*>\s*\.tavern-nav-tab\s*\{[\s\S]*flex:\s*1\s+1\s+112px;[\s\S]*max-width:\s*132px;/);
    expect(themeCss).toMatch(/\.tavern-nav-tab\s*\{[\s\S]*height:\s*64px;[\s\S]*padding:\s*0\s+9px;/);
    expect(themeCss).toMatch(/\.fallout-dashboard-grid\s*\{[\s\S]*grid-template-columns:\s*260px\s+minmax\(0,\s*1fr\)\s+minmax\(320px,\s*500px\);/);
  });

  it('clips shared shell labels inside their controls', () => {
    expect(themeCss).toMatch(/\.tavern-brand-title,\s*[\s\S]*\.tavern-brand-subtitle\s*\{[\s\S]*text-overflow:\s*ellipsis;[\s\S]*white-space:\s*nowrap;/);
    expect(themeCss).toMatch(/\.tavern-nav-label\s*\{[\s\S]*overflow:\s*hidden;[\s\S]*text-overflow:\s*ellipsis;[\s\S]*white-space:\s*nowrap;/);
    expect(themeCss).toMatch(/\.tavern-bottom-status\s*>\s*span\s*\{[\s\S]*overflow:\s*hidden;[\s\S]*text-overflow:\s*ellipsis;/);
  });
});
