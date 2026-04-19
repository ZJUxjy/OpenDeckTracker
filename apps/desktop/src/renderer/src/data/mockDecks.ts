export type Card = {
  id: string;
  name: string;
  cost: number;
  count: number;
  drawn: number;
  rarity: 'free' | 'common' | 'rare' | 'epic' | 'legendary';
  imageFallback?: string;
};

export const MOCK_DECK: Card[] = [
  { id: '1', name: 'Shield Slam', cost: 1, count: 2, drawn: 0, rarity: 'epic' },
  { id: '2', name: 'Execute', cost: 1, count: 2, drawn: 1, rarity: 'free' },
  { id: '3', name: 'Bash', cost: 2, count: 2, drawn: 0, rarity: 'common' },
  { id: '4', name: 'Bladestorm', cost: 3, count: 2, drawn: 2, rarity: 'epic' },
  { id: '5', name: 'Heavy Plate', cost: 3, count: 2, drawn: 1, rarity: 'common' },
  { id: '6', name: 'Shield Block', cost: 3, count: 2, drawn: 0, rarity: 'free' },
  { id: '7', name: 'Craftsman\'s Hammer', cost: 4, count: 2, drawn: 0, rarity: 'rare' },
  { id: '8', name: 'Ignis, the Eternal Flame', cost: 4, count: 1, drawn: 0, rarity: 'legendary' },
  { id: '9', name: 'Brawl', cost: 5, count: 2, drawn: 1, rarity: 'epic' },
  { id: '10', name: 'Trial by Fire', cost: 6, count: 2, drawn: 0, rarity: 'epic' },
  { id: '11', name: 'Reno, Lone Ranger', cost: 8, count: 1, drawn: 0, rarity: 'legendary' },
  { id: '12', name: 'Odyn, Prime Designate', cost: 8, count: 1, drawn: 1, rarity: 'legendary' },
  { id: '13', name: 'Trenchstalker', cost: 9, count: 2, drawn: 0, rarity: 'epic' },
  { id: '14', name: 'Shield Shatter', cost: 10, count: 2, drawn: 1, rarity: 'rare' },
];

export const MOCK_STATS = {
  wins: 142,
  losses: 98,
  winrate: 59.2,
  currentRank: 'Legend',
  deckName: 'Control Odyn Warrior',
  heroClass: 'Warrior',
};
