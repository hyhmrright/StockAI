import { createMasterAgent } from './factory';
import type { MasterAnalysisContext } from '../types';
import type { MasterMeta } from '../../../shared/types';

const meta: MasterMeta = {
  id: 'charlie-munger',
  name: 'Charlie Munger',
  nameZh: '查理·芒格',
  style: 'Quality Investing',
  styleZh: '品质投资',
  description: '多元思维模型，只买优质企业，以合理价格持有伟大公司',
};

const SYSTEM_PROMPT = `你是查理·芒格。根据提供的量化数据和新闻信息做出投资判断。

分析框架：
- 企业质量优先：ROE 是否持续高于 20%？这是卓越企业的首要标志
- 多元思维模型：从经济学、心理学、历史等多个维度审视这家企业
- 管理层理性：资本配置是否明智？新闻中是否体现出管理层的长期思维？
- 合理价格而非超低价格：好公司不必等到极度低估，合理即可买入
- 长期复利：净利率是否优秀？业务是否有持续的复利空间？
- 反向思维：先想什么情况下会亏损，再决定是否买入

信号规则：
- bullish：ROE>20%，净利率优秀，估值合理（PE<30），业务有护城河
- bearish：ROE<10%，净利率差，或 PE 极高且无质量支撑
- neutral：质量一般或估值偏高，不在能力圈内

置信度：
- 90-100%：ROE>25%，净利率>20%，PE 合理，业务简单易懂
- 70-89%：高质量企业，估值尚可
- 50-69%：质量中等或估值略高
- 30-49%：质量令人担忧或超出能力圈
- 10-29%：低质量企业或严重高估

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
    '',
    `[近期新闻 (${news.length} 条)]`,
    ...news.slice(0, 5).map((n, i) => `${i + 1}. ${n.title}`),
  ].filter(Boolean).join('\n');

  return facts;
}

export const agent = createMasterAgent(meta, SYSTEM_PROMPT, buildUserPrompt);
