import { describe, expect, it } from 'bun:test';
import type { ReportChunk } from '../../shared/types';
import { searchIrmQa } from './irm';
import { fetchSseFeeds, resolveSseUid } from './sse';
import { warnUnverified } from '../smoke-helpers';
import { toErrorMessage } from '../utils';

/**
 * 财报 RAG 数据源（交易所投资者互动平台）的真网络冒烟——只跑 `bun run test:integration`。
 *
 * 两个源的可断言强度差别很大，不能一视同仁：
 *
 * - **深交所互动易（irm）**：全文检索、无时间窗、未观察到限流 → 硬断言「有结果」。
 * - **上证e互动（sse）**：两个已实测的平台特性让「非空」不可断言（详见 sse.ts 模块注释）——
 *   `type=11` 只暴露近 1 个月已回复问答，不活跃公司合法返回 `[]`；站点有**整站级**反爬，
 *   数分钟内数十次请求即触发 HTTP 403（本仓开发期实测被封数小时）。CI 出口 IP 与大量
 *   爬虫共用，长期在黑名单里的概率不低。
 *
 * 所以 sse 这条走「**限流 = 未验证，不是失败**」的口径：够不着源不代表解析契约破了，
 * 把它判红只会让这个每日任务天天红、进而被所有人忽略——那比没有监控更糟。
 * 代价是「端点被下线」这类真故障在 sse 这条上会被降级成一行 stderr 警告，
 * 需要人扫日志才能发现。这是明知的取舍，不是疏漏。
 */

const SSE_CODE = '600519'; // 贵州茅台——uid 519，本平台内的稳定事实
const SSE_UID = '519';
const IRM_CODE = '000001';
const IRM_NAME = '平安银行';

/** 问答 chunk 的形状契约：正文含问答两段 + 有位置标记 */
function expectQaContract(chunks: ReportChunk[]): void {
  for (const chunk of chunks) {
    expect(chunk.text).toContain('问：');
    expect(chunk.text).toContain('答：');
    expect(chunk.docTitle.length).toBeGreaterThan(0);
  }
}

describe('财报 RAG 数据源（真网络）', () => {
  it('深交所互动易：按公司简称全文检索仍返回问答', async () => {
    const chunks = await searchIrmQa(IRM_CODE, IRM_NAME, 10);
    expect(chunks.length).toBeGreaterThan(0);
    expectQaContract(chunks);
  });

  it('上证e互动：uid 解析与问答抓取的契约仍成立（限流则跳过断言）', async () => {
    // resolveSseUid 把 403 和「页面结构变了」一律吞成 null，两者无法区分，
    // 故 null 只能记为未验证。
    const uid = await resolveSseUid(SSE_CODE);
    if (uid === null) {
      warnUnverified('上证e互动 company.do', 'uid 解析返回 null（多半是整站 403 反爬）');
      return;
    }
    expect(uid).toBe(SSE_UID);

    let chunks: ReportChunk[];
    try {
      chunks = await fetchSseFeeds(SSE_CODE, uid, 10);
    } catch (err) {
      if (toErrorMessage(err).includes('HTTP 403')) {
        warnUnverified('上证e互动 userfeeds', '403（整站级反爬限流）');
        return;
      }
      throw err;
    }

    // 空数组是合法的（该公司近 1 个月无董秘回复），故只在有数据时校形状。
    // 打印条数让每日日志能看出趋势——长期恒 0 值得人工去看一眼。
    console.warn(`[冒烟] 上证e互动 ${SSE_CODE} 返回 ${chunks.length} 条问答`);
    expectQaContract(chunks);
  });
});
