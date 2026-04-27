## MODIFIED Requirements

### Requirement: 下载脚本

The repository SHALL contain a default local card-data refresh command `pnpm cards:convert` that converts `data/cards/hsdata/CardDefs.xml` into generated JSON card datasets under `data/cards/generated/`. The converter SHALL emit at least `cards.all.enUS.json`, `cards.all.zhCN.json`, `cards.collectible.enUS.json`, `cards.collectible.zhCN.json`, and `card-build.json`. The existing `pnpm cards:download` command MAY remain as an explicit HearthstoneJSON fallback, but CI and README quickstart SHALL use `pnpm cards:convert` by default.

#### Scenario: 成功转换本地 hsdata XML

- **GIVEN** `data/cards/hsdata/CardDefs.xml` exists and is valid hsdata XML
- **WHEN** executing `pnpm cards:convert`
- **THEN** the command exits with code 0 and writes the required generated JSON files under `data/cards/generated/`

#### Scenario: XML 文件缺失时明确失败

- **GIVEN** `data/cards/hsdata/CardDefs.xml` does not exist
- **WHEN** executing `pnpm cards:convert`
- **THEN** the command exits non-zero and stderr contains `CardDefs.xml` and the expected input path

#### Scenario: legacy download is not the default CI path

- **WHEN** inspecting README quickstart and CI workflow commands
- **THEN** they invoke `pnpm cards:convert` instead of relying on `pnpm cards:download`

### Requirement: 数据归属与策略文档

The `data/cards/` directory SHALL contain a `README.md` documenting the hsdata source (`data/cards/hsdata/CardDefs.xml`), client build metadata, generated output paths, license/attribution notes, whether generated JSON files are committed, and the command to refresh data (`pnpm cards:convert`). The README SHALL also mention that `pnpm cards:download` is a legacy HearthstoneJSON fallback if retained.

#### Scenario: README 章节齐全

- **WHEN** reading `data/cards/README.md`
- **THEN** the file contains substrings `hsdata`, `CardDefs.xml`, `pnpm cards:convert`, `data/cards/generated`, and `HearthstoneJSON`

### Requirement: gitignore 排除 JSON 数据

The `.gitignore` SHALL exclude generated card JSON under `data/cards/generated/*.json` so local conversion artifacts do not appear as untracked files unless the repository explicitly changes to committing generated data.

#### Scenario: gitignore 命中

- **GIVEN** `pnpm cards:convert` produced `data/cards/generated/cards.all.enUS.json`
- **WHEN** running `git status --short`
- **THEN** the generated JSON file does not appear as an untracked file

### Requirement: CI 工作流自动下载

The CI workflow SHALL invoke `pnpm cards:convert` after dependency installation and before `pnpm test`, so CI runs against the same local hsdata-derived card data as developers. CI SHALL NOT require network access to HearthstoneJSON for the default test path.

#### Scenario: CI 步骤顺序

- **WHEN** inspecting `.github/workflows/ci.yml`
- **THEN** `pnpm cards:convert` appears after dependency installation and before `pnpm test`

#### Scenario: CI 不依赖网络下载卡牌数据

- **WHEN** CI runs with network access disabled after dependencies are installed
- **THEN** the card-data refresh step still succeeds using `data/cards/hsdata/CardDefs.xml`

## ADDED Requirements

### Requirement: hsdata XML 转换映射

The converter SHALL map hsdata XML `Entity` and `Tag` data into the project `CardDef` JSON shape. It SHALL map `CardID` to `id`, `ID` to `dbfId`, localized `CARDNAME` to `name`, `COST` to `cost`, `ATK` to `attack`, `HEALTH` to `health`, `ARMOR` to `armor`, `CARDTEXT_INHAND` to `text`, `CLASS` to `cardClass`, `CARD_SET` to `set`, `CARDTYPE` to `type`, `RARITY` to `rarity`, `COLLECTIBLE` to `collectible`, and mechanics tags to `mechanics`.

#### Scenario: representative card converts to CardDef

- **GIVEN** a fixture XML card with `CardID="CS2_029"`, `ID="315"`, `CARDNAME.enUS="Fireball"`, `COST=4`, `CLASS=MAGE`, `CARDTYPE=SPELL`, and `COLLECTIBLE=1`
- **WHEN** the converter processes the fixture
- **THEN** the generated `CardDef` has `id="CS2_029"`, `dbfId=315`, `name="Fireball"`, `cost=4`, `cardClass="MAGE"`, `type="SPELL"`, and `collectible=true`

#### Scenario: zhCN locale fallback

- **GIVEN** a fixture XML card with `CARDNAME.enUS` but no `CARDNAME.zhCN`
- **WHEN** generating `cards.all.zhCN.json`
- **THEN** the generated card uses the `enUS` name instead of an empty string

### Requirement: deterministic generated output

The converter SHALL produce deterministic JSON output for the same XML input. Cards SHALL be sorted by ascending `dbfId` and then by `id`, and object fields SHALL be emitted in a stable order.

#### Scenario: repeated conversion is byte-stable

- **GIVEN** an unchanged `CardDefs.xml`
- **WHEN** running `pnpm cards:convert` twice
- **THEN** the generated JSON file contents are byte-identical across both runs

### Requirement: conversion validation

The converter SHALL validate that every emitted card has a non-empty `id`, integer `dbfId`, non-empty `name`, string `set`, string `type`, string `cardClass`, and boolean `collectible`. It SHALL fail with a clear error for duplicate non-zero `dbfId` values, duplicate non-empty `id` values, malformed XML, or unsupported enum values that cannot be mapped safely.

#### Scenario: duplicate card id fails conversion

- **GIVEN** a fixture XML with two `Entity` nodes using the same `CardID`
- **WHEN** executing the converter
- **THEN** conversion fails and the error message contains the duplicate `CardID`

#### Scenario: unsupported enum reports card context

- **GIVEN** a fixture XML card with an unsupported `CARDTYPE` enum value
- **WHEN** executing the converter
- **THEN** conversion fails and the error message contains `CARDTYPE`, the unsupported value, and the affected `CardID`

### Requirement: build metadata artifact

The converter SHALL write `data/cards/generated/card-build.json` containing at least the XML build number, source path, generated timestamp, total card count, collectible card count, and locale list.

#### Scenario: metadata contains build and counts

- **WHEN** reading `data/cards/generated/card-build.json` after conversion
- **THEN** it contains `build`, `source`, `generatedAt`, `totalCards`, `collectibleCards`, and `locales`
