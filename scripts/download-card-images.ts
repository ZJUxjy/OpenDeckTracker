import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CARD_IMAGE_FALLBACK_LOCALE,
  CARD_IMAGE_PRIMARY_LOCALE,
  CARD_IMAGE_SIZE,
  cardImageCachePath,
  ensureCardImageCached,
} from '../apps/desktop/src/main/card-image-cache';

const DEFAULT_CARDS_FILE = 'data/cards/generated/cards.collectible.zhCN.json';
const DEFAULT_CACHE_ROOT = 'resources/card-images';

export interface DownloadCardImagesOptions {
  cardsFile: string;
  cacheRoot: string;
  locale?: string;
  fallbackLocale?: string;
  size?: string;
  force?: boolean;
  fetchImpl?: typeof fetch;
}

export interface DownloadCardImagesResult {
  total: number;
  downloaded: number;
  skipped: number;
  failed: number;
  failures: Array<{ cardId: string; message: string }>;
}

interface CardJsonRow {
  id?: unknown;
}

export async function downloadCardImagesForTest(
  options: DownloadCardImagesOptions,
): Promise<DownloadCardImagesResult> {
  return downloadCardImages(options);
}

async function downloadCardImages(
  options: DownloadCardImagesOptions,
): Promise<DownloadCardImagesResult> {
  const locale = options.locale ?? CARD_IMAGE_PRIMARY_LOCALE;
  const fallbackLocale = options.fallbackLocale ?? CARD_IMAGE_FALLBACK_LOCALE;
  const size = options.size ?? CARD_IMAGE_SIZE;
  const cardIds = await readCardIds(options.cardsFile);
  const result: DownloadCardImagesResult = {
    total: cardIds.length,
    downloaded: 0,
    skipped: 0,
    failed: 0,
    failures: [],
  };

  for (const cardId of cardIds) {
    try {
      const primaryPath = cardImageCachePath({
        root: options.cacheRoot,
        locale,
        size,
        cardId,
      });

      if (!options.force && await fileExists(primaryPath)) {
        result.skipped += 1;
        continue;
      }

      await ensureCardImageCached(cardId, {
        root: options.cacheRoot,
        primaryLocale: locale,
        fallbackLocale,
        size,
        force: options.force,
        fetchImpl: options.fetchImpl,
      });
      result.downloaded += 1;
    } catch (e) {
      result.failed += 1;
      result.failures.push({ cardId, message: (e as Error).message });
    }
  }

  return result;
}

async function readCardIds(cardsFile: string): Promise<string[]> {
  const raw = await readFile(cardsFile, 'utf8');
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error(`card data must be an array: ${cardsFile}`);
  }

  const ids = new Set<string>();
  for (const row of parsed as CardJsonRow[]) {
    if (typeof row.id === 'string' && row.id.length > 0) {
      ids.add(row.id);
    }
  }
  return [...ids].sort((a, b) => a.localeCompare(b));
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const info = await stat(filePath);
    return info.isFile();
  } catch {
    return false;
  }
}

function parseArgs(argv: string[]): DownloadCardImagesOptions & { help: boolean } {
  const options: DownloadCardImagesOptions & { help: boolean } = {
    cardsFile: DEFAULT_CARDS_FILE,
    cacheRoot: DEFAULT_CACHE_ROOT,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    switch (arg) {
      case '--help':
      case '-h':
        options.help = true;
        break;
      case '--cards':
        if (!next) throw new Error('--cards requires a file path');
        options.cardsFile = next;
        i += 1;
        break;
      case '--cache-root':
      case '--root':
        if (!next) throw new Error(`${arg} requires a directory path`);
        options.cacheRoot = next;
        i += 1;
        break;
      case '--locale':
        if (!next) throw new Error('--locale requires a locale');
        options.locale = next;
        i += 1;
        break;
      case '--fallback-locale':
        if (!next) throw new Error('--fallback-locale requires a locale');
        options.fallbackLocale = next;
        i += 1;
        break;
      case '--size':
        if (!next) throw new Error('--size requires an image size');
        options.size = next;
        i += 1;
        break;
      case '--force':
        options.force = true;
        break;
      default:
        throw new Error(`unknown argument: ${arg}`);
    }
  }

  return options;
}

function printHelp(): void {
  console.log(`Usage: pnpm cards:images [options]

Options:
  --cards <file>             Generated card JSON file (default: ${DEFAULT_CARDS_FILE})
  --cache-root, --root <dir> Cache root directory (default: ${DEFAULT_CACHE_ROOT})
  --locale <locale>          Primary locale (default: ${CARD_IMAGE_PRIMARY_LOCALE})
  --fallback-locale <locale> Fallback locale (default: ${CARD_IMAGE_FALLBACK_LOCALE})
  --size <size>              Image size (default: ${CARD_IMAGE_SIZE})
  --force                    Re-download existing files
  --help                     Show this help message`);
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const options = parseArgs(argv);
  if (options.help) {
    printHelp();
    return;
  }

  const result = await downloadCardImages(options);
  console.log(
    `Card images: ${result.downloaded} downloaded, ${result.skipped} skipped, ${result.failed} failed, ${result.total} total`,
  );

  if (result.failures.length > 0) {
    for (const failure of result.failures.slice(0, 10)) {
      console.error(`${failure.cardId}: ${failure.message}`);
    }
  }

  if (result.total === 0) {
    throw new Error(`no card IDs found in ${options.cardsFile}`);
  }
  if (result.downloaded === 0 && result.skipped === 0 && result.failed > 0) {
    throw new Error('all requested card image downloads failed');
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  void main().catch((e) => {
    console.error((e as Error).message);
    process.exitCode = 1;
  });
}
