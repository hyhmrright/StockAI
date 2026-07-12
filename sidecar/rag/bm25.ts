import type { ReportChunk } from '../../shared/types';
import type { ReportIndexFile } from './types';

/**
 * 纯 TS BM25：CJK 字符 bigram 分词 + 标准 BM25 检索。
 *
 * 为什么不用 bun:sqlite FTS5：内置 unicode61 不切中文词，CJK 召回退化；jieba 引入原生依赖。
 * 纯 TS bigram + BM25 约百行、确定性、可离线单测、无原生依赖——最契合本仓「解析层离线可测」约定。
 * 无 IO：buildIndex/query 皆纯函数，index.test.ts 可全 hermetic。
 */

const K1 = 1.5; // 词频饱和参数
const B = 0.75; // 文档长度归一化强度

/**
 * 分词：中文按字符 bigram（单字段落退化为 unigram），英文/数字按词并小写归一。
 * bigram 兼顾无分词器下的中文召回：「营收」「收下」「下滑」覆盖「营收下滑」的连续二元组。
 */
export function tokenize(text: string): string[] {
  const tokens: string[] = [];
  // 连续 CJK 段 或 连续 ASCII 字母数字段（其余字符——标点/空白——作分隔符丢弃）；matchAll 避免手写 exec 循环漏推进
  for (const match of text.matchAll(/[一-鿿]+|[a-zA-Z0-9]+/g)) {
    const seg = match[0];
    if (seg.charCodeAt(0) >= 0x4e00 && seg.charCodeAt(0) <= 0x9fff) {
      if (seg.length === 1) tokens.push(seg);
      else for (let i = 0; i < seg.length - 1; i++) tokens.push(seg.slice(i, i + 2));
    } else {
      tokens.push(seg.toLowerCase());
    }
  }
  return tokens;
}

/**
 * 建索引（不含 IO）：把 chunks 分词，构建倒排 postings / 文档频率 df / 长度归一化所需的 lens、avgLen。
 * df 为「命中该 term 的 chunk 数」（同一 chunk 内重复 term 只计一次）。
 */
export function buildIndex(symbol: string, chunks: ReportChunk[]): ReportIndexFile {
  const postings: Record<string, number[]> = {};
  const df: Record<string, number> = {};
  const lens: number[] = [];
  let totalLen = 0;

  chunks.forEach((chunk, idx) => {
    const terms = tokenize(chunk.text);
    lens.push(terms.length);
    totalLen += terms.length;
    const seen = new Set<string>();
    for (const term of terms) {
      if (seen.has(term)) continue;
      seen.add(term);
      (postings[term] ??= []).push(idx);
      df[term] = (df[term] ?? 0) + 1;
    }
  });

  const avgLen = chunks.length > 0 ? totalLen / chunks.length : 0;
  return { symbol, builtAt: Date.now(), chunks, postings, df, avgLen, lens };
}

/**
 * BM25 查询：返回 top-K { chunkIndex, score }（score 降序）。
 * - idf 用 log(1 + (N-df+0.5)/(df+0.5)) 变体，恒非负，避免高频词产生负分污染阈值判定。
 * - 只返回 score>0 的 chunk：查询词与任何 chunk 无交集（如非财报类问题）→ 返回空数组。
 */
export function query(
  index: ReportIndexFile,
  question: string,
  k = 4,
): { chunkIndex: number; score: number }[] {
  const N = index.chunks.length;
  if (N === 0) return [];
  const qTerms = tokenize(question);
  if (qTerms.length === 0) return [];

  // 逐 chunk 累加 BM25 分：只遍历查询词命中的倒排，避免全表扫描
  const scores = new Map<number, number>();
  // 查询词去重（同一 term 多次出现不重复叠加 idf 贡献）
  const uniqueQTerms = [...new Set(qTerms)];

  for (const term of uniqueQTerms) {
    const posting = index.postings[term];
    if (!posting?.length) continue;
    const df = index.df[term] ?? posting.length;
    const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));

    for (const chunkIdx of posting) {
      // chunk 内该 term 的词频：postings 只记「命中」不记频次，故重算 tf
      const tf = termFreq(index.chunks[chunkIdx].text, term);
      const len = index.lens[chunkIdx] || 1;
      const norm = tf * (K1 + 1);
      const denom = tf + K1 * (1 - B + (B * len) / (index.avgLen || 1));
      scores.set(chunkIdx, (scores.get(chunkIdx) ?? 0) + idf * (norm / denom));
    }
  }

  return [...scores.entries()]
    .filter(([, score]) => score > 0)
    .map(([chunkIndex, score]) => ({ chunkIndex, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

/** 单 chunk 内某 term 的出现次数（bigram 命中计数，与 tokenize 口径一致） */
function termFreq(text: string, term: string): number {
  const terms = tokenize(text);
  let count = 0;
  for (const t of terms) if (t === term) count++;
  return count;
}
