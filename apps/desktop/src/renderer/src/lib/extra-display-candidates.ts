import deathknight from '../../../../../../data/cards/review/standard-extra-display-candidates/deathknight.json';
import demonhunter from '../../../../../../data/cards/review/standard-extra-display-candidates/demonhunter.json';
import druid from '../../../../../../data/cards/review/standard-extra-display-candidates/druid.json';
import hunter from '../../../../../../data/cards/review/standard-extra-display-candidates/hunter.json';
import mage from '../../../../../../data/cards/review/standard-extra-display-candidates/mage.json';
import neutral from '../../../../../../data/cards/review/standard-extra-display-candidates/neutral.json';
import paladin from '../../../../../../data/cards/review/standard-extra-display-candidates/paladin.json';
import priest from '../../../../../../data/cards/review/standard-extra-display-candidates/priest.json';
import rogue from '../../../../../../data/cards/review/standard-extra-display-candidates/rogue.json';
import shaman from '../../../../../../data/cards/review/standard-extra-display-candidates/shaman.json';
import warlock from '../../../../../../data/cards/review/standard-extra-display-candidates/warlock.json';
import warrior from '../../../../../../data/cards/review/standard-extra-display-candidates/warrior.json';

interface CandidateFile {
  cards?: ExtraDisplayCandidate[];
}

export interface ExtraDisplayCandidate {
  cardCode: string;
  cardNameZhCN: string;
  cardTextZhCNPlain?: string;
  type?: string;
  cost?: number;
  extraDisplay?: {
    displayType?: string;
    implementationPriority?: string;
    displaySurfaces?: string[];
    stateNeeded?: string[];
    suggestedDisplayTextZhCN?: string;
    reasoningZhCN?: string;
    emptyWarning?: boolean;
    /** When displayType is `on_board_trigger_highlight`, describes what to highlight. */
    triggerHighlight?: {
      matchSpellSchool?: string;
      matchRace?: string;
    };
  };
}

/** All candidates whose displayType marks them as a board-resident trigger. */
export function getOnBoardTriggerCandidates(): ExtraDisplayCandidate[] {
  return ON_BOARD_TRIGGER_CANDIDATES;
}

const candidateFiles = [
  deathknight,
  demonhunter,
  druid,
  hunter,
  mage,
  neutral,
  paladin,
  priest,
  rogue,
  shaman,
  warlock,
  warrior,
] as CandidateFile[];

const CANDIDATES_BY_CARD_ID = new Map<string, ExtraDisplayCandidate>();
const ON_BOARD_TRIGGER_CANDIDATES: ExtraDisplayCandidate[] = [];

for (const file of candidateFiles) {
  for (const card of file.cards ?? []) {
    CANDIDATES_BY_CARD_ID.set(card.cardCode, card);
    if (card.extraDisplay?.displayType === 'on_board_trigger_highlight') {
      ON_BOARD_TRIGGER_CANDIDATES.push(card);
    }
  }
}

export function getExtraDisplayCandidate(cardId: string): ExtraDisplayCandidate | null {
  return CANDIDATES_BY_CARD_ID.get(cardId) ?? null;
}
