import type { EffectDef } from '../types';
import artanis from './artanis';
import bolideBehemoth from './bolide-behemoth';
import brashBattlemaster from './brash-battlemaster';
import cleansingCleric from './cleansing-cleric';
import deepminerBrann from './deepminer-brann';
import dewProcess from './dew-process';
import ebyssian from './ebyssian';
import emboldeningBlade from './emboldening-blade';
import forebodingFlame from './foreboding-flame';
import freeSpirit from './free-spirit';
import frostLichJaina from './frost-lich-jaina';
import groovyCat from './groovy-cat';
import infestor from './infestor';
import interstellarStarslicer from './interstellar-starslicer';
import interstellarWayfarer from './interstellar-wayfarer';
import inzah from './inzah';
import leyWalker from './ley-walker';
import lightshow from './lightshow';
import migratingElekk from './migrating-elekk';
import mysticRunesaber from './mystic-runesaber';
import photonCannon from './photon-cannon';
import pursuitOfJustice from './pursuit-of-justice';
import resilientSavior from './resilient-savior';
import roamFree from './roam-free';
import sentry from './sentry';
import starlightGroove from './starlight-groove';
import surgeNeedle from './surge-needle';
import talyaEarthstrider from './talya-earthstrider';
import tamePet from './tame-pet';
import theStonewright from './the-stonewright';

// `tamePet` and `roamFree` carry typed params; the catalog erases
// per-effect param types via the structural `EffectDef` shape (the
// default param type is `unknown`, which accepts any specific param
// shape via covariance — no `as unknown as` casts needed).
const ALL_EFFECTS: readonly EffectDef[] = [
  artanis,
  bolideBehemoth,
  brashBattlemaster,
  cleansingCleric,
  deepminerBrann,
  dewProcess,
  ebyssian,
  emboldeningBlade,
  forebodingFlame,
  freeSpirit,
  frostLichJaina,
  groovyCat,
  infestor,
  interstellarStarslicer,
  interstellarWayfarer,
  inzah,
  leyWalker,
  lightshow,
  migratingElekk,
  mysticRunesaber,
  photonCannon,
  pursuitOfJustice,
  resilientSavior,
  roamFree,
  sentry,
  starlightGroove,
  surgeNeedle,
  talyaEarthstrider,
  tamePet,
  theStonewright,
];

/**
 * Aggregated, alphabetically-sorted catalog of all known global
 * effects. Renderer / registry consumers MUST treat this as immutable.
 */
export const EFFECT_CATALOG: readonly EffectDef[] = [...ALL_EFFECTS].sort(
  (a, b) => a.id.localeCompare(b.id),
);
