export type Card = {
  id: string;
  name: string;
  cost: number;
  count: number;
  drawn: number;
  rarity: 'free' | 'common' | 'rare' | 'epic' | 'legendary';
  dbfId?: number;
  imageFallback?: string;
};

// 真实 dbfId 取自 HearthstoneJSON cards.collectible.enUS.json
// 当主进程加载完 CardDb 后，Decklist 会用 dbfId 查回真实 name/cost/rarity 覆盖此处的 mock 值
export const MOCK_DECK: Card[] = [
  { id: '1', name: 'Shield Slam', cost: 1, count: 2, drawn: 0, rarity: 'epic', dbfId: 69641 },
  { id: '2', name: 'Execute', cost: 1, count: 2, drawn: 1, rarity: 'free', dbfId: 69535 },
  { id: '3', name: 'Bash', cost: 2, count: 2, drawn: 0, rarity: 'common', dbfId: 2729 },
  { id: '4', name: 'Bladestorm', cost: 3, count: 2, drawn: 2, rarity: 'epic', dbfId: 56504 },
  { id: '5', name: 'Heavy Plate', cost: 3, count: 2, drawn: 1, rarity: 'common', dbfId: 97333 },
  { id: '6', name: 'Shield Block', cost: 3, count: 2, drawn: 0, rarity: 'free', dbfId: 76302 },
  { id: '7', name: "Craftsman's Hammer", cost: 4, count: 2, drawn: 0, rarity: 'rare' },
  { id: '8', name: 'Ignis, the Eternal Flame', cost: 4, count: 1, drawn: 0, rarity: 'legendary' },
  { id: '9', name: 'Brawl', cost: 5, count: 2, drawn: 1, rarity: 'epic', dbfId: 69640 },
  { id: '10', name: 'Trial by Fire', cost: 6, count: 2, drawn: 0, rarity: 'epic', dbfId: 97700 },
  { id: '11', name: 'Reno, Lone Ranger', cost: 8, count: 1, drawn: 0, rarity: 'legendary' },
  { id: '12', name: 'Odyn, Prime Designate', cost: 8, count: 1, drawn: 1, rarity: 'legendary' },
  { id: '13', name: 'Trenchstalker', cost: 9, count: 2, drawn: 0, rarity: 'epic', dbfId: 74672 },
  { id: '14', name: 'Shield Shatter', cost: 10, count: 2, drawn: 1, rarity: 'rare', dbfId: 67193 },
];

export const MOCK_STATS = {
  wins: 142,
  losses: 98,
  winrate: 59.2,
  currentRank: 'Legend',
  deckName: 'Control Odyn Warrior',
  heroClass: 'Warrior',
};
