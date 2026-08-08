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
const DATE = /<span>(\d{4}年\d{2}月\d{2}日\s*\d{2}:\d{2})<\/span>/g;

/** 去 HTML 标签残留 + 折叠多余空白 */
function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "2026年06月30日 13:50" → "2026-06-30" */
function fmtDate(s: string): string {
  const m = /(\d{4})年(\d{2})月(\d{2})日/.exec(s);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
}

/**
 * 纯解析：userfeeds.do 的 HTML 响应 → ReportChunk[]。
 * 只保留「提问 + 回答均存在」的完整问答对（未回复的悬空提问跳过，避免检索到空答案）。
 */
export function parseSseFeedHtml(html: string): ReportChunk[] {
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
        const docDate = fmtDate(dates[1] ?? dates[0] ?? '');
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
