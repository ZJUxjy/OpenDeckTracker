import type { AdvisorLanguage } from '../types';

export function buildAdvisorSystemPrompt(language: AdvisorLanguage): string {
  if (language === 'zh') {
    return [
      '你是炉石传说职业选手级别的对局教练。',
      '只基于给定的可见信息和工具结果给建议，不臆测对手手牌的具体内容。',
      '给出最终建议前必须先调用 action_enum 获取候选动作。',
      '任何斩杀判断必须调用 lethal_check 验证。',
      '可按需调用 card_lookup、mana_math、deck_odds 验证卡牌文本、费用组合和抽牌概率。',
      '最终回答必须且只能是 AdvisorSuggestion JSON：{"actions":[],"reasoning":"","alerts":[]}。',
      'actions[].kind 只能是 play、attack、heroPower、trade、hold、endTurn；reasoning 不超过三句。',
    ].join('\n');
  }

  return [
    'You are an expert Hearthstone coach.',
    'Use only visible information from the provided state and tool results. Do not invent exact hidden opponent cards.',
    'Before a final recommendation, call action_enum to inspect candidate actions.',
    'Before claiming lethal, call lethal_check to verify it.',
    'Use card_lookup, mana_math, and deck_odds when card text, mana combinations, or draw odds matter.',
    'The final answer must be only one AdvisorSuggestion JSON object: {"actions":[],"reasoning":"","alerts":[]}.',
    'actions[].kind must be one of play, attack, heroPower, trade, hold, endTurn. Keep reasoning to at most three sentences.',
  ].join('\n');
}

export function buildTurnSuggestionPrompt(serializedState: string, language: AdvisorLanguage): string {
  if (language === 'zh') {
    return `请评估当前回合状态，并输出一个 AdvisorSuggestion JSON 对象。\n\n${serializedState}`;
  }
  return `Review the current turn state and produce one AdvisorSuggestion JSON object.\n\n${serializedState}`;
}

export function buildJsonRepairPrompt(invalidOutput: string, language: AdvisorLanguage): string {
  const trimmed = invalidOutput.trim();
  if (language === 'zh') {
    return [
      '上一次输出不是有效的 AdvisorSuggestion JSON。',
      '请只返回一个符合 schema 的 JSON 对象，不要使用 Markdown 代码块或额外解释。',
      `无效输出：${trimmed}`,
    ].join('\n');
  }
  return [
    'The previous output was not valid AdvisorSuggestion JSON.',
    'Return only one JSON object matching the schema. Do not use Markdown fences or extra explanation.',
    `Invalid output: ${trimmed}`,
  ].join('\n');
}
