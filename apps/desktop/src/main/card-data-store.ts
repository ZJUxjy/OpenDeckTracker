import fs from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { checkLatestCardRelease, prepareCardRelease, type CardDataRelease } from '../../../../scripts/lib/card-data-release';

export interface CardDataMetadata {
  build: string;
  version?: string;
  commit?: string;
  generatedAt: string;
  totalCards: number;
  collectibleCards: number;
}
export interface CardDataStatus {
  active: CardDataMetadata | null;
  pending: CardDataMetadata | null;
  latest: CardDataRelease | null;
  canRollback: boolean;
  busy: boolean;
}
type Pointer = { current: string | null; previous: string | null };

/** Immutable version directories plus one atomic pointer; this process keeps its initial version. */
export class CardDataStore {
  readonly activeDirectory: string;
  private latest: CardDataRelease | null = null;
  private busy = false;

  constructor(private root: string, private bundledDirectory: string, private fetcher: typeof fetch = fetch) {
    const pointer = this.readPointer();
    this.activeDirectory = this.usableDirectory(pointer.current) ??
      this.usableDirectory(pointer.previous) ?? bundledDirectory;
  }

  private directory(id: string | null): string {
    if (id === null) return this.bundledDirectory;
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('Invalid card data pointer');
    return path.join(this.root, id, 'generated');
  }

  private readPointer(): Pointer {
    try {
      const value = JSON.parse(readFileSync(path.join(this.root, 'current.json'), 'utf8')) as Pointer;
      this.directory(value.current); this.directory(value.previous);
      return value;
    } catch { return { current: null, previous: null }; }
  }

  private usableDirectory(id: string | null): string | null {
    const directory = this.directory(id);
    return ['card-build.json', 'cards.all.enUS.json', 'cards.all.zhCN.json'].every(
      name => existsSync(path.join(directory, name)),
    ) ? directory : null;
  }

  private async metadata(directory: string): Promise<CardDataMetadata | null> {
    try { return JSON.parse(await fs.readFile(path.join(directory, 'card-build.json'), 'utf8')); }
    catch { return null; }
  }

  async getStatus(): Promise<CardDataStatus> {
    const pointer = this.readPointer();
    const nextDirectory = this.directory(pointer.current);
    return {
      active: await this.metadata(this.activeDirectory),
      pending: nextDirectory === this.activeDirectory ? null : await this.metadata(nextDirectory),
      latest: this.latest,
      canRollback: pointer.current !== pointer.previous,
      busy: this.busy,
    };
  }

  async check(): Promise<CardDataStatus> {
    this.latest = await checkLatestCardRelease(this.fetcher);
    return this.getStatus();
  }

  private async publish(pointer: Pointer): Promise<void> {
    await fs.mkdir(this.root, { recursive: true });
    const tmp = path.join(this.root, `${randomUUID()}.json`);
    await fs.writeFile(tmp, JSON.stringify(pointer));
    await fs.rename(tmp, path.join(this.root, 'current.json'));
  }

  async install(): Promise<CardDataStatus> {
    if (this.busy) throw new Error('Card data operation already running');
    this.busy = true;
    try {
      const release = this.latest ?? await checkLatestCardRelease(this.fetcher);
      const pointer = this.readPointer();
      const selected = await this.metadata(this.directory(pointer.current));
      if (selected?.commit !== release.commit) {
        const id = randomUUID();
        await prepareCardRelease(release, path.join(this.root, id), this.fetcher);
        await this.publish({ current: id, previous: pointer.current });
      }
      this.latest = release;
    } finally { this.busy = false; }
    return this.getStatus();
  }

  async rollback(): Promise<CardDataStatus> {
    if (this.busy) throw new Error('Card data operation already running');
    this.busy = true;
    try {
      const pointer = this.readPointer();
      if (pointer.current === pointer.previous || !this.usableDirectory(pointer.previous)) {
        throw new Error('No previous card data available');
      }
      await this.publish({ current: pointer.previous, previous: pointer.current });
    } finally { this.busy = false; }
    return this.getStatus();
  }
}
