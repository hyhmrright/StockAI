import { describe, test, expect } from 'bun:test';
import { EastmoneyNewsStrategy } from './eastmoney-news';

/** 东财资讯搜索的 JSONP 响应样例（字段裁剪自真实返回） */
function jsonpBody(articles: unknown[]): string {
  return `cb(${JSON.stringify({ code: 0, msg: 'OK', result: { cmsArticleWebOld: articles } })});`;
}

// 正文含代码，与真实返回一致——实测 600519 / 300866 / AAPL 各 8 条结果
// 全部在标题或正文里带上了代码，相关性过滤（见 relevanceTokens）因此不会误杀。
const ARTICLE = {
  date: '2026-08-08 15:53:07',
  title: '茅台又涨价了！飞天茅台涨至1753元/瓶',
  content: '据了解，7月17日，贵州茅台（600519.SH）曾发布公告称……',
  mediaName: '红星资本局',
  url: 'http://finance.eastmoney.com/a/202608083835835634.html',
};

function makeFetch(body: string, ok = true) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const impl = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return { ok, status: ok ? 200 : 502, text: async () => body } as Response;
  }) as unknown as typeof fetch;
  return { impl, calls };
}

describe('EastmoneyNewsStrategy', () => {
  test('解析 JSONP 响应为 StockNews', async () => {
    const { impl } = makeFetch(jsonpBody([ARTICLE]));
    const results = await new EastmoneyNewsStrategy(impl).scrape('贵州茅台600519', {} as never);

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      title: '茅台又涨价了！飞天茅台涨至1753元/瓶',
      source: '红星资本局',
      date: '2026-08-08',
      content: '据了解，7月17日，贵州茅台（600519.SH）曾发布公告称……',
      url: 'http://finance.eastmoney.com/a/202608083835835634.html',
    });
  });

  test('剥离高亮标签，避免 <em> 混进标题喂给 LLM', async () => {
    const { impl } = makeFetch(
      jsonpBody([{ ...ARTICLE, title: '贵州茅台（<em>600519</em>）涨停' }]),
    );
    const results = await new EastmoneyNewsStrategy(impl).scrape('600519', {} as never);

    expect(results[0].title).toBe('贵州茅台（600519）涨停');
  });

  test('不依赖 Google/Yahoo 域名——这正是它存在的理由', async () => {
    const { impl, calls } = makeFetch(jsonpBody([ARTICLE]));
    await new EastmoneyNewsStrategy(impl).scrape('600519', {} as never);

    expect(calls[0].url).toContain('eastmoney.com');
    expect(calls[0].url).not.toContain('google');
    expect(calls[0].url).not.toContain('yahoo');
  });

  test('走 fetchWithPolicy：请求必须带中止信号，网络不可达时不会无限期挂起', async () => {
    const { impl, calls } = makeFetch(jsonpBody([ARTICLE]));
    await new EastmoneyNewsStrategy(impl).scrape('600519', {} as never);

    expect(calls[0].init?.signal).toBeInstanceOf(AbortSignal);
  });

  test('缺 title 或 url 的条目被丢弃', async () => {
    const { impl } = makeFetch(
      jsonpBody([ARTICLE, { ...ARTICLE, title: '' }, { ...ARTICLE, url: '' }]),
    );
    const results = await new EastmoneyNewsStrategy(impl).scrape('600519', {} as never);

    expect(results).toHaveLength(1);
  });

  test('丢弃与标的无关的全文命中', async () => {
    // 东财搜索是全文子串匹配：'NON_EXISTENT_99999' 实测命中 2 条仅因正文里出现 "99999"
    // 的无关新闻（一条讲炒鞋、一条讲温州经济）。放行它们就毁掉了"查无此股 → 0 条"的
    // 不变量——而 fetchMarketBundle 正是靠它提示用户"请确认代码是否正确"。
    const { impl } = makeFetch(
      jsonpBody([
        { ...ARTICLE, title: '炒鞋往事', content: '二手平台被挂出 39999 元' },
        { ...ARTICLE, title: '贵州茅台涨价', content: '公司公告' },
      ]),
    );
    const results = await new EastmoneyNewsStrategy(impl).scrape('贵州茅台600519', {} as never);

    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('贵州茅台涨价');
  });

  test('美股按代码匹配且忽略大小写', async () => {
    const { impl } = makeFetch(
      jsonpBody([
        { ...ARTICLE, title: '美股科技股分化', content: 'Meta 涨超 6%，微软涨近 5%' },
        { ...ARTICLE, title: '三星门店之困', content: '华为、苹果（aapl.O）、OPPO 合计占据' },
      ]),
    );
    const results = await new EastmoneyNewsStrategy(impl).scrape('AAPL', {} as never);

    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('三星门店之困');
  });

  test('HTTP 失败时返回空列表，交由 scraper 回退到下一策略', async () => {
    const { impl } = makeFetch('', false);
    const results = await new EastmoneyNewsStrategy(impl).scrape('600519', {} as never);

    expect(results).toEqual([]);
  });

  test('响应不是合法 JSONP 时返回空列表而非抛出', async () => {
    const { impl } = makeFetch('<html>502 Bad Gateway</html>');
    const results = await new EastmoneyNewsStrategy(impl).scrape('600519', {} as never);

    expect(results).toEqual([]);
  });

  test('不调用 ctx.getPage——纯 fetch 策略绝不启动 Chromium', async () => {
    const { impl } = makeFetch(jsonpBody([ARTICLE]));
    const ctx = {
      getPage: () => {
        throw new Error('不应启动浏览器');
      },
    };

    await expect(
      new EastmoneyNewsStrategy(impl).scrape('600519', ctx as never),
    ).resolves.toHaveLength(1);
  });
});
