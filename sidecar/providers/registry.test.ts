import { expect, test, describe } from "bun:test";
import { createProvider } from "./registry";

describe("createProvider", () => {
  test("返回的 provider 实现 AIProvider 接口（具有 analyze 方法）", () => {
    const provider = createProvider("openai", { apiKey: "sk-test" });
    expect(typeof provider.analyze).toBe("function");
  });

  test("type 为 'ollama' 时返回具有 analyze 方法的 provider", () => {
    const provider = createProvider("ollama", {});
    expect(typeof provider.analyze).toBe("function");
  });

  test("type 为 'anthropic' 时返回具有 analyze 方法的 provider", () => {
    const provider = createProvider("anthropic", { apiKey: "sk-ant-test" });
    expect(typeof provider.analyze).toBe("function");
  });

  test("未知 type 回退后仍返回具有 analyze 方法的 provider", () => {
    const provider = createProvider("unknown-provider", { apiKey: "sk-dummy" });
    expect(typeof provider.analyze).toBe("function");
  });

  test("空字符串 type 回退后仍返回具有 analyze 方法的 provider", () => {
    const provider = createProvider("", { apiKey: "sk-dummy" });
    expect(typeof provider.analyze).toBe("function");
  });

  test("自定义 config 传递正确（构造不抛出）", () => {
    expect(() =>
      createProvider("openai", {
        apiKey: "sk-custom",
        baseUrl: "https://custom.api.com/v1",
        model: "gpt-3.5-turbo",
      })
    ).not.toThrow();
  });
});
