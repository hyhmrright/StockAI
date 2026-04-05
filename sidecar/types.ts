// 定义股票新闻接口
export interface StockNews {
  title: string;   // 新闻标题
  source: string;  // 新闻来源
  date: string;    // 发布日期
  content: string; // 新闻内容 (Markdown 格式)
  url: string;     // 新闻链接
}

// 定义分析 Payload 接口
export interface AnalysisPayload {
  symbol: string;  // 股票代码
  news: StockNews[]; // 相关新闻列表
}
