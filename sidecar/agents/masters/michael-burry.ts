import { createMasterAgent, formatNewsForPrompt } from './factory';
import type { MasterAnalysisContext } from '../types';
import type { MasterMeta } from '../../../shared/types';

const meta: MasterMeta = {
  id: 'michael-burry',
  name: 'Michael Burry',
  nameZh: '迈克尔·伯里',
  style: 'Contrarian Value',
  styleZh: '逆向价值',
  description: '大空头，擅长发现市场定价错误，敢于逆势而行',
};

const SYSTEM_PROMPT = `你是迈克尔·伯里。根据提供的量化数据和新闻信息做出投资判断。

分析框架：
- 市场定价错误识别：技术面超卖而基本面强健 = 错误定价的买入机会
- 逆向信号：大众情绪极度悲观时寻找被抛售的优质资产
- 基本面与技术背离：RSI 超卖（<30）+ PE/PB 低估 = 强烈买入信号
- 泡沫识别：估值极高 + 新闻炒作 + 技术超买 = 潜在做空机会
- 数据驱动：忽略市场噪音，只看硬数据（PE/PB/负债率/现金流）
- 尾部风险：识别市场忽视的系统性风险

信号规则：
- bullish：RSI<35（超卖）且 PE/PB 低（被错误抛售的价值股）
- bearish：RSI>70（超买）且估值高（PE>30）且新闻充斥炒作
- neutral：技术与基本面信号方向一致（无背离），或数据不充分

置信度：
- 90-100%：极度超卖 + 基本面强健，市场明显定价错误
- 70-89%：明确的逆向机会，信号背离显著
- 50-69%：信号混合，背离不够明显
- 30-49%：趋势顺势，无逆向机会
- 10-29%：市场共识正确，逆向无依据

推理控制在 200 字以内。只返回 JSON：
{"signal": "bullish|bearish|neutral", "confidence": 0-100, "reasoning": "..."}`;

function buildUserPrompt(ctx: MasterAnalysisContext): string {
  const { quant, news, symbol } = ctx;
  const fd = quant.fundamental.details;
  const td = quant.technical.details;

  const facts = [
    `股票: ${symbol}`,
    `综合量化评分: ${quant.composite.score}/100`,
    '',
    '[技术面数据（逆向关键）]',
    `趋势信号: ${quant.technical.signal}, 置信度 ${quant.technical.confidence}%`,
    td.rsi != null ? `RSI: ${td.rsi}（<30 超卖 / >70 超买）` : null,
    td.adx != null ? `ADX: ${td.adx}` : null,
    td.macd_trend != null ? `MACD 趋势: ${td.macd_trend}` : null,
    '',
    '[基本面数据（价值锚定）]',
    fd.pe != null ? `PE: ${fd.pe}` : null,
    fd.pb != null ? `PB: ${fd.pb}` : null,
    fd.debt_to_asset != null ? `资产负债率: ${fd.debt_to_asset}%` : null,
    fd.net_margin != null ? `净利率: ${fd.net_margin}%` : null,
    fd.revenue_growth != null ? `营收增长: ${fd.revenue_growth}%` : null,
    '',
    `[近期新闻 (${news.length} 条，注意炒作信号)]`,
    ...formatNewsForPrompt(news),
  ].filter(Boolean).join('\n');

  return facts;
}

export const agent = createMasterAgent(meta, SYSTEM_PROMPT, buildUserPrompt);
