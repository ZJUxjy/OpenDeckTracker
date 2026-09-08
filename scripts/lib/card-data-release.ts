import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { convertHsdataCardsForTest } from './hsdata-converter';

export interface CardDataRelease {
  commit: string;
  version: string;
  build: string;
  sha256?: string;
}

export function validateRelease(value: CardDataRelease): CardDataRelease {
  if (!/^[a-f0-9]{40}$/.test(value.commit) || !/^\d+(\.\d+){3}$/.test(value.version) ||
      value.version.split('.').at(-1) !== value.build ||
      (value.sha256 !== undefined && !/^[a-f0-9]{64}$/.test(value.sha256))) {
    throw new Error('Invalid card data release');
  }
  return value;
}

async function request(url: string, fetcher: typeof fetch): Promise<Response> {
  const response = await fetcher(url, {
    signal: AbortSignal.timeout(180_000),
    headers: { 'User-Agent': 'OpenDeckTracker-card-data' },
  });
  if (!response.ok) throw new Error(`Card data download: HTTP ${response.status}`);
  return response;
}

export async function checkLatestCardRelease(fetcher: typeof fetch = fetch): Promise<CardDataRelease> {
  const commit = await (await request('https://api.github.com/repos/HearthSim/hsdata/commits/master', fetcher)).json() as { sha: string };
  if (!/^[a-f0-9]{40}$/.test(commit.sha)) throw new Error('Invalid upstream commit');
  const readme = await (await request(`https://raw.githubusercontent.com/HearthSim/hsdata/${commit.sha}/README.md`, fetcher)).text();
  const version = /Version:\s*(\d+\.\d+\.\d+\.(\d+))/.exec(readme);
  if (!version?.[1] || !version[2]) throw new Error('Missing upstream version');
  return validateRelease({ commit: commit.sha, version: version[1], build: version[2] });
}

/** Writes only to a staging directory. Callers publish after complete validation. */
export async function prepareCardRelease(
  release: CardDataRelease, directory: string, fetcher: typeof fetch = fetch,
): Promise<CardDataRelease> {
  validateRelease(release);
  await fs.mkdir(directory, { recursive: true });
  const xml = path.join(directory, 'CardDefs.xml');
  const bytes = Buffer.from(await (await request(
    `https://raw.githubusercontent.com/HearthSim/hsdata/${release.commit}/CardDefs.xml`, fetcher,
  )).arrayBuffer());
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (release.sha256 && release.sha256 !== sha256) throw new Error('Card data checksum mismatch');
  await fs.writeFile(xml, bytes);
  const generated = path.join(directory, 'generated');
  const result = await convertHsdataCardsForTest(xml, generated);
  if (result.build !== release.build || result.totalCards === 0 || result.collectibleCards === 0) {
    throw new Error('Card data validation failed');
  }
  const metadataPath = path.join(generated, 'card-build.json');
  const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8'));
  const verified = { ...release, sha256 };
  await fs.writeFile(metadataPath, JSON.stringify({ ...metadata, ...verified,
    source: `HearthSim/hsdata@${release.commit}` }, null, 2) + '\n');
  await fs.unlink(xml);
  return verified;
}
