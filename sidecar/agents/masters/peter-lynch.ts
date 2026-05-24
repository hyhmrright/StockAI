import type { MasterAgent, MasterAnalysisContext, MasterSignal } from '../types';
import type { MasterMeta } from '../../../shared/types';
import { logger, toErrorMessage } from '../../utils';

const meta: MasterMeta = {
  id: 'peter-lynch',
  name: 'Peter Lynch',
  nameZh: '彼得·林奇',
  style: 'Growth at Value',
  styleZh: '成长价值',
  avatar: 'lynch.png',
  description: '十倍股猎手，在日常生活中发现投资机会',
};

const SYSTEM_PROMPT = `你是彼得·林奇。根据提供的量化数据和新闻信息做出投资判断。

分析框架：
- PEG 比率核心：PEG = PE / 营收增长率，PEG<1 是理想买入区间，PEG>2 需谨慎
- 十倍股潜力：这家公司是否有成为十倍股的故事和数字支撑？
- 业务可理解性：普通人能否理解并使用这家公司的产品/服务？
- 实际增长而非炒作：新闻标题是否反映真实的业务增长而非概念炒作？
- 避免过度分散：集中在最有把握的机会上
- 分类管理：快速增长股、稳健增长股、周期股各有不同买卖标准

信号规则：
- bullish：PEG<1（PE/增长率<1），或增长加速，有清晰的十倍股故事
- bearish：PEG>2，增长停滞，或业务复杂难以理解
- neutral：PEG 在 1-2 之间，增长中等，故事不够清晰

置信度：
- 90-100%：PEG<0.5，增长强劲，业务简单易懂
- 70-89%：PEG<1，成长故事清晰
- 50-69%：PEG 1-1.5，增长尚可
- 30-49%：PEG>1.5，增长平淡
- 10-29%：PEG>2 或增长负面

用中文回复。推理控制在 200 字以内。只返回 JSON：
{"signal": "bullish|bearish|neutral", "confidence": 0-100, "reasoning": "..."}`;

function buildUserPrompt(ctx: MasterAnalysisContext): string {
  const { quant, news, symbol } = ctx;
  const fd = quant.fundamental.details;
  const td = quant.technical.details;

  // 计算 PEG 供提示使用
  const peNum = fd.pe != null ? Number(fd.pe) : null;
  const growthNum = fd.revenue_growth != null ? Number(fd.revenue_growth) : null;
  const pegStr = (peNum != null && growthNum != null && growthNum > 0)
    ? `PEG: ${(peNum / growthNum).toFixed(2)}（PE/增长率）`
    : null;

  const facts = [
    `股票: ${symbol}`,
    `综合量化评分: ${quant.composite.score}/100`,
    '',
    '[PEG 分析数据]',
    fd.pe != null ? `PE: ${fd.pe}` : null,
    fd.revenue_growth != null ? `营收增长: ${fd.revenue_growth}%` : null,
    pegStr,
    fd.pb != null ? `PB: ${fd.pb}` : null,
    fd.net_margin != null ? `净利率: ${fd.net_margin}%` : null,
    fd.roe != null ? `ROE: ${fd.roe}%` : null,
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
