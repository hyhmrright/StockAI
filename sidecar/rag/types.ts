import type { ReportChunk } from '../../shared/types';

/**
 * RAG 子系统的 sidecar 内部类型（不跨层，不进 shared/types.ts）。
 * 跨层的 ReportChunk 定义在 shared/types.ts——本模块仅 import 消费，不重复声明。
 */

/**
 * 按 symbol 一份的磁盘 JSON 索引（落 stockai-report-index-cache）。
 * chunks 带原文+元信息；postings/df/avgLen/lens 为纯 TS BM25 的倒排结构。
 */
export interface ReportIndexFile {
  symbol: string;
  builtAt: number; // 建索引时刻（Unix 毫秒）
  chunks: ReportChunk[];
  postings: Record<string, number[]>; // term → chunk 下标列表（倒排）
  df: Record<string, number>; // term → 文档频率（去重后每 term 命中的 chunk 数）
  avgLen: number; // 平均 chunk 分词长度（BM25 归一化）
  lens: number[]; // 每 chunk 分词长度
}
