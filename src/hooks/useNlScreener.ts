import { useCallback, useRef, useState } from 'react';
import type { ScreenResponse } from '../../shared/types';
import type { TranslationKey } from '../i18n';
import { ServiceError, screenStocks } from '../lib/ipc';

/** 服务端错误码 → 前端 i18n 提示 key（见蓝图 §7）；未列出的 code 一律归通用错误 */
const ERROR_KEY_MAP: Record<string, TranslationKey> = {
  ERR_SCREEN_PARSE: 'screener_err_parse',
  ERR_SCREEN_NO_CONDITIONS: 'screener_err_no_conditions',
};

type Fetcher = (query: string) => Promise<ScreenResponse>;

export interface UseNlScreenerResult {
  response: ScreenResponse | null;
  loading: boolean;
  /** 出错时为 i18n key（组件用 t(errorKey) 渲染），无错时 null */
  errorKey: TranslationKey | null;
  run: (query: string) => void;
  clear: () => void;
}

/**
 * #14 自然语言选股 hook：把查询交给 sidecar 两阶段全市场筛选，管理 loading/结果/降级三态。
 * 进度局限（见蓝图 §5）：--screen 是单次 IPC，无法流式回报精拉进度，故仅暴露不确定态 loading。
 * fetcher 依赖注入便于离线单测。
 */
export function useNlScreener(fetcher: Fetcher = screenStocks): UseNlScreenerResult {
  const [response, setResponse] = useState<ScreenResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorKey, setErrorKey] = useState<TranslationKey | null>(null);
  // 请求序号：仅最新一次 run 的回调可写状态，避免旧请求/已 clear 的结果覆盖
  const reqIdRef = useRef(0);

  const run = useCallback(
    (query: string) => {
      const q = query.trim();
      if (!q) return; // 空串不发起（ERR_MISSING_PARAM 在此前拦掉）

      const myReqId = ++reqIdRef.current;
      setLoading(true);
      setErrorKey(null);
      setResponse(null);

      fetcher(q)
        .then((res) => {
          if (reqIdRef.current !== myReqId) return;
          setResponse(res);
        })
        .catch((e) => {
          if (reqIdRef.current !== myReqId) return;
          // ServiceError 带 code → 差异化降级文案；其它异常 → 通用错误，功能不崩
          const code = e instanceof ServiceError ? e.code : '';
          setErrorKey(ERROR_KEY_MAP[code] ?? 'screener_err_generic');
        })
        .finally(() => {
          if (reqIdRef.current === myReqId) setLoading(false);
        });
    },
    [fetcher],
  );

  const clear = useCallback(() => {
    reqIdRef.current++; // 作废进行中的请求
    setResponse(null);
    setErrorKey(null);
    setLoading(false);
  }, []);

  return { response, loading, errorKey, run, clear };
}
