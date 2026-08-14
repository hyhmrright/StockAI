/**
 * 每日数据源冒烟监控的共用判据：**够不着源 ≠ 解析契约破了**。
 *
 * 背景：CI 出口 IP（Azure）与大量爬虫共用，东财 `push2*` 家族对它限流已成常态。
 * 2026-08-14 那次跑里同一 host 上三条链路随机 ECONNRESET / 502，而同一时刻从国内 IP
 * 打同样三个端点全部 200、亚秒返回。workflow 里那层「失败重跑一次」救不了它：重跑还是
 * 同一个出口 IP，实测第二次反而挂得更多（1 fail → 3 fail），像是限流在累积。
 *
 * 取舍与 `rag.integration.ts` 的上证e互动同款：**限流 = 未验证，不是失败**。够不着源
 * 证明不了解析假设有没有变，把它判红只会让这个每日任务天天红、进而被所有人忽略——
 * 那比没有监控更糟。
 *
 * **代价必须说明白**：ECONNRESET / 502 既可能是限流、也可能是上游真挂——2026-08-09 东财
 * push2 整体故障就是一模一样的症状，两者在错误里无法区分。所以**只有备源仍被硬断言覆盖
 * 的链路才准用本模块降级**：东财 K 线 / 资金流 / 板块榜都有新浪兜底，那三条备源测试塌了
 * 照样红，整块空白不会无声无息。给独家源（龙虎榜 / 公司 F10 / 财报历史 / A 股基本面）用
 * 就等于把它们的监控直接关掉——那些链路一挂就是整块空白，必须留硬断言。
 */

import { toErrorMessage } from './utils';

/** 扫日志时能一眼捞出来的标记 */
export function warnUnverified(source: string, reason: string): void {
  console.warn(`[冒烟未验证] ${source}：${reason}`);
}

/**
 * 「够不着源」的错误特征：连接被重置/拒绝、超时、网关级错误。
 *
 * `TimeoutError` 是 `fetchWithPolicy` 里 `AbortSignal.timeout` 触发的 DOMException 的 name——
 * **限流最常见的样子恰恰是挂起而非报错**（本机实测两次东财/新浪失败都卡满 8 秒超时才抛），
 * 漏了它等于只挡住了一半。
 */
const UNREACHABLE =
  /ECONNRESET|ETIMEDOUT|ECONNREFUSED|TimeoutError|socket connection was closed|HTTP (?:429|50[234])/i;

/**
 * 取数：够不着源时记一行未验证并返回 undefined，其余错误照常抛。
 *
 * 断言必须留在调用侧对返回值判空之后——本函数刻意**只**包住取数，这样「断言失败」在结构上
 * 就不可能被误判成限流（Bun 的 expect 失败只是普通 Error，靠错误类型区分并不可靠）。
 */
export async function fetchOrSkip<T>(
  source: string,
  fetch: () => Promise<T>,
): Promise<T | undefined> {
  try {
    return await fetch();
  } catch (err) {
    // ECONNRESET 只挂在 code 上、超时只挂在 name 上，两者都不出现在 message 里——三处都要看
    const { name = '', code = '' } = (typeof err === 'object' && err !== null ? err : {}) as {
      name?: string;
      code?: string | number;
    };
    const message = toErrorMessage(err);
    if (!UNREACHABLE.test(`${name} ${code} ${message}`)) throw err;
    warnUnverified(source, message.split('\n')[0]); // 抓取错误常带多行上下文，日志只留首行
    return undefined;
  }
}
