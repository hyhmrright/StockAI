import { scrapeStockNews } from '../sidecar/scraper';
import type { AIAnalysisResult, StockNews } from '../shared/types';
import type { AIProvider } from '../sidecar/ai';

/**
 * 冒烟测试：验证全流程集成
 * 1. 抓取新闻 (Sidecar 逻辑)
 * 2. 验证数据结构 (AnalysisPayload)
 * 3. 模拟 AI 分析 (AI 逻辑)
 */
async function runSmokeTest() {
  const symbol = 'NVDA';
  console.log(`🚀 开始对 ${symbol} 进行集成冒烟测试...`);

  try {
    // 1. 测试抓取逻辑 (模拟 start_analysis 的核心)
    console.log('阶段 1: 正在抓取新闻...');
    const news: StockNews[] = await scrapeStockNews(symbol);

    if (!Array.isArray(news)) {
      throw new Error('抓取结果不是数组');
    }

    console.log(`✅ 成功抓取到 ${news.length} 条新闻`);

    // 2. 验证数据结构
    const payload = { symbol, news };

    console.log('阶段 2: 验证数据结构...');
    if (payload.symbol !== symbol || !Array.isArray(payload.news)) {
      throw new Error('数据结构不正确');
    }
    console.log('✅ 数据结构验证通过');

    // 3. 模拟 AI 分析逻辑 (Mock 调用)
    console.log('阶段 3: 模拟 AI 分析...');
    const mockAiProvider: AIProvider = {
      kind: 'openai',
      analyze: async (s: string, n: any[]): Promise<AIAnalysisResult> => {
        return {
          rating: 85,
          sentiment: 'bullish',
          summary: `基于对 ${s} 的最新新闻分析，AI 认为其表现强劲。`,
          pros: ['业绩超预期', '市场需求旺盛'],
          cons: ['短期涨幅过大'],
        };
      },
    };

    const aiResult = await mockAiProvider.analyze(payload.symbol, payload.news);
    console.log(`✅ AI Mock 返回评分 ${aiResult.rating}`);

    // 4. 未知 symbol 的降级行为：应当返回空数组而非抛错
    console.log('\n阶段 4: 验证未知 symbol 降级为空数组...');
    const fallback = await scrapeStockNews('UNLIKELY_SYMBOL_XYZZY_42', false);
    if (!Array.isArray(fallback)) {
      throw new Error('未知 symbol 返回非数组，违反约定');
    }
    console.log(`✅ 未知 symbol 返回空数组（长度 ${fallback.length}）`);

    // 5. K 线 + 报价：覆盖 A 股 / 美股两个市场
    console.log('\n阶段 5: K 线 + 实时报价回归（A 股 + 美股）...');
    const { getKline, getQuote } = await import('../sidecar/kline');

    const aapl = await getKline({ symbol: 'AAPL', period: '1d', range: '1m' });
    if (!Array.isArray(aapl) || aapl.length === 0) throw new Error('AAPL K 线为空');
    console.log(
      `✅ AAPL 1M 日 K：${aapl.length} 根，最后一根 close=${aapl[aapl.length - 1].close}`,
    );

    const maotai = await getKline({ symbol: '600519', period: '1d', range: '1m' });
    if (!Array.isArray(maotai) || maotai.length === 0) throw new Error('600519 K 线为空');
    console.log(
      `✅ 600519 1M 日 K：${maotai.length} 根，最后一根 close=${maotai[maotai.length - 1].close}`,
    );

    const qAapl = await getQuote('AAPL');
    if (!qAapl?.price || isNaN(qAapl.price)) throw new Error('AAPL 报价无效');
    console.log(`✅ AAPL 实时：${qAapl.price} ${qAapl.currency}，涨跌 ${qAapl.changePercent}%`);

    const qMaotai = await getQuote('600519');
    if (!qMaotai?.price || isNaN(qMaotai.price)) throw new Error('600519 报价无效');
    console.log(
      `✅ 600519 实时：${qMaotai.price} ${qMaotai.currency}，涨跌 ${qMaotai.changePercent}%`,
    );

    console.log('\n✨ 全流程集成测试通过！');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ 冒烟测试失败:');
    console.error(error);
    process.exit(1);
  }
}

runSmokeTest();
