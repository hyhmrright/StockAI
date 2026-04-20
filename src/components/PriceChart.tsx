import React, { useMemo } from 'react';

interface PriceChartProps {
  /** 股票代码 */
  symbol: string;
}

/**
 * 将输入 symbol 转换为 TradingView 格式
 * 例如: 601012 -> SSE:601012, AAPL -> NASDAQ:AAPL
 */
function resolveTradingViewSymbol(symbol: string): string {
  const upper = symbol.toUpperCase();
  
  // 处理显式前缀 (sh/sz/bj/gb_)
  if (upper.startsWith('SH')) return `SSE:${upper.substring(2)}`;
  if (upper.startsWith('SZ')) return `SZSE:${upper.substring(2)}`;
  if (upper.startsWith('BJ')) return `BSE:${upper.substring(2)}`;
  if (upper.startsWith('GB_')) return `${upper.substring(3)}`; // 美股通常直接用代码，或者 NASDAQ:AAPL

  // 处理纯数字代码 (A股)
  const chinaMatch = symbol.match(/\d{6}/);
  if (chinaMatch) {
    const code = chinaMatch[0];
    if (code.startsWith('6')) return `SSE:${code}`;
    if (code.startsWith('0') || code.startsWith('3')) return `SZSE:${code}`;
    if (code.startsWith('4') || code.startsWith('8')) return `BSE:${code}`;
  }

  // 美股启发式处理
  // 如果是 2-5 位纯字母，优先尝试 NASDAQ
  if (/^[A-Z]{2,5}$/.test(upper)) {
    // 这是一个简化处理，大部分科技股在 NASDAQ
    // 实际生产中可能需要根据 fetchStockInfo 返回的 exchange 动态决定
    return `NASDAQ:${upper}`;
  }

  return upper;
}

/**
 * PriceChart 使用 TradingView 的 Financial Chart Widget
 * 完全免费且支持实时行情
 */
const PriceChart: React.FC<PriceChartProps> = ({ symbol }) => {
  const tvSymbol = useMemo(() => resolveTradingViewSymbol(symbol), [symbol]);

  // 构建 TradingView Widget URL
  const widgetUrl = useMemo(() => {
    const config = {
      symbol: tvSymbol,
      interval: "D",
      timezone: "Etc/UTC",
      theme: "dark",
      style: "1",
      locale: "zh_CN",
      toolbar_bg: "#f1f3f6",
      enable_publishing: false,
      hide_side_toolbar: false,
      allow_symbol_change: true,
      container_id: "tradingview_chart"
    };
    
    // 使用公开的 Widget 地址
    return `https://s.tradingview.com/widgetembed/?frameElementId=tradingview_chart&symbol=${encodeURIComponent(config.symbol)}&interval=${config.interval}&hidesidetoolbar=1&symboledit=1&saveimage=1&toolbarbg=f1f3f6&studies=%5B%5D&theme=dark&style=1&timezone=${encodeURIComponent(config.timezone)}&withdateranges=1&showpopupbutton=1&popupwidth=1000&popupheight=650&locale=zh_CN`;
  }, [tvSymbol]);

  return (
    <div className="w-full bg-panel rounded-xl border border-white/10 overflow-hidden shadow-xl mb-8">
      <div className="h-[450px] w-full relative">
        <iframe
          title="TradingView Chart"
          src={widgetUrl}
          width="100%"
          height="100%"
          frameBorder="0"
          allowFullScreen
          className="bg-transparent"
        />
      </div>
    </div>
  );
};

export default PriceChart;
