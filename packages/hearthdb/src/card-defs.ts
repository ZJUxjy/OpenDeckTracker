export type CardClass =
  | 'DEATHKNIGHT'
  | 'DEMONHUNTER'
  | 'DRUID'
  | 'HUNTER'
  | 'MAGE'
  | 'PALADIN'
  | 'PRIEST'
  | 'ROGUE'
  | 'SHAMAN'
  | 'WARLOCK'
  | 'WARRIOR'
  | 'NEUTRAL'
  | 'DREAM'
  | 'WHIZBANG';

export type Rarity = 'FREE' | 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY';

export type CardType =
  | 'MINION'
  | 'SPELL'
  | 'WEAPON'
  | 'HERO'
  | 'HERO_POWER'
  | 'ENCHANTMENT'
  | 'LOCATION'
  | 'GAME_MODE_BUTTON'
  | 'MOVE_MINION_HOVER_TARGET'
  | 'MERCENARY_ABILITY'
  | 'BATTLEGROUND_HERO_BUDDY'
  | 'BATTLEGROUND_SPELL'
  | 'BATTLEGROUND_QUEST_REWARD'
  | 'BATTLEGROUND_TRINKET'
  | 'BATTLEGROUND_ANOMALY'
  | 'PET';

export interface CardDef {
  id: string;
  dbfId: number;
  name: string;
  cost?: number;
  attack?: number;
  health?: number;
  armor?: number;
  text?: string;
  cardClass: CardClass;
  rarity?: Rarity;
  set: string;
  type: CardType;
  mechanics?: string[];
  collectible: boolean;
}
