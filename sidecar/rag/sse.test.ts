import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseSseFeedHtml, resolveSseUid, fetchSseFeeds } from './sse';

const FEED_HTML = readFileSync(
  join(import.meta.dir, '__fixtures__', 'sse-userfeeds-600519.html'),
  'utf8',
);
const COMPANY_HTML = readFileSync(
  join(import.meta.dir, '__fixtures__', 'sse-company-600519.html'),
  'utf8',
);

describe('parseSseFeedHtml', () => {
  test('真实 fixture：解析出 3 条完整问答，去除 HTML 标签，日期取回答时间', () => {
    const chunks = parseSseFeedHtml(FEED_HTML);
    expect(chunks).toHaveLength(3);
    expect(chunks[0].text).toBe(
      '问：董秘你好，请问什么时候披露中报？\n答：尊敬的投资者，您好！公司2026年半年度报告的预约披露时间是2026年8月15日，敬请您关注。谢谢您！',
    );
    expect(chunks[0].docTitle).toBe('投资者互动问答');
    expect(chunks[0].docDate).toBe('2026-06-30'); // 回答时间（第二个时间戳），非提问时间
    expect(chunks[0].position).toBe('问答 #1');
    expect(chunks[1].docDate).toBe('2026-06-30');
    expect(chunks[2].docDate).toBe('2026-06-22');
    // 提问原文里的 <a href='user.do?uid=519'>:贵州茅台(600519)</a> 前缀应被剥离
    expect(chunks[0].text).not.toContain('<a');
    expect(chunks[0].text).not.toContain('贵州茅台(600519)');
  });

  test('只有提问无回答（悬空提问）→ 跳过', () => {
    const html = `
      <div class="m_feed_item" id="item-1">
        <div class="m_feed_detail">
          <div class="m_feed_cnt">
            <div class="m_feed_txt">董秘你好，还没人回复我</div>
          </div>
        </div>
      </div>
    `;
    expect(parseSseFeedHtml(html)).toEqual([]);
  });

  test('空 HTML → []', () => {
    expect(parseSseFeedHtml('')).toEqual([]);
  });

  describe('相对时间戳（站点对近 24h 的条目渲染"昨天 HH:MM"而非绝对日期）', () => {
    /** 一条完整问答，两个时间戳依次为提问时间、回答时间 */
    const qaWith = (askTs: string, answerTs: string) => `
      <div class="m_feed_item" id="item-1">
        <div class="m_feed_detail">
          <div class="m_feed_cnt">
            <div class="m_feed_txt">请问中报何时披露？</div>
            <div class="m_feed_from"><span>${askTs}</span></div>
          </div>
        </div>
        <div class="m_feed_detail m_qa">
          <div class="m_feed_cnt">
            <div class="m_feed_txt" id="m_feed_txt-1">预约披露时间是 8 月 15 日。</div>
            <div class="m_feed_from"><span>${answerTs}</span></div>
          </div>
        </div>
      </div>
    `;
    // UTC 12:00 = 北京 20:00，落在同一北京日内，不跨日
    const now = new Date('2026-08-08T12:00:00Z');

    test('回答为"昨天"、提问为绝对日期 → docDate 取回答日期，不再退化成提问日期', () => {
      const chunks = parseSseFeedHtml(qaWith('2026年08月05日 09:27', '昨天 17:17'), now);
      expect(chunks[0].docDate).toBe('2026-08-07');
    });

    test('提问与回答同为"昨天" → 折算出日期，不再是空串', () => {
      const chunks = parseSseFeedHtml(qaWith('昨天 09:27', '昨天 17:17'), now);
      expect(chunks[0].docDate).toBe('2026-08-07');
    });

    test('"今天" → 折算为当日', () => {
      const chunks = parseSseFeedHtml(qaWith('今天 09:27', '今天 17:17'), now);
      expect(chunks[0].docDate).toBe('2026-08-08');
    });

    test('北京时间凌晨（UTC 前一日）折算仍按北京日历，不早算一天', () => {
      const beijingEarlyMorning = new Date('2026-08-08T17:00:00Z'); // 北京 08-09 01:00
      const chunks = parseSseFeedHtml(qaWith('今天 00:10', '今天 01:00'), beijingEarlyMorning);
      expect(chunks[0].docDate).toBe('2026-08-09');
    });

    test('绝对日期不受 now 影响（原行为保持）', () => {
      const chunks = parseSseFeedHtml(qaWith('2026年06月30日 09:27', '2026年06月30日 13:50'), now);
      expect(chunks[0].docDate).toBe('2026-06-30');
    });
  });

  test('超长回答按 600 字符截断', () => {
    const longAnswer = 'A'.repeat(1000);
    const html = `
      <div class="m_feed_item" id="item-1">
        <div class="m_feed_detail">
          <div class="m_feed_cnt">
            <div class="m_feed_txt">提问</div>
          </div>
        </div>
        <div class="m_feed_detail m_qa">
          <div class="m_feed_cnt">
            <div class="m_feed_txt" id="m_feed_txt-1">${longAnswer}</div>
          </div>
        </div>
      </div>
    `;
    const chunks = parseSseFeedHtml(html);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text.length).toBe(600);
  });
});

describe('resolveSseUid', () => {
  test('真实 company.do fixture：页面仅含公司自身 uid=519（无其他 uid 混入）', async () => {
    const uid = await resolveSseUid('600519', {
      fetchImpl: (async () =>
        new Response(COMPANY_HTML, { status: 200 })) as unknown as typeof fetch,
    });
    expect(uid).toBe('519');
  });

  test('合成串：company.do 页面含 uid=数字 → 提取成功', async () => {
    const uid = await resolveSseUid('600519', {
      fetchImpl: (async () =>
        new Response('<html>...uid=519...</html>', { status: 200 })) as unknown as typeof fetch,
    });
    expect(uid).toBe('519');
  });

  test('深市代码 303 重定向 / 空响应 → null（该平台无此公司）', async () => {
    const uid = await resolveSseUid('000858', {
      fetchImpl: (async () => new Response('', { status: 200 })) as unknown as typeof fetch,
    });
    expect(uid).toBeNull();
  });

  test('HTTP 非 2xx → null', async () => {
    const uid = await resolveSseUid('600519', {
      fetchImpl: (async () => new Response('', { status: 500 })) as unknown as typeof fetch,
    });
    expect(uid).toBeNull();
  });

  test('网络异常 → null（不抛）', async () => {
    const uid = await resolveSseUid('600519', {
      fetchImpl: (async () => {
        throw new Error('network down');
      }) as unknown as typeof fetch,
    });
    expect(uid).toBeNull();
  });
});

describe('fetchSseFeeds', () => {
  test('真实 fixture 响应 → ReportChunk[]，附带 company.do 来源链接', async () => {
    const chunks = await fetchSseFeeds('600519', '519', 10, {
      fetchImpl: (async () => new Response(FEED_HTML, { status: 200 })) as unknown as typeof fetch,
    });
    expect(chunks).toHaveLength(3);
    expect(chunks[0].url).toBe('https://sns.sseinfo.com/company.do?stockcode=600519');
  });

  test('HTTP 非 2xx → 抛出（编排层 best-effort 捕获）', async () => {
    await expect(
      fetchSseFeeds('600519', '519', 10, {
        fetchImpl: (async () => new Response('', { status: 500 })) as unknown as typeof fetch,
      }),
    ).rejects.toThrow('500');
  });
});
