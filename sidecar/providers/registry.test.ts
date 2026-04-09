import { expect, test, describe } from "bun:test";
import { createProvider } from "./registry";
import { OpenAIProvider } from "./openai";
import { OllamaProvider } from "./ollama";

describe("createProvider", () => {
  test("type 为 'openai' 时创建 OpenAIProvider 实例", () => {
    const provider = createProvider("openai", { apiKey: "sk-test" });
    expect(provider).toBeInstanceOf(OpenAIProvider);
  });

  test("type 为 'ollama' 时创建 OllamaProvider 实例", () => {
    const provider = createProvider("ollama", {});
    expect(provider).toBeInstanceOf(OllamaProvider);
  });

  test("未知 type 回退为 OpenAIProvider", () => {
    const provider = createProvider("unknown-provider", { apiKey: "sk-dummy" });
    expect(provider).toBeInstanceOf(OpenAIProvider);
  });

  test("空字符串 type 回退为 OpenAIProvider", () => {
    const provider = createProvider("", { apiKey: "sk-dummy" });
    expect(provider).toBeInstanceOf(OpenAIProvider);
  });

  test("自定义 config 传递正确", () => {
    // 内部字段为 private，仅验证构造成功
    const provider = createProvider("openai", {
      apiKey: "sk-custom",
      baseUrl: "https://custom.api.com/v1",
      model: "gpt-3.5-turbo",
    });
    expect(provider).toBeInstanceOf(OpenAIProvider);
  });
});
