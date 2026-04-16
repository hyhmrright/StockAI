import { describe, test, expect } from "bun:test";
import { resolveExchangeName } from "./stock-info";

describe("resolveExchangeName", () => {
  test("sh + 688xxx 识别为科创板", () => {
    expect(resolveExchangeName("sh", "688693")).toBe("科创板");
  });

  test("sh + 非 688 为上交所", () => {
    expect(resolveExchangeName("sh", "601012")).toBe("上交所");
    expect(resolveExchangeName("sh", "600519")).toBe("上交所");
  });

  test("sz + 300/301 识别为创业板", () => {
    expect(resolveExchangeName("sz", "300750")).toBe("创业板");
    expect(resolveExchangeName("sz", "301308")).toBe("创业板");
  });

  test("sz + 其他为深交所", () => {
    expect(resolveExchangeName("sz", "000001")).toBe("深交所");
  });

  test("bj 前缀为北交所", () => {
    expect(resolveExchangeName("bj", "830799")).toBe("北交所");
  });

  test("未知前缀：大写原值兜底", () => {
    expect(resolveExchangeName("xx", "123456")).toBe("XX");
  });
});
