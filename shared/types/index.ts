// 跨层共享的数据类型定义（前端 + Sidecar 的唯一来源）。
//
// 本文件是 barrel：按界限上下文分文件存放，此处统一 re-export，
// 所有调用点一律 `from '../shared/types'`，不要直接 import 子文件——
// 子文件划分是内部组织，barrel 才是对外契约。
export * from './envelope'; // 服务响应信封（stdout ↔ Rust ↔ 前端协议）
export * from './provider'; // AI Provider / 角色分级模型 / 语言
export * from './stock'; // 标的与行情：新闻、基本信息、搜索、K 线、报价
export * from './quant'; // 量化四维评分、资金流、关键价位、全市场横截面
export * from './chat'; // 对话式追问与溯源角标（含财报 RAG 片段）
export * from './masters'; // 投资大师多智能体与虚拟组合前向跟踪
export * from './backtest'; // 策略回测
export * from './screener'; // 自选股扫描 + 全市场自然语言选股
export * from './history'; // 本地分析历史（SQLite）
export * from './portfolio'; // 用户真实持仓与组合估值
export * from './company'; // 公司基本资料 F10（仅 A 股）：概况、主营构成、股东结构
