import { expect, test, describe } from 'bun:test';
import { fetchWithPolicy } from './http';
import { HTTP_DEFAULTS } from './config';

/**
 * 本模块被每个数据源测试**间接**跑到（它们都往 fetchWithPolicy 注 fetchImpl），
 * 但那些用例只断言 URL——把注入 UA、注入超时这两行删掉，全仓测试照样全绿。
 * 「UA 与超时只表达一次」是本层的硬约定，得有人正面钉住它。
 */
function capture() {
  const seen: { url?: string; init?: RequestInit } = {};
  const fetchImpl = (async (url: string, init: RequestInit) => {
    seen.url = url;
    seen.init = init;
    return new Response('ok');
  }) as unknown as typeof fetch;
  return { seen, fetchImpl };
}

const headersOf = (init?: RequestInit) => init?.headers as Record<string, string>;

describe('fetchWithPolicy', () => {
  test('URL 原样透传', async () => {
    const { seen, fetchImpl } = capture();
    await fetchWithPolicy('https://x.test/a?b=1', { fetchImpl });
    expect(seen.url).toBe('https://x.test/a?b=1');
  });

  test('默认注入统一 User-Agent，取自 HTTP_DEFAULTS', async () => {
    const { seen, fetchImpl } = capture();
    await fetchWithPolicy('https://x.test/a', { fetchImpl });
    expect(headersOf(seen.init)['User-Agent']).toBe(HTTP_DEFAULTS.userAgent);
  });

  test('调用方的 headers 与默认 UA 合并（Referer 是各数据源的常见附加头）', async () => {
    const { seen, fetchImpl } = capture();
    await fetchWithPolicy('https://x.test/a', {
      fetchImpl,
      headers: { Referer: 'https://r.test' },
    });

    expect(headersOf(seen.init).Referer).toBe('https://r.test');
    expect(headersOf(seen.init)['User-Agent']).toBe(HTTP_DEFAULTS.userAgent);
  });

  test('同名 header 覆盖默认 UA', async () => {
    const { seen, fetchImpl } = capture();
    await fetchWithPolicy('https://x.test/a', {
      fetchImpl,
      headers: { 'User-Agent': 'custom/1.0' },
    });
    expect(headersOf(seen.init)['User-Agent']).toBe('custom/1.0');
  });

  test('method 与 body 原样透传', async () => {
    const { seen, fetchImpl } = capture();
    await fetchWithPolicy('https://x.test/a', { fetchImpl, method: 'POST', body: 'k=v' });

    expect(seen.init?.method).toBe('POST');
    expect(seen.init?.body).toBe('k=v');
  });

  /** 挂起的请求会拖死整条 Promise.allSettled 链路，超时不是可选项 */
  test('每次请求都带超时 signal，且 timeoutMs 真的生效', async () => {
    const { seen, fetchImpl } = capture();
    await fetchWithPolicy('https://x.test/a', { fetchImpl, timeoutMs: 1 });
    const signal = seen.init?.signal as AbortSignal;

    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal.aborted).toBe(false);
    await new Promise((r) => setTimeout(r, 30));
    expect(signal.aborted).toBe(true);
  });

  test('不传 timeoutMs 时用默认值，不会立刻中止', async () => {
    const { seen, fetchImpl } = capture();
    await fetchWithPolicy('https://x.test/a', { fetchImpl });
    await new Promise((r) => setTimeout(r, 30));

    expect((seen.init?.signal as AbortSignal).aborted).toBe(false);
    expect(HTTP_DEFAULTS.timeoutMs).toBeGreaterThan(30);
  });
});
