import { describe, expect, test } from 'bun:test';
import { fetchYahooSession } from './yahoo-session';

/** 按 URL 分派的假 fetch：seed 阶段回 cookie，crumb 阶段回给定响应 */
function stubFetch(seed: Response, crumb: Response): typeof fetch {
  return (async (url: string | URL | Request) =>
    String(url).includes('getcrumb') ? crumb : seed) as typeof fetch;
}

function seedResponse(cookies: string[]): Response {
  const headers = new Headers();
  for (const c of cookies) headers.append('set-cookie', c);
  // 真实响应就是 404——状态码不该影响结果
  return new Response('', { status: 404, headers });
}

describe('fetchYahooSession', () => {
  test('拼接全部 cookie 并去掉属性段', async () => {
    const session = await fetchYahooSession(
      stubFetch(
        seedResponse(['A1=one; Path=/; Secure', 'A3=two; HttpOnly']),
        new Response('  abc123\n'),
      ),
    );
    expect(session.cookie).toBe('A1=one; A3=two');
    expect(session.crumb).toBe('abc123');
  });

  test('未下发 cookie 时抛出，而不是拿空 Cookie 头去撞 401', async () => {
    const call = fetchYahooSession(stubFetch(seedResponse([]), new Response('abc123')));
    expect(call).rejects.toThrow('未下发 cookie');
  });

  test('crumb 端点非 200 时抛出', async () => {
    const call = fetchYahooSession(
      stubFetch(seedResponse(['A3=two']), new Response('Too Many Requests', { status: 429 })),
    );
    expect(call).rejects.toThrow('HTTP 429');
  });

  test('crumb 端点回 HTML 页面时抛出，不把整页当 crumb 拼进 URL', async () => {
    const call = fetchYahooSession(
      stubFetch(seedResponse(['A3=two']), new Response('<html><body>consent</body></html>')),
    );
    expect(call).rejects.toThrow('crumb 响应异常');
  });
});
