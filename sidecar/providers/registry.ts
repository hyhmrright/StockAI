import { AIProvider } from "../ai";
import { PROVIDER_DEFAULTS } from "../config";
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
 * Provider 工厂映射表
 * 新增 Provider 只需在此添加一行，analysis.ts 和其他调用方无需修改
 */
const PROVIDER_FACTORIES: Record<string, ProviderFactory> = {
  ollama: (cfg) => new OllamaProvider(
    cfg.baseUrl || PROVIDER_DEFAULTS.ollama.baseUrl,
    cfg.model   || PROVIDER_DEFAULTS.ollama.model
  ),
  anthropic: (cfg) => new AnthropicProvider(
    cfg.apiKey,
    cfg.model || PROVIDER_DEFAULTS.anthropic.model
  ),
  deepseek: (cfg) => new OpenAIProvider(
    cfg.apiKey,
    cfg.baseUrl || PROVIDER_DEFAULTS.deepseek.baseUrl,
    cfg.model   || PROVIDER_DEFAULTS.deepseek.model
  ),
  openai: (cfg) => new OpenAIProvider(
    cfg.apiKey || process.env.OPENAI_API_KEY || '',
    cfg.baseUrl || PROVIDER_DEFAULTS.openai.baseUrl,
    cfg.model   || PROVIDER_DEFAULTS.openai.model
  ),
};

/**
 * 根据类型创建 AI Provider 实例
 */
export function createProvider(type: string, config: ProviderConfig): AIProvider {
  const factory = PROVIDER_FACTORIES[type] ?? PROVIDER_FACTORIES.openai;
  return factory(config);
}
