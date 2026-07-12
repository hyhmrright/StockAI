import { logger, toErrorMessage } from '../utils';
import { RAG_UA, RAG_REQ_TIMEOUT } from './http-common';

/**
 * 巨潮 topSearch/query——沪深通用的股票代码→公司简称解析，免鉴权公开端点。
 * 深市走 irm.ts 全文检索时用简称作 `keyWord`；沪市不需要（sse.ts 直接用代码查 uid）。
 */

export interface CompanyNameDeps {
  fetchImpl?: typeof fetch;
}

/**
 * 代码 → 公司简称（如 "五粮液"）。解析失败/无匹配/网络异常 → null（上层据此优雅退化）。
 */
export async function resolveCompanyName(
  code: string,
  deps: CompanyNameDeps = {},
): Promise<string | null> {
  const _fetch = deps.fetchImpl ?? fetch;
  try {
    const resp = await _fetch('http://www.cninfo.com.cn/new/information/topSearch/query', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': RAG_UA,
      },
      body: new URLSearchParams({ keyWord: code, maxNum: '10' }).toString(),
      signal: AbortSignal.timeout(RAG_REQ_TIMEOUT),
    });
    if (!resp.ok) {
      logger.warn(`巨潮 topSearch HTTP ${resp.status} (${code})`);
      return null;
    }
    const list = (await resp.json()) as Array<{ code?: string; zwjc?: string }>;
    const hit = Array.isArray(list) ? list.find((x) => x?.code === code && x?.zwjc) : undefined;
    if (!hit?.zwjc) {
      logger.warn(`巨潮 topSearch 公司简称未命中 (${code})`);
      return null;
    }
    return hit.zwjc;
  } catch (err) {
    logger.warn(`巨潮 topSearch 解析失败 (${code}): ${toErrorMessage(err)}`);
    return null;
  }
}
