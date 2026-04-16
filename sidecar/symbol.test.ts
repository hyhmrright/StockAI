import { describe, test, expect, mock, beforeEach } from "bun:test";

const mocks = {
  fetchInfo: mock((_parsed: any) => Promise.resolve<{ name: string } | null>(null)),
};

mock.module("./stock-info", () => ({ fetchStockInfo: mocks.fetchInfo }));

const { getEnhancedSymbol } = await import("./symbol");

describe("getEnhancedSymbol", () => {
  beforeEach(() => {
    mocks.fetchInfo.mockReset();
    mocks.fetchInfo.mockResolvedValue(null);
  });

  test("非 A 股输入：原样返回", async () => {
    expect(await getEnhancedSymbol("AAPL")).toBe("AAPL");
    expect(mocks.fetchInfo).not.toHaveBeenCalled();
  });

  test("A 股纯代码：成功拿到公司名时拼接", async () => {
    mocks.fetchInfo.mockResolvedValue({ name: "隆基绿能" });
    expect(await getEnhancedSymbol("601012")).toBe("隆基绿能601012");
  });

  test("A 股纯代码：fetchStockInfo 返回 null 时回退原输入", async () => {
    mocks.fetchInfo.mockResolvedValue(null);
    expect(await getEnhancedSymbol("601012")).toBe("601012");
  });

  test("A 股纯代码：fetchStockInfo 抛错时静默回退", async () => {
    mocks.fetchInfo.mockRejectedValue(new Error("网络异常"));
    expect(await getEnhancedSymbol("601012")).toBe("601012");
  });

  test("已含中文名的输入：不再触发网络查询", async () => {
    expect(await getEnhancedSymbol("隆基绿能601012")).toBe("隆基绿能601012");
    expect(mocks.fetchInfo).not.toHaveBeenCalled();
  });
});
