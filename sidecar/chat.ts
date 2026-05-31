import OpenAI from 'openai';
import { PROVIDER_PROFILES } from '../shared/constants';
import type { ProviderType, ChatPayload, Language } from '../shared/types';

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
  zh: (s) => `你是专业的股票投资分析助手，正在与用户讨论股票 ${s}。请基于下方提供的上下文（新闻、量化评分、已有分析）回答用户的追问。要求：只依据给定事实，不要编造财务数据或新闻；事实不足时如实说明；回答简洁、口语化，用中文。`,
  en: (s) => `You are a professional stock investment assistant discussing ${s} with the user. Answer follow-up questions based only on the context below (news, quant scores, prior analysis). Do not fabricate financial data or news; say so when facts are insufficient. Be concise and conversational, in English.`,
  ja: (s) => `あなたは株式投資の専門アシスタントで、ユーザーと銘柄 ${s} について議論しています。以下のコンテキスト（ニュース、定量スコア、既存の分析）のみに基づいて追加質問に答えてください。財務データやニュースを捏造せず、事実が不足する場合はその旨を述べてください。簡潔かつ会話的に、日本語で回答してください。`,
};

const CONTEXT_LABELS: Record<Language, { news: string; quant: string; analysis: string; none: string }> = {
  zh: { news: '近期新闻', quant: '量化评分', analysis: '已有分析结论', none: '（暂无额外上下文）' },
  en: { news: 'Recent news', quant: 'Quant score', analysis: 'Prior analysis', none: '(no extra context)' },
  ja: { news: '最近のニュース', quant: '定量スコア', analysis: '既存の分析', none: '（追加コンテキストなし）' },
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
  const system = `${SYSTEM_INTRO[lang](payload.symbol)}\n\n${buildContextBlock(payload, lang)}`;
  const history: LLMMessage[] = payload.history.map(m => ({ role: m.role, content: m.content }));
  return [{ role: 'system', content: system }, ...history, { role: 'user', content: payload.question }];
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
