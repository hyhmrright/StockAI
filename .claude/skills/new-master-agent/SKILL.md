---
name: new-master-agent
description: 在 sidecar/agents/masters/ 新增投资大师 Agent，覆盖实现、registry 注册、公共测试清单与前端 meta 副本四处
---

# 新增投资大师 Agent

向用户询问以下信息（若已在请求中提供则跳过）：

- **大师 ID**：英文 kebab-case，如 `george-soros`
- **英文姓名 / 中文姓名**：如 `George Soros` / `乔治·索罗斯`
- **投资风格（英/中）**：如 `Macro Trading` / `宏观交易`
- **核心理念**：2–3 句话描述其投资哲学（写进 SYSTEM_PROMPT）
- **是否加入默认选中列表**（当前默认 5 位，见下）

## 四处改动

| # | 文件 | 内容 | 漏了会怎样 |
|---|------|------|-----------|
| 1 | `sidecar/agents/masters/<id>.ts` | 新建实现 | —— |
| 2 | `sidecar/agents/registry.ts` | import + `REGISTRY` Map 追加 | 大师不参与分析 |
| 3 | `sidecar/agents/masters/masters-common.test.ts` | `ALL_MASTER_FILES` 数组追加 | ⚠️ **测试不会失败**，新大师静默漏出公共测试覆盖 |
| 4 | `src/components/DeepAnalysis/master-meta.ts` | `MASTER_META` 数组追加 | ⚠️ **不报错**：前端展示不出姓名/风格 |

> 第 4 处是 meta 的第二份副本——前端不能 import `sidecar/`（单向依赖），当前只能各存一份。新增时**两边字段必须逐字一致**。

可选第 5 处：`shared/constants.ts` 的 `DEFAULT_SELECTED_MASTERS`（当前是 `warren-buffett` / `ben-graham` / `michael-burry` / `cathie-wood` / `aswath-damodaran` 五位）。仅当用户明确要把新大师设为默认选中时才加——13 位全默认会让每次深度分析都跑满 LLM 调用。

## 实施步骤

### 1. 读取参考模板

读 `sidecar/agents/masters/ben-graham.ts` 作结构参考，读 `shared/types/masters.ts` 确认 `MasterMeta`，读 `sidecar/agents/types.ts` 确认 `MasterAgent` / `MasterAnalysisContext`。

### 2. 创建大师文件

`sidecar/agents/masters/<id>.ts`：

- **`meta: MasterMeta`** —— 恰好五个字段：`id` / `name` / `nameZh` / `style` / `styleZh`。**没有 `description` 字段**，多写会编译报错。
- **`SYSTEM_PROMPT`** —— 用该大师第一人称口吻，含分析框架、信号规则（bullish/bearish/neutral）、置信度标准；结尾要求只返回 `{"signal": "...", "confidence": 0-100, "reasoning": "..."}`。
  语言指令由 `createMasterAgent` 自动追加（`LANG_INSTRUCTION`），**prompt 里不要自己写「请用中文回答」**。
- **`buildUserPrompt(ctx: MasterAnalysisContext)`** —— 从 `ctx.quant` / `ctx.news` 提取数据。复用 `factory.ts` 的两个辅助函数，别手搓格式化：
  ```ts
  import { createMasterAgent, formatFactorsForPrompt, formatNewsForPrompt } from './factory';
  ```
  按该大师的视角**挑选**因子（价值派看估值/负债，成长派看营收增速/研发），不要无差别塞全部字段。
- 末尾：`export const agent = createMasterAgent(meta, SYSTEM_PROMPT, buildUserPrompt);`
- 行内注释用**简体中文**。

### 3. 注册（第 2–4 处）

**`sidecar/agents/registry.ts`**：
```ts
import { agent as <camelId> } from './masters/<id>';
// REGISTRY Map 中追加：
[<camelId>.meta.id, <camelId>],
```

**`sidecar/agents/masters/masters-common.test.ts`**：在 `ALL_MASTER_FILES` 数组追加 `'<id>'`。

**`src/components/DeepAnalysis/master-meta.ts`**：在 `MASTER_META` 数组追加与第 2 步 `meta` **完全相同**的五字段对象。

### 4. 验证

```bash
cd sidecar && bun test agents
bun tsc --noEmit
```

`masters-common.test.ts` 会对清单里每位大师跑公共契约测试（meta 完整性、prompt 构建不崩、解析容错）。确认输出里的大师数量已 +1——**数量没变说明第 3 处漏了**。

再核对两份 meta 一致：

```bash
python3 -c "
import re
s=open('sidecar/agents/masters/<id>.ts').read()
f=open('src/components/DeepAnalysis/master-meta.ts').read()
fields=dict(re.findall(r\"(\w+): '([^']*)'\", re.search(r'const meta[^{]*\{(.*?)\};', s, re.S).group(1)))
print(fields)
print('前端已同步:', all(f\"'{v}'\" in f for v in fields.values()))"
```
