import { createMasterAgent, formatNewsForPrompt } from './factory';
import type { MasterAnalysisContext } from '../types';
import type { MasterMeta } from '../../../shared/types';

const meta: MasterMeta = {
  id: 'bill-ackman',
  name: 'Bill Ackman',
  nameZh: '比尔·阿克曼',
  style: 'Activist Investing',
  styleZh: '激进投资',
  description: '激进价值投资者，大胆押注并推动变革',
};

const SYSTEM_PROMPT = `你是比尔·阿克曼。根据提供的量化数据和新闻信息做出投资判断。

分析框架：
- 价值解锁催化剂：新闻中是否存在重组、管理层变动、分拆、回购等价值释放事件？
- 集中押注：是否值得大仓位押注？企业是否被严重低估且有明确的修复路径？
- 管理层问责：管理层是否在为股东创造价值？是否需要外部推动改变？
- 逆向勇气：市场对这家公司的看法是否过于悲观，导致错误低估？
- 基本面支撑：低估必须有硬数据支撑，而非仅凭感觉
- 退出机制：价值修复的时间窗口和退出策略是否清晰？

信号规则：
- bullish：明显低估（PE 低）+ 有明确催化剂 + 基本面信号积极
- bearish：估值合理但无催化剂，或管理层问题严重且无改善迹象
- neutral：有价值但缺乏催化剂，或催化剂不确定性高

置信度：
- 90-100%：严重低估 + 明确催化剂 + 强大基本面
- 70-89%：低估明显，催化剂可能性高
- 50-69%：价值存在，催化剂不确定
- 30-49%：估值中等，无明显催化剂
- 10-29%：估值高或基本面差

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
    '[基本面数据（价值锚定）]',
    fd.pe != null ? `PE: ${fd.pe}` : null,
    fd.pb != null ? `PB: ${fd.pb}` : null,
    fd.roe != null ? `ROE: ${fd.roe}%` : null,
    fd.net_margin != null ? `净利率: ${fd.net_margin}%` : null,
    fd.debt_to_asset != null ? `资产负债率: ${fd.debt_to_asset}%` : null,
    fd.revenue_growth != null ? `营收增长: ${fd.revenue_growth}%` : null,
    '',
    '[基本面信号]',
    `基本面信号: ${quant.fundamental.signal}, 置信度 ${quant.fundamental.confidence}%`,
    '',
    '[技术面概况]',
    `趋势信号: ${quant.technical.signal}, 置信度 ${quant.technical.confidence}%`,
    td.rsi != null ? `RSI: ${td.rsi}` : null,
    '',
    `[近期新闻 (${news.length} 条，关注催化剂事件)]`,
    ...formatNewsForPrompt(news),
  ]
    .filter(Boolean)
    .join('\n');

  return facts;
}

export const agent = createMasterAgent(meta, SYSTEM_PROMPT, buildUserPrompt);
