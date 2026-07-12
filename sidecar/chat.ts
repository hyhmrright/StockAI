import OpenAI from 'openai';
import { PROVIDER_PROFILES } from '../shared/constants';
import type {
  ProviderType,
  ChatPayload,
  ChatCitation,
  CitationSourceType,
  Language,
} from '../shared/types';

/** OpenAI 风格消息（含 system，与 shared 的 ChatMessage 区分——后者是不含 system 的对外历史） */
export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatClientConfig {
  provider: string;
  apiKey: string;
  baseUrl: string;
  modelName: string;
}

/** 测试注入点：替换底层 completion，避开真实网络与 bun:test 的 mock.module 跨文件泄漏 */
export interface ChatCompletionDep {
  complete: (messages: LLMMessage[]) => Promise<string>;
}

const SYSTEM_INTRO: Record<Language, (symbol: string) => string> = {
  zh: (s) =>
    `你是专业的股票投资分析助手，正在与用户讨论股票 ${s}。请基于下方提供的上下文（新闻、量化评分、已有分析）回答用户的追问。要求：只依据给定事实，不要编造财务数据或新闻；事实不足时如实说明；回答简洁、口语化，用中文。`,
  en: (s) =>
    `You are a professional stock investment assistant discussing ${s} with the user. Answer follow-up questions based only on the context below (news, quant scores, prior analysis). Do not fabricate financial data or news; say so when facts are insufficient. Be concise and conversational, in English.`,
  ja: (s) =>
    `あなたは株式投資の専門アシスタントで、ユーザーと銘柄 ${s} について議論しています。以下のコンテキスト（ニュース、定量スコア、既存の分析）のみに基づいて追加質問に答えてください。財務データやニュースを捏造せず、事実が不足する場合はその旨を述べてください。簡潔かつ会話的に、日本語で回答してください。`,
};

const CONTEXT_LABELS: Record<
  Language,
  { news: string; quant: string; analysis: string; none: string }
> = {
  zh: { news: '近期新闻', quant: '量化评分', analysis: '已有分析结论', none: '（暂无额外上下文）' },
  en: {
    news: 'Recent news',
    quant: 'Quant score',
    analysis: 'Prior analysis',
    none: '(no extra context)',
  },
  ja: {
    news: '最近のニュース',
    quant: '定量スコア',
    analysis: '既存の分析',
    none: '（追加コンテキストなし）',
  },
};

/**
 * 溯源标注指令（追加在上下文之后，让 LLM 看到编号后的新闻再学标注规则）。
 * marker 用 ASCII 结构 token（不用各语言「来源」字样），避免模型本地化导致解析漂移；
 * 三语仅解释含义。校验与改写在 extractCitations，LLM 标错/越界会被静默删除，故指令宽松即可。
 */
const CITATION_GUIDE: Record<Language, string> = {
  zh: '标注规则：若某条论断直接来自上方某条上下文，请在该论断句末紧跟来源标记——引用第 N 条新闻用 [src:news:N]（N 为上方新闻列表中的可见编号），引用量化评分用 [src:quant]，引用已有分析结论用 [src:analysis]。仅在确有对应来源时标注；不确定或来源不明时不要标注。标记须原样输出，不要翻译或改写方括号内的内容。',
  en: 'Citation rules: if a statement comes directly from one of the context items above, append a source marker right after it — use [src:news:N] to cite the N-th news item (N is the visible number in the news list above), [src:quant] for the quant score, [src:analysis] for the prior analysis. Only annotate when a matching source truly exists; do not annotate when unsure or when there is no clear source. Output the marker verbatim; do not translate or alter what is inside the brackets.',
  ja: '引用ルール：ある主張が上記コンテキストのいずれかに直接基づく場合、その主張の直後にソースマーカーを付けてください——N番目のニュースを引用するには [src:news:N]（N は上記ニュース一覧の可視番号）、定量スコアには [src:quant]、既存の分析には [src:analysis] を使います。対応するソースが確実にある場合のみ付与し、不確かな場合やソースが明確でない場合は付けないでください。マーカーはそのまま出力し、角括弧内の内容を翻訳・改変しないでください。',
};

/** 把上下文拼成 system prompt 的事实段 */
function buildContextBlock(payload: ChatPayload, lang: Language): string {
  const L = CONTEXT_LABELS[lang];
  const { context } = payload;
  const parts: string[] = [];
  if (context.newsTitles?.length) {
    parts.push(`[${L.news}]\n${context.newsTitles.map((t, i) => `${i + 1}. ${t}`).join('\n')}`);
  }
  if (context.quantSummary) parts.push(`[${L.quant}]\n${context.quantSummary}`);
  if (context.analysisSummary) parts.push(`[${L.analysis}]\n${context.analysisSummary}`);
  return parts.length ? parts.join('\n\n') : L.none;
}

/** 构建发给 LLM 的完整消息序列：system(角色+上下文) + 多轮历史 + 本次问题 */
export function buildChatMessages(payload: ChatPayload, language?: Language): LLMMessage[] {
  const lang = language ?? 'zh';
  const system = `${SYSTEM_INTRO[lang](payload.symbol)}\n\n${buildContextBlock(payload, lang)}\n\n${CITATION_GUIDE[lang]}`;
  const history: LLMMessage[] = payload.history.map((m) => ({ role: m.role, content: m.content }));
  return [
    { role: 'system', content: system },
    ...history,
    { role: 'user', content: payload.question },
  ];
}

/** 纯文本多轮对话补全（不强制 json_object，返回自然语言回答） */
export async function runChat(
  config: ChatClientConfig,
  messages: LLMMessage[],
  dep?: ChatCompletionDep,
): Promise<string> {
  if (dep) return dep.complete(messages);
  const client = new OpenAI({ apiKey: config.apiKey, baseURL: config.baseUrl });
  const profile = PROVIDER_PROFILES[config.provider as ProviderType] ?? PROVIDER_PROFILES.openai;
  const response = await client.chat.completions.create(
    {
      model: config.modelName,
      messages: messages as OpenAI.ChatCompletionMessageParam[],
    },
    { timeout: profile.timeout },
  );
  return response.choices[0]?.message?.content ?? '';
}

/** 匹配 LLM 产出的合法结构 token（news:N / quant / analysis），大小写不敏感 */
const CITE_TOKEN = /\[src:(?:news:(\d+)|quant|analysis)\]/gi;
/** 兜底：任何 [src:...] 形状的残留（如 [src:foobar] / [src:news:]），清除避免原始标记泄漏 */
const CITE_RESIDUAL = /\[src:[^\]]*\]/gi;

/**
 * 纯函数：解析 LLM 回答里的内联溯源标记，逐个「校验→改写/删除」，返回清洗后的正文 + 校验通过的 citations。
 *
 * 关键红线（错误来源比无来源更糟）：
 * - 校验对象一律是本次 payload.context 的真实字段，绝不信任 LLM 声称的内容；
 * - 越界 / 上下文缺席的标记 → 用 '' 替换（静默降级，不产生 citation、不渲染角标）；
 * - 合法标记 → 改写为 [[cite:idx]]，snippet 从 context 取真实值；同一来源多次引用去重复用同一 idx；
 * - 兜底清除任何未匹配已知类型的残留 [src:...]，前端只认 [[cite:N]]，永不接触原始 LLM 标记。
 *
 * 无 IO、不接触 config/apiKey、不抛异常；reply 为空或 context 为空均安全返回 { reply, citations:[] }。
 */
export function extractCitations(
  reply: string,
  payload: ChatPayload,
): { reply: string; citations: ChatCitation[] } {
  if (!reply) return { reply: reply ?? '', citations: [] };

  const context = payload?.context ?? {};
  const citations: ChatCitation[] = [];
  const dedupe = new Map<string, number>(); // key(sourceType:sourceRef) → citation 下标

  const rewritten = reply.replace(CITE_TOKEN, (match: string, newsNum?: string) => {
    let sourceType: CitationSourceType;
    let sourceRef: number | string;
    let snippet: string;

    if (newsNum !== undefined) {
      // news:N —— N 为 1-based，越界（含 0）即非法
      const n = Number(newsNum);
      const titles = context.newsTitles;
      if (!titles?.length || n < 1 || n > titles.length) return '';
      sourceType = 'news';
      sourceRef = n;
      snippet = titles[n - 1];
    } else if (/quant/i.test(match)) {
      if (!context.quantSummary) return '';
      sourceType = 'quant';
      sourceRef = 'summary';
      snippet = context.quantSummary;
    } else {
      // analysis
      if (!context.analysisSummary) return '';
      sourceType = 'analysis';
      sourceRef = 'summary';
      snippet = context.analysisSummary;
    }

    const key = `${sourceType}:${sourceRef}`;
    let idx = dedupe.get(key);
    if (idx === undefined) {
      idx = citations.length;
      dedupe.set(key, idx);
      citations.push({ index: idx, sourceType, sourceRef, snippet });
    }
    return `[[cite:${idx}]]`;
  });

  // 兜底：清除任何未匹配已知类型的残留标记，正文其余部分完整保留
  const cleaned = rewritten.replace(CITE_RESIDUAL, '');
  return { reply: cleaned, citations };
}
