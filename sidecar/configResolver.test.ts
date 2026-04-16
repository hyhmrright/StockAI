import { expect, test, describe } from "bun:test";
import { resolveConfig } from "./configResolver";

const validConfig = {
  _version: "2",
  activeProvider: "ollama",
  providerConfigs: {
    ollama: { apiKey: "", baseUrl: "http://localhost:11434", model: "qwen3.5:9b" },
  },
  deepMode: true,
};

describe("resolveConfig", () => {
  test("版本匹配时正确解析配置", () => {
    const cfg = resolveConfig(validConfig);
    expect(cfg.provider).toBe("ollama");
    expect(cfg.baseUrl).toBe("http://localhost:11434");
    expect(cfg.modelName).toBe("qwen3.5:9b");
    expect(cfg.deepMode).toBe(true);
  });

  test("_version 缺失时抛出版本不兼容错误", () => {
    const bad = { activeProvider: "ollama", providerConfigs: {} };
    expect(() => resolveConfig(bad)).toThrow("版本不兼容");
  });

  test("_version 错误时抛出版本不兼容错误", () => {
    const bad = { ...validConfig, _version: "1" };
    expect(() => resolveConfig(bad)).toThrow("版本不兼容");
  });

  test("deepMode 缺省时默认为 true", () => {
    const cfg = resolveConfig({ ...validConfig, deepMode: undefined });
    expect(cfg.deepMode).toBe(true);
  });

  test("deepMode 显式为 false 时正确读取", () => {
    const cfg = resolveConfig({ ...validConfig, deepMode: false });
    expect(cfg.deepMode).toBe(false);
  });

  test("providerCfg 缺失时回退到 PROVIDER_PROFILES", () => {
    const cfg = resolveConfig({ ...validConfig, providerConfigs: {} });
    expect(cfg.baseUrl).toBe("http://localhost:11434");
    expect(cfg.modelName).toBe("qwen3.5:9b");
  });
});
