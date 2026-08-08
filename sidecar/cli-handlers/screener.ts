import { toErrorMessage, successEnvelope, errorEnvelope, errorEnvelopeFromUnknown } from '../utils';
import type { ResolvedConfig } from '../configResolver';
import type { HandlerContext } from './context';

/** #14 自然语言选股。独立成组：它有自己的一套错误码分类，与其它 LLM 链路不共用。 */
export function createScreenerHandlers({ out }: HandlerContext) {
  return {
    /**
     * LLM 解析 → 全市场两阶段筛选（粗筛快照 + 候选精拉）。
     * 结构化抽取属轻任务，走 quick 角色。异常按类型映射稳定错误码，任何路径都 outputJson 合法信封。
     */
    async handleScreen(nlQuery: string, config: ResolvedConfig) {
      if (!nlQuery?.trim()) {
        out(errorEnvelope('ERR_MISSING_PARAM', '未提供筛选描述'));
        return;
      }
      // 在 try 外 import：下面的 catch 要用它导出的错误类做 instanceof 分类
      const nlScreen = await import('../quant/nl-screen');
      try {
        const { createChatProvider } = await import('../agents/chat-adapter');
        const chat = createChatProvider(config.roles.quick);
        const result = await nlScreen.runScreen({ nlQuery, chat, language: config.language });
        out(successEnvelope(result));
      } catch (error) {
        if (error instanceof nlScreen.ScreenParseError) {
          out(errorEnvelope('ERR_SCREEN_PARSE', toErrorMessage(error)));
        } else if (error instanceof nlScreen.ScreenNoConditionsError) {
          out(errorEnvelope('ERR_SCREEN_NO_CONDITIONS', toErrorMessage(error)));
        } else {
          out(errorEnvelopeFromUnknown('ERR_SCREEN', error));
        }
      }
    },
  };
}
