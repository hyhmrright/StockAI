import type { SentimentSignal, Language, StockNews } from '../../shared/types';
import type { ChatProvider } from './types';
import { logger, toErrorMessage } from '../utils';

const SYSTEM_PROMPTS: Record<Language, string> = {
  zh: `你是金融新闻情绪分析专家。对每条新闻标注情绪倾向并给出整体判断。只返回 JSON。`,
  en: `You are a financial news sentiment analysis expert. Label the sentiment of each news item and give an overall judgment. Return only JSON.`,
  ja: `あなたは金融ニュースの感情分析の専門家です。各ニュースの感情傾向にラベルを付け、全体的な判断を示してください。JSONのみを返してください。`,
};

interface SentimentItem {
  index: number;
  sentiment: 'positive' | 'negative' | 'neutral';
}

const USER_PROMPT_INTRO: Record<Language, (n: number) => string> = {
  zh: (n) => `对以下 ${n} 条新闻逐条标注情绪（positive/negative/neutral）：`,
  en: (n) => `Label the sentiment (positive/negative/neutral) of each of the following ${n} news items:`,
  ja: (n) => `以下の${n}件のニュースそれぞれに感情（positive/negative/neutral）をラベル付けしてください：`,
};

function buildPrompt(news: StockNews[], lang: Language = 'zh'): string {
  const items = news.map((n, i) =>
    `${i + 1}. ${n.title}${n.content ? '\n   ' + n.content.substring(0, 300) : ''}`,
  ).join('\n\n');
  const intro = (USER_PROMPT_INTRO[lang] ?? USER_PROMPT_INTRO.zh)(news.length);
  return `${intro}\n\n${items}\n\n返回格式：\n{\n  "items": [{"index": 1, "sentiment": "positive"}, ...],\n  "overall": "positive" | "negative" | "neutral"\n}`;
}

export function computeSentimentSignal(items: SentimentItem[]): SentimentSignal {
  const breakdown = { positive: 0, negative: 0, neutral: 0, total: items.length };
  for (const item of items) {
    if (item.sentiment === 'positive') breakdown.positive++;
    else if (item.sentiment === 'negative') breakdown.negative++;
    else breakdown.neutral++;
  }
  let signal: 'bullish' | 'bearish' | 'neutral';
  if (breakdown.positive > breakdown.negative && breakdown.positive > breakdown.neutral) signal = 'bullish';
  else if (breakdown.negative > breakdown.positive && breakdown.negative > breakdown.neutral) signal = 'bearish';
  else signal = 'neutral';
  const maxCount = Math.max(breakdown.positive, breakdown.negative, breakdown.neutral);
  const confidence = breakdown.total > 0 ? Math.round((maxCount / breakdown.total) * 100) : 50;
  return { signal, confidence, newsBreakdown: breakdown };
}

export async function analyzeSentiment(news: StockNews[], chat: ChatProvider, language?: Language): Promise<SentimentSignal> {
  const lang = language ?? 'zh';
  if (news.length === 0) return { signal: 'neutral', confidence: 50, newsBreakdown: { positive: 0, negative: 0, neutral: 0, total: 0 } };
  try {
    const raw = await chat.chat(SYSTEM_PROMPTS[lang], buildPrompt(news, lang));
    const parsed = JSON.parse(raw) as { items?: SentimentItem[] };
    const items: SentimentItem[] = (parsed.items || []).map(it => ({
      index: it.index,
      sentiment: ['positive', 'negative', 'neutral'].includes(it.sentiment) ? it.sentiment : 'neutral',
    }));
    return computeSentimentSignal(items);
  } catch (err) {
    logger.warn(`情绪分析失败: ${toErrorMessage(err)}`);
    return { signal: 'neutral', confidence: 50, newsBreakdown: { positive: 0, negative: 0, neutral: 0, total: 0 } };
  }
}
