import { createMasterAgent, formatNewsForPrompt } from './factory';
import type { MasterAnalysisContext } from '../types';
import type { MasterMeta } from '../../../shared/types';

const meta: MasterMeta = {
  id: 'nassim-taleb',
  name: 'Nassim Taleb',
  nameZh: '纳西姆·塔勒布',
  style: 'Antifragility',
  styleZh: '反脆弱',
  description: '黑天鹅猎手，关注尾部风险和非对称收益',
};

const SYSTEM_PROMPT = `你是纳西姆·塔勒布。根据提供的量化数据和新闻信息做出投资判断。

分析框架：
- 反脆弱性评估：这家公司是否在波动和压力中变得更强，而非被击垮？
- 杠杆即脆弱：高负债率（>60%）是系统性风险的来源，应避免
- 波动性分析：成交量比率和 RSI 极值是否暗示隐藏的尾部风险？
- 黑天鹅识别：是否存在市场忽视的低概率高冲击事件风险？
- 非对称收益：下行有限（低负债、低估值）而上行无限（反脆弱特性）
- 极端 RSI 警示：RSI>80 或 <20 往往预示均值回归的极端风险

信号规则：
- bullish：低负债（反脆弱），低波动但趋势向上，RSI 温和区间（40-60）
- bearish：高负债 + 高波动 + RSI 极端（>75 或 <25），系统性脆弱
- neutral：波动正常，无明显脆弱性或反脆弱特征

置信度：
- 90-100%：低负债 + 低杠杆 + 受益于波动的商业模式
- 70-89%：财务稳健，抗冲击能力强
- 50-69%：风险特征中性
- 30-49%：存在脆弱性信号（高负债或高波动）
- 10-29%：严重脆弱，黑天鹅风险高

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
    '[脆弱性指标]',
    fd.debt_to_asset != null ? `资产负债率: ${fd.debt_to_asset}%（>60% = 脆弱）` : null,
    td.rsi != null ? `RSI: ${td.rsi}（>75 或 <25 = 极端信号）` : null,
    td.volume_ratio != null ? `成交量比: ${td.volume_ratio}（异常波动代理指标）` : null,
    td.adx != null ? `ADX: ${td.adx}（趋势强度）` : null,
    '',
    '[基本面稳健性]',
    fd.pe != null ? `PE: ${fd.pe}` : null,
    fd.pb != null ? `PB: ${fd.pb}` : null,
    fd.net_margin != null ? `净利率: ${fd.net_margin}%` : null,
    fd.revenue_growth != null ? `营收增长: ${fd.revenue_growth}%` : null,
    '',
    '[技术面概况]',
    `趋势信号: ${quant.technical.signal}, 置信度 ${quant.technical.confidence}%`,
    td.macd_trend != null ? `MACD 趋势: ${td.macd_trend}` : null,
    '',
    ...(quant.risk ? [
      '[风险指标]',
      `年化波动率: ${(quant.risk.annualizedVolatility * 100).toFixed(1)}%`,
      `波动率百分位: ${quant.risk.volatilityPercentile}%`,
      `最大回撤: ${(quant.risk.maxDrawdown * 100).toFixed(1)}%`,
      `夏普比率: ${quant.risk.sharpeProxy}`,
      `风险等级: ${quant.risk.riskLevel}`,
      '',
    ] : []),
    `[近期新闻 (${news.length} 条，关注尾部风险信号)]`,
    ...formatNewsForPrompt(news),
  ].filter(Boolean).join('\n');

  return facts;
}

export const agent = createMasterAgent(meta, SYSTEM_PROMPT, buildUserPrompt);
