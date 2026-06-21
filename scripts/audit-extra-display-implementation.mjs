import fs from 'fs';
import path from 'path';

const root = path.resolve(import.meta.dirname, '..');
const dir = path.join(root, 'data/cards/review/standard-extra-display-candidates');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'rejected.json');

const vocab = fs.readFileSync(path.join(root, 'data/cards/schema/stateNeeded-vocabulary.md'), 'utf8');
const vocabKeys = new Set(
  [...vocab.matchAll(/`([a-zA-Z0-9_.]+)`/g)]
    .map((m) => m[1])
    .filter((k) => !k.includes('cardCode')),
);

const stateSrc = fs.readFileSync(path.join(root, 'packages/core/src/tracker/extra-display-state.ts'), 'utf8');
const deckSrc = fs.readFileSync(path.join(root, 'packages/core/src/tracker/deck-tracker.ts'), 'utf8');
const livePanel = fs.readFileSync(
  path.join(root, 'apps/desktop/src/renderer/src/components/LiveDeckPanel.tsx'),
  'utf8',
);

const trackedCounters = new Set([...stateSrc.matchAll(/(?:increment|setCounter)\('([^']+)'/g)].map((m) => m[1]));
const trackedPools = new Set([...stateSrc.matchAll(/incrementPool\('([^']+)'/g)].map((m) => m[1]));
const trackedPoolAliases = new Set([
  ...stateSrc.matchAll(/pools\['([^']+)'\]/g),
  ...stateSrc.matchAll(/pools\.([a-zA-Z0-9_.]+)\s*=/g),
  ...deckSrc.matchAll(/add\('([^']+)'/g),
].map((m) => m[1]));

const SOFT_KEYS = new Set([
  'currentCost',
  'entityIdScopedCounter',
  'infuseRequired',
  'infusedState',
  'spellsCastWhileThisEntityInHand',
  'spellstoneUpgradeState',
  'currentSpellDamageValue',
  'friendlyBoardSpace',
]);
const specialCards = new Set([...livePanel.matchAll(/if \(cardId === '([^']+)'\)/g)].map((m) => m[1]));
const staticHover = new Set([...livePanel.matchAll(/getStaticHoverPoolCardIds|STATIC_HOVER|staticHover/g)]);

function classifyKey(key) {
  if (key.startsWith('counter.') || key.startsWith('cardState.')) {
    return { status: 'entity_tag' };
  }
  if (key.startsWith('graveyardPool.') || key.startsWith('deckPool.')) {
    const aliased = trackedPoolAliases.has(key);
    return { status: aliased ? 'implemented_pool' : 'card_specific_pool' };
  }
  if (trackedCounters.has(key)) return { status: 'implemented_counter' };
  if (trackedPools.has(key) || trackedPoolAliases.has(key)) return { status: 'implemented_pool' };
  if (vocabKeys.has(key)) return { status: 'vocab_only' };
  return { status: 'missing' };
}

const allCards = [];
for (const file of files) {
  const data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
  for (const card of data.cards ?? []) {
    allCards.push({ ...card, _file: file });
  }
}

const buckets = { full: [], partial: [], none: [], triggerOnly: [] };

for (const card of allCards) {
  const ed = card.extraDisplay ?? {};
  const states = ed.stateNeeded ?? [];
  const displayType = ed.displayType ?? '';
  const code = card.cardCode;

  if (displayType === 'on_board_trigger_highlight') {
    buckets.triggerOnly.push({ code, name: card.cardNameZhCN, file: card._file });
    continue;
  }

  if (states.length === 0) {
    buckets.none.push({ code, name: card.cardNameZhCN, file: card._file, reason: 'no stateNeeded' });
    continue;
  }

  const keyStatuses = states.map((k) => ({ key: k, ...classifyKey(k) }));
  const hasSpecial = specialCards.has(code);
  const implStatuses = new Set(['implemented_counter', 'implemented_pool', 'entity_tag']);

  const allImpl = keyStatuses.every((k) => implStatuses.has(k.status));
  const anyImpl = keyStatuses.some((k) => implStatuses.has(k.status));
  const missingKeys = keyStatuses.filter((k) => k.status === 'missing');
  const vocabOnlyKeys = keyStatuses.filter((k) => k.status === 'vocab_only');
  const cardPoolKeys = keyStatuses.filter((k) => k.status === 'card_specific_pool');

  const entry = {
    code,
    name: card.cardNameZhCN,
    file: card._file,
    displayType,
    keyStatuses,
    hasSpecial,
  };

  const hardMissing = missingKeys.filter((k) => !SOFT_KEYS.has(k));

  if (allImpl || (anyImpl && hasSpecial && hardMissing.length === 0) || (allImpl && hardMissing.length === 0)) {
    buckets.full.push(entry);
  } else if (
    anyImpl ||
    vocabOnlyKeys.some((k) => trackedCounters.has(k.key) || trackedPools.has(k.key) || trackedPoolAliases.has(k.key)) ||
    cardPoolKeys.some((k) => trackedPoolAliases.has(k.key))
  ) {
    buckets.partial.push({
      ...entry,
      missingKeys: missingKeys.map((k) => k.key),
      vocabOnlyKeys: vocabOnlyKeys.map((k) => k.key),
      unwiredPools: cardPoolKeys.filter((k) => !trackedPoolAliases.has(k.key)).map((k) => k.key),
    });
  } else {
    buckets.none.push({
      ...entry,
      missingKeys: missingKeys.map((k) => k.key),
    });
  }
}

console.log(JSON.stringify({
  total: allCards.length,
  rejectedCount: JSON.parse(fs.readFileSync(path.join(dir, 'rejected.json'), 'utf8')).count,
  full: buckets.full.length,
  partial: buckets.partial.length,
  none: buckets.none.length,
  triggerOnly: buckets.triggerOnly.length,
}, null, 2));

console.log('\n--- NONE / NOT TRACKED ---');
for (const x of buckets.none) {
  console.log(`${x.code}\t${x.name}\t${x.displayType ?? x.reason}\t${(x.missingKeys ?? x.keyStatuses?.map((k) => k.key) ?? []).join(',')}`);
}

console.log('\n--- PARTIAL ---');
for (const x of buckets.partial) {
  console.log(`${x.code}\t${x.name}\t${x.displayType}\tmissing=${x.missingKeys?.join('|') ?? ''}\tvocabOnly=${x.vocabOnlyKeys?.join('|') ?? ''}\tunwiredPool=${x.unwiredPools?.join('|') ?? ''}\tspecial=${x.hasSpecial}`);
}

console.log('\n--- FULL ---');
for (const x of buckets.full) {
  console.log(`${x.code}\t${x.name}\t${x.displayType}${x.hasSpecial ? ' (+special UI)' : ''}`);
}

console.log('\n--- TRIGGER ONLY ---');
for (const x of buckets.triggerOnly) {
  console.log(`${x.code}\t${x.name}`);
}
