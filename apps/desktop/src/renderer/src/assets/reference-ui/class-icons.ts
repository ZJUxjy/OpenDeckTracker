import type { HeroClass } from '@hdt/core';

import deathKnightIcon from './class-icons/deathknight.png';
import demonHunterIcon from './class-icons/demonhunter.png';
import druidIcon from './class-icons/druid.png';
import hunterIcon from './class-icons/hunter.png';
import mageIcon from './class-icons/mage.png';
import neutralIcon from './logo-hs-cut.png';
import paladinIcon from './class-icons/paladin.png';
import priestIcon from './class-icons/priest.png';
import rogueIcon from './class-icons/rogue.png';
import shamanIcon from './class-icons/shaman.png';
import warlockIcon from './class-icons/warlock.png';
import warriorIcon from './class-icons/warrior.png';

export const CLASS_ICON_IMAGES: Record<HeroClass, string> = {
  DEATHKNIGHT: deathKnightIcon,
  DEMONHUNTER: demonHunterIcon,
  DRUID: druidIcon,
  HUNTER: hunterIcon,
  MAGE: mageIcon,
  PALADIN: paladinIcon,
  PRIEST: priestIcon,
  ROGUE: rogueIcon,
  SHAMAN: shamanIcon,
  WARLOCK: warlockIcon,
  WARRIOR: warriorIcon,
  NEUTRAL: neutralIcon,
};
