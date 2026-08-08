import type { ReportChunk } from '../../shared/types';
import { HTTP_DEFAULTS } from '../config';
import { fetchWithPolicy } from '../http';
import { logger, toErrorMessage } from '../utils';
import { truncateChunkText } from './http-common';

/**
 * 上证e互动（sns.sseinfo.com）——沪市专属投资者互动问答，官方免鉴权公开端点。
 *
 * 开放项探测结论（2026-07 亲测）：
 * - 巨潮「投资者关系活动记录表」对沪市公司（如 600519）几乎 0 命中，fallback「业绩说明会」
 *   拿到的也只是空洞的会前通知，无实质问答——故弃用巨潮 PDF 方案，改走交易所官方互动平台。
 * - `company.do?stockcode=X` 页面本身（HTML）内嵌该公司在本平台的 uid（如 600519→519），
 *   深市代码在此平台返回 303/空内容——印证该平台系上交所专属，深市走 irm.ts。
 * - `ajax/userfeeds.do?typeCode=company&type=11&pageSize=N&uid=X&page=1` 返回服务端渲染的
 *   HTML 问答列表（非 JSON），每条含提问原文 + 董秘回答原文 + 各自时间戳，内容真实（非通知）。
 *
 * 覆盖率天花板（2026-08 实测 15 家沪市公司，务必知悉——空结果多数不是故障）：
 * - `type=11`（已回复）只暴露**近 1 个月**的问答，且 `page=2` 起恒空：翻页拿不到更早历史。
 *   互动不活跃的公司（实测茅台/工行/招行/中信证券）近 1 个月零回复 → 本模块合法返回 []。
 *   这是平台限制，不是 bug，改代码绕不过去。
 * - `type=10` 是「提问」列表（含未获回复的），实测整页均无回答块，对 RAG 无价值，勿误用。
 * - 站点有反爬限流：数分钟内数十次请求即触发 **HTTP 403**（整站级，非按 uid）。正常用法
 *   （一次分析一只股）碰不到，但批量探测/监控须限速，否则测到的"空"其实是被封。
 */

export interface SseDeps {
  fetchImpl?: typeof fetch;
}

/**
 * 由沪市代码解析该公司在上证e互动的 uid。company.do 页面 HTML 内嵌 `uid=数字`（多处一致，
 * 取第一个即可）。非沪市 / 该平台无此公司（303/空响应）/ 网络异常 → 返回 null（上层优雅退化）。
 */
export async function resolveSseUid(code: string, deps: SseDeps = {}): Promise<string | null> {
  try {
    const resp = await fetchWithPolicy(`https://sns.sseinfo.com/company.do?stockcode=${code}`, {
      timeoutMs: HTTP_DEFAULTS.slowTimeoutMs,
      fetchImpl: deps.fetchImpl,
    });
    if (!resp.ok) {
      logger.warn(`上证e互动 company.do HTTP ${resp.status} (${code})`);
      return null;
    }
    const html = await resp.text();
    const m = /uid=(\d+)/.exec(html);
    if (!m) {
      logger.warn(`上证e互动 uid 未命中 (${code})`);
      return null;
    }
    return m[1];
  } catch (err) {
    logger.warn(`上证e互动 uid 解析失败 (${code}): ${toErrorMessage(err)}`);
    return null;
  }
}

/** 单条 m_feed_item 块：提问 <div class="m_feed_txt"> + 回答 <div class="m_feed_txt" id="m_feed_txt-N"> */
const ITEM_BLOCK =
  /<div class="m_feed_item" id="item-(\d+)">([\s\S]*?)<\/div>\s*<\/div>\s*(?=<div class="m_feed_item"|$)/g;
const QUESTION_TXT = /<div class="m_feed_txt">\s*(?:<a[^>]*>[^<]*<\/a>)?([\s\S]*?)<\/div>/;
const ANSWER_TXT = /<div class="m_feed_txt" id="m_feed_txt-\d+">([\s\S]*?)<\/div>/;
// 站点时间戳两种形态（2026-08 实测 82 个样本，仅此两种）：绝对 "2026年08月06日 10:40"、
// 相对 "昨天 14:29"。漏掉相对形态会让「回答时间」捕获不到，docDate 静默退化成提问时间甚至空串。
// "今天" 一并支持：与 "昨天" 同源同格式，成本相同，漏掉则同样静默失真。
const DATE = /<span>((?:\d{4}年\d{2}月\d{2}日|今天|昨天)\s*\d{2}:\d{2})<\/span>/g;

/** 去 HTML 标签残留 + 折叠多余空白 */
function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 北京时区的 YYYY-MM-DD（与 irm.ts 的 +8h 口径对齐）；offsetDays 用于回退到"昨天" */
function beijingDate(now: Date, offsetDays: number): string {
  return new Date(now.getTime() + 8 * 3600_000 + offsetDays * 86400_000).toISOString().slice(0, 10);
}

/** "2026年06月30日 13:50" → "2026-06-30"；"昨天 14:29" → 相对 now 折算的北京日期 */
function fmtDate(s: string, now: Date): string {
  const m = /(\d{4})年(\d{2})月(\d{2})日/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  if (s.startsWith('今天')) return beijingDate(now, 0);
  if (s.startsWith('昨天')) return beijingDate(now, -1);
  return '';
}

/**
 * 纯解析：userfeeds.do 的 HTML 响应 → ReportChunk[]。
 * 只保留「提问 + 回答均存在」的完整问答对（未回复的悬空提问跳过，避免检索到空答案）。
 * `now` 是相对时间戳（"昨天 HH:MM"）的折算基准，注入以保证解析可确定性测试。
 */
export function parseSseFeedHtml(html: string, now: Date = new Date()): ReportChunk[] {
  const chunks: ReportChunk[] = [];
  ITEM_BLOCK.lastIndex = 0;
  let m: RegExpExecArray | null = ITEM_BLOCK.exec(html);
  let n = 0;
  while (m !== null) {
    const block = m[2];
    const qMatch = QUESTION_TXT.exec(block);
    const aMatch = ANSWER_TXT.exec(block);
    if (qMatch && aMatch) {
      const question = stripHtml(qMatch[1]);
      const answer = stripHtml(aMatch[1]);
      if (question && answer) {
        n++;
        const dates: string[] = [];
        DATE.lastIndex = 0;
        let d: RegExpExecArray | null = DATE.exec(block);
        while (d !== null) {
          dates.push(d[1]);
          d = DATE.exec(block);
        }
        // 第二个时间戳为回答发布时间；缺失则退回第一个（提问时间）
        const docDate = fmtDate(dates[1] ?? dates[0] ?? '', now);
        const text = `问：${question}\n答：${answer}`;
        chunks.push({
          text: truncateChunkText(text),
          docTitle: '投资者互动问答',
          docDate,
          position: `问答 #${n}`,
        });
      }
    }
    m = ITEM_BLOCK.exec(html);
  }
  return chunks;
}

/**
 * 拉取某公司在上证e互动的最新问答（单页，pageSize 条）→ ReportChunk[]。
 * 网络异常 → 抛出（由编排层 best-effort 捕获）。
 */
export async function fetchSseFeeds(
  code: string,
  uid: string,
  pageSize = 10,
  deps: SseDeps = {},
): Promise<ReportChunk[]> {
  const url = `https://sns.sseinfo.com/ajax/userfeeds.do?typeCode=company&type=11&pageSize=${pageSize}&uid=${uid}&page=1`;
  const resp = await fetchWithPolicy(url, {
    timeoutMs: HTTP_DEFAULTS.slowTimeoutMs,
    fetchImpl: deps.fetchImpl,
  });
  if (!resp.ok) throw new Error(`上证e互动 userfeeds HTTP ${resp.status}: ${code}`);
  const html = await resp.text();
  const chunks = parseSseFeedHtml(html);
  const sourceUrl = `https://sns.sseinfo.com/company.do?stockcode=${code}`;
  return chunks.map((c) => ({ ...c, url: sourceUrl }));
}
