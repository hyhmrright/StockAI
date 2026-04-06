import { scrapeStockNews } from './scraper';
import { OpenAIProvider } from './providers/openai';
import { OllamaProvider } from './providers/ollama';
import { AIProvider, AIAnalysisResult } from './ai';

/**
 * 执行完整的股票分析流程
 * @param symbol 股票代码
 * @param providerType AI 提供者类型 ('openai' | 'ollama')
 * @param config 配置项 (apiKey, baseUrl 等)
 */
export async function performFullAnalysis(
  symbol: string,
  providerType: 'openai' | 'ollama' = 'openai',
  config: { apiKey?: string; baseUrl?: string; model?: string } = {}
): Promise<{ symbol: string; news: any[]; analysis: AIAnalysisResult }> {
  
  // 1. 抓取新闻
  const news = await scrapeStockNews(symbol);
  
  // 2. 初始化 AI 提供者
  let provider: AIProvider;
  
  if (providerType === 'ollama') {
    provider = new OllamaProvider(config.model || 'llama3');
  } else {
    provider = new OpenAIProvider(
      config.apiKey || process.env.OPENAI_API_KEY || '',
      config.baseUrl || 'https://api.openai.com/v1',
      config.model || 'gpt-4o'
    );
  }
  
  // 3. 执行 AI 分析
  const analysis = await provider.analyze(symbol, news);
  
  return {
    symbol,
    news,
    analysis
  };
}
