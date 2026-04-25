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
