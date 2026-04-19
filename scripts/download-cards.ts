/**
 * Downloads the latest collectible card data from HearthstoneJSON.
 * Run via: pnpm cards:download
 *
 * Output: data/cards/cards.collectible.<locale>.json (one per locale)
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const OUT_DIR = 'data/cards';
const URL = (locale: string): string =>
  `https://api.hearthstonejson.com/v1/latest/${locale}/cards.collectible.json`;
const MAX_ATTEMPTS = 3;

async function ensureOutDir(): Promise<void> {
  await fs.mkdir(OUT_DIR, { recursive: true });
}

async function downloadOne(locale: string): Promise<void> {
  const url = URL(locale);
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const text = await res.text();
      // schema sanity check
      const parsed: unknown = JSON.parse(text);
      if (!Array.isArray(parsed)) {
        throw new Error(`expected JSON array, got ${typeof parsed}`);
      }
      const outPath = path.join(OUT_DIR, `cards.collectible.${locale}.json`);
      await fs.writeFile(outPath, text, 'utf8');
      const sizeKB = (text.length / 1024).toFixed(1);
      const cards = parsed.length;
      console.log(`✓ ${locale}: ${sizeKB} KB, ${cards} cards → ${outPath}`);
      return;
    } catch (e) {
      const msg = (e as Error).message;
      console.warn(`  ${locale}: attempt ${attempt}/${MAX_ATTEMPTS} failed: ${msg}`);
      if (attempt === MAX_ATTEMPTS) {
        throw new Error(
          `Failed to download ${locale} after ${MAX_ATTEMPTS} attempts. Last error: ${msg}\n` +
            `Check https://hearthstonejson.com/ for upstream status, or retry later with: pnpm cards:download`,
        );
      }
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
}

async function main(): Promise<void> {
  await ensureOutDir();
  console.log(`Downloading card data to ${OUT_DIR}/ ...`);

  // enUS is required; zhCN is best-effort (may lag enUS by hours after a release)
  await downloadOne('enUS');
  try {
    await downloadOne('zhCN');
  } catch (e) {
    console.warn(`zhCN download failed (non-fatal): ${(e as Error).message}`);
  }

  console.log('Done.');
}

main().catch((e: Error) => {
  console.error(`\n❌ ${e.message}`);
  process.exit(1);
});
