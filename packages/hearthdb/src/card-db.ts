import type { CardDef } from './card-defs';
import { matches, type SearchFilter } from './card-search';

export class CardDb {
  private readonly byDbfId = new Map<number, CardDef>();
  private readonly byId = new Map<string, CardDef>();

  constructor(cards: readonly CardDef[]) {
    for (const c of cards) {
      if (typeof c.dbfId === 'number') this.byDbfId.set(c.dbfId, c);
      if (typeof c.id === 'string' && c.id.length > 0) this.byId.set(c.id, c);
    }
  }

  get size(): number {
    return this.byDbfId.size;
  }

  findByDbfId(dbfId: number): CardDef | undefined {
    return this.byDbfId.get(dbfId);
  }

  findById(id: string): CardDef | undefined {
    return this.byId.get(id);
  }

  search(filter: SearchFilter): CardDef[] {
    const limit = filter.limit ?? 50;
    const offset = filter.offset ?? 0;
    const out: CardDef[] = [];
    let matched = 0;

    for (const c of this.byDbfId.values()) {
      if (!matches(c, filter)) continue;
      if (matched >= offset && out.length < limit) {
        out.push(c);
      }
      matched += 1;
      if (out.length >= limit) break;
    }
    return out;
  }
}
