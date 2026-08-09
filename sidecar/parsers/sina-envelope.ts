/**
 * 新浪各行情接口的响应都不是裸 JSON，外面裹着一层壳，且**每个接口的壳还不一样**：
 *
 * - 日 K：`/*<script>location.href='//sina.com';</script>*\/\nx([...]);`（防盗链注释 + JSONP）
 * - 板块榜：`var S_Finance_bankuai_sinaindustry = {...};`
 * - 报价：`var hq_str_sh600519="...";`（这个是逗号串，不走本模块）
 *
 * 与其在五个解析器里各写一遍「找第一个 `[` 到最后一个 `]`」，不如收在这里一次。
 * 各调用方对失败的处理并不相同（有的抛、有的返回 null、有的返回空表），
 * 所以本函数只负责取出并解析，失败一律返回 `null`，由调用方决定语义。
 */
export function extractSinaJson<T>(raw: string, open: '[' | '{'): T | null {
  const close = open === '[' ? ']' : '}';
  const start = raw.indexOf(open);
  const end = raw.lastIndexOf(close);
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}
