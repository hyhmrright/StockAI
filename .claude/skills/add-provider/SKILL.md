---
name: add-provider
description: 新增 AI Provider，覆盖 config.ts / providers/registry.ts / shared/types.ts 全流程
---

# 新增 AI Provider

向用户询问以下信息（若已在请求中提供则跳过）：
- **Provider ID**：小写，如 `mistral`
- **协议类型**：OpenAI 兼容 / 自定义协议
- **默认 baseUrl**：如 `https://api.mistral.ai/v1`
- **默认 modelName**：如 `mistral-large-latest`
- **显示名称**：如 `Mistral`

## 实施步骤

### 1. 读取现有结构
- 读取 `sidecar/config.ts` 的 `PROVIDER_PROFILES` 了解字段格式
- 读取 `sidecar/providers/registry.ts` 的 `PROVIDER_FACTORIES` 了解注册格式
- 读取 `shared/types.ts` 的 `ProviderType` 联合类型

### 2. OpenAI 兼容协议（推荐路径）
**`sidecar/config.ts`**：在 `PROVIDER_PROFILES` 追加：
```ts
<id>: { baseUrl: '<defaultBaseUrl>', modelName: '<defaultModel>' },
```

**`sidecar/providers/registry.ts`**：在 `PROVIDER_FACTORIES` 追加：
```ts
<id>: (config) => new OpenAIProvider({ ...config, baseUrl: profile.baseUrl }),
```

**`shared/types.ts`**：在 `ProviderType` 追加 `| '<id>'`

### 3. 自定义协议
在 `sidecar/providers/<id>.ts` 实现 `AIProvider` 接口（参考 `sidecar/ai.ts`），然后同样在 registry 和 types 注册。

### 4. 验证四处同步
检查以下四个文件均已更新：
- [ ] `sidecar/config.ts` — PROVIDER_PROFILES
- [ ] `sidecar/providers/registry.ts` — PROVIDER_FACTORIES  
- [ ] `shared/types.ts` — ProviderType
- [ ] （自定义协议时）`sidecar/providers/<id>.ts`

### 5. 运行测试
```bash
cd sidecar && bun test config
bun tsc --noEmit
```
