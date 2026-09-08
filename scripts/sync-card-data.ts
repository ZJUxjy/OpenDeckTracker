import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { checkLatestCardRelease, prepareCardRelease, validateRelease } from './lib/card-data-release';

const latest = process.argv.includes('--latest');
const sourcePath = 'data/cards/source.json';
const release = latest ? await checkLatestCardRelease() : validateRelease(JSON.parse(await fs.readFile(sourcePath, 'utf8')));
const stage = path.resolve('data/cards', `.update-${randomUUID()}`);
const output = path.resolve('data/cards/generated');
const backup = path.resolve('data/cards', `.previous-${randomUUID()}`);
const verified = await prepareCardRelease(release, stage);
const stagedManifest = path.join(stage, 'source.json');
if (latest) await fs.writeFile(stagedManifest, JSON.stringify(verified, null, 2) + '\n');
let hadPrevious = false;
try { await fs.rename(output, backup); hadPrevious = true; } catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
}
try { await fs.rename(path.join(stage, 'generated'), output); } catch (error) {
  if (hadPrevious) await fs.rename(backup, output);
  throw error;
}
if (latest) {
  try { await fs.rename(stagedManifest, sourcePath); }
  catch (error) {
    await fs.rename(output, path.join(stage, 'generated'));
    if (hadPrevious) await fs.rename(backup, output);
    throw error;
  }
}
await fs.rmdir(stage);
console.log(`Card data ready: ${verified.version} (${verified.commit}).${hadPrevious ? ` Previous data: ${backup}` : ''}`);
