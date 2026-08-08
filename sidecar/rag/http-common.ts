/** RAG 抓取层（sse.ts / irm.ts / company-name.ts）共用的 chunk 截断逻辑。
 *  UA 与超时不在此定义——统一走 sidecar/http.ts 的 fetchWithPolicy（交易所平台响应慢，用 slowTimeoutMs）。 */

/** chunk 正文长度上限（字符）：控制注入 token，超长截断 */
const MAX_CHUNK_LEN = 600;

/** 按 MAX_CHUNK_LEN 截断问答正文（保留完整前缀，不做省略号，纯截断控制 token） */
export function truncateChunkText(text: string): string {
  return text.length > MAX_CHUNK_LEN ? text.slice(0, MAX_CHUNK_LEN) : text;
}
