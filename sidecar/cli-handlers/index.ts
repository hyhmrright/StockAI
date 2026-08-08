import { createContext, type HandlerDeps } from './context';
import { createModelHandlers } from './models';
import { createMarketDataHandlers } from './market-data';
import { createAnalysisHandlers } from './analysis';
import { createConversationHandlers } from './conversation';
import { createScreenerHandlers } from './screener';

export type { HandlerDeps } from './context';
export { fetchProviderModels, type RawConfig } from './models';

/**
 * 组装全部 CLI handler。按领域分文件（models / market-data / analysis / conversation /
 * screener），各组只吃一个共享的 HandlerContext（输出通道 + 测试注入点 + 通用守卫）。
 *
 * 新增能力：在对应领域文件加一个 handler 即可，本文件不动——除非要开一个新领域。
 * 三层布线仍以 shared/actions.ts 为准，由 shared/actions.test.ts 交叉校验。
 */
export function createHandlers(deps: HandlerDeps = {}) {
  const ctx = createContext(deps);
  return {
    ...createModelHandlers(ctx),
    ...createMarketDataHandlers(ctx),
    ...createAnalysisHandlers(ctx),
    ...createConversationHandlers(ctx),
    ...createScreenerHandlers(ctx),
  };
}

export const Handlers = createHandlers();
