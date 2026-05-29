---
name: add-provider
description: 新增 AI Provider，覆盖 shared/constants.ts / providers/registry.ts / shared/types.ts 全流程
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
- 读取 `shared/constants.ts` 的 `PROVIDER_PROFILES` 与 `ProviderProfile` 接口了解字段格式（`sidecar/config.ts` 仅 re-export，**不要在那里加 profile**）
- 读取 `sidecar/providers/registry.ts` 的 `PROVIDER_FACTORIES` 了解注册格式
- 读取 `shared/types.ts` 的 `ProviderType` 联合类型

### 2. OpenAI 兼容协议（推荐路径）
**`shared/constants.ts`**：在 `PROVIDER_PROFILES` 追加一行。`ProviderProfile` 四个字段**全部必填**（`Record<ProviderType, ProviderProfile>` 会在漏字段时编译报错）：
```ts
<id>: { baseUrl: '<defaultBaseUrl>', model: '<defaultModel>', contentLimit: 1000, timeout: 60_000 },
```

**`sidecar/providers/registry.ts`**：在 `PROVIDER_FACTORIES` 追加（构造器用位置参数，profile 默认值从 `PROVIDER_PROFILES` 兜底）：
```ts
<id>: (cfg) => new OpenAIProvider(
  cfg.apiKey,
  cfg.baseUrl ?? PROVIDER_PROFILES.<id>.baseUrl,
  cfg.model   ?? PROVIDER_PROFILES.<id>.model,
),
```

**`shared/types.ts`**：在 `ProviderType` 追加 `| '<id>'`

### 3. 自定义协议
在 `sidecar/providers/<id>.ts` 实现 `AIProvider` 接口（参考 `sidecar/ai.ts`），然后同样在 registry 和 types 注册。

### 4. 验证四处同步
检查以下四个文件均已更新：
- [ ] `shared/constants.ts` — PROVIDER_PROFILES
- [ ] `sidecar/providers/registry.ts` — PROVIDER_FACTORIES
- [ ] `shared/types.ts` — ProviderType
- [ ] （自定义协议时）`sidecar/providers/<id>.ts`

### 5. 运行测试
```bash
cd sidecar && bun test config
bun tsc --noEmit
```
