import type { MasterSignal, SentimentSignal, DeepAnalysisResult, QuantBundle, Language } from '../../shared/types';
import type { ChatProvider } from './types';
import { logger, toErrorMessage } from '../utils';

const SYSTEM_PROMPTS: Record<Language, string> = {
  zh: `你是投资委员会主席。综合所有分析师的独立研判，给出最终投资建议。
重点关注：多数分析师的共识方向、高置信度分析师的权重更大、不同风格间的分歧。
用中文回复。只返回 JSON：
{"signal": "bullish|bearish|neutral", "confidence": 0-100, "summary": "200字以内综合分析", "consensus": 0-100}`,
  en: `You are the chair of the investment committee. Synthesize all analysts' independent assessments into a final recommendation.
Focus on: the consensus direction, weight high-confidence analysts more heavily, and note divergences between styles.
Respond in English. Return only JSON:
{"signal": "bullish|bearish|neutral", "confidence": 0-100, "summary": "Summary in under 200 words", "consensus": 0-100}`,
  ja: `あなたは投資委員会の議長です。全アナリストの独立した評価を総合して最終推奨を提示してください。
重視すること：多数決の方向性、高い確信度のアナリストへの重み付け、スタイル間の乖離。
日本語で回答してください。JSONのみを返してください：
{"signal": "bullish|bearish|neutral", "confidence": 0-100, "summary": "200字以内の総合分析", "consensus": 0-100}`,
};

export function computeConsensus(signals: MasterSignal[]): number {
  if (signals.length === 0) return 0;
  const counts = { bullish: 0, bearish: 0, neutral: 0 };
  for (const s of signals) counts[s.signal]++;
  return Math.round((Math.max(counts.bullish, counts.bearish, counts.neutral) / signals.length) * 100);
}

function computeLocalSynthesis(signals: MasterSignal[]): { signal: 'bullish' | 'bearish' | 'neutral'; confidence: number } {
  if (signals.length === 0) return { signal: 'neutral', confidence: 50 };
  let bW = 0, beW = 0, nW = 0;
  for (const s of signals) {
    if (s.signal === 'bullish') bW += s.confidence;
    else if (s.signal === 'bearish') beW += s.confidence;
    else nW += s.confidence;
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

function buildSynthesisPrompt(signals: MasterSignal[], sentiment: SentimentSignal, quant: QuantBundle): string {
  const summary = signals.map(s => `- ${s.masterId}: ${s.signal} (${s.confidence}%) — ${s.reasoning.slice(0, 80)}`).join('\n');
  return `[各大师研判]\n${summary}\n\n[情绪分析]\n信号: ${sentiment.signal}, 正面新闻 ${sentiment.newsBreakdown.positive}/${sentiment.newsBreakdown.total}\n\n[量化评分]\n综合: ${quant.composite.score}/100 (${quant.composite.signal})\n技术面: ${quant.technical.signal} (${quant.technical.confidence}%)\n基本面: ${quant.fundamental.signal} (${quant.fundamental.confidence}%)`;
}

export async function synthesize(
  masterSignals: MasterSignal[], sentiment: SentimentSignal, quant: QuantBundle, chat: ChatProvider,
  language?: Language,
): Promise<DeepAnalysisResult> {
  const lang = language ?? 'zh';
  const consensus = computeConsensus(masterSignals);
  const localSynthesis = computeLocalSynthesis(masterSignals);
  let synthesis: DeepAnalysisResult['synthesis'];
  try {
    const raw = await chat.chat(SYSTEM_PROMPTS[lang], buildSynthesisPrompt(masterSignals, sentiment, quant));
    const parsed = JSON.parse(raw);
    synthesis = {
      signal: ['bullish', 'bearish', 'neutral'].includes(parsed.signal) ? parsed.signal : localSynthesis.signal,
      confidence: Math.max(0, Math.min(100, Number(parsed.confidence) || localSynthesis.confidence)),
      summary: String(parsed.summary || '').slice(0, 1000),
      consensus: Number(parsed.consensus) || consensus,
    };
  } catch (err) {
    logger.warn(`综合研判 LLM 失败，使用本地计算: ${toErrorMessage(err)}`);
    const bullishCount = masterSignals.filter(s => s.signal === 'bullish').length;
    const bearishCount = masterSignals.filter(s => s.signal === 'bearish').length;
    const FALLBACK_SUMMARY: Record<Language, (n: number, b: number, be: number, sig: string) => string> = {
      zh: (n, b, be, sig) => `${n} 位大师中 ${b} 位看涨、${be} 位看跌。综合判断为${sig === 'bullish' ? '看涨' : sig === 'bearish' ? '看跌' : '中性'}。`,
      en: (n, b, be, sig) => `${b} of ${n} analysts bullish, ${be} bearish. Overall: ${sig}.`,
      ja: (n, b, be, sig) => `${n}人中${b}人が強気、${be}人が弱気。総合判断：${sig === 'bullish' ? '強気' : sig === 'bearish' ? '弱気' : '中立'}。`,
    };
    synthesis = {
      signal: localSynthesis.signal, confidence: localSynthesis.confidence,
      summary: (FALLBACK_SUMMARY[lang] ?? FALLBACK_SUMMARY.zh)(masterSignals.length, bullishCount, bearishCount, localSynthesis.signal),
      consensus,
    };
  }
  return { masterSignals, sentiment, synthesis };
}
