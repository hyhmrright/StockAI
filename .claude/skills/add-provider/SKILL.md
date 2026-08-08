---
name: add-provider
description: 新增 AI Provider，覆盖 ProviderType / PROVIDER_PROFILES / STATIC_MODELS / PROVIDER_FACTORIES / 前端图标 / 三语 i18n 全部六处
---

# 新增 AI Provider

向用户询问以下信息（若已在请求中提供则跳过）：

- **Provider ID**：小写，如 `mistral`
- **协议类型**：OpenAI 兼容 / 自定义协议
- **默认 baseUrl**：如 `https://api.mistral.ai/v1`
- **默认 modelName**：如 `mistral-large-latest`
- **显示名称与一句话描述**（中/英/日三语）：如 `Mistral` / 「欧洲开源模型，性价比高」
- **图标 emoji**：如 `🌬️`
- **静态模型目录**：2–3 个常用 model id（真打 `/models` 失败时的回退目录）

## 六处改动（缺一不可）

其中两处漏掉**不会编译报错**，但会静默出问题——单独标注了。

| # | 文件 | 内容 | 漏了会怎样 |
|---|------|------|-----------|
| 1 | `shared/types/provider.ts` | `ProviderType` 加 `\| '<id>'` | 后续几处全部编译报错 |
| 2 | `shared/constants.ts` | `PROVIDER_PROFILES` | 编译报错（`Record<ProviderType, _>`） |
| 3 | `shared/constants.ts` | `STATIC_MODELS` | 编译报错（同上） |
| 4 | `sidecar/providers/registry.ts` | `PROVIDER_FACTORIES` | ⚠️ **不报错**：`createProvider` 静默降级为 openai |
| 5 | `src/components/settings/ProviderSelector.tsx` | `PROVIDER_ICONS` | 编译报错（`Record<ProviderType, string>`）——但注意 `PROVIDERS = Object.keys(PROVIDER_ICONS)`，**这里才是下拉框的数据源** |
| 6 | `src/i18n/{zh,en,ja}.json` | `provider_name_<id>` + `provider_desc_<id>` | ⚠️ **不报错**：调用点用了 `as TranslationKey` 断言，UI 会直接显示 key 名字符串 |

## 实施步骤

### 1. 读取现有结构

- `shared/constants.ts` 的 `ProviderProfile` 接口与 `PROVIDER_PROFILES`、`STATIC_MODELS`（`sidecar/config.ts` 仅 re-export，**不要在那里加 profile**）
- `sidecar/providers/registry.ts` 的 `PROVIDER_FACTORIES`
- `shared/types/provider.ts` 的 `ProviderType`
- `src/components/settings/ProviderSelector.tsx` 的 `PROVIDER_ICONS`

### 2. shared 层（第 1–3 处）

**`shared/types/provider.ts`**：`ProviderType` 追加 `| '<id>'`。

**`shared/constants.ts`** 的 `PROVIDER_PROFILES` 追加一行，四个字段**全部必填**：

```ts
<id>: { baseUrl: '<defaultBaseUrl>', model: '<defaultModel>', contentLimit: 1000, timeout: 60_000 },
```

**`shared/constants.ts`** 的 `STATIC_MODELS` 追加一项（`tagKey` 复用现有的 `model_tag_flagship` / `_fast` / `_long` / `_reasoning` / `_value`，需要新 tag 时同步加三语 key）：

```ts
<id>: [
  { value: '<model-a>', tagKey: 'model_tag_flagship' },
  { value: '<model-b>', tagKey: 'model_tag_fast' },
],
```

### 3. Sidecar 工厂（第 4 处）

**OpenAI 兼容协议（推荐路径）** —— `sidecar/providers/registry.ts` 复用 `OpenAIProvider`，构造器用位置参数，默认值从 `PROVIDER_PROFILES` 兜底：

```ts
<id>: (cfg) =>
  new OpenAIProvider(
    cfg.apiKey,
    cfg.baseUrl ?? PROVIDER_PROFILES.<id>.baseUrl,
    cfg.model ?? PROVIDER_PROFILES.<id>.model,
  ),
```

**自定义协议** —— 在 `sidecar/providers/<id>.ts` 实现 `AIProvider` 接口（接口定义见 `sidecar/ai.ts`，参考 `anthropic.ts`），再同样注册。

> **实时列模型无需改代码**：`cli-handlers/models.ts` 只对 `ollama` 特判，其余云端 provider 一律真打 `/models`，空结果自动回退 `STATIC_MODELS`。别去改那里的分支。

### 4. 前端（第 5 处）

`src/components/settings/ProviderSelector.tsx` 的 `PROVIDER_ICONS` 追加 `<id>: '<emoji>',`。图标是专有展示不走 i18n；**下拉选项由 `Object.keys(PROVIDER_ICONS)` 派生，不加这里 UI 里就选不到**。

### 5. 三语 i18n（第 6 处）

`src/i18n/zh.json` / `en.json` / `ja.json` **各加两个 key**（扁平结构，就近插在其它 `provider_name_*` / `provider_desc_*` 旁）：

```json
"provider_name_<id>": "<显示名>",
"provider_desc_<id>": "<一句话描述>"
```

三语必须齐，缺了不会编译报错但 UI 会显示 key 名。

### 6. 验证

```bash
bun tsc --noEmit                 # 覆盖第 1/2/3/5 处的 Record 完整性
cd sidecar && bun test config providers
```

再人工确认两处编译器抓不到的：

- `PROVIDER_FACTORIES` 里确有新 provider（否则静默降级 openai）
- 三个 locale 各有 `provider_name_<id>` 与 `provider_desc_<id>`

```bash
python3 -c "
import json
for f in ('zh','en','ja'):
    d=json.load(open(f'src/i18n/{f}.json'))
    print(f, [k for k in ('provider_name_<id>','provider_desc_<id>') if k not in d] or 'OK')"
```
