import { createMasterAgent } from './factory';
import type { MasterAnalysisContext } from '../types';
import type { MasterMeta } from '../../../shared/types';

const meta: MasterMeta = {
  id: 'aswath-damodaran',
  name: 'Aswath Damodaran',
  nameZh: '阿斯瓦斯·达摩达兰',
  style: 'Valuation',
  styleZh: '估值',
  description: '估值院长，用数字讲故事，纪律性估值',
};

const SYSTEM_PROMPT = `你是阿斯瓦斯·达摩达兰。根据提供的量化数据和新闻信息做出投资判断。

分析框架：
- 故事与数字的平衡：新闻叙事是否能被财务数据验证？好故事必须有好数字支撑
- 成长股估值：高 PE 是否有高增长和高 ROE 支撑？成长期需要不同的估值框架
- 价值股估值：低 PE/PB 是否反映真实低估，还是价值陷阱？
- 风险溢价评估：负债率高意味着更高的权益风险溢价，需要更大折价
- 纪律性估值：设定内在价值区间，只在折价足够时才买入
- 全维度数据分析：所有基本面指标综合评估，不依赖单一指标

信号规则：
- bullish：增长与 ROE 支撑当前估值，或存在显著折价（PE/PB 远低于成长支撑的合理值）
- bearish：高估值无增长支撑，或低增长高负债（价值陷阱）
- neutral：估值合理但无显著折价或溢价

置信度：
- 90-100%：量化数据全面支持，故事与数字高度一致
- 70-89%：多数指标支持，少数偏差
- 50-69%：指标混合，需更多数据
- 30-49%：数字与故事存在矛盾
- 10-29%：估值明显偏离基本面

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
    '[全面估值数据]',
    fd.pe != null ? `PE: ${fd.pe}` : null,
    fd.pb != null ? `PB: ${fd.pb}` : null,
    fd.roe != null ? `ROE: ${fd.roe}%` : null,
    fd.net_margin != null ? `净利率: ${fd.net_margin}%` : null,
    fd.revenue_growth != null ? `营收增长: ${fd.revenue_growth}%` : null,
    fd.debt_to_asset != null ? `资产负债率: ${fd.debt_to_asset}%` : null,
    '',
    '[基本面信号]',
    `基本面信号: ${quant.fundamental.signal}, 置信度 ${quant.fundamental.confidence}%`,
    '',
    '[技术面概况]',
    `趋势信号: ${quant.technical.signal}, 置信度 ${quant.technical.confidence}%`,
    td.rsi != null ? `RSI: ${td.rsi}` : null,
    ...(quant.valuation ? [
      '',
      '[估值数据]',
      quant.valuation.intrinsicValue != null ? `内在价值: ${(quant.valuation.intrinsicValue / 1e8).toFixed(0)}亿` : null,
      quant.valuation.marketCap != null ? `市值: ${(quant.valuation.marketCap / 1e8).toFixed(0)}亿` : null,
      quant.valuation.marginOfSafety != null ? `安全边际: ${(quant.valuation.marginOfSafety * 100).toFixed(1)}%` : null,
      `估值信号: ${quant.valuation.signal}`,
      quant.valuation.models.dcf ? `DCF基准值: ${(quant.valuation.models.dcf.base / 1e8).toFixed(0)}亿 (WACC ${(quant.valuation.models.dcf.wacc * 100).toFixed(1)}%)` : null,
    ] : []),
    '',
    `[近期新闻 (${news.length} 条，验证叙事与数字一致性)]`,
    ...news.slice(0, 5).map((n, i) => `${i + 1}. ${n.title}`),
  ].filter(Boolean).join('\n');

  return facts;
}

export const agent = createMasterAgent(meta, SYSTEM_PROMPT, buildUserPrompt);
