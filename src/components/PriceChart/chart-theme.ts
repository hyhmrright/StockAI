/**
 * 图表主题色板：把 ChartCanvas / SubChart 之前散落的硬编码颜色集中。
 * 未来若新增 light 主题，只需在此扩展第二份字典 + 暴露切换器，调用方零改动。
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
  /** 副图 MACD/KDJ/RSI 等的固定通用色（与 MA_COLORS 互补） */
  series: {
    yellow: string; // KDJ K 线、MACD DIF
    purple: string; // KDJ D 线、MACD DEA
    pink: string; // KDJ J 线、比较基准
    cyan: string; // RSI / OBV
  };
}

/**
 * 暗色主题：当前唯一主题。颜色与 v0.6.0 之前散落在 ChartCanvas / SubChart 的硬编码完全一致，
 * 保证视觉零回归。
 */
export const DARK_CHART_THEME: ChartTheme = {
  background: 'transparent',
  text: 'rgba(255,255,255,0.55)',
  textMuted: 'rgba(255,255,255,0.45)',
  grid: 'rgba(255,255,255,0.06)',
  gridSubtle: 'rgba(255,255,255,0.04)',
  bollBand: 'rgba(255,255,255,0.4)',
  bollMid: 'rgba(255,255,255,0.6)',
  prevCloseLine: 'rgba(255,255,255,0.4)',
  compareSeries: '#FF6B9D',
  series: {
    yellow: '#F5C842',
    purple: '#B388FF',
    pink: '#FF6B9D',
    cyan: '#4FC3F7',
  },
};

/** 当前应用的主题。预留切换接口，目前只有 dark。 */
export const CHART_THEME: ChartTheme = DARK_CHART_THEME;
