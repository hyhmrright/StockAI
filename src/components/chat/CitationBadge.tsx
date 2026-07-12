import React, { useEffect, useRef, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import type { ChatCitation, StockNews } from '../../../shared/types';
import { useLanguage } from '../../hooks/useLanguage';

type TFn = ReturnType<typeof useLanguage>['t'];

// 按 sourceType 派生本地化 label（前端是 label 的唯一来源，sidecar 只回原始字段）
function citationLabel(c: ChatCitation, t: TFn): string {
  if (c.label) return c.label; // sidecar 若破例回了 label 则尊重
  switch (c.sourceType) {
    case 'news':
      return t('chat_citation_news', { n: c.sourceRef });
    case 'quant':
      return t('chat_citation_quant');
    case 'analysis':
      return t('chat_citation_analysis');
    default:
      return t('chat_citation_open_source');
  }
}

// 仅放行 http/https，挡掉 javascript: 等注入协议
function safeHref(url?: string): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

interface CitationBadgeProps {
  citation: ChatCitation;
  newsRef?: StockNews[]; // 供新闻角标补原文链接/日期
}

/** 可点击的上标溯源角标：点击弹出被引用的原文片段 */
const CitationBadge: React.FC<CitationBadgeProps> = ({ citation, newsRef }) => {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  // 点击外部关闭 popover
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const label = citationLabel(citation, t);
  // 新闻可用本地 newsRef 补链：sourceRef 为 1-based 序号，guard 越界
  const news =
    citation.sourceType === 'news' && typeof citation.sourceRef === 'number'
      ? newsRef?.[citation.sourceRef - 1]
      : undefined;
  const href = safeHref(news?.url);

  return (
    <span className="relative inline-block" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t('chat_citation_open_source')}
        title={label}
        className="align-super text-[10px] leading-none font-bold text-emerald-400 hover:text-emerald-300 ml-0.5 cursor-pointer"
      >
        [{citation.index + 1}]
      </button>
      {open && (
        <span className="absolute z-10 left-0 top-4 w-60 max-w-[80vw] rounded-lg border border-gray-600 bg-gray-800 p-3 text-xs text-gray-200 shadow-xl whitespace-normal">
          <span className="block font-bold text-emerald-400 mb-1">{label}</span>
          <span className="block text-gray-300 break-words">{citation.snippet}</span>
          {news && (
            <span className="mt-2 flex items-center justify-between text-[10px] text-gray-500">
              <span>{news.source}</span>
              <span>{news.date}</span>
            </span>
          )}
          {href && (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex items-center gap-1 text-emerald-400 hover:text-emerald-300"
            >
              <ExternalLink size={11} />
              {t('chat_citation_view_original')}
            </a>
          )}
        </span>
      )}
    </span>
  );
};

/**
 * 把 assistant 回答按 [[cite:N]] token 切分为「文本段 + 角标」。
 * N === citation.index；找不到对应 citation（越界/无效）则静默丢弃该 token，
 * 既不渲染角标也不把原始 token 泄漏进正文——错误来源比无来源更糟。
 */
export function renderChatContent(
  content: string,
  citations?: ChatCitation[],
  newsRef?: StockNews[],
): React.ReactNode {
  if (!citations?.length) return content; // 无角标：纯文本快路径
  const byIndex = new Map(citations.map((c) => [c.index, c]));
  const parts: React.ReactNode[] = [];
  const re = /\[\[cite:(\d+)\]\]/g;
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null = re.exec(content);
  while (m !== null) {
    if (m.index > last) parts.push(content.slice(last, m.index));
    const citation = byIndex.get(Number(m[1]));
    if (citation) {
      parts.push(<CitationBadge key={`c${key++}`} citation={citation} newsRef={newsRef} />);
    }
    last = m.index + m[0].length;
    m = re.exec(content);
  }
  if (last < content.length) parts.push(content.slice(last));
  return parts;
}

export default CitationBadge;
