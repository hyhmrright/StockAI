import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AIAnalysisResult, StockNews } from "../../shared/types";
import { useAIAnalysis } from "./useAIAnalysis";

function buildResult(rating: number): AIAnalysisResult {
  return {
    rating,
    sentiment: rating >= 50 ? "bullish" : "bearish",
    summary: `mock-${rating}`,
    pros: ["p"],
    cons: ["c"],
  };
}

const NEWS: StockNews[] = [
  { title: "n1", source: "s", date: "2026-05-23", content: "", url: "https://a" },
];

describe("useAIAnalysis", () => {
  it("初始 record 为 null", () => {
    const runner = vi.fn(async () => buildResult(60));
    const { result } = renderHook(() => useAIAnalysis("AAPL", runner));
    expect(result.current.record).toBeNull();
    expect(result.current.analyzing).toBe(false);
    expect(runner).not.toHaveBeenCalled();
  });

  it("analyze 显式触发后填充 record", async () => {
    const runner = vi.fn(async () => buildResult(72));
    const { result } = renderHook(() => useAIAnalysis("AAPL", runner));

    await act(async () => { await result.current.analyze(NEWS); });
    expect(result.current.record?.result.rating).toBe(72);
    expect(result.current.record?.newsSnapshotLength).toBe(1);
    expect(runner).toHaveBeenCalledWith("AAPL", NEWS);
  });

  it("按 symbol 缓存：切换 symbol 后保留各自最近结果", async () => {
    const runner = vi.fn((sym: string) => Promise.resolve(buildResult(sym === "AAPL" ? 70 : 30)));
    const { result, rerender } = renderHook(({ s }) => useAIAnalysis(s, runner), {
      initialProps: { s: "AAPL" },
    });

    await act(async () => { await result.current.analyze(NEWS); });
    expect(result.current.record?.result.rating).toBe(70);

    rerender({ s: "MSFT" });
    // MSFT 未分析，record 应为 null
    expect(result.current.record).toBeNull();

    await act(async () => { await result.current.analyze(NEWS); });
    expect(result.current.record?.result.rating).toBe(30);

    // 切回 AAPL 应该看到之前的缓存
    rerender({ s: "AAPL" });
    expect(result.current.record?.result.rating).toBe(70);
  });

  it("news 为空时不调用 LLM 并填错误", async () => {
    const runner = vi.fn(async () => buildResult(60));
    const { result } = renderHook(() => useAIAnalysis("AAPL", runner));

    await act(async () => { await result.current.analyze([]); });
    expect(runner).not.toHaveBeenCalled();
    expect(result.current.error).toMatch(/尚未抓到新闻/);
  });

  it("LLM 抛错时设 error 且不写 record", async () => {
    const runner = vi.fn(async () => { throw new Error("rate limit"); });
    const { result } = renderHook(() => useAIAnalysis("AAPL", runner));

    await act(async () => { await result.current.analyze(NEWS); });
    expect(result.current.error).toMatch(/rate limit/);
    expect(result.current.record).toBeNull();
  });

  it("analyzing 标志在分析期间为 true", async () => {
    let resolve: ((v: AIAnalysisResult) => void) | null = null;
    const runner = vi.fn(() => new Promise<AIAnalysisResult>(res => { resolve = res; }));
    const { result } = renderHook(() => useAIAnalysis("AAPL", runner));

    let pending: Promise<void>;
    act(() => { pending = result.current.analyze(NEWS); });
    await waitFor(() => expect(result.current.analyzing).toBe(true));

    await act(async () => {
      resolve!(buildResult(50));
      await pending!;
    });
    expect(result.current.analyzing).toBe(false);
  });
});
