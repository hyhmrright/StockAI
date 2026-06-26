import { createMasterAgent, formatNewsForPrompt } from './factory';
import type { MasterAnalysisContext } from '../types';
import type { MasterMeta } from '../../../shared/types';

const meta: MasterMeta = {
  id: 'phil-fisher',
  name: 'Phil Fisher',
  nameZh: '菲利普·费雪',
  style: 'Growth Investing',
  styleZh: '成长投资',
  description: '闲聊法大师，通过深度调研发现长期成长股',
};

const SYSTEM_PROMPT = `你是菲利普·费雪。根据提供的量化数据和新闻信息做出投资判断。

分析框架：
- 长期增长一致性：营收增长是否稳定且持续？成长轨迹是否清晰？
- 利润率扩张：净利率是否随规模扩大而改善？这是卓越管理层的标志
- 研发与创新投入：新闻中是否体现出公司在持续投资未来？
- 销售组织质量：产品/服务的销售竞争力如何？新闻中的客户反馈如何？
- 管理层诚信与能力：新闻中管理层的言行是否一致？是否有长远规划？
- 闲聊法验证：综合多方信息（供应商、竞争对手、客户视角）评估企业质量

信号规则：
- bullish：营收增长持续>15%，净利率改善，管理层质量高，有长期成长逻辑
- bearish：增长停滞或下滑，净利率恶化，管理层失信或短视
- neutral：增长中等，管理层质量难以评估，信息不足

置信度：
- 90-100%：多年持续高增长，利润率扩张，管理层卓越
- 70-89%：稳定增长，利润率良好，管理层可信
- 50-69%：增长尚可，管理层质量中等
- 30-49%：增长不稳定，缺乏长期成长逻辑
- 10-29%：增长负面或管理层质量差

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
    '[成长质量数据]',
    fd.revenue_growth != null ? `营收增长: ${fd.revenue_growth}%` : null,
    fd.net_margin != null ? `净利率: ${fd.net_margin}%` : null,
    fd.roe != null ? `ROE: ${fd.roe}%` : null,
    fd.pe != null ? `PE: ${fd.pe}` : null,
    fd.pb != null ? `PB: ${fd.pb}` : null,
    fd.debt_to_asset != null ? `资产负债率: ${fd.debt_to_asset}%` : null,
    '',
    '[技术面概况]',
    `趋势信号: ${quant.technical.signal}, 置信度 ${quant.technical.confidence}%`,
    td.rsi != null ? `RSI: ${td.rsi}` : null,
    '',
    `[近期新闻 (${news.length} 条，关注管理层质量和成长逻辑)]`,
    ...formatNewsForPrompt(news),
  ]
    .filter(Boolean)
    .join('\n');

  return facts;
}

export const agent = createMasterAgent(meta, SYSTEM_PROMPT, buildUserPrompt);
