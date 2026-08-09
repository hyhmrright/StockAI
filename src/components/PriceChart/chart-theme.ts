/**
 * 图表主题色板：把 ChartCanvas / SubChart 之前散落的硬编码颜色集中。
 *
 * 目前只有暗色一套。真要加 light 主题，**光在此加第二份字典是不够的**——各消费方
 * 都在建 series 时一次性读取本对象（`useChartInstance` / `SubChart` / 各 overlay），
 * 运行时切换需要它们能重读并重建，即改成 context/hook 下发。加主题时按这个来，
 * 不要被"再加一份字典即可"的印象误导。
 */

export interface ChartTheme {
  /** 主图/副图背景：与外层卡片融合 */
  background: string;
  /** 坐标轴文字、底部时间标签 */
  text: string;
  /** 副图坐标轴文字（更弱化） */
  textMuted: string;
  /** 主图网格线 */
  grid: string;
  /** 副图网格线（更弱） */
  gridSubtle: string;
  /** BOLL 上下轨（虚线） */
  bollBand: string;
  /** BOLL 中轨（实线） */
  bollMid: string;
  /** 昨收水平虚线 */
  prevCloseLine: string;
  /** 比较基准 series 颜色 */
  compareSeries: string;
  /** AI 关键价位线配色（按 PriceLevel.type 索引） */
  levelColors: {
    support: string; // 支撑（BOLL 下轨）
    resistance: string; // 阻力（BOLL 上轨）
    target: string; // 目标价（估值安全边际）
    stopLoss: string; // 止损（现价 −2×ATR）
  };
  /** 回测买入箭头（绿） */
  buyMarker: string;
  /** 回测卖出箭头（红） */
  sellMarker: string;
  /** 回测净值曲线（独立隐藏轴） */
  equityLine: string;
  /** 副图 MACD/KDJ/RSI 等的固定通用色（与 MA_COLORS 互补） */
  series: {
    yellow: string; // KDJ K 线、MACD DIF
    purple: string; // KDJ D 线、MACD DEA
    pink: string; // KDJ J 线、比较基准
    cyan: string; // RSI / OBV
  };
}

/**
 * 当前应用的主题（暗色）。颜色与 v0.6.0 之前散落在 ChartCanvas / SubChart 的硬编码完全一致，
 * 保证视觉零回归。
 */
export const CHART_THEME: ChartTheme = {
  background: 'transparent',
  text: 'rgba(255,255,255,0.55)',
  textMuted: 'rgba(255,255,255,0.45)',
  grid: 'rgba(255,255,255,0.06)',
  gridSubtle: 'rgba(255,255,255,0.04)',
  bollBand: 'rgba(255,255,255,0.4)',
  bollMid: 'rgba(255,255,255,0.6)',
  prevCloseLine: 'rgba(255,255,255,0.4)',
  compareSeries: '#FF6B9D',
  levelColors: {
    support: '#2DD4BF', // teal
    resistance: '#FBBF24', // amber
    target: '#B388FF', // violet
    stopLoss: '#F87171', // red
  },
  buyMarker: '#22C55E', // green
  sellMarker: '#EF4444', // red
  equityLine: '#22D3EE', // cyan（与 MA 长线区分）
  series: {
    yellow: '#F5C842',
    purple: '#B388FF',
    pink: '#FF6B9D',
    cyan: '#4FC3F7',
  },
};
