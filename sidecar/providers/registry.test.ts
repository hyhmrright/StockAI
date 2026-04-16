import { expect, test, describe } from "bun:test";
import { createProvider } from "./registry";

describe("createProvider", () => {
  test("'openai' → OpenAIProvider", () => {
    const p = createProvider("openai", { apiKey: "sk-test" });
    expect(p.kind).toBe("openai");
  });

  test("'deepseek' → OpenAI 兼容 Provider（共用 OpenAI 家族）", () => {
    const p = createProvider("deepseek", { apiKey: "sk-test" });
    expect(p.kind).toBe("openai");
  });

  test("'ollama' → OllamaProvider", () => {
    const p = createProvider("ollama", {});
    expect(p.kind).toBe("ollama");
  });

  test("'anthropic' → AnthropicProvider", () => {
    const p = createProvider("anthropic", { apiKey: "sk-ant-test" });
    expect(p.kind).toBe("anthropic");
  });

  test("未知 type 回退到 openai（不静默返回 wrong family）", () => {
    const p = createProvider("unknown-provider", { apiKey: "sk-dummy" });
    expect(p.kind).toBe("openai");
  });

  test("空字符串 type 同样回退到 openai", () => {
    const p = createProvider("", { apiKey: "sk-dummy" });
    expect(p.kind).toBe("openai");
  });

  test("自定义 config 字段不会让构造抛错", () => {
    expect(() =>
      createProvider("openai", {
        apiKey: "sk-custom",
        baseUrl: "https://custom.api.com/v1",
        model: "gpt-3.5-turbo",
      })
    ).not.toThrow();
  });
});
