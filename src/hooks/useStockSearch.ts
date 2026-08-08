import { useEffect, useState } from 'react';
import { searchStocks } from '../lib/ipc';
import type { StockSearchResult } from '../../shared/types';

const DEBOUNCE_MS = 300;
const MIN_KEYWORD_LEN = 2;

/**
 * 关键词搜索：防抖 + 竞态守卫。
 *
 * 不复用 useSymbolFetch / useSymbolScopedAsync：那两个按 symbol 分桶缓存，
 * 而这里的 key 是用户正在敲的关键词，每次击键都变，进桶只会把缓存撑爆。
 *
 * error 存原始异常而不是格式化好的字符串：文案要在渲染时用**当前**语言翻译，
 * 存成字符串会让切语言后错误行停在旧语言上。
 */
export function useStockSearch(keyword: string) {
  const [results, setResults] = useState<StockSearchResult[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    if (keyword.trim().length < MIN_KEYWORD_LEN) {
      setResults([]);
      setError(null);
      // 也要复位 isSearching：上一次请求可能还在途，而它的 finally 认得 cancelled，
      // 不会替这次复位——漏了这行，删字删到 2 字以下就会把 spinner 永远留在转。
      setIsSearching(false);
      return;
    }

    // 竞态守卫：防抖只挡得住「还没发出的」请求，已在途的不会被取消。
    // 慢的旧请求可能后于新请求返回，把上一个关键词的结果盖在新结果上。
    let cancelled = false;

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const data = await searchStocks(keyword);
        if (cancelled) return;
        setResults(data);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        // 失败必须清空旧结果：留着的话下拉里挂的是上一个关键词的命中，看起来像「搜到了」
        setResults([]);
        setError(err);
      } finally {
        if (!cancelled) setIsSearching(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [keyword]);

  return { results, error, isSearching };
}
