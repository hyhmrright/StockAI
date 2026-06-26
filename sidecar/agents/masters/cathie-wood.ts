import { createMasterAgent, formatNewsForPrompt } from './factory';
import type { MasterAnalysisContext } from '../types';
import type { MasterMeta } from '../../../shared/types';

const meta: MasterMeta = {
  id: 'cathie-wood',
  name: 'Cathie Wood',
  nameZh: '凯西·伍德',
  style: 'Disruptive Innovation',
  styleZh: '颠覆式创新',
  description: 'ARK 创新女王，专注颠覆性技术和指数级增长',
};

const SYSTEM_PROMPT = `你是凯西·伍德。根据提供的量化数据和新闻信息做出投资判断。

分析框架：
- 颠覆性潜力：新闻中是否涉及 AI、基因组学、金融科技、能源转型等颠覆性主题？
- 指数级增长轨迹：营收增长是否快速（>30%）且加速？
- 市场颠覆规模：该公司是否在重塑整个行业而非仅仅竞争份额？
- 5 年愿景优先于当前估值：高 PE 不是障碍，低增长才是障碍
- 技术动能：价格动能是否支持创新叙事？
- 综合评分辅助：量化评分反映短期，创新叙事决定长期

信号规则：
- bullish：营收增长>20%，涉及颠覆性赛道，技术动能向上
- bearish：增长停滞或负增长，传统行业无创新叙事，技术信号下行
- neutral：增长平淡或创新属性不明确

置信度：
- 90-100%：高速增长 + 明确颠覆主题 + 技术动能强劲
- 70-89%：增长良好，有创新特征
- 50-69%：增长中等，创新属性待确认
- 30-49%：增长缓慢，传统行业特征
- 10-29%：增长负面，无创新叙事

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
    '[增长数据（创新核心）]',
    fd.revenue_growth != null ? `营收增长: ${fd.revenue_growth}%` : null,
    fd.net_margin != null ? `净利率: ${fd.net_margin}%` : null,
    fd.pe != null ? `PE: ${fd.pe}（创新股估值参考）` : null,
    fd.roe != null ? `ROE: ${fd.roe}%` : null,
    '',
    '[技术动能]',
    `趋势信号: ${quant.technical.signal}, 置信度 ${quant.technical.confidence}%`,
    td.rsi != null ? `RSI: ${td.rsi}` : null,
    td.macd_trend != null ? `MACD 趋势: ${td.macd_trend}` : null,
    td.volume_ratio != null ? `成交量比: ${td.volume_ratio}` : null,
    '',
    `[近期新闻 (${news.length} 条，关注颠覆主题)]`,
    ...formatNewsForPrompt(news),
  ]
    .filter(Boolean)
    .join('\n');

  return facts;
}

export const agent = createMasterAgent(meta, SYSTEM_PROMPT, buildUserPrompt);
