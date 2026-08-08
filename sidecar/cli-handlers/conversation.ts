import {
  toErrorMessage,
  logger,
  successEnvelope,
  errorEnvelope,
  errorEnvelopeFromUnknown,
} from '../utils';
import type { ResolvedConfig } from '../configResolver';
import type { ChatPayload } from '../../shared/types';
import type { HandlerContext } from './context';

/** 对话式追问及其前置的财报 RAG 索引预热。 */
export function createConversationHandlers({ out, deps, requireSymbol }: HandlerContext) {
  return {
    /**
     * #11 财报 RAG 预热：提前建索引，把交易所互动平台抓取挪出 chat 首答关键路径（前端 fire-and-forget）。
     * 返回 { indexed, docCount }。ensureReportIndex 已吞掉网络异常返回 null，此处仅兜底信封。
     */
    async handleIndexReports(symbol: string) {
      if (!requireSymbol(symbol)) return;
      try {
        const ensureIndex = deps._ensureReportIndex ?? (await import('../rag')).ensureReportIndex;
        const index = await ensureIndex(symbol);
        out(successEnvelope({ indexed: !!index, docCount: index?.chunks.length ?? 0 }));
      } catch (error) {
        out(errorEnvelopeFromUnknown('ERR_INDEX_REPORTS', error));
      }
    },

    /**
     * 对话式追问 — 基于已抓上下文做多轮自然语言问答，复用 provider 配置
     */
    async handleChat(payload: ChatPayload, config: ResolvedConfig) {
      try {
        if (!payload?.question?.trim()) {
          out(errorEnvelope('ERR_MISSING_PARAM', '未提供问题'));
          return;
        }
        const { runChat, buildChatMessages, extractCitations } = await import('../chat');
        const runChatFn = deps._runChat ?? runChat;
        // 财报 RAG：best-effort 检索交易所官方互动平台的投资者问答原文，非空则注入 context.reportChunks。
        // 异常/无命中一律吞掉退化为 []，绝不让 RAG 失败阻断 chat（永不阻断主流程）。
        try {
          const retrieve =
            deps._retrieveReportChunks ?? (await import('../rag')).retrieveReportChunks;
          const chunks = await retrieve(payload.symbol, payload.question);
          if (chunks.length) {
            payload.context = { ...payload.context, reportChunks: chunks };
          }
        } catch (err) {
          logger.warn(`财报 RAG 检索失败，退化为无 report 上下文: ${toErrorMessage(err)}`);
        }
        const messages = buildChatMessages(payload, config.language);
        // 对话追问走 summarize 角色（基于已抓上下文的信息提炼，可用更便宜的模型）
        const rawReply = await runChatFn(config.roles.summarize, messages);
        // 校验 + 静默降级：LLM 标错/越界的来源会被删除，只有真实上下文命中的才产生 citation
        const { reply, citations } = extractCitations(rawReply, payload);
        out(successEnvelope({ reply, citations }));
      } catch (error) {
        out(errorEnvelopeFromUnknown('ERR_CHAT', error));
      }
    },
  };
}
