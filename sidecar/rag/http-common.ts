/** RAG 抓取层（sse.ts / irm.ts / company-name.ts）共用的 HTTP 配置与 chunk 截断逻辑。 */

export const RAG_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';
export const RAG_REQ_TIMEOUT = 10_000;

/** chunk 正文长度上限（字符）：控制注入 token，超长截断 */
const MAX_CHUNK_LEN = 600;

/** 按 MAX_CHUNK_LEN 截断问答正文（保留完整前缀，不做省略号，纯截断控制 token） */
export function truncateChunkText(text: string): string {
  return text.length > MAX_CHUNK_LEN ? text.slice(0, MAX_CHUNK_LEN) : text;
}
