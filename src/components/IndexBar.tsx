import React from 'react';
import { useQuotes } from '../hooks/useQuotes';
import { useLanguage } from '../hooks/useLanguage';
import { upColor, downColor } from '../lib/market-hours';
import type { TranslationKey } from '../i18n';
import type { Market } from '../../shared/types';

/**
 * 大盘指数条。
 *
 * 这些代码走的是**既有**的报价链路，没有新增任何数据源：A 股指数由腾讯的
 * `v_sh000001` 形态返回，美股指数由 Yahoo 返回，两侧 parser 的字段位置与个股完全一致
 * （已实测：上证 / 深证成指 / 创业板指 / 标普 500 / 纳斯达克 / 道琼斯 六个全部解析正常）。
 *
 * 名称不取接口返回值而是走 i18n：数据源给的是「上证指数」「S&P 500」这类混合语言的原名，
 * 摆在一条里长短不一；这里要的是各语言下等宽的简称。`index_sp500` 三语同值，
 * 但仍占一个 key——让这张表只有一种取名方式，比省一条译文值钱。
 */
const INDICES: { symbol: string; label: TranslationKey; market: Market }[] = [
  { symbol: 'sh000001', label: 'index_sh', market: 'A股' },
  { symbol: 'sz399001', label: 'index_sz', market: 'A股' },
  { symbol: 'sz399006', label: 'index_cyb', market: 'A股' },
  { symbol: '^GSPC', label: 'index_sp500', market: '美股' },
  { symbol: '^IXIC', label: 'index_nasdaq', market: '美股' },
  { symbol: '^DJI', label: 'index_dji', market: '美股' },
];

const SYMBOLS = INDICES.map((i) => i.symbol);

interface Props {
  /** 点整条 → 展开市场概览（板块涨幅榜） */
  onOpenOverview: () => void;
}

const IndexBar: React.FC<Props> = ({ onOpenOverview }) => {
  const { quotes } = useQuotes(SYMBOLS);
  const { t } = useLanguage();

  return (
    <button
      onClick={onOpenOverview}
      title={t('market_overview')}
      className="flex items-center gap-5 px-6 py-1.5 border-b border-white/5 bg-panel/60 hover:bg-white/5 transition-colors overflow-x-auto shrink-0 w-full text-left"
    >
      {INDICES.map(({ symbol, label, market }) => {
        const q = quotes[symbol];
        // 还没取到就留白占位，避免整条在加载时抖动
        const color = !q ? undefined : q.change >= 0 ? upColor(market) : downColor(market);

        return (
          <div key={symbol} className="flex items-baseline gap-1.5 whitespace-nowrap">
            <span className="text-[11px] text-gray-500">{t(label)}</span>
            <span className="text-[11px] font-mono font-semibold" style={{ color }}>
              {q ? q.price.toFixed(2) : '—'}
            </span>
            {q && (
              <span className="text-[10px] font-mono" style={{ color }}>
                {q.changePercent >= 0 ? '+' : ''}
                {q.changePercent.toFixed(2)}%
              </span>
            )}
          </div>
        );
      })}
    </button>
  );
};

export default IndexBar;
