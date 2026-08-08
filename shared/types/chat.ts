// 对话式追问与溯源角标（含财报 RAG 片段）
/** 溯源角标的来源类型 */
export type CitationSourceType = 'news' | 'quant' | 'analysis' | 'report';

/**
 * RAG 检索回的单条投资者互动问答片段（沪市上证e互动 / 深市互动易）。
 * 由 sidecar 在 handleChat 内注入 ChatContext（前端不填），驱动 report 类型溯源角标。
 */
export interface ReportChunk {
  text: string; // chunk 正文（问答段，「问：…\n答：…」），已截断到长度上限
  docTitle: string; // 固定为「投资者互动问答」
  docDate: string; // 回答发布日期 YYYY-MM-DD
  url?: string; // 来源页面链接（供 badge「查看原文」复用）
  position?: string; // 片段位置，如「问答 #7」
}

/**
 * AI 回答里的一条溯源角标（sidecar 校验通过后才产生）。
 * 关键红线：错误来源比无来源更糟——每条 citation 的 snippet 都由 sidecar 从「本次真实传入的 context」取值，
 * 不信任 LLM 声称的内容；校验不过的标记被静默删除，不会产生 citation。
 */
export interface ChatCitation {
  index: number; // 与 reply 中 [[cite:index]] token 对应，即 citations 数组下标
  sourceType: CitationSourceType;
  sourceRef: number | string; // news→1-based 序号；quant/analysis→'summary' 哨兵
  snippet: string; // 被引用的原文片段（新闻标题 / 量化摘要 / 分析结论 / 财报问答段），取自本次 context
  label?: string; // 可选：角标本地化标题；实际由前端按 useLanguage() 派生，sidecar 不生成
  sourceUrl?: string; // 仅 report 用：来源页面链接；report 无前端 ref 数组，链接必须自带
  sourceMeta?: { title: string; date: string; position?: string }; // 仅 report 用：来源行渲染（标题/日期/片段位置）
}

/** 对话式追问的单条历史消息（不含 system，system 由 sidecar 按上下文构建） */
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  citations?: ChatCitation[]; // 仅 assistant 消息可能携带，随多轮历史持久化
}

/** 对话式追问上下文：精简自当前股票的新闻/量化/已有分析，避免重复抓取与超长 payload */
export interface ChatContext {
  newsTitles?: string[]; // 近期新闻标题
  quantSummary?: string; // 量化评分摘要（如「综合 72/100，技术面看涨」）
  analysisSummary?: string; // 已有 AI 分析的结论摘要
  reportChunks?: ReportChunk[]; // 财报/说明会 RAG 检索片段；前端不填，sidecar 在 handleChat 内注入
}

/** 对话式追问请求（前端 → Rust → Sidecar） */
export interface ChatPayload {
  symbol: string;
  question: string;
  history: ChatMessage[]; // 之前的多轮对话
  context: ChatContext;
}

/** 对话式追问响应 */
export interface ChatResponse {
  reply: string; // 已清洗：[src:...] 均被删除或改写为 [[cite:N]]
  citations?: ChatCitation[]; // 校验通过的溯源角标，可能为空数组
}
