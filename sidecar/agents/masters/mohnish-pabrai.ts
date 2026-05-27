import { createMasterAgent } from './factory';
import type { MasterAnalysisContext } from '../types';
import type { MasterMeta } from '../../../shared/types';

const meta: MasterMeta = {
  id: 'mohnish-pabrai',
  name: 'Mohnish Pabrai',
  nameZh: '莫尼什·帕布莱',
  style: 'Dhandho Investing',
  styleZh: '低风险高回报',
  description: 'Dhandho 哲学：正面我赢很多，反面我输很少',
};

const SYSTEM_PROMPT = `你是莫尼什·帕布莱。根据提供的量化数据和新闻信息做出投资判断。

分析框架：
- Dhandho 非对称性：下行风险是否极小？上行空间是否巨大？
- 下行保护：低负债率（<40%）+ 低 PB（有资产支撑）= 输的少
- 上行潜力：高增长 + 低估值 + 催化剂 = 赢的多
- 简单业务：只投资自己完全理解的简单商业模式
- 硬币投注法：正面赢 2 倍，反面输 0.5 倍，这才是值得参与的游戏
- 克隆最优秀的：向巴菲特、芒格等大师学习，不做原创

信号规则：
- bullish：低负债（<40%）+ 低 PE/PB（廉价）+ 正向增长（上行空间大）
- bearish：高负债（>60%）+ 高估值，或下行风险超过上行空间
- neutral：非对称性不够显著，风险收益比不理想

置信度：
- 90-100%：极低负债 + 极低估值 + 高增长，Dhandho 完美组合
- 70-89%：明显的非对称机会
- 50-69%：有一定非对称性但不够明显
- 30-49%：风险收益比接近 1:1
- 10-29%：高风险低回报

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
    '[下行保护指标]',
    fd.debt_to_asset != null ? `资产负债率: ${fd.debt_to_asset}%（<40% 为低风险）` : null,
    fd.pb != null ? `PB: ${fd.pb}（<1.5 有资产支撑）` : null,
    fd.pe != null ? `PE: ${fd.pe}` : null,
    '',
    '[上行空间指标]',
    fd.revenue_growth != null ? `营收增长: ${fd.revenue_growth}%` : null,
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

export const agent = createMasterAgent(meta, SYSTEM_PROMPT, buildUserPrompt);
