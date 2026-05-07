import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EFFECT_CATALOG } from '@hdt/core';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../../../../..');

interface LocaleTree {
  [key: string]: string | LocaleTree;
}

function load(file: string): LocaleTree {
  const raw = readFileSync(resolve(repoRoot, file), 'utf-8');
  return JSON.parse(raw) as LocaleTree;
}

function flatten(obj: LocaleTree, prefix = ''): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') {
      out.push(path);
    } else {
      out.push(...flatten(v, path));
    }
  }
  return out;
}

const en = load('resources/locales/en-US.json');
const zh = load('resources/locales/zh-CN.json');

describe('globalEffects locale parity', () => {
  it('en-US and zh-CN have the same globalEffects.* key set', () => {
    const enKeys = flatten((en['globalEffects'] as LocaleTree) ?? {})
      .filter((p) => !p.startsWith('_'))
      .sort();
    const zhKeys = flatten((zh['globalEffects'] as LocaleTree) ?? {})
      .filter((p) => !p.startsWith('_'))
      .sort();
    expect(zhKeys).toEqual(enKeys);
  });

  it('every catalog entry has paired title + body in both locales', () => {
    for (const def of EFFECT_CATALOG) {
      const enEntry = (en['globalEffects'] as LocaleTree | undefined)?.[def.id];
      const zhEntry = (zh['globalEffects'] as LocaleTree | undefined)?.[def.id];
      expect(enEntry, `en-US ${def.id}`).toBeDefined();
      expect(zhEntry, `zh-CN ${def.id}`).toBeDefined();

      const enT = (enEntry as LocaleTree)?.['title'];
      const enB = (enEntry as LocaleTree)?.['body'];
      const zhT = (zhEntry as LocaleTree)?.['title'];
      const zhB = (zhEntry as LocaleTree)?.['body'];
      expect(typeof enT).toBe('string');
      expect((enT as string).length).toBeGreaterThan(0);
      expect(typeof enB).toBe('string');
      expect((enB as string).length).toBeGreaterThan(0);
      expect(typeof zhT).toBe('string');
      expect((zhT as string).length).toBeGreaterThan(0);
      expect(typeof zhB).toBe('string');
      expect((zhB as string).length).toBeGreaterThan(0);
    }
  });
});
