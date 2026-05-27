---
name: new-master-agent
description: 在 sidecar/agents/masters/ 新增投资大师 Agent，自动完成接口实现和 registry 注册
---

# 新增投资大师 Agent

向用户询问以下信息（若已在请求中提供则跳过）：
- **大师 ID**：英文 kebab-case，如 `george-soros`
- **英文姓名**：如 `George Soros`
- **中文姓名**：如 `乔治·索罗斯`
- **投资风格（英文）**：如 `Macro Trading`
- **投资风格（中文）**：如 `宏观交易`
- **核心理念**：2-3 句话描述其投资哲学

## 实施步骤

### 1. 读取参考模板
读取 `sidecar/agents/masters/ben-graham.ts` 作为结构参考，读取 `sidecar/agents/types.ts` 确认 MasterAgent 接口。

### 2. 创建大师文件
在 `sidecar/agents/masters/<id>.ts` 新建文件，结构：
- `meta` 对象：包含 `id / name / nameZh / style / styleZh / description`
- `SYSTEM_PROMPT`：用该大师的第一人称口吻，包含分析框架、信号规则（bullish/bearish/neutral）、置信度标准，结尾要求只返回 `{"signal": "...", "confidence": 0-100, "reasoning": "..."}`
- `buildUserPrompt(ctx)`：从 `ctx.quant` 和 `ctx.news` 提取数据构建用户 prompt，参考 ben-graham.ts 的字段选取
- 调用 `createMasterAgent(meta, SYSTEM_PROMPT, buildUserPrompt)` 并 `export const agent`

### 3. 注册到 registry
在 `sidecar/agents/registry.ts`：
- 顶部添加 import：`import { agent as <camelId> } from './masters/<id>';`
- 在 `REGISTRY` Map 中追加：`[<camelId>.meta.id, <camelId>],`

### 4. 验证
```bash
cd sidecar && bun test agents
```

确认无类型错误、无测试失败后完成。
