import { scrapeStockNews } from '../sidecar/scraper';
import { AnalysisPayload, StockNews } from '../sidecar/types';
import { AIAnalysisResult, AIProvider } from '../sidecar/ai';

/**
 * 冒烟测试：验证全流程集成
 * 1. 抓取新闻 (Sidecar 逻辑)
 * 2. 验证数据结构 (AnalysisPayload)
 * 3. 模拟 AI 分析 (AI 逻辑)
 */
async function runSmokeTest() {
  const symbol = "NVDA";
  console.log(`🚀 开始对 ${symbol} 进行集成冒烟测试...`);

  try {
    // 1. 测试抓取逻辑 (模拟 start_analysis 的核心)
    console.log("阶段 1: 正在抓取新闻...");
    const news: StockNews[] = await scrapeStockNews(symbol);
    
    if (!Array.isArray(news)) {
      throw new Error("抓取结果不是数组");
    }
    
    console.log(`✅ 成功抓取到 ${news.length} 条新闻`);

    // 2. 验证 AnalysisPayload 结构
    const payload: AnalysisPayload = {
      symbol: symbol,
      news: news
    };
    
    console.log("阶段 2: 验证数据结构...");
    if (payload.symbol !== symbol || !Array.isArray(payload.news)) {
      throw new Error("AnalysisPayload 结构不正确");
    }
    console.log("✅ 数据结构符合 AnalysisPayload 定义");

    // 3. 模拟 AI 分析逻辑 (Mock 调用)
    console.log("阶段 3: 模拟 AI 分析...");
    const mockAiProvider: AIProvider = {
      analyze: async (s: string, n: any[]): Promise<AIAnalysisResult> => {
        return {
          rating: 85,
          sentiment: 'bullish',
          summary: `基于对 ${s} 的最新新闻分析，AI 认为其表现强劲。`,
          pros: ['业绩超预期', '市场需求旺盛'],
          cons: ['短期涨幅过大']
        };
      }
    };

    const aiResult = await mockAiProvider.analyze(payload.symbol, payload.news);
    
    // 4. 测试错误降级逻辑
    console.log("\n阶段 4: 正在测试错误降级逻辑...");
    try {
      await scrapeStockNews("FAIL");
      throw new Error("错误降级测试失败: 预期应抛出错误但未抛出");
    } catch (e: any) {
      if (e.message.includes("模拟网络错误")) {
        console.log("✅ 成功模拟并捕获错误:", e.message);
      } else {
        throw e;
      }
    }

    console.log("\n✨ 全流程集成测试通过！");
    process.exit(0);
  } catch (error) {
    console.error("\n❌ 冒烟测试失败:");
    console.error(error);
    process.exit(1);
  }
}

runSmokeTest();
