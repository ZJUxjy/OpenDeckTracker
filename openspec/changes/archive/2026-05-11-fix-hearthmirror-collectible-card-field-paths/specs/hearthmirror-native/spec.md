## ADDED Requirements

### Requirement: get_collection parses CollectibleCard elements

`get_collection_internal` SHALL treat each element of
`CollectionManager.m_collectibleCards` as a `CollectibleCard`
instance (not `CollectionCardData`). The three per-element field reads
MUST resolve through these exact field-path strings:

- `dbf_id` → `m_CardDbId`
- `count` → `<OwnedCount>k__BackingField`
- `premium` → `m_PremiumType`

These names are case-and-character exact (the `<…>k__BackingField`
form is the Mono backing-field for the C# auto-property
`int OwnedCount { get; set; }`). The `premium` field's runtime type is
the `Premium` enum (`i32` underlying); reading it via
`read_int32_field` MUST return the numeric enum value.

On a healthy live HS collection, the resulting `CardResult` items
MUST have `dbf_id != 0` for every entry corresponding to a real
collectible card.

#### Scenario: Healthy collection populates non-zero dbf-ids

- **GIVEN** Hearthstone is running with a real player collection
- **WHEN** `get_collection_internal` is invoked
- **THEN** the diagnostic counter `non_zero_dbfid` equals `parsed`
- **AND** the diagnostic counter `field_misses` equals `0`

#### Scenario: Owned count of unowned card is zero, not missing

- **GIVEN** a `CollectibleCard` slot whose
  `<OwnedCount>k__BackingField` is `0` (card seen but not owned)
- **WHEN** `get_collection_internal` parses that element
- **THEN** the resulting `CardResult.count` is `0`
- **AND** `field_misses` does NOT increment for the count field

#### Scenario: Premium field carries enum value

- **GIVEN** a `CollectibleCard` slot whose `m_PremiumType` is the
  `Premium.Golden` enum value (numeric 1)
- **WHEN** `get_collection_internal` parses that element
- **THEN** the resulting `CardResult.premium` is `1`
