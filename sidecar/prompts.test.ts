import { describe, test, expect } from "bun:test";
import { buildAnalysisPrompt, SYSTEM_PROMPT } from "./prompts";
import { createMockNews } from "../shared/test-utils";

describe("SYSTEM_PROMPT", () => {
  test("包含金融分析师角色定义", () => {
    expect(SYSTEM_PROMPT).toContain("金融分析师");
  });

  test("要求 JSON 纯文本格式", () => {
    expect(SYSTEM_PROMPT).toContain("JSON");
  });
});

describe("buildAnalysisPrompt", () => {
  const news = [
    createMockNews({ title: "苹果发布新款 iPhone", source: "Reuters", content: "苹果公司在秋季发布会上推出了全新 iPhone 系列产品，搭载最新的 A20 芯片，性能提升显著，发布会现场吸引了大量关注。" }),
    createMockNews({ title: "苹果Q3财报超预期", source: "Bloomberg", content: "" }),
  ];

  test("包含股票代码", () => {
    const prompt = buildAnalysisPrompt("AAPL", news);
    expect(prompt).toContain("AAPL");
  });

  test("包含新闻标题", () => {
    const prompt = buildAnalysisPrompt("AAPL", news);
    expect(prompt).toContain("苹果发布新款 iPhone");
    expect(prompt).toContain("苹果Q3财报超预期");
  });

  test("包含新闻来源", () => {
    const prompt = buildAnalysisPrompt("AAPL", news);
    expect(prompt).toContain("Reuters");
    expect(prompt).toContain("Bloomberg");
  });

  test("正文超过 50 字符时包含正文摘要段", () => {
    const prompt = buildAnalysisPrompt("AAPL", news);
    expect(prompt).toContain("【正文摘要】");
    expect(prompt).toContain("A20 芯片");
  });

  test("正文不足 50 字符时不生成正文摘要段", () => {
    const shortNews = [createMockNews({ title: "短新闻", content: "太短了" })];
    const prompt = buildAnalysisPrompt("AAPL", shortNews);
    expect(prompt).not.toContain("【正文摘要】");
  });

  test("包含 JSON 格式要求", () => {
    const prompt = buildAnalysisPrompt("AAPL", news);
    expect(prompt).toContain("rating");
    expect(prompt).toContain("sentiment");
    expect(prompt).toContain("summary");
    expect(prompt).toContain("pros");
    expect(prompt).toContain("cons");
  });

  test("新闻列表使用序号编排", () => {
    const prompt = buildAnalysisPrompt("AAPL", news);
    expect(prompt).toContain("1. 【标题】");
    expect(prompt).toContain("2. 【标题】");
  });

  test("contentLimit 参数截断正文", () => {
    const longContent = "A".repeat(2000);
    const longNews = [createMockNews({ title: "长新闻", content: longContent })];

    const prompt500 = buildAnalysisPrompt("AAPL", longNews, 500);
    // 正文摘要部分最多 500 字符（加上标题等前缀后整体更长，但正文内容不超过 500）
    const match = prompt500.match(/【正文摘要】: (A+)/);
    expect(match).not.toBeNull();
    expect(match![1].length).toBe(500);
  });

  test("空新闻列表仍生成有效 prompt", () => {
    const prompt = buildAnalysisPrompt("TSLA", []);
    expect(prompt).toContain("TSLA");
    expect(prompt).toContain("股票代码");
  });
});
