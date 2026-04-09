import { AIProvider } from "../ai";
import { PROVIDER_DEFAULTS } from "../config";
import { OpenAIProvider } from "./openai";
import { OllamaProvider } from "./ollama";

/**
 * Provider 配置
 */
interface ProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

/**
 * 根据类型创建 AI Provider 实例
 * 新增 Provider 只需在此注册，analysis.ts 无需修改
 */
export function createProvider(
  type: string,
  config: ProviderConfig
): AIProvider {
  switch (type) {
    case 'ollama':
      return new OllamaProvider(
        config.baseUrl || PROVIDER_DEFAULTS.ollama.baseUrl,
        config.model || PROVIDER_DEFAULTS.ollama.model
      );
    case 'openai':
    default:
      return new OpenAIProvider(
        config.apiKey || process.env.OPENAI_API_KEY || '',
        config.baseUrl || PROVIDER_DEFAULTS.openai.baseUrl,
        config.model || PROVIDER_DEFAULTS.openai.model
      );
  }
}
