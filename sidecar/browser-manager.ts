import { chromium, Browser, Page } from 'playwright-core';
import { BROWSER_CONTEXT_DEFAULTS, BROWSER_LAUNCH_ARGS } from './config';
import { logger } from './utils';

/**
 * 浏览器生命周期管理器
 * 封装 Chromium 的启动、上下文创建和销毁逻辑
 */
export class BrowserManager {
  private browser: Browser | null = null;
  private pagePromise: Promise<Page> | null = null;

  /**
   * 获取或创建一个新的页面
   * 采用懒加载模式，仅在需要时启动浏览器
   */
  async getPage(): Promise<Page> {
    if (this.pagePromise) return this.pagePromise;

    this.pagePromise = (async () => {
      logger.info("首次需要浏览器，启动 Chromium...");
      this.browser = await chromium.launch({ headless: true, args: BROWSER_LAUNCH_ARGS });
      const context = await this.browser.newContext(BROWSER_CONTEXT_DEFAULTS);
      return context.newPage();
    })().catch(err => {
      // 启动失败时清空缓存，允许下次调用重试而非永远返回已拒绝的 Promise
      this.pagePromise = null;
      throw err;
    });

    return this.pagePromise;
  }

  /**
   * 关闭浏览器并清理资源
   */
  async close(): Promise<void> {
    // 等待正在进行的启动完成，防止 browser 赋值前 close() 返回导致进程泄漏
    if (this.pagePromise) {
      try { await this.pagePromise; } catch { /* 启动失败则无需关闭 */ }
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.pagePromise = null;
    }
  }
}
