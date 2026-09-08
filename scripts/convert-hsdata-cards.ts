import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { convertHsdataCardsForTest } from './lib/hsdata-converter';
export { convertHsdataCardsForTest } from './lib/hsdata-converter';
const DEFAULT_INPUT = 'data/cards/hsdata/CardDefs.xml';
const DEFAULT_OUT_DIR = 'data/cards/generated';

function printHelp(): void {
  console.log(`Usage: pnpm cards:convert [--input <CardDefs.xml>] [--out-dir <dir>]

Converts Hearthstone hsdata CardDefs.xml into generated JSON card datasets.
Defaults:
  --input   ${DEFAULT_INPUT}
  --out-dir ${DEFAULT_OUT_DIR}`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    return;
  }

  let input = DEFAULT_INPUT;
  let outDir = DEFAULT_OUT_DIR;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === '--input') {
      input = args[++i] ?? input;
    } else if (arg === '--out-dir') {
      outDir = args[++i] ?? outDir;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  const result = await convertHsdataCardsForTest(input, outDir);
  console.log(
    `Converted hsdata build ${result.build}: ${result.totalCards} cards, ` +
      `${result.collectibleCards} collectible -> ${outDir}`,
  );
}

const isCli = process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isCli) {
  main().catch((error: Error) => {
    console.error(error.message);
    process.exit(1);
  });
}
