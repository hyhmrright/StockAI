import type { AIProvider } from "../ai";
import { PROVIDER_PROFILES } from "../config";
import { logger } from "../utils";
import { OpenAIProvider } from "./openai";
import { OllamaProvider } from "./ollama";
import { AnthropicProvider } from "./anthropic";

interface ProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

type ProviderFactory = (config: ProviderConfig) => AIProvider;

/**
 * Provider 工厂映射表。新增 Provider 只需在此添加一行。
 */
const PROVIDER_FACTORIES: Record<string, ProviderFactory> = {
  ollama: (cfg) => new OllamaProvider(
    cfg.baseUrl ?? PROVIDER_PROFILES.ollama.baseUrl,
    cfg.model   ?? PROVIDER_PROFILES.ollama.model,
  ),
  anthropic: (cfg) => new AnthropicProvider(
    cfg.apiKey,
    cfg.model ?? PROVIDER_PROFILES.anthropic.model,
  ),
  deepseek: (cfg) => new OpenAIProvider(
    cfg.apiKey,
    cfg.baseUrl ?? PROVIDER_PROFILES.deepseek.baseUrl,
    cfg.model   ?? PROVIDER_PROFILES.deepseek.model,
  ),
  openai: (cfg) => new OpenAIProvider(
    cfg.apiKey || process.env.OPENAI_API_KEY || '',
    cfg.baseUrl ?? PROVIDER_PROFILES.openai.baseUrl,
    cfg.model   ?? PROVIDER_PROFILES.openai.model,
  ),
};

/**
 * 根据类型创建 AI Provider 实例
 */
export function createProvider(type: string, config: ProviderConfig): AIProvider {
  const factory = PROVIDER_FACTORIES[type];
  if (!factory) {
    logger.warn(`未知 Provider 类型 "${type}"，降级为 openai`);
  }
  return (factory ?? PROVIDER_FACTORIES.openai)(config);
}
