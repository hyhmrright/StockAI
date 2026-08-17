---
name: new-master-agent
description: 在 sidecar/agents/masters/ 新增投资大师 Agent，覆盖 shared 元数据表、实现与 registry 注册三处
---

# 新增投资大师 Agent

向用户询问以下信息（若已在请求中提供则跳过）：

- **大师 ID**：英文 kebab-case，如 `george-soros`
- **英文姓名 / 中文姓名**：如 `George Soros` / `乔治·索罗斯`
- **投资风格（英/中）**：如 `Macro Trading` / `宏观交易`
- **核心理念**：2–3 句话描述其投资哲学（写进 SYSTEM_PROMPT）
- **是否加入默认选中列表**（当前默认 5 位，见下）

## 三处改动

| # | 文件 | 内容 | 漏了会怎样 |
|---|------|------|-----------|
| 1 | `shared/constants.ts` | `MASTER_META` 数组追加五字段对象 | 第 2 步的 `masterMetaById` 在模块加载时抛，提示补这张表 |
| 2 | `sidecar/agents/masters/<id>.ts` | 新建实现 | `masters-common.test.ts` 的「目录里的文件与 MASTER_META 的 id 完全对应」失败 |
| 3 | `sidecar/agents/registry.ts` | import + `REGISTRY` Map 追加 | 同套件的「registry 注册的大师与 MASTER_META 的 id 完全对应」失败 |

> **三处都漏不掉**——每一处都有响亮的失败。元数据只此一份（`shared/` 两侧都能 import），
> 前端 `src/components/DeepAnalysis/master-meta.ts` 只做取用，**不要往那里加数据**。

可选第 4 处：`shared/constants.ts` 的 `DEFAULT_SELECTED_MASTERS`（当前是 `warren-buffett` / `ben-graham` / `michael-burry` / `cathie-wood` / `aswath-damodaran` 五位）。仅当用户明确要把新大师设为默认选中时才加——13 位全默认会让每次深度分析都跑满 LLM 调用。

## 实施步骤

### 1. 读取参考模板

读 `sidecar/agents/masters/ben-graham.ts` 作结构参考，读 `shared/types/masters.ts` 确认 `MasterMeta`，读 `sidecar/agents/types.ts` 确认 `MasterAgent` / `MasterAnalysisContext`。

### 2. 登记元数据（第 1 处）

`shared/constants.ts` 的 `MASTER_META` 数组追加，恰好五个字段：`id` / `name` / `nameZh` / `style` / `styleZh`。**没有 `description` 字段**，多写会编译报错。数组顺序即前端设置页的展示顺序。

### 3. 创建大师文件（第 2 处）

`sidecar/agents/masters/<id>.ts`：

- **`const meta = masterMetaById('<id>');`** —— 从 shared 取，不要在这里写字面量。
  ```ts
  import { masterMetaById } from '../../../shared/constants';
  ```
- **`SYSTEM_PROMPT`** —— 用该大师第一人称口吻，含分析框架、信号规则（bullish/bearish/neutral）、置信度标准；结尾要求只返回 `{"signal": "...", "confidence": 0-100, "reasoning": "..."}`。
  语言指令由 `createMasterAgent` 自动追加（`LANG_INSTRUCTION`），**prompt 里不要自己写「请用中文回答」**。
- **`buildUserPrompt(ctx: MasterAnalysisContext)`** —— 从 `ctx.quant` / `ctx.news` 提取数据。复用 `factory.ts` 的两个辅助函数，别手搓格式化：
  ```ts
  import { createMasterAgent, formatFactorsForPrompt, formatNewsForPrompt } from './factory';
  ```
  按该大师的视角**挑选**因子（价值派看估值/负债，成长派看营收增速/研发），不要无差别塞全部字段。
- 末尾：`export const agent = createMasterAgent(meta, SYSTEM_PROMPT, buildUserPrompt);`
- 行内注释用**简体中文**。

### 4. 注册（第 3 处）

**`sidecar/agents/registry.ts`**：
```ts
import { agent as <camelId> } from './masters/<id>';
// REGISTRY Map 中追加：
[<camelId>.meta.id, <camelId>],
```

### 5. 验证

```bash
cd sidecar && bun test agents
```

```bash
bunx tsc --noEmit
```

`masters-common.test.ts` 先跑「三处登记必须彼此一致」双向校验（目录 ↔ MASTER_META ↔ registry），再对每位大师跑公共契约测试（meta 完整性、prompt 构建不崩、解析容错）。三处齐全时全绿，漏任何一处都会指名道姓地失败——不必再手工核对两份 meta 是否逐字一致。
