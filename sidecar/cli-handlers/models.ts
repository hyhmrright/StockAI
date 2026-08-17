import { withTimeout, toErrorMessage } from '../utils';
import { logger } from '../log';
import { successEnvelope, errorEnvelope } from '../protocol';
import { STATIC_MODELS, PROVIDER_CAPS, PROVIDER_PROFILES } from '../../shared/constants';
import type { ProviderType } from '../../shared/types';
import type { HandlerContext } from './context';

/**
 * 列模型错误码（与前端 ProviderForm 显示提示对齐）
 * - TIMEOUT：请求超时
 * - AUTH：401/403，鉴权失败
 * - NETWORK：连接拒绝/DNS/网络层异常
 * - SERVER：5xx，服务器内部错误
 * - BAD_REQUEST：4xx 非鉴权（多为配置错误）
 * - UNKNOWN：兜底
 */
export type ListModelsErrorCode =
  | 'ERR_LIST_MODELS_TIMEOUT'
  | 'ERR_LIST_MODELS_AUTH'
  | 'ERR_LIST_MODELS_NETWORK'
  | 'ERR_LIST_MODELS_SERVER'
  | 'ERR_LIST_MODELS_BAD_REQUEST'
  | 'ERR_LIST_MODELS';

/**
 * 把列模型链路抛出的各种错误（fetch / Ollama / OpenAI SDK）映射到稳定错误码。
 * 入参 unknown，永不抛出。
 *
 * 住在这里而不是 `utils.ts`：它只服务 `--list-models` 这一条链路，放进通用工具模块
 * 等于让另外 40 个 importer 也依赖某个 provider 的报错形状。
 */
export function classifyListModelsError(error: unknown): {
  code: ListModelsErrorCode;
  message: string;
} {
  const message = toErrorMessage(error);

  // 超时（withTimeout 抛出，name 已标记）
  if (error instanceof Error && error.name === 'TimeoutError') {
    return { code: 'ERR_LIST_MODELS_TIMEOUT', message };
  }

  // 优先匹配 HTTP 状态码（OpenAI SDK 错误带 status，fetch Response 也带）
  const status =
    typeof (error as { status?: unknown })?.status === 'number'
      ? (error as { status: number }).status
      : undefined;
  if (status !== undefined) {
    if (status === 401 || status === 403) {
      return { code: 'ERR_LIST_MODELS_AUTH', message };
    }
    if (status >= 500) {
      return { code: 'ERR_LIST_MODELS_SERVER', message };
    }
    if (status >= 400) {
      return { code: 'ERR_LIST_MODELS_BAD_REQUEST', message };
    }
  }

  // 网络层关键词：connection refused / ECONNREFUSED / fetch failed / ENOTFOUND
  const lowered = message.toLowerCase();
  if (
    lowered.includes('econnrefused') ||
    lowered.includes('connection refused') ||
    lowered.includes('fetch failed') ||
    lowered.includes('enotfound') ||
    lowered.includes('network') ||
    lowered.includes('getaddrinfo')
  ) {
    return { code: 'ERR_LIST_MODELS_NETWORK', message };
  }

  // 文本兜底：消息里含 unauthorized / invalid api key
  if (
    lowered.includes('unauthorized') ||
    lowered.includes('invalid api key') ||
    lowered.includes('invalid_api_key')
  ) {
    return { code: 'ERR_LIST_MODELS_AUTH', message };
  }

  return { code: 'ERR_LIST_MODELS', message };
}

/** Rust/前端传来的未经 resolveConfig 校验的裸配置（列模型走表单当前编辑值，可能尚未保存） */
export interface RawConfig {
  provider?: string;
  baseUrl?: string;
  base_url?: string;
  apiKey?: string;
  api_key?: string;
}

/** 某 provider 静态目录的模型 id 列表（动态拉取无端点或返回空时兜底） */
function staticModelValues(provider: ProviderType): string[] {
  return (STATIC_MODELS[provider] ?? []).map((m) => m.value);
}

/**
 * 向 OpenAI 兼容 / Anthropic 的列模型端点拉真实模型（10s 超时，鉴权头按 provider 区分）。
 * 返回项为各 provider /models 的原始 model id——不过滤 embedding/vision 等非对话模型，与其它 provider 一致。
 * 抛出的错误交由 classifyListModelsError 归类为稳定错误码。fetchImpl 供测试注入，默认全局 fetch。
 */
export async function fetchProviderModels(
  provider: ProviderType,
  baseUrl: string,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string[]> {
  const caps = PROVIDER_CAPS[provider];
  const url = `${baseUrl.replace(/\/$/, '')}${caps.modelsPath}`;
  const headers: Record<string, string> =
    caps.authStyle === 'anthropic'
      ? { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }
      : { Authorization: `Bearer ${apiKey}` };
  const resp = await withTimeout(fetchImpl(url, { headers }), 10_000, '获取模型列表超时');
  if (!resp.ok) {
    // 把 HTTP 状态挂到 error.status，供 classifyListModelsError 区分鉴权/服务器/请求错误。
    // 消息用语言中性英文：它会经 {message} 注入前端 i18n 模板，避免对 en/ja 用户夹带中文。
    const err = new Error(`list-models request failed (${resp.status})`) as Error & {
      status?: number;
    };
    err.status = resp.status;
    throw err;
  }
  const data = (await resp.json()) as { data?: Array<{ id?: string }> };
  return (data.data ?? []).map((m) => m.id).filter((id): id is string => !!id);
}

export function createModelHandlers({ out, deps }: HandlerContext) {
  const listModelsFetch = deps._listModelsFetch ?? fetchProviderModels;

  return {
    /**
     * 获取模型列表 - 不触发 playwright 加载
     * - ollama：走本地 SDK 真实拉取
     * - 有列模型端点的云端 provider（openai/anthropic/deepseek/glm）：真打 /models，空结果回退静态目录
     * - 无端点 provider：直接返回静态精选目录（防御兜底，当前所有云端 provider 均有端点）
     */
    async handleListModels(rawConfig: RawConfig) {
      try {
        const provider = (rawConfig.provider || 'ollama') as ProviderType;
        const baseUrl = rawConfig.baseUrl || rawConfig.base_url || undefined;
        const apiKey = rawConfig.apiKey || rawConfig.api_key || '';

        if (provider === 'ollama') {
          logger.info(`正在连接 Ollama 服务: ${baseUrl ?? 'default'}`);
          const { Ollama } = await import('ollama');
          const ollama = new Ollama({ host: baseUrl });

          const list = await withTimeout(
            ollama.list(),
            10_000,
            '获取 Ollama 模型列表超时，请检查服务是否响应',
          );

          out(successEnvelope({ models: list.models.map((m) => m.name) }));
          return;
        }

        const caps = PROVIDER_CAPS[provider];
        // 无公开列模型端点 → 返回静态精选目录（防御兜底，当前所有云端 provider 均有端点）
        if (!caps?.modelsPath) {
          out(successEnvelope({ models: staticModelValues(provider) }));
          return;
        }

        const effectiveBaseUrl = baseUrl || PROVIDER_PROFILES[provider].baseUrl;
        const models = await listModelsFetch(provider, effectiveBaseUrl, apiKey);
        // 真实列表为空时回退静态目录，避免下拉空白
        out(successEnvelope({ models: models.length ? models : staticModelValues(provider) }));
      } catch (error) {
        const { code, message } = classifyListModelsError(error);
        logger.error(`获取模型列表失败 [${code}]: ${message}`);
        out(errorEnvelope(code, message));
      }
    },
  };
}
