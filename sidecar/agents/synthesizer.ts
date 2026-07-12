import type {
  MasterSignal,
  SentimentSignal,
  DeepAnalysisResult,
  QuantBundle,
  Language,
  MasterWeightInput,
} from '../../shared/types';
import type { ChatProvider } from './types';
import { computeMasterWeights, type MasterWeight } from './weights';
import { logger, toErrorMessage } from '../utils';

const SYSTEM_PROMPTS: Record<Language, string> = {
  zh: `你是投资委员会主席。综合所有分析师的独立研判，给出最终投资建议。
重点关注：多数分析师的共识方向、高置信度分析师的权重更大、不同风格间的分歧。
历史命中率更高的分析师，其观点权重更高（已在其行末标注）。
用中文回复。只返回 JSON：
{"signal": "bullish|bearish|neutral", "confidence": 0-100, "summary": "200字以内综合分析", "consensus": 0-100}`,
  en: `You are the chair of the investment committee. Synthesize all analysts' independent assessments into a final recommendation.
Focus on: the consensus direction, weight high-confidence analysts more heavily, and note divergences between styles.
Analysts with a higher historical hit rate carry more weight (annotated at the end of their line).
Respond in English. Return only JSON:
{"signal": "bullish|bearish|neutral", "confidence": 0-100, "summary": "Summary in under 200 words", "consensus": 0-100}`,
  ja: `あなたは投資委員会の議長です。全アナリストの独立した評価を総合して最終推奨を提示してください。
重視すること：多数決の方向性、高い確信度のアナリストへの重み付け、スタイル間の乖離。
過去の的中率が高いアナリストほど、その見解の重みが大きくなります（各行末に注記）。
日本語で回答してください。JSONのみを返してください：
{"signal": "bullish|bearish|neutral", "confidence": 0-100, "summary": "200字以内の総合分析", "consensus": 0-100}`,
};

export const FALLBACK_SUMMARY: Record<
  Language,
  (n: number, b: number, be: number, sig: string) => string
> = {
  zh: (n, b, be, sig) =>
    `${n} 位大师中 ${b} 位看涨、${be} 位看跌。综合判断为${sig === 'bullish' ? '看涨' : sig === 'bearish' ? '看跌' : '中性'}。`,
  en: (n, b, be, sig) => `${b} of ${n} analysts bullish, ${be} bearish. Overall: ${sig}.`,
  ja: (n, b, be, sig) =>
    `${n}人中${b}人が強気、${be}人が弱気。総合判断：${sig === 'bullish' ? '強気' : sig === 'bearish' ? '弱気' : '中立'}。`,
};

const PROMPT_LABELS: Record<
  Language,
  {
    masters: string;
    sentiment: string;
    quant: string;
    signal: string;
    positive: string;
    composite: string;
    tech: string;
    fundamental: string;
    hitRate: string;
    weight: string;
  }
> = {
  zh: {
    masters: '各大师研判',
    sentiment: '情绪分析',
    quant: '量化评分',
    signal: '信号',
    positive: '正面新闻',
    composite: '综合',
    tech: '技术面',
    fundamental: '基本面',
    hitRate: '历史命中率',
    weight: '权重',
  },
  en: {
    masters: 'Master Analysts',
    sentiment: 'Sentiment',
    quant: 'Quant Score',
    signal: 'Signal',
    positive: 'Positive news',
    composite: 'Composite',
    tech: 'Technical',
    fundamental: 'Fundamental',
    hitRate: 'Hit rate',
    weight: 'Weight',
  },
  ja: {
    masters: '投資マスター分析',
    sentiment: '感情分析',
    quant: '定量スコア',
    signal: 'シグナル',
    positive: 'ポジティブニュース',
    composite: '総合',
    tech: 'テクニカル',
    fundamental: 'ファンダメンタル',
    hitRate: '的中率',
    weight: 'ウェイト',
  },
};

export function computeConsensus(signals: MasterSignal[]): number {
  if (signals.length === 0) return 0;
  const counts = { bullish: 0, bearish: 0, neutral: 0 };
  for (const s of signals) counts[s.signal]++;
  return Math.round(
    (Math.max(counts.bullish, counts.bearish, counts.neutral) / signals.length) * 100,
  );
}

export function computeLocalSynthesis(
  signals: MasterSignal[],
  weights?: Map<string, MasterWeight>,
): {
  signal: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
} {
  if (signals.length === 0) return { signal: 'neutral', confidence: 50 };
  let bW = 0,
    beW = 0,
    nW = 0;
  for (const s of signals) {
    // 达阈值大师的 confidence 贡献乘以权重；缺省（未达阈值/无 weights）为 1 → 与今天逐字节一致
    const w = weights?.get(s.masterId)?.weight ?? 1;
    if (s.signal === 'bullish') bW += s.confidence * w;
    else if (s.signal === 'bearish') beW += s.confidence * w;
    else nW += s.confidence * w;
  }
  const total = bW + beW + nW;
  if (total === 0) return { signal: 'neutral', confidence: 50 };
  const maxW = Math.max(bW, beW, nW);
  let signal: 'bullish' | 'bearish' | 'neutral';
  if (bW === beW && bW === maxW) signal = 'neutral';
  else if (maxW === bW) signal = 'bullish';
  else if (maxW === beW) signal = 'bearish';
  else signal = 'neutral';
  return { signal, confidence: Math.round((maxW / total) * 100) };
}

export function buildSynthesisPrompt(
  signals: MasterSignal[],
  sentiment: SentimentSignal,
  quant: QuantBundle,
  lang: Language,
  weights?: Map<string, MasterWeight>,
): string {
  const L = PROMPT_LABELS[lang];
  const summary = signals
    .map((s) => {
      // 仅对达阈值（在 Map 中）的大师追加战绩标注；未达阈值不标注，LLM 不会对薄样本过度自信
      const wEntry = weights?.get(s.masterId);
      const badge = wEntry
        ? ` [${L.hitRate} ${Math.round(wEntry.hitRate * 100)}% · ${L.weight} ${wEntry.weight.toFixed(2)}]`
        : '';
      return `- ${s.masterId}: ${s.signal} (${s.confidence}%)${badge} — ${s.reasoning.slice(0, 80)}`;
    })
    .join('\n');
  return `[${L.masters}]\n${summary}\n\n[${L.sentiment}]\n${L.signal}: ${sentiment.signal}, ${L.positive} ${sentiment.newsBreakdown.positive}/${sentiment.newsBreakdown.total}\n\n[${L.quant}]\n${L.composite}: ${quant.composite.score}/100 (${quant.composite.signal})\n${L.tech}: ${quant.technical.signal} (${quant.technical.confidence}%)\n${L.fundamental}: ${quant.fundamental.signal} (${quant.fundamental.confidence}%)`;
}

export async function synthesize(
  masterSignals: MasterSignal[],
  sentiment: SentimentSignal,
  quant: QuantBundle,
  chat: ChatProvider,
  language?: Language,
  masterWeights?: MasterWeightInput[],
): Promise<DeepAnalysisResult> {
  const lang = language ?? 'zh';
  // 空/缺省 → 空 Map → 两条路径均按默认权重，与今天一致（向后兼容）
  const weights = computeMasterWeights(masterWeights ?? []);
  if (weights.size > 0) logger.info(`已加载 ${weights.size} 位大师权重`);
  const consensus = computeConsensus(masterSignals);
  const localSynthesis = computeLocalSynthesis(masterSignals, weights);
  let synthesis: DeepAnalysisResult['synthesis'];
  try {
    const raw = await chat.chat(
      SYSTEM_PROMPTS[lang],
      buildSynthesisPrompt(masterSignals, sentiment, quant, lang, weights),
    );
    const parsed = JSON.parse(raw);
    synthesis = {
      signal: ['bullish', 'bearish', 'neutral'].includes(parsed.signal)
        ? parsed.signal
        : localSynthesis.signal,
      confidence: Math.max(
        0,
        Math.min(100, Number(parsed.confidence) || localSynthesis.confidence),
      ),
      summary: String(parsed.summary || '').slice(0, 1000),
      consensus: Number(parsed.consensus) || consensus,
    };
  } catch (err) {
    logger.warn(`综合研判 LLM 失败，使用本地计算: ${toErrorMessage(err)}`);
    const bullishCount = masterSignals.filter((s) => s.signal === 'bullish').length;
    const bearishCount = masterSignals.filter((s) => s.signal === 'bearish').length;
    synthesis = {
      signal: localSynthesis.signal,
      confidence: localSynthesis.confidence,
      summary: (FALLBACK_SUMMARY[lang] ?? FALLBACK_SUMMARY.zh)(
        masterSignals.length,
        bullishCount,
        bearishCount,
        localSynthesis.signal,
      ),
      consensus,
    };
  }
  return { masterSignals, sentiment, synthesis };
}
