## ADDED Requirements

### Requirement: Collection snapshot dedupes by content hash

`CollectionSnapshotStore.save(cards, now?)` SHALL compute a stable
content hash over the incoming card list — canonical over a sort by
`(dbfId, premium)` and aggregating `count` — and compare it to the hash
stored from the previous successful save.

When the incoming hash equals the stored hash, the store MUST:

- Return a `CollectionSnapshot` whose `cards` reflect the call's input
  and whose `lastUpdatedAt` equals the stored value (NOT the `now`
  argument).
- NOT write to the underlying rows or update either `lastUpdatedAt` or
  `cardsHash` meta.

When the incoming hash differs from the stored hash (including the
first save after upgrade with no stored hash), the store MUST:

- Rewrite the card rows atomically with the new content.
- Update `lastUpdatedAt` and `cardsHash` meta in the same transaction.
- Return a `CollectionSnapshot` whose `lastUpdatedAt` matches the new
  value.

The store MUST remain backward-compatible with snapshots saved before
this requirement was introduced: a missing `cardsHash` row MUST be
treated as "no match", causing the next save to compute and persist the
hash for future calls.

#### Scenario: Identical collection preserves lastUpdatedAt

- **GIVEN** the store contains cards saved at `T1`
- **WHEN** `save(sameCards, T2)` is called with `T2 > T1` and a
  card list whose canonical hash matches
- **THEN** the returned snapshot has `lastUpdatedAt === T1`
- **AND** `get().lastUpdatedAt === T1`

#### Scenario: Changed card count updates lastUpdatedAt

- **GIVEN** the store contains `[{ dbfId: 1, count: 2, premium: 0 }]`
  saved at `T1`
- **WHEN** `save([{ dbfId: 1, count: 3, premium: 0 }], T2)` is called
- **THEN** the returned snapshot has `lastUpdatedAt === T2`
- **AND** `get().cards` reflects the new count

#### Scenario: New card added updates lastUpdatedAt

- **GIVEN** the store contains `[{ dbfId: 1, count: 2, premium: 0 }]`
  saved at `T1`
- **WHEN** a save adds a new card `{ dbfId: 2, count: 1, premium: 1 }`
  at `T2`
- **THEN** the returned snapshot has `lastUpdatedAt === T2`

#### Scenario: First save after upgrade computes and stores the hash

- **GIVEN** a pre-existing snapshot was saved before content-hash
  storage was introduced (no `cardsHash` meta row)
- **WHEN** `save(cards, T2)` is called with any card list
- **THEN** the store writes both `lastUpdatedAt = T2` and a new
  `cardsHash`
- **AND** a subsequent `save(sameCards, T3)` returns
  `lastUpdatedAt === T2`

### Requirement: Collection progress passes through dedup timestamp

The collection-progress IPC handler SHALL surface the
`lastUpdatedAt` value returned by `CollectionSnapshotStore.save()`
directly in `CollectionProgressResponse.lastUpdatedAt` whenever the
read came from a successful live sync. The handler MUST NOT clobber
the snapshot's preserved timestamp with `Date.now()`.

#### Scenario: Live read with unchanged content reports the original timestamp

- **GIVEN** the cache holds a snapshot saved at `T1`
- **AND** the live read returns the same cards
- **WHEN** the renderer calls `collection:get-progress` at `T2 > T1`
- **THEN** the response's `lastUpdatedAt === T1`
- **AND** `mirrorAlive === true` and `source === 'live'`
