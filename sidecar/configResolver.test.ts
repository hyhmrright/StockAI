import { expect, test, describe } from 'bun:test';
import { resolveConfig } from './configResolver';

const validConfig = {
  _version: '3',
  activeProvider: 'ollama',
  providerConfigs: {
    ollama: { apiKey: '', baseUrl: 'http://127.0.0.1:11434', model: 'qwen3.5:4b' },
  },
  deepMode: true,
};

describe('resolveConfig', () => {
  test('版本匹配时正确解析配置', () => {
    const cfg = resolveConfig(validConfig);
    expect(cfg.provider).toBe('ollama');
    expect(cfg.baseUrl).toBe('http://127.0.0.1:11434');
    expect(cfg.modelName).toBe('qwen3.5:4b');
    expect(cfg.deepMode).toBe(true);
  });

  test('_version 缺失时抛出版本不兼容错误', () => {
    const bad = { activeProvider: 'ollama', providerConfigs: {} };
    expect(() => resolveConfig(bad)).toThrow('版本不兼容');
  });

  test('_version 错误时抛出版本不兼容错误（旧版 "2" 也拒绝）', () => {
    const bad = { ...validConfig, _version: '2' };
    expect(() => resolveConfig(bad)).toThrow('版本不兼容');
  });

  test('deepMode 缺省时默认为 true', () => {
    const cfg = resolveConfig({ ...validConfig, deepMode: undefined });
    expect(cfg.deepMode).toBe(true);
  });

  test('deepMode 显式为 false 时正确读取', () => {
    const cfg = resolveConfig({ ...validConfig, deepMode: false });
    expect(cfg.deepMode).toBe(false);
  });

  test('providerCfg 缺失时回退到 PROVIDER_PROFILES', () => {
    const cfg = resolveConfig({ ...validConfig, providerConfigs: {} });
    expect(cfg.baseUrl).toBe('http://127.0.0.1:11434');
    expect(cfg.modelName).toBe('qwen3.5:4b');
  });

  test('language 字段存在时正确读取', () => {
    const cfg = resolveConfig({ ...validConfig, language: 'en' });
    expect(cfg.language).toBe('en');
  });

  test('language 字段缺失时默认 zh', () => {
    const cfg = resolveConfig(validConfig);
    expect(cfg.language).toBe('zh');
  });

  test('language 值无效时回退到 zh', () => {
    const cfg = resolveConfig({ ...validConfig, language: 'fr' });
    expect(cfg.language).toBe('zh');
  });
});

describe('resolveConfig 角色分级（roleModels）', () => {
  // 同时配置多个 provider 的 key，验证角色可指向不同 provider
  const multiProviderConfig = {
    _version: '3',
    activeProvider: 'ollama',
    providerConfigs: {
      ollama: { apiKey: '', baseUrl: 'http://127.0.0.1:11434', model: 'qwen3.5:4b' },
      openai: { apiKey: 'sk-openai', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o' },
      deepseek: {
        apiKey: 'sk-deepseek',
        baseUrl: 'https://api.deepseek.com',
        model: 'deepseek-v4-pro',
      },
    },
  };

  test('roleModels 缺省时三角色全部跟随 activeProvider（开箱即与现状一致）', () => {
    const cfg = resolveConfig(validConfig);
    for (const role of ['brain', 'quick', 'summarize'] as const) {
      expect(cfg.roles[role].provider).toBe('ollama');
      expect(cfg.roles[role].model).toBe('qwen3.5:4b');
    }
  });

  test('各角色指向不同 provider 时取对应 key/baseUrl + role 的 model', () => {
    const cfg = resolveConfig({
      ...multiProviderConfig,
      roleModels: {
        brain: { provider: 'openai', model: 'gpt-4o' },
        quick: { provider: 'deepseek', model: 'deepseek-chat' },
        // summarize 缺省 → 跟随 active(ollama)
      },
    });
    expect(cfg.roles.brain).toMatchObject({
      provider: 'openai',
      apiKey: 'sk-openai',
      model: 'gpt-4o',
    });
    expect(cfg.roles.quick).toMatchObject({
      provider: 'deepseek',
      apiKey: 'sk-deepseek',
      model: 'deepseek-chat',
    });
    expect(cfg.roles.summarize.provider).toBe('ollama');
  });

  test('顶层 provider/apiKey/baseUrl/modelName 等于 brain 角色', () => {
    const cfg = resolveConfig({
      ...multiProviderConfig,
      roleModels: { brain: { provider: 'openai', model: 'gpt-4o' } },
    });
    expect(cfg.provider).toBe('openai');
    expect(cfg.apiKey).toBe('sk-openai');
    expect(cfg.baseUrl).toBe('https://api.openai.com/v1');
    expect(cfg.modelName).toBe('gpt-4o');
  });

  test('role 指向的云端 provider 未配置 key 时回退 activeProvider（避免无声跑到空 key）', () => {
    const cfg = resolveConfig({
      ...validConfig, // 只有 ollama，无 anthropic key
      roleModels: { brain: { provider: 'anthropic', model: 'claude-3-5-sonnet-20241022' } },
    });
    expect(cfg.roles.brain.provider).toBe('ollama');
    expect(cfg.roles.brain.model).toBe('qwen3.5:4b');
  });

  test('role 指向本地 ollama 无需 key 即可生效', () => {
    const cfg = resolveConfig({
      ...multiProviderConfig,
      activeProvider: 'openai',
      roleModels: { quick: { provider: 'ollama', model: 'qwen3.5:4b' } },
    });
    expect(cfg.roles.quick.provider).toBe('ollama');
    expect(cfg.roles.quick.model).toBe('qwen3.5:4b');
  });
});
