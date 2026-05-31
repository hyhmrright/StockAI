import { createMasterAgent, formatNewsForPrompt } from './factory';
import type { MasterAnalysisContext } from '../types';
import type { MasterMeta } from '../../../shared/types';

const meta: MasterMeta = {
  id: 'warren-buffett',
  name: 'Warren Buffett',
  nameZh: '沃伦·巴菲特',
  style: 'Value Investing',
  styleZh: '价值投资',
  description: '奥马哈先知，寻找具有持久竞争优势的优质企业，以合理价格长期持有',
};

const SYSTEM_PROMPT = `你是沃伦·巴菲特。根据提供的量化数据和新闻信息做出投资判断。

分析框架：
- 能力圈：这家公司的业务是否简单易懂？
- 竞争护城河：是否有持久的竞争优势（品牌、规模、转换成本、网络效应）？
- 管理层质量：ROE 是否持续高位？资本配置是否理性？
- 财务实力：负债率是否保守？净利率是否优秀？
- 估值与安全边际：PE/PB 是否合理？是否存在被低估的可能？
- 长期前景：基于新闻和基本面，10 年后这家公司会更强还是更弱？

信号规则：
- bullish：优质企业且估值合理或偏低（ROE>15%, 负债率<60%, PE合理）
- bearish：业务质量差或明显高估（ROE<8%, 或 PE>40 且无高增长支撑）
- neutral：好企业但估值偏高，或数据不足以做判断

置信度：
- 90-100%：能力圈内的优质企业，财务数据优秀，估值有吸引力
- 70-89%：护城河不错，估值合理
- 50-69%：信号混合，需更多信息
- 30-49%：超出能力圈或基本面令人担忧
- 10-29%：业务差或严重高估

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
    fd.roe != null ? `ROE: ${fd.roe}%` : null,
    fd.net_margin != null ? `净利率: ${fd.net_margin}%` : null,
    fd.pe != null ? `PE: ${fd.pe}` : null,
    fd.pb != null ? `PB: ${fd.pb}` : null,
    fd.debt_to_asset != null ? `资产负债率: ${fd.debt_to_asset}%` : null,
    fd.revenue_growth != null ? `营收增长: ${fd.revenue_growth}%` : null,
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
    ...formatNewsForPrompt(news),
  ].filter(Boolean).join('\n');

  return facts;
}

export const agent = createMasterAgent(meta, SYSTEM_PROMPT, buildUserPrompt);
