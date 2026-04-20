// 跨层共享的数据类型定义（前端 + Sidecar 的唯一来源）
/**
 * 统一的业务响应信封
 */
export interface ServiceResponse<T> {
  data?: T;
  error?: {
    code: string;    // 错误码，如 'ERR_SCRAPE_EMPTY', 'ERR_AI_AUTH'
    message: string; // 人类可读的消息
  };
}

/** AI 服务提供商类型 */
export type ProviderType = "openai" | "ollama" | "anthropic" | "deepseek";

/**
 * 股票新闻数据接口
 */
export interface StockNews {
  title: string;   // 新闻标题
  source: string;  // 新闻来源（域名或媒体名称）
  date: string;    // 发布日期，格式为 YYYY-MM-DD（无法解析时为原始字符串）
  content: string; // 新闻内容（Markdown 格式；深度模式下为完整正文，否则为摘要或空字符串）
  url: string;     // 新闻原文链接
}

/**
 * AI 分析结果接口
 */
export interface AIAnalysisResult {
  rating: number; // 综合评分，范围 1-100（50 为中性基准）
  sentiment: 'bullish' | 'bearish' | 'neutral'; // 情绪：看涨、看跌、中性
  summary: string; // 简要总结
  pros: string[]; // 利多理由
  cons: string[]; // 利空/风险因素
  sector?: string;      // 所属板块
  industry?: string;    // 所属行业
  description?: string; // 公司业务描述
}

/**
 * 股票基本信息（来自 Sina Finance / Yahoo Finance）
 */
export interface StockInfo {
  name: string;            // 股票全称
  code: string;            // 标准化代码（如 688693）
  exchange: string;        // 交易所名称（科创板 / 上交所 / 深交所 / 北交所 / NASDAQ / NYSE）
  market: string;          // 市场（A股 / 美股）
  price?: number;          // 最新价
  change?: number;         // 涨跌额
  changePercent?: number;  // 涨跌幅 %
  currency: string;        // 货币（CNY / USD）
}

/**
 * 股票搜索结果
 */
export interface StockSearchResult {
  name: string;
  code: string;
  type: string;     // 股票类型：A股、美股、港股等
  fullCode: string; // 完整带市场前缀的代码（用于新浪接口，如 sh601012, gb_aapl）
  price?: number;          // 最新价
  change?: number;         // 涨跌额
  changePercent?: number;  // 涨跌幅 %
}

/**
 * 完整的股票分析响应
 */
export interface FullAnalysisResponse {
  symbol: string;
  stockInfo?: StockInfo;
  news: StockNews[];
  analysis: AIAnalysisResult;
}
