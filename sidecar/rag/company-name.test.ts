import { describe, test, expect } from 'bun:test';
import { resolveCompanyName } from './company-name';

describe('resolveCompanyName', () => {
  test('真实响应形态：命中代码 → 返回简称', async () => {
    const name = await resolveCompanyName('000858', {
      fetchImpl: (async () =>
        new Response(JSON.stringify([{ code: '000858', orgId: 'gssz0000858', zwjc: '五粮液' }]), {
          status: 200,
        })) as unknown as typeof fetch,
    });
    expect(name).toBe('五粮液');
  });

  test('无匹配（code 不同）→ null', async () => {
    const name = await resolveCompanyName('000858', {
      fetchImpl: (async () =>
        new Response(JSON.stringify([{ code: '000001', zwjc: '平安银行' }]), {
          status: 200,
        })) as unknown as typeof fetch,
    });
    expect(name).toBeNull();
  });

  test('空数组 → null', async () => {
    const name = await resolveCompanyName('000858', {
      fetchImpl: (async () => new Response('[]', { status: 200 })) as unknown as typeof fetch,
    });
    expect(name).toBeNull();
  });

  test('HTTP 非 2xx → null', async () => {
    const name = await resolveCompanyName('000858', {
      fetchImpl: (async () => new Response('', { status: 500 })) as unknown as typeof fetch,
    });
    expect(name).toBeNull();
  });

  test('网络异常 → null（不抛）', async () => {
    const name = await resolveCompanyName('000858', {
      fetchImpl: (async () => {
        throw new Error('network down');
      }) as unknown as typeof fetch,
    });
    expect(name).toBeNull();
  });
});
