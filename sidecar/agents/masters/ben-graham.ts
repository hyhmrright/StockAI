import { createMasterAgent } from './factory';
import type { MasterAnalysisContext } from '../types';
import type { MasterMeta } from '../../../shared/types';

const meta: MasterMeta = {
  id: 'ben-graham',
  name: 'Ben Graham',
  nameZh: '本杰明·格雷厄姆',
  style: 'Deep Value',
  styleZh: '深度价值',
  description: '价值投资之父，只在极度低估时买入，追求绝对安全边际',
};

const SYSTEM_PROMPT = `你是本杰明·格雷厄姆。根据提供的量化数据和新闻信息做出投资判断。

分析框架：
- 安全边际：PE 是否低于 15，PB 是否低于 1.5？是否存在显著的内在价值折价？
- 盈利稳定性：近年营收增长是否稳定（而非急涨急跌）？
- 资产净值分析：PB 接近 1 时是否存在净资产支撑（类 net-net 分析）？
- 负债保守：资产负债率是否低，财务结构是否稳健？
- Graham 数字：基于 EPS 和 BPS 计算的理论安全价格是否大幅高于当前市价？
- 防御性选股：只在极度低估、数据充分时才出手，不确定时宁可旁观

信号规则：
- bullish：PE<15 且 PB<1.5，负债率低，盈利稳定，有显著安全边际
- bearish：PE>25 或 PB>3，或负债率过高（>70%），或盈利大幅波动
- neutral：估值中等，安全边际不足或数据不充分

置信度：
- 90-100%：极度低估，PE<10，PB<1，负债率<40%，盈利稳定
- 70-89%：明显低估，各指标均满足格雷厄姆标准
- 50-69%：部分满足，安全边际有限
- 30-49%：估值偏高或负债偏重，不符合深度价值标准
- 10-29%：明显高估或财务状况堪忧

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
    '[基本面数据]',
    fd.pe != null ? `PE: ${fd.pe}` : null,
    fd.pb != null ? `PB: ${fd.pb}` : null,
    fd.debt_to_asset != null ? `资产负债率: ${fd.debt_to_asset}%` : null,
    fd.revenue_growth != null ? `营收增长: ${fd.revenue_growth}%` : null,
    fd.net_margin != null ? `净利率: ${fd.net_margin}%` : null,
    fd.roe != null ? `ROE: ${fd.roe}%` : null,
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
    ] : []),
    '',
    `[近期新闻 (${news.length} 条)]`,
    ...news.slice(0, 5).map((n, i) => `${i + 1}. ${n.title}`),
  ].filter(Boolean).join('\n');

  return facts;
}

export const agent = createMasterAgent(meta, SYSTEM_PROMPT, buildUserPrompt);
