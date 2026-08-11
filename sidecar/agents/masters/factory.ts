import type { MasterAgent, MasterAnalysisContext, MasterSignal } from '../types';
import type {
  MasterMeta,
  Language,
  StockNews,
  MasterFactors,
  FundFlowData,
} from '../../../shared/types';
import { logger, toErrorMessage } from '../../utils';

/** deepMode 抓到的正文注入大师 prompt 时的截断长度（防 13 大师 token 膨胀） */
const NEWS_BODY_MAX_CHARS = 200;

/**
 * 构建大师 prompt 的新闻段：标题 + 正文摘要。
 * 深度模式下前几条新闻带完整正文，此处截断注入，让大师吃到正文而非仅标题。
 */
export function formatNewsForPrompt(
  news: StockNews[],
  maxItems = 5,
  bodyChars = NEWS_BODY_MAX_CHARS,
): string[] {
  return news.slice(0, maxItems).map((n, i) => {
    const body = n.content?.trim();
    return body ? `${i + 1}. ${n.title}\n   ${body.slice(0, bodyChars)}` : `${i + 1}. ${n.title}`;
  });
}

/** 元 → 亿元带符号标签。资金流原始单位是元，9 位数字直接进 prompt，LLM 易读错量级 */
function yi(v: number): string {
  return `${v >= 0 ? '+' : ''}${(v / 1e8).toFixed(2)}亿`;
}

/**
 * 消费 quant.fundFlow 的大师（3 位）——system prompt 里把「市场行为」当判断输入的那几位：
 * 德鲁肯米勒的动能共振、伯里的逆向背离、伍德的动能验证叙事。价值派的框架里日频资金流是噪声，
 * 喂了只会污染多期财报得出的结论。这也让 13 位大师的输入真正分化：共识度才有统计意义，
 * 否则同一份输入错了就一起错。
 *
 * 与 VALUE_FACTOR_CONSUMER_IDS 同为「谁吃哪份数据」的可执行声明——**改这三个文件的
 * buildUserPrompt 时必须同步改这里**，否则 deep-analysis 的缓存 key 会漏算（新消费者的
 * 资金流变化命中旧结果）或多算（非消费者被无谓击穿缓存，白跑一轮 LLM）。
 */
export const FUND_FLOW_CONSUMER_IDS: ReadonlySet<string> = new Set([
  'stanley-druckenmiller',
  'michael-burry',
  'cathie-wood',
]);

/**
 * 个股资金流向 → prompt 段。只给 FUND_FLOW_CONSUMER_IDS 里的大师调用。
 *
 * A 股专属，美股 quant.fundFlow 恒为空 → 返回空数组（大师完全回退今天的行为）。
 */
export function formatFundFlowForPrompt(fundFlow?: FundFlowData): string[] {
  if (!fundFlow) return [];
  const date = fundFlow.date ? `（${fundFlow.date}）` : '';
  return [
    `[资金流向]${date}`,
    `主力净流入: ${yi(fundFlow.mainNet)}（占成交额 ${signed(fundFlow.mainNetPct, '%')}）`,
    `超大单 ${yi(fundFlow.superLargeNet)} | 大单 ${yi(fundFlow.largeNet)} | ` +
      `中单 ${yi(fundFlow.mediumNet)} | 小单 ${yi(fundFlow.smallNet)}`,
  ];
}

const MARGIN_DIR_ZH: Record<string, string> = { up: '上升', down: '下降', flat: '持平' };
const DEBT_DIR_ZH: Record<string, string> = {
  falling: '下降（去杠杆）',
  stable: '平稳',
  rising: '上升（加杠杆，警惕）',
};
const STABILITY_ZH: Record<string, string> = { stable: '稳定', volatile: '波动' };
const MOAT_VERDICT_ZH: Record<string, string> = { wide: '宽阔', narrow: '中等', none: '不明显' };

/** 带正负号的百分点/百分比标签 */
function signed(v: number, unit: string): string {
  return `${v >= 0 ? '+' : ''}${v}${unit}`;
}

/**
 * 大师专属预计算因子 → 中文标签段（表现层，与纯函数 computeFactors 分离）。
 * available:false 时返回空数组（大师完全回退单期快照行为）。token 有界（~6-8 行）。
 * 沿用现有 buildUserPrompt 各段（[基本面数据] 等）的硬编码中文约定，无需新增 zh.json key。
 */
export function formatFactorsForPrompt(factors?: MasterFactors): string[] {
  if (!factors?.available) return [];
  const asOf = factors.asOf ? `，截至 ${factors.asOf}` : '';
  const lines: string[] = [`[预计算因子]（基于 ${factors.annualPeriods} 期年报${asOf}）`];

  const roe = factors.roeConsistency;
  if (roe) {
    lines.push(
      `护城河(ROE持续性): ROE 连续 ${roe.streak} 期年报 >${roe.threshold}%` +
        `（${roe.totalPeriods} 期中 ${roe.periodsAbove} 期达标，均值 ${roe.avgRoe}%），判定：${MOAT_VERDICT_ZH[roe.verdict]}`,
    );
  }
  const mt = factors.marginTrend;
  if (mt?.gross)
    lines.push(
      `毛利率趋势: 最新 ${mt.gross.latest}%，${MARGIN_DIR_ZH[mt.gross.direction]}（较早期 ${signed(mt.gross.deltaPp, 'pp')}）`,
    );
  if (mt?.net)
    lines.push(
      `净利率趋势: 最新 ${mt.net.latest}%，${MARGIN_DIR_ZH[mt.net.direction]}（较早期 ${signed(mt.net.deltaPp, 'pp')}）`,
    );
  const dt = factors.debtTrend;
  if (dt)
    lines.push(`负债率趋势: 最新 ${dt.latest}%（均值 ${dt.avg}%），${DEBT_DIR_ZH[dt.direction]}`);

  const gs = factors.growthStability;
  if (gs?.revenue)
    lines.push(
      `营收增长稳定性: 年均 ${signed(gs.revenue.avgGrowth, '%')}` +
        `（${gs.revenue.positivePeriods}/${gs.revenue.totalPeriods} 期正增，${STABILITY_ZH[gs.revenue.stability]}）`,
    );
  if (gs?.netIncome)
    lines.push(
      `净利增长稳定性: 年均 ${signed(gs.netIncome.avgGrowth, '%')}（${STABILITY_ZH[gs.netIncome.stability]}）`,
    );
  const dcf = factors.simpleDcf;
  if (dcf)
    lines.push(
      `简化DCF每股内在价值: ¥${dcf.intrinsicValuePerShare}` +
        `（口径:${dcf.basis === 'ocfps' ? '每股经营现金流' : '每股收益'}；假设增速 ${dcf.assumedGrowthPct}%；${dcf.note}）`,
    );
  return lines;
}

const LANG_INSTRUCTION: Record<Language, string> = {
  zh: '用中文回复',
  en: 'Respond in English',
  ja: '日本語で回答してください',
};

export const PARSE_FAIL_MSG: Record<Language, string> = {
  zh: '响应解析失败',
  en: 'Response parse failed',
  ja: 'レスポンス解析失敗',
};

export const SERVICE_UNAVAIL_MSG: Record<Language, string> = {
  zh: '分析服务暂不可用',
  en: 'Analysis service unavailable',
  ja: '分析サービス利用不可',
};

function parseResponse(raw: string, masterId: string, lang: Language): MasterSignal {
  try {
    const parsed = JSON.parse(raw);
    const signal = ['bullish', 'bearish', 'neutral'].includes(parsed.signal)
      ? parsed.signal
      : 'neutral';
    const confidence = Math.max(0, Math.min(100, Number(parsed.confidence) || 50));
    const reasoning = String(parsed.reasoning || '').slice(0, 500);
    return { masterId, signal, confidence, reasoning };
  } catch {
    return { masterId, signal: 'neutral', confidence: 50, reasoning: PARSE_FAIL_MSG[lang] };
  }
}

export function createMasterAgent(
  meta: MasterMeta,
  systemPrompt: string,
  buildUserPrompt: (ctx: MasterAnalysisContext) => string,
): MasterAgent {
  return {
    meta,
    async analyze(ctx: MasterAnalysisContext): Promise<MasterSignal> {
      const lang = ctx.language ?? 'zh';
      const localizedPrompt = `${systemPrompt}\n${LANG_INSTRUCTION[lang]}`;
      try {
        const raw = await ctx.chat.chat(localizedPrompt, buildUserPrompt(ctx));
        return parseResponse(raw, meta.id, lang);
      } catch (err) {
        logger.warn(`[${meta.id}] 分析失败: ${toErrorMessage(err)}`);
        return {
          masterId: meta.id,
          signal: 'neutral',
          confidence: 50,
          reasoning: SERVICE_UNAVAIL_MSG[lang],
        };
      }
    },
  };
}
