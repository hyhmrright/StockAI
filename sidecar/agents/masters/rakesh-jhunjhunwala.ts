import type { MasterAgent, MasterAnalysisContext, MasterSignal } from '../types';
import type { MasterMeta } from '../../../shared/types';
import { logger, toErrorMessage } from '../../utils';

const meta: MasterMeta = {
  id: 'rakesh-jhunjhunwala',
  name: 'Rakesh Jhunjhunwala',
  nameZh: '拉凯什·金君瓦拉',
  style: 'Long-term Wealth',
  styleZh: '长期财富',
  avatar: 'jhunjhunwala.png',
  description: '印度大牛，相信长期持有优质企业创造财富',
};

const SYSTEM_PROMPT = `你是拉凯什·金君瓦拉。根据提供的量化数据和新闻信息做出投资判断。

分析框架：
- 长期财富创造：这家公司 10-20 年后会更有价值吗？短期波动不重要
- 优质企业标准：ROE>15%，净利率稳定或改善，负债可控
- 品牌与定价权：新闻中是否体现出品牌优势和提价能力？
- 中产阶级成长主题：是否受益于消费升级、城镇化等长期结构性趋势？
- 耐心持有：买入后长期持有，不轻易因短期波动出售
- 增长验证：营收增长是结构性的（行业扩张）还是周期性的（景气高峰）？

信号规则：
- bullish：ROE>15%，营收增长>10%，净利率良好，有长期成长逻辑
- bearish：ROE<8%，增长停滞，净利率下滑，无长期竞争优势
- neutral：质量中等，长期成长逻辑不够清晰

置信度：
- 90-100%：ROE>20%，持续高增长，强品牌，受益于长期结构趋势
- 70-89%：优质企业，增长稳健，有护城河
- 50-69%：质量中等，增长有但不突出
- 30-49%：质量平庸，长期成长逻辑薄弱
- 10-29%：低质量企业，无长期持有价值

用中文回复。推理控制在 200 字以内。只返回 JSON：
{"signal": "bullish|bearish|neutral", "confidence": 0-100, "reasoning": "..."}`;

function buildUserPrompt(ctx: MasterAnalysisContext): string {
  const { quant, news, symbol } = ctx;
  const fd = quant.fundamental.details;
  const td = quant.technical.details;

  const facts = [
    `股票: ${symbol}`,
    `综合量化评分: ${quant.composite.score}/100`,
    '',
    '[长期质量数据]',
    fd.roe != null ? `ROE: ${fd.roe}%` : null,
    fd.revenue_growth != null ? `营收增长: ${fd.revenue_growth}%` : null,
    fd.net_margin != null ? `净利率: ${fd.net_margin}%` : null,
    fd.pe != null ? `PE: ${fd.pe}` : null,
    fd.pb != null ? `PB: ${fd.pb}` : null,
    fd.debt_to_asset != null ? `资产负债率: ${fd.debt_to_asset}%` : null,
    '',
    '[技术面概况]',
    `趋势信号: ${quant.technical.signal}, 置信度 ${quant.technical.confidence}%`,
    td.rsi != null ? `RSI: ${td.rsi}` : null,
    '',
    `[近期新闻 (${news.length} 条，关注长期成长主题)]`,
    ...news.slice(0, 5).map((n, i) => `${i + 1}. ${n.title}`),
  ].filter(Boolean).join('\n');

  return facts;
}

function parseResponse(raw: string, masterId: string): MasterSignal {
  try {
    const parsed = JSON.parse(raw);
    const signal = ['bullish', 'bearish', 'neutral'].includes(parsed.signal) ? parsed.signal : 'neutral';
    const confidence = Math.max(0, Math.min(100, Number(parsed.confidence) || 50));
    const reasoning = String(parsed.reasoning || '').slice(0, 500);
    return { masterId, signal, confidence, reasoning };
  } catch {
    return { masterId, signal: 'neutral', confidence: 50, reasoning: '响应解析失败' };
  }
}

async function analyze(ctx: MasterAnalysisContext): Promise<MasterSignal> {
  const userPrompt = buildUserPrompt(ctx);
  try {
    const raw = await ctx.chat.chat(SYSTEM_PROMPT, userPrompt);
    return parseResponse(raw, meta.id);
  } catch (err) {
    logger.warn(`[${meta.id}] 分析失败: ${toErrorMessage(err)}`);
    return { masterId: meta.id, signal: 'neutral', confidence: 50, reasoning: '分析服务暂不可用' };
  }
}

export const agent: MasterAgent = { meta, analyze };
