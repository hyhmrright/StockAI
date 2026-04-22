import { expect, test, describe } from "bun:test";
import { detectChinaStock, parseSymbol } from "./exchange";

describe("detectChinaStock", () => {
  test("6 开头识别为上交所", () => {
    const result = detectChinaStock("601012");
    expect(result).not.toBeNull();
    expect(result!.code).toBe("601012");
    expect(result!.googleSuffix).toBe("SHA");
    expect(result!.yahooSuffix).toBe(".SS");
  });

  test("0 开头识别为深交所", () => {
    const result = detectChinaStock("000001");
    expect(result).not.toBeNull();
    expect(result!.googleSuffix).toBe("SZE");
    expect(result!.yahooSuffix).toBe(".SZ");
  });

  test("3 开头识别为深交所（创业板）", () => {
    const result = detectChinaStock("300750");
    expect(result).not.toBeNull();
    expect(result!.googleSuffix).toBe("SZE");
  });

  test("4 开头识别为北交所", () => {
    const result = detectChinaStock("430047");
    expect(result).not.toBeNull();
    expect(result!.googleSuffix).toBe("BJS");
    expect(result!.yahooSuffix).toBe(".BJ");
  });

  test("8 开头识别为北交所", () => {
    const result = detectChinaStock("830799");
    expect(result).not.toBeNull();
    expect(result!.googleSuffix).toBe("BJS");
  });

  test("纯英文代码返回 null（非 A 股）", () => {
    expect(detectChinaStock("AAPL")).toBeNull();
    expect(detectChinaStock("TSLA")).toBeNull();
  });

  test("包含中文名的 A 股代码能正确提取", () => {
    const result = detectChinaStock("隆基绿能601012");
    expect(result).not.toBeNull();
    expect(result!.code).toBe("601012");
    expect(result!.googleSuffix).toBe("SHA");
  });

  test("不含 6 位数字的字符串返回 null", () => {
    expect(detectChinaStock("12345")).toBeNull();
    expect(detectChinaStock("")).toBeNull();
  });

  test("首位为非 A 股代码段的 6 位数字返回 null", () => {
    // 以 1/2/9 等开头的 6 位代码不属于任何已知交易所
    expect(detectChinaStock("100001")).toBeNull();
    expect(detectChinaStock("200001")).toBeNull();
    expect(detectChinaStock("999999")).toBeNull();
  });
});

describe("parseSymbol", () => {
  test("纯代码输入：displayName 未定义，chinaInfo 正确填充", () => {
    const parsed = parseSymbol("601012");
    expect(parsed.chinaInfo?.code).toBe("601012");
    expect(parsed.displayName).toBeUndefined();
    expect(parsed.rawInput).toBe("601012");
  });

  test("中文名+代码混合：displayName 剥离后保留名称", () => {
    const parsed = parseSymbol("隆基绿能601012");
    expect(parsed.chinaInfo?.code).toBe("601012");
    expect(parsed.displayName).toBe("隆基绿能");
  });

  test("代码在前、名称在后也能正确提取", () => {
    const parsed = parseSymbol("601012隆基绿能");
    expect(parsed.chinaInfo?.code).toBe("601012");
    expect(parsed.displayName).toBe("隆基绿能");
  });

  test("美股代码：chinaInfo 为 undefined", () => {
    const parsed = parseSymbol("AAPL");
    expect(parsed.chinaInfo).toBeUndefined();
    expect(parsed.displayName).toBeUndefined();
    expect(parsed.rawInput).toBe("AAPL");
  });

  test("首尾空格：rawInput 已 trim", () => {
    const parsed = parseSymbol("  601012  ");
    expect(parsed.rawInput).toBe("601012");
    expect(parsed.chinaInfo?.code).toBe("601012");
  });

  test("支持显式前缀 (sh601012)", () => {
    const parsed = parseSymbol("sh601012");
    expect(parsed.chinaInfo?.sinaPrefix).toBe("sh");
    expect(parsed.chinaInfo?.code).toBe("601012");
  });

  test("支持显式前缀 (gb_aapl)", () => {
    const parsed = parseSymbol("gb_aapl");
    expect(parsed.usInfo?.sinaPrefix).toBe("gb_");
    expect(parsed.usInfo?.symbol).toBe("AAPL");
  });

  test("纯中文输入：识别为普通搜索词", () => {
    const parsed = parseSymbol("苹果");
    expect(parsed.chinaInfo).toBeUndefined();
    expect(parsed.usInfo).toBeUndefined();
    expect(parsed.rawInput).toBe("苹果");
  });

  test("空字符串或 nullish 输入：返回空 rawInput 而不崩溃", () => {
    const parsedEmpty = parseSymbol("");
    expect(parsedEmpty.rawInput).toBe("");
    
    // @ts-ignore: 测试无效输入
    const parsedNull = parseSymbol(null);
    expect(parsedNull.rawInput).toBe("");
    
    // @ts-ignore: 测试无效输入
    const parsedUndefined = parseSymbol(undefined);
    expect(parsedUndefined.rawInput).toBe("");
  });
});
