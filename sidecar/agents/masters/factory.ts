import type { MasterAgent, MasterAnalysisContext, MasterSignal } from '../types';
import type { MasterMeta, Language, StockNews } from '../../../shared/types';
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
