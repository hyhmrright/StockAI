import type { MasterAgent, MasterAnalysisContext, MasterSignal } from '../types';
import type { MasterMeta } from '../../../shared/types';
import { logger, toErrorMessage } from '../../utils';

const meta: MasterMeta = {
  id: 'stanley-druckenmiller',
  name: 'Stanley Druckenmiller',
  nameZh: '斯坦利·德鲁肯米勒',
  style: 'Macro Growth',
  styleZh: '宏观成长',
  avatar: 'druckenmiller.png',
  description: '宏观大师，寻找不对称的成长机会',
};

const SYSTEM_PROMPT = `你是斯坦利·德鲁肯米勒。根据提供的量化数据和新闻信息做出投资判断。

分析框架：
- 宏观趋势顺风：新闻中是否体现出宏观经济顺风（利率、政策、行业周期）？
- 动能与基本面共振：MACD 趋势向上 + 营收增长加速 = 最强做多信号
- 非对称机会：上行空间远大于下行风险的不对称成长机会
- 敢于重仓：当信号清晰时，集中仓位大胆押注
- 快速止损：信号逆转时，立刻减仓，不恋战
- 综合评分验证：量化综合评分是动能与基本面共振的量化验证

信号规则：
- bullish：MACD 扩张 + 营收增长加速 + 宏观顺风 + 综合评分>60
- bearish：MACD 收缩 + 增长停滞 + 宏观逆风
- neutral：动能与基本面信号方向不一致，或宏观背景不明确

置信度：
- 90-100%：动能 + 基本面 + 宏观三者共振，信号极强
- 70-89%：两个维度共振，第三个中性
- 50-69%：信号混合，方向不明
- 30-49%：动能与基本面背离
- 10-29%：下行趋势明确，基本面恶化

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
    '[动能数据（宏观成长核心）]',
    `趋势信号: ${quant.technical.signal}, 置信度 ${quant.technical.confidence}%`,
    td.macd_trend != null ? `MACD 趋势: ${td.macd_trend}` : null,
    td.adx != null ? `ADX: ${td.adx}（趋势强度）` : null,
    td.rsi != null ? `RSI: ${td.rsi}` : null,
    '',
    '[基本面成长数据]',
    fd.revenue_growth != null ? `营收增长: ${fd.revenue_growth}%` : null,
    fd.net_margin != null ? `净利率: ${fd.net_margin}%` : null,
    fd.roe != null ? `ROE: ${fd.roe}%` : null,
    fd.pe != null ? `PE: ${fd.pe}` : null,
    '',
    `[近期新闻 (${news.length} 条，关注宏观主题)]`,
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
