import { fetchWithPolicy } from './http';

/**
 * Yahoo `quoteSummary`（v10）的 cookie + crumb 握手。
 *
 * 为什么需要：该端点已加上鉴权门禁，裸请求一律 **HTTP 401**——这不是限流，重试或换 UA 都没用。
 * 每日数据源冒烟（`quant.integration.ts`）从干净 IP 实测确认了这一点。
 * v8 chart 与 v7 quote 仍然开放，所以只有基本面这一条链路需要握手。
 *
 * 两步：
 *   1. GET `fc.yahoo.com` —— 响应**必定是 404**，但会 Set-Cookie 下发 A1/A3；这里的
 *      产物是 cookie 不是响应体，所以**故意不检查状态码**。
 *   2. 带上该 cookie GET `/v1/test/getcrumb` —— 响应体就是裸 crumb 字符串。
 *
 * 不做进程级缓存：sidecar 是「一次 CLI 调用一个进程」的短命进程，一次运行里
 * `fetchFundamentals` 只调一次，缓存省不下任何请求，只会引入过期态。
 */
export interface YahooSession {
  /** 拼好的 `Cookie` 请求头值 */
  cookie: string;
  /** 附在 URL 上的 `crumb` 查询参数值 */
  crumb: string;
}

export async function fetchYahooSession(fetchImpl?: typeof fetch): Promise<YahooSession> {
  // 404 是这一步的正常响应，要的是它的 Set-Cookie
  const seed = await fetchWithPolicy('https://fc.yahoo.com', { fetchImpl });
  const cookie = seed.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
  if (!cookie) throw new Error('Yahoo 未下发 cookie，无法取 crumb');

  const resp = await fetchWithPolicy('https://query1.finance.yahoo.com/v1/test/getcrumb', {
    headers: { Cookie: cookie },
    fetchImpl,
  });
  if (!resp.ok) throw new Error(`Yahoo crumb HTTP ${resp.status}`);

  const crumb = (await resp.text()).trim();
  // crumb 是十来个字符的单 token。同意页/错误页会以 200 + HTML 返回，只看状态码
  // 会把整页 HTML 当 crumb 拼进 URL，换来一个更难查的 401。
  // 用长度上限而非「不含空白」判别：压缩过的 HTML 片段同样没有空白。
  // 字符集刻意不收窄——crumb 里出现过 `/` `.` `+`，收窄会误杀真 crumb。
  if (!crumb || crumb.length > 32 || /[\s<>]/.test(crumb)) {
    throw new Error(`Yahoo crumb 响应异常: ${crumb.slice(0, 40)}`);
  }
  return { cookie, crumb };
}
