import type { StockInfo } from '../shared/types';
import type { ParsedSymbol } from './parsers/exchange';

/**
 * 是否需要先查公司名才能拼出搜索关键词。
 *
 * 只有 A 股纯代码输入需要（"601012" 单独搜命中率低）。其余市场直接用原输入，
 * 调用方据此决定「等信息回来再抓新闻」还是「信息与新闻并发」——**这个判断必须留在
 * 调用方**，否则就回到了"为了拼关键词而自己再拉一次股票信息"的老路（见 enhanceSymbol）。
 */
export function needsNameLookup(parsed: ParsedSymbol): boolean {
  return !!parsed.chinaInfo && !parsed.displayName;
}

/**
 * 用已取到的股票信息拼出搜索关键词（"601012" -> "隆基绿能601012"）。
 *
 * 刻意做成纯函数、由调用方把 info 传进来：它此前自己调 fetchStockInfo，而调用方
 * 紧接着又调了一次同一接口——同一份数据串行请求两遍。实测 hq.sinajs.cn 抖动区间是
 * 0.26s–8.00s，那次多余的往返最坏就是白等 8 秒，且它串在整条链最前面，把新闻抓取一起顶后。
 *
 * 拿不到名字（信息源失败 / 无 name 字段）时回退原输入——这是搜索优化而非强依赖。
 */
export function enhanceSymbol(
  symbol: string,
  parsed: ParsedSymbol,
  info: StockInfo | null,
): string {
  return info?.name && parsed.chinaInfo ? `${info.name}${parsed.chinaInfo.code}` : symbol;
}
