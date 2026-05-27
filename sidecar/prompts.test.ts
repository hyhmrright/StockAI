import { describe, test, expect } from "bun:test";
import { buildAnalysisPrompt, buildEnhancedPrompt, getSystemPrompt } from "./prompts";
import { createMockNews, createMockQuantBundle } from "../shared/test-utils";

describe("SYSTEM_PROMPT", () => {
  test("包含金融分析师角色定义", () => {
    expect(getSystemPrompt('zh')).toContain("金融分析师");
  });
  test("要求 JSON 纯文本格式", () => {
    expect(getSystemPrompt('zh')).toContain("JSON");
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

    const prompt500 = buildAnalysisPrompt("AAPL", longNews, 'zh', 500);
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

describe("buildEnhancedPrompt", () => {
  const news = [createMockNews({ title: "测试新闻" })];
  const quant = createMockQuantBundle({
    technical: { signal: 'bullish', confidence: 72, details: { rsi: 45, adx: 28, alignment: 'bullish', volume_ratio: 1.3, macd_trend: 'expanding' } },
    fundamental: { signal: 'neutral', confidence: 55, details: { roe: 16.5, pe: 22, net_margin: 12 } },
    composite: { signal: 'bullish', score: 68 },
  });

  test("包含量化分析摘要标题", () => {
    const prompt = buildEnhancedPrompt("AAPL", news, quant);
    expect(prompt).toContain("[量化分析摘要]");
  });

  test("包含技术面信号", () => {
    const prompt = buildEnhancedPrompt("AAPL", news, quant);
    expect(prompt).toContain("看涨");
    expect(prompt).toContain("72%");
  });

  test("包含基本面指标值", () => {
    const prompt = buildEnhancedPrompt("AAPL", news, quant);
    expect(prompt).toContain("ROE：16.5%");
    expect(prompt).toContain("PE：22");
  });

  test("包含综合评分", () => {
    const prompt = buildEnhancedPrompt("AAPL", news, quant);
    expect(prompt).toContain("68/100");
  });

  test("包含 technicalView/fundamentalView 要求", () => {
    const prompt = buildEnhancedPrompt("AAPL", news, quant);
    expect(prompt).toContain("technicalView");
    expect(prompt).toContain("fundamentalView");
  });

  test("仍包含原有新闻列表", () => {
    const prompt = buildEnhancedPrompt("AAPL", news, quant);
    expect(prompt).toContain("测试新闻");
  });
});

describe("buildAnalysisPrompt with language", () => {
  const news = [createMockNews({ title: "Apple releases iPhone", source: "Reuters", content: "Apple unveiled a new iPhone series at its annual fall event. The device features the latest chip." })];

  test("language='en' 时 prompt 包含英文角色指令", () => {
    const prompt = buildAnalysisPrompt("AAPL", news, 'en');
    expect(prompt).toContain("senior financial analyst");
  });

  test("language='ja' 時 prompt 包含日文角色指令", () => {
    const prompt = buildAnalysisPrompt("AAPL", news, 'ja');
    expect(prompt).toContain("アナリスト");
  });

  test("language='zh' 时行为与不传语言一致", () => {
    const prompt1 = buildAnalysisPrompt("AAPL", news, 'zh');
    const prompt2 = buildAnalysisPrompt("AAPL", news);
    expect(prompt1).toBe(prompt2);
  });
});

describe("getSystemPrompt", () => {
  test("zh 返回中文 system prompt", () => {
    expect(getSystemPrompt('zh')).toContain("金融分析师");
  });
  test("en 返回英文 system prompt", () => {
    expect(getSystemPrompt('en')).toContain("financial analyst");
  });
  test("ja 返回日文 system prompt", () => {
    expect(getSystemPrompt('ja')).toContain("金融アナリスト");
  });
});
