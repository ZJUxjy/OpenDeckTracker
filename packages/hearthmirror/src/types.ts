export interface BattleTag {
  name: string;
  fullBattleTag: string;
}

export interface AccountId {
  hi: bigint;
  lo: bigint;
}

export interface Card {
  dbfId: number;
  count: number;
  premium: number;
}

export interface Deck {
  id: number;
  name: string;
  hero: string;
  formatType: number;
  deckType: number;
  cards: Card[];
}

export interface MatchPlayer {
  id: number;
  name: string;
  accountId: AccountId;
  battleTag: BattleTag;
  standardRank: number;
  wildRank: number;
  classicRank: number;
  twistRank: number;
}

export interface MatchInfo {
  localPlayer: MatchPlayer;
  opposingPlayer: MatchPlayer;
  missionId: number;
  gameType: number;
  formatType: number;
}

export interface MedalInfoData {
  leagueId: number;
  starLevel: number;
  stars: number;
  legendRank: number;
  seasonId: number;
  seasonWins: number;
}

export interface MedalInfo {
  standard: MedalInfoData | null;
  wild: MedalInfoData | null;
  classic: MedalInfoData | null;
  twist: MedalInfoData | null;
}

export interface ArenaInfo {
  deck: Deck;
  wins: number;
  losses: number;
}

export interface BattlegroundRatingInfo {
  rating: number;
  rank: number;
}

export interface GameServerInfo {
  address: string;
  port: number;
  mission: number;
  gameHandle: number;
  version: string;
  resumable: boolean;
}

export interface FieldDump {
  name: string;
  offset: number;
}

export type FieldDumpEntry = FieldDump;

export interface ServiceInfo {
  name: string;
  addr: number;
}

export type ServiceEntry = ServiceInfo;
