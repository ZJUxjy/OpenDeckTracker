import type { Zone } from '@hdt/core';
import type { PowerEvent, PowerEntityRef } from '../types/power-events';
import { zoneFromTagValue, type PowerTagMap, type PowerTagValue } from '../types/power-tags';
import { HearthWatcherGameState } from './hearthwatcher-game-state';

export function reducePowerEvent(
  state: HearthWatcherGameState,
  event: PowerEvent,
): HearthWatcherGameState {
  switch (event.type) {
    case 'create-game':
      return state;
    case 'full-entity': {
      const controllerId = numericTag(event.tags.CONTROLLER) ?? numericTag(event.tags.PLAYER_ID);
      const update: Parameters<HearthWatcherGameState['upsertEntity']>[0] = {
        entityId: event.entityId,
        cardId: event.cardId,
        tags: event.tags,
      };
      const zone = zoneFromTags(event.tags);
      if (zone !== undefined) update.zone = zone;
      if (controllerId !== undefined) update.controllerId = controllerId;
      state.upsertEntity(update);
      return state;
    }
    case 'show-entity':
    case 'change-entity': {
      const entityId = numericEntityRef(event.entity);
      if (entityId === null) return state;
      const update: Parameters<HearthWatcherGameState['upsertEntity']>[0] = {
        entityId,
        cardId: event.cardId,
        tags: event.tags,
        info: { hidden: false },
      };
      const zone = zoneFromTags(event.tags);
      const controllerId = numericTag(event.tags.CONTROLLER) ?? numericTag(event.tags.PLAYER_ID);
      if (zone !== undefined) update.zone = zone;
      if (controllerId !== undefined) update.controllerId = controllerId;
      state.upsertEntity(update);
      return state;
    }
    case 'hide-entity': {
      const entityId = numericEntityRef(event.entity);
      if (entityId !== null) {
        state.upsertEntity({ entityId, tags: event.tags, info: { hidden: true } });
      }
      return state;
    }
    case 'tag-change': {
      const entityId = numericEntityRef(event.entity);
      if (entityId === null) return state;
      const tag = event.tag;
      if (tag === 'ZONE') {
        state.upsertEntity({ entityId, zone: zoneFromTagValue(event.value) });
      } else if (tag === 'CONTROLLER' || tag === 'PLAYER_ID') {
        const controllerId = numericTag(event.value);
        if (controllerId !== undefined) state.upsertEntity({ entityId, controllerId });
      } else if (tag === 'MULLIGAN_STATE') {
        state.upsertEntity({ entityId, info: { mulliganed: String(event.value) !== 'INPUT' } });
      } else {
        state.upsertEntity({ entityId, tags: { [tag]: event.value } });
      }
      return state;
    }
    case 'block-start':
    case 'block-end':
    case 'shuffle-deck':
      return state;
  }
}

function zoneFromTags(tags: PowerTagMap): Zone | undefined {
  if (tags.ZONE === undefined) return undefined;
  return zoneFromTagValue(tags.ZONE);
}

function numericTag(value: PowerTagValue | undefined): number | undefined {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value);
  return undefined;
}

function numericEntityRef(value: PowerEntityRef): number | null {
  return typeof value === 'number' ? value : null;
}
