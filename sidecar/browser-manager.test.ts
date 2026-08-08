import { describe, test, expect, mock } from 'bun:test';
import { BrowserManager } from './browser-manager';

/**
 * close() 的契约是「既不抛，也不无限等」——调用方（scraper.ts）把它放在 finally 里
 * 无条件 await，且那已经在抓取预算之外。抛出会连同已抓到的新闻一起丢掉。
 *
 * BrowserManager 没有构造注入口，这里直接往私有字段塞替身：为了测试再开一个注入参数，
 * 是把测试的需要漏进生产 API。
 */
function withFakes(mgr: BrowserManager, fakes: { context?: unknown; browser?: unknown }) {
  Object.assign(mgr, fakes);
}

describe('BrowserManager.close', () => {
  test('browser.close() 抛出时不外泄异常，且句柄被清空', async () => {
    const mgr = new BrowserManager();
    withFakes(mgr, { browser: { close: mock(() => Promise.reject(new Error('浏览器已崩溃'))) } });

    await expect(mgr.close()).resolves.toBeUndefined();
    expect((mgr as unknown as { browser: unknown }).browser).toBeNull();
  });

  test('context.close() 失败不拦住 browser.close()——要收的是浏览器子进程', async () => {
    const browserClose = mock(() => Promise.resolve());
    const mgr = new BrowserManager();
    withFakes(mgr, {
      context: { close: mock(() => Promise.reject(new Error('上下文已失效'))) },
      browser: { close: browserClose },
    });

    await mgr.close();

    expect(browserClose).toHaveBeenCalledTimes(1);
  });

  test('没有任何句柄时是空操作', async () => {
    await expect(new BrowserManager().close()).resolves.toBeUndefined();
  });
});
