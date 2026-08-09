import type { StockNews } from '../../shared/types';
import { todayISO, toErrorMessage, logger } from '../utils';
import { fetchWithPolicy } from '../http';
import { parseSymbol } from '../parsers/exchange';
import type { ScrapeContext, ScrapeStrategy } from './base';

/** 单次取回的最大条数，与 Google News RSS 对齐 */
const PAGE_SIZE = 8;

/**
 * 东方财富资讯搜索策略。
 *
 * 存在的理由是**可达性**：其余四个策略全部指向 google.com / news.google.com /
 * finance.yahoo.com，在这三个域名都不可达的地区（正是本项目 A 股用户的所在地）
 * 新闻抓取整条链 100% 失败，且被 `fetchMarketBundle` 报成"没有找到这只股票的相关新闻，
 * 请确认代码是否正确"——把网络不可达伪装成用户输错了代码。
 *
 * 与 RSS 同为纯 fetch 实现，不调用 ctx.getPage()，故不触发 Chromium。
 * 挂在 search-api-web 主机上，与 2026-08-09 故障的 push2* 家族是两套服务。
 */
export class EastmoneyNewsStrategy implements ScrapeStrategy {
  readonly name = '东方财富资讯';

  constructor(private readonly fetchImpl?: typeof fetch) {}

  async scrape(symbol: string, _ctx: ScrapeContext): Promise<StockNews[]> {
    // 关键词直接用上游 getEnhancedSymbol 增强过的输入（如"贵州茅台600519"）——
    // 实测公司名 + 代码的召回与相关性都优于单独任一形式。
    const param = {
      uid: '',
      keyword: symbol,
      type: ['cmsArticleWebOld'],
      client: 'web',
      clientType: 'web',
      clientVersion: 'curr',
      param: {
        cmsArticleWebOld: {
          searchScope: 'default',
          // 按相关性而非时间排序：时间序会把"每日早报"这类仅提及代码的通稿顶到前面
          sort: 'default',
          pageIndex: 1,
          pageSize: PAGE_SIZE,
          preTag: '',
          postTag: '',
        },
      },
    };
    const url = `https://search-api-web.eastmoney.com/search/jsonp?cb=cb&param=${encodeURIComponent(
      JSON.stringify(param),
    )}`;

    try {
      const resp = await fetchWithPolicy(url, { fetchImpl: this.fetchImpl });
      if (!resp.ok) {
        throw new Error(`HTTP 错误! 状态码: ${resp.status}`);
      }
      return this.parse(await resp.text(), symbol);
    } catch (err) {
      logger.warn(`[${this.name}] 资讯抓取失败 (${symbol}): ${toErrorMessage(err)}`);
      return [];
    }
  }

  /** 解析 JSONP 响应；非法响应交由调用方的 catch 兜底为空列表 */
  private parse(jsonp: string, symbol: string): StockNews[] {
    const payload = jsonp.match(/^[^(]*\(([\s\S]*)\)[;\s]*$/)?.[1];
    if (!payload) throw new Error('响应不是合法的 JSONP');

    const articles = JSON.parse(payload)?.result?.cmsArticleWebOld;
    if (!Array.isArray(articles)) throw new Error('响应缺少 result.cmsArticleWebOld 数组');

    const tokens = relevanceTokens(symbol);

    return articles
      .slice(0, PAGE_SIZE)
      .map((a) => ({
        title: stripTags(a?.title),
        url: typeof a?.url === 'string' ? a.url : '',
        source: stripTags(a?.mediaName),
        // 形如 "2026-08-08 15:53:07"，取日期部分即可
        date: /^\d{4}-\d{2}-\d{2}/.test(a?.date ?? '') ? a.date.slice(0, 10) : todayISO(),
        // 摘要先落进 content：深度模式只为前 3 条抓全文，其余条目有摘要远好过空字符串
        content: stripTags(a?.content),
      }))
      .filter((n) => n.title && n.url && isRelevant(n, tokens));
  }
}

/**
 * 标的的识别性词元——文章命中其一才算与本标的有关。
 *
 * 东财搜索是**全文子串匹配**，什么都能命中：实测 'NON_EXISTENT_99999' 靠正文里的
 * "39999"、"99999" 匹配到炒鞋和温州经济两条新闻。放行这类命中会毁掉
 * `fetchMarketBundle` 依赖的"查无此股 → 0 条"不变量，让用户拿到一份基于无关新闻的分析，
 * 而不是"请确认代码是否正确"的提示。
 */
function relevanceTokens(symbol: string): string[] {
  const parsed = parseSymbol(symbol);
  const tokens = [parsed.displayName, parsed.chinaInfo?.code].filter((t): t is string => !!t);
  // 解析不出结构（美股 / 港股 / 无效输入）时退回原始输入整体匹配
  return (tokens.length > 0 ? tokens : [symbol]).map((t) => t.toLowerCase());
}

function isRelevant(news: StockNews, tokens: string[]): boolean {
  const haystack = `${news.title}${news.content}`.toLowerCase();
  return tokens.some((t) => haystack.includes(t));
}

/** 去掉搜索接口回传的高亮标签，避免 `<em>` 混进标题与摘要后被喂给 LLM */
function stripTags(value: unknown): string {
  return typeof value === 'string' ? value.replace(/<\/?em>/g, '').trim() : '';
}
