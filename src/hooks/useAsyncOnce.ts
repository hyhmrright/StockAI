import { useEffect, useRef, useState } from 'react';

export interface AsyncOnceState<T> {
  data: T | null;
  error: unknown;
}

/**
 * 挂载时取一次数，之后不再刷新。
 *
 * 适用对象是「打开才拉、关掉就完」的一次性快照（板块榜、龙虎榜这类横截面），
 * 因此刻意**不**提供重取入口——需要按 key 重取的场景请用 `useSymbolFetch` /
 * `useSymbolScopedAsync`，别把这个 hook 撑成第三个状态机。
 *
 * `cancelled` 守卫是沿用本仓既有写法（`useStockSearch` 同形）的防御性代码，**不是**
 * 承重结构：React 18 起卸载后 setState 已是静默 no-op，去掉它当前也观察不到差异，
 * 因此没有为它写测试——写出来只会是一条永远绿的空断言。真正需要它的是日后加重取时。
 */
export function useAsyncOnce<T>(fetcher: () => Promise<T>): AsyncOnceState<T> {
  const [state, setState] = useState<AsyncOnceState<T>>({ data: null, error: null });
  // fetcher 多半是调用方内联的箭头函数，每次渲染都是新引用；进依赖数组会变成无限重取，
  // 故存 ref 只取挂载那一刻的版本——这也是「只取一次」语义的一部分。
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    let cancelled = false;
    fetcherRef
      .current()
      .then((data) => !cancelled && setState({ data, error: null }))
      .catch((error) => !cancelled && setState({ data: null, error }));
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
