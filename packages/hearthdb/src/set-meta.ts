// Set rotation metadata — hand-curated constants.
//
// MAINTENANCE BURDEN: Update STANDARD_SET_CODES every time Blizzard
// announces a new Standard rotation (typically each April and with
// each new expansion launch). The current list reflects the Standard
// rotation in effect as of May 2026 (post-Cataclysm rotation).
//
// Source: https://news.blizzard.com/en-us/hearthstone/24058436/
//   (last verified rotation; refresh with a newer announcement URL
//    when the next rotation lands.)
//
// When updating:
// 1. Move rotated-out sets from STANDARD_SET_CODES (they stay in SET_LABELS).
// 2. Add the new expansion's set code to STANDARD_SET_CODES.
// 3. Add its display name to SET_LABELS.
// 4. Update this source URL to the latest announcement.
//
// Set codes are the internal Blizzard identifiers (e.g. SET_1892)
// used in Cards.json, NOT the marketing slugs (e.g. "whizbangs-workshop").

/** Current Standard-legal set codes, oldest first. */
export const STANDARD_SET_CODES: readonly string[] = [
  'SET_1810', // Core
  'SET_1941', // Event
  'SET_1946', // Into the Emerald Dream
  'SET_1952', // The Lost City of Un'Goro
  'SET_1957', // Across the Timeways
  'SET_1980', // Cataclysm
] as const;

/**
 * Display names for set codes. Covers Standard, Wild, Classic, and
 * adventure sets. Unknown set codes fall back to the i18n
 * `collection.progress.unknownSet` key at render time.
 */
export const SET_LABELS: Record<string, { 'en-US': string; 'zh-CN': string }> = {
  // ── Standard ──────────────────────────────────────────────
  SET_1810: { 'en-US': 'Core',                       'zh-CN': '核心' },
  SET_1941: { 'en-US': 'Event',                      'zh-CN': '活动' },
  SET_1946: { 'en-US': 'Into the Emerald Dream',     'zh-CN': '漫游翡翠梦境' },
  SET_1952: { 'en-US': "The Lost City of Un'Goro",   'zh-CN': '安戈洛龟途' },
  SET_1957: { 'en-US': 'Across the Timeways',        'zh-CN': '穿越时间流' },
  SET_1980: { 'en-US': 'Cataclysm',                  'zh-CN': '大地的裂变' },

  // ── Recently rotated out (still in Wild) ──────────────────
  SET_1809: { 'en-US': 'Festival of Legends',        'zh-CN': '传奇节日' },
  SET_1858: { 'en-US': 'TITANS',                     'zh-CN': '泰坦' },
  SET_1892: { 'en-US': 'Showdown in the Badlands',   'zh-CN': '决战荒芜之地' },
  SET_1897: { 'en-US': "Whizbang's Workshop",        'zh-CN': '砰砰实验室' },
  SET_1905: { 'en-US': 'Perils in Paradise',         'zh-CN': '天堂危机' },
  SET_1935: { 'en-US': 'The Great Dark Beyond',      'zh-CN': '大黑暗彼岸' },

  // ── Wild expansions ───────────────────────────────────────
  SET_3:    { 'en-US': 'Legacy',                     'zh-CN': '传承' },
  SET_1635: { 'en-US': 'Core (2021)',                'zh-CN': '核心（2021）' },
  SET_1637: { 'en-US': 'Core (2022)',                'zh-CN': '核心（2022）' },
  SET_1525: { 'en-US': 'Forged in the Barrens',      'zh-CN': '贫瘠之地的锻造' },
  SET_1578: { 'en-US': 'United in Stormwind',        'zh-CN': '暴风城集结' },
  SET_1626: { 'en-US': 'Fractured in Alterac Valley','zh-CN': '奥特兰克的决裂' },
  SET_1658: { 'en-US': 'Voyage to the Sunken City',  'zh-CN': '探寻沉没之城' },
  SET_1691: { 'en-US': 'Murder at Castle Nathria',   'zh-CN': '纳堡凶案' },
  SET_1776: { 'en-US': 'Path of Arthas',             'zh-CN': '阿尔萨斯之路' },
  SET_1869: { 'en-US': 'March of the Lich King',     'zh-CN': '巫妖王进军' },
  SET_1466: { 'en-US': 'Madness at the Darkmoon Faire','zh-CN': '暗月马戏团' },
  SET_1443: { 'en-US': 'Scholomance Academy',       'zh-CN': '通灵学院' },
  SET_1414: { 'en-US': 'Ashes of Outland',           'zh-CN': '外域的灰烬' },
  SET_1463: { 'en-US': 'Demon Hunter Initiate',      'zh-CN': '恶魔猎手入门' },
  SET_1347: { 'en-US': 'Descent of Dragons',         'zh-CN': '巨龙降临' },
  SET_1403: { 'en-US': "Galakrond's Awakening",      'zh-CN': '迦拉克隆的觉醒' },
  SET_1158: { 'en-US': 'Saviors of Uldum',           'zh-CN': '奥丹姆奇兵' },
  SET_1130: { 'en-US': 'Rise of Shadows',            'zh-CN': '暗影崛起' },
  SET_1129: { 'en-US': "Rastakhan's Rumble",         'zh-CN': '拉斯塔哈的大乱斗' },
  SET_1127: { 'en-US': 'The Boomsday Project',       'zh-CN': '砰砰计划' },
  SET_1125: { 'en-US': 'The Witchwood',              'zh-CN': '女巫森林' },
  SET_1004: { 'en-US': 'Kobolds & Catacombs',        'zh-CN': '狗头人与地下世界' },
  SET_1001: { 'en-US': 'Knights of the Frozen Throne','zh-CN': '冰封王座的骑士' },
  SET_27:   { 'en-US': 'Journey to Un\'Goro',        'zh-CN': '勇闯安戈洛' },
  SET_25:   { 'en-US': 'Mean Streets of Gadgetzan',  'zh-CN': '龙争虎斗加基森' },
  SET_23:   { 'en-US': 'One Night in Karazhan',      'zh-CN': '卡拉赞之夜' },
  SET_21:   { 'en-US': 'Whispers of the Old Gods',   'zh-CN': '上古之神的低语' },
  SET_20:   { 'en-US': 'League of Explorers',        'zh-CN': '探险者协会' },
  SET_15:   { 'en-US': 'The Grand Tournament',       'zh-CN': '冠军的试炼' },
  SET_14:   { 'en-US': 'Blackrock Mountain',         'zh-CN': '黑石山的火焰' },
  SET_13:   { 'en-US': 'Goblins vs Gnomes',          'zh-CN': '地精大战侏儒' },
  SET_12:   { 'en-US': 'Naxxramas',                  'zh-CN': '纳克萨玛斯' },

  // ── Wild — mini-sets & misc ───────────────────────────────
  SET_1898: { 'en-US': 'Festival of Legends Mini-Set','zh-CN': '传奇节日迷你系列' },

  // ── Classic / Legacy ──────────────────────────────────────
  SET_17:   { 'en-US': 'Legacy',                     'zh-CN': '传承' },
  SET_1646: { 'en-US': 'Classic',                    'zh-CN': '经典' },

  // ── Non-collectible / internal (no user-facing tiles) ─────
  // SET_5, SET_16, SET_18, SET_1143, SET_1453, SET_1586,
  // SET_1904, SET_1961 — skipped (0 collectible cards).
};
