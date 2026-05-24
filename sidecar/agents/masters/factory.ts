import type { MasterAgent, MasterAnalysisContext, MasterSignal } from '../types';
import type { MasterMeta } from '../../../shared/types';
import { logger, toErrorMessage } from '../../utils';

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

export function createMasterAgent(
  meta: MasterMeta,
  systemPrompt: string,
  buildUserPrompt: (ctx: MasterAnalysisContext) => string,
): MasterAgent {
  return {
    meta,
    async analyze(ctx: MasterAnalysisContext): Promise<MasterSignal> {
      try {
        const raw = await ctx.chat.chat(systemPrompt, buildUserPrompt(ctx));
        return parseResponse(raw, meta.id);
      } catch (err) {
        logger.warn(`[${meta.id}] 分析失败: ${toErrorMessage(err)}`);
        return { masterId: meta.id, signal: 'neutral', confidence: 50, reasoning: '分析服务暂不可用' };
      }
    },
  };
}
