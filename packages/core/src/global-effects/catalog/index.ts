import type { EffectDef } from '../types';
import artanis from './artanis';
import brashBattlemaster from './brash-battlemaster';
import cleansingCleric from './cleansing-cleric';
import dewProcess from './dew-process';
import emboldeningBlade from './emboldening-blade';
import forebodingFlame from './foreboding-flame';
import frostLichJaina from './frost-lich-jaina';
import interstellarStarslicer from './interstellar-starslicer';
import interstellarWayfarer from './interstellar-wayfarer';
import inzah from './inzah';
import photonCannon from './photon-cannon';
import pursuitOfJustice from './pursuit-of-justice';
import resilientSavior from './resilient-savior';
import roamFree from './roam-free';
import sentry from './sentry';
import starlightGroove from './starlight-groove';
import talyaEarthstrider from './talya-earthstrider';
import tamePet from './tame-pet';
import theStonewright from './the-stonewright';

// `tamePet` and `roamFree` carry typed params; the catalog erases
// per-effect param types and stores the structural-erased form.
// `Record<string, unknown>` isn't assignable to typed param shapes
// directly (no string index signature), so we route through `unknown`.
const ALL_EFFECTS: readonly EffectDef[] = [
  artanis,
  brashBattlemaster,
  cleansingCleric,
  dewProcess,
  emboldeningBlade,
  forebodingFlame,
  frostLichJaina,
  interstellarStarslicer,
  interstellarWayfarer,
  inzah,
  photonCannon,
  pursuitOfJustice,
  resilientSavior,
  roamFree as unknown as EffectDef,
  sentry,
  starlightGroove,
  talyaEarthstrider,
  tamePet as unknown as EffectDef,
  theStonewright,
];

/**
 * Aggregated, alphabetically-sorted catalog of all known global
 * effects. Renderer / registry consumers MUST treat this as immutable.
 */
export const EFFECT_CATALOG: readonly EffectDef[] = [...ALL_EFFECTS].sort(
  (a, b) => a.id.localeCompare(b.id),
);
