import { describe, test, expect, mock, jest } from 'bun:test';
import { BrowserManager } from './browser-manager';
import { TIMEOUTS } from './config';

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

  /**
   * 契约的另一半：**不无限等**。前面几条只覆盖了「不抛」。
   *
   * 卡死的 Chromium（close() 永不 resolve）是真实故障——清理跑在 scrapeStockNews 的
   * finally 里、在 scrapeBudget 之外，没有这条线就等于「有界抓取」又变回无限期等待。
   *
   * 用 fake timers 而不是真等 10 秒：这套默认套件整体跑 0.5s，为一条断言加 10s
   * 会让每次改动的反馈成本翻二十倍。
   *
   * **全程不 await close() 本身**，只推进时钟后断言状态位。这不是风格选择：
   * 去掉 withTimeout 后 close() 会永不落地，await 它就变成整个套件永久挂起
   * ——而 fake timers 下 bun 的用例超时也不生效（两条都已实测）。断状态位则让
   * 同样的回归表现为一条干净的断言失败。
   */
  test('清理挂死时在 browserClose 上限处放弃等待，并照常清空句柄', async () => {
    jest.useFakeTimers();
    try {
      const mgr = new BrowserManager();
      withFakes(mgr, { browser: { close: () => new Promise(() => {}) } });

      let settled = false;
      void mgr.close().then(() => {
        settled = true;
      });

      // 上限之前不许提前放手——提前返回意味着还活着的 Chromium 被丢下不管
      jest.advanceTimersByTime(TIMEOUTS.browserClose - 1);
      await flushMicrotasks();
      expect(settled).toBe(false);

      jest.advanceTimersByTime(2);
      await flushMicrotasks();

      expect(settled).toBe(true);
      expect((mgr as unknown as { browser: unknown }).browser).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });
});

/** fake timers 下推进微任务队列：定时器已触发，但 promise 链还要几轮才落地 */
async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 8; i++) await Promise.resolve();
}
