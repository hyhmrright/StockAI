/**
 * 跨模块共享的领域错误类型。
 *
 * **本模块必须保持零依赖（叶子）**。这里住的是「抛出方与分类方都要认识」的错误：
 * 抛在业务链路深处，认在 `cli-handlers` 的 catch 里映射成错误码。若把类定义留在抛出方
 * 的模块里，分类方就得为一个 6 行的类顶层 import 整条业务子图——`ScrapeEmptyError` 曾
 * 定义在 `analysis.ts`，`cli-handlers/analysis.ts` 为它拖进 scraper → 五个抓取策略 →
 * browser-manager 的整张图（实测 46ms，而其余四个 handler 合计仅 7.7ms），让 `--quote`
 * `--quotes` 这些根本不抓新闻的动作每次启动都白付这笔钱。
 */

/** 未抓到新闻时抛出，供 cli-handlers 识别并映射到 ERR_SCRAPE_EMPTY 错误码 */
export class ScrapeEmptyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScrapeEmptyError';
  }
}
