/**
 * 东财 F10 的 ROEJQ 是「报告期内累计值」（一季报=Q1累计、中报=H1累计、三季报=前三季度累计），非年化——
 * 与「ROE>15%」这类年化阈值语义/量纲错位（年中查询几乎恒为季度低值）。年报本身已是全年累计，无需换算。
 * 简单年化：按报告期天数占全年比例折算。多股票实测（茅台/平安银行/宁德时代）验证：
 * 三季报×4/3、中报×2、一季报×4 后与真实年报误差普遍 <10%，作为筛选阈值判断的近似已足够。
 * 未知/缺失报告期类型 → 原样返回，不做换算（保守，不臆测）。
 */
export function annualizeRoe(
  roe: number | undefined,
  reportType: string | undefined,
): number | undefined {
  if (roe == null) return undefined;
  switch (reportType) {
    case '一季报':
      return roe * 4;
    case '中报':
      return roe * 2;
    case '三季报':
      return roe * (4 / 3);
    default:
      return roe; // '年报' 或未知类型：原样返回
  }
}
