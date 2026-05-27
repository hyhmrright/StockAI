import type { MasterAgent, MasterAnalysisContext, MasterSignal } from '../types';
import type { MasterMeta, Language } from '../../../shared/types';
import { logger, toErrorMessage } from '../../utils';

const LANG_INSTRUCTION: Record<Language, string> = {
  zh: '用中文回复',
  en: 'Respond in English',
  ja: '日本語で回答してください',
};

const PARSE_FAIL_MSG: Record<Language, string> = {
  zh: '响应解析失败',
  en: 'Response parse failed',
  ja: 'レスポンス解析失敗',
};

const SERVICE_UNAVAIL_MSG: Record<Language, string> = {
  zh: '分析服务暂不可用',
  en: 'Analysis service unavailable',
  ja: '分析サービス利用不可',
};

function parseResponse(raw: string, masterId: string, lang: Language): MasterSignal {
  try {
    const parsed = JSON.parse(raw);
    const signal = ['bullish', 'bearish', 'neutral'].includes(parsed.signal) ? parsed.signal : 'neutral';
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
        return { masterId: meta.id, signal: 'neutral', confidence: 50, reasoning: SERVICE_UNAVAIL_MSG[lang] };
      }
    },
  };
}
