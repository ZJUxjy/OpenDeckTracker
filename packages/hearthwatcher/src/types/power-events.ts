import type { PowerTagMap, PowerTagValue } from './power-tags';

export type PowerEntityRef = number | string;

export interface BasePowerEvent {
  raw: string;
  content: string;
  timestamp?: string;
}

export interface CreateGameEvent extends BasePowerEvent {
  type: 'create-game';
}

export interface FullEntityEvent extends BasePowerEvent {
  type: 'full-entity';
  entityId: number;
  cardId: string;
  tags: PowerTagMap;
}

export interface ShowEntityEvent extends BasePowerEvent {
  type: 'show-entity';
  entity: PowerEntityRef;
  cardId: string;
  tags: PowerTagMap;
}

export interface HideEntityEvent extends BasePowerEvent {
  type: 'hide-entity';
  entity: PowerEntityRef;
  tags: PowerTagMap;
}

export interface ChangeEntityEvent extends BasePowerEvent {
  type: 'change-entity';
  entity: PowerEntityRef;
  cardId: string;
  tags: PowerTagMap;
}

export interface TagChangeEvent extends BasePowerEvent {
  type: 'tag-change';
  entity: PowerEntityRef;
  tag: string;
  value: PowerTagValue;
}

export interface BlockStartEvent extends BasePowerEvent {
  type: 'block-start';
  blockType: string;
  entity: PowerEntityRef | null;
  effectCardId: string;
  target: PowerEntityRef | null;
  subOption: number | null;
}

export interface BlockEndEvent extends BasePowerEvent {
  type: 'block-end';
}

export interface ShuffleDeckEvent extends BasePowerEvent {
  type: 'shuffle-deck';
  playerId: number | null;
}

export type PowerEvent =
  | CreateGameEvent
  | FullEntityEvent
  | ShowEntityEvent
  | HideEntityEvent
  | ChangeEntityEvent
  | TagChangeEvent
  | BlockStartEvent
  | BlockEndEvent
  | ShuffleDeckEvent;
