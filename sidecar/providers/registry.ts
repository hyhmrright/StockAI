import { AIProvider } from "../ai";
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
        config.baseUrl || 'http://localhost:11434',
        config.model || 'qwen3.5:27b'
      );
    case 'openai':
    default:
      return new OpenAIProvider(
        config.apiKey || process.env.OPENAI_API_KEY || '',
        config.baseUrl || 'https://api.openai.com/v1',
        config.model || 'gpt-4o'
      );
  }
}
