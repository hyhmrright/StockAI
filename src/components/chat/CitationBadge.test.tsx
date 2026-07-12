import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom';
import ChatPanel from '../ChatPanel';
import { reportPositionLabel } from './CitationBadge';
import type { ChatMessage, StockNews } from '../../../shared/types';

const noop = () => {};

function renderPanel(messages: ChatMessage[], newsRef?: StockNews[]) {
  return render(
    <ChatPanel
      messages={messages}
      sending={false}
      error={null}
      newsRef={newsRef}
      onAsk={noop}
      onReset={noop}
    />,
  );
}

describe('ChatPanel 溯源角标渲染', () => {
  it('assistant 消息带 citation → 出现角标，点击弹出 snippet', () => {
    const messages: ChatMessage[] = [
      {
        role: 'assistant',
        content: '基本面稳健[[cite:0]]。',
        citations: [
          { index: 0, sourceType: 'quant', sourceRef: 'summary', snippet: '综合 72/100（看涨）' },
        ],
      },
    ];
    renderPanel(messages);

    // 角标可见（label 派生为「量化评分」），snippet 默认隐藏
    const badge = screen.getByRole('button', { name: '查看引用来源' });
    expect(badge).toBeInTheDocument();
    expect(screen.queryByText('综合 72/100（看涨）')).not.toBeInTheDocument();

    // 点击展开 popover
    fireEvent.click(badge);
    expect(screen.getByText('综合 72/100（看涨）')).toBeInTheDocument();
    expect(screen.getByText('量化评分')).toBeInTheDocument();
  });

  it('无 citations → 纯文本，无角标', () => {
    renderPanel([{ role: 'assistant', content: '这是一段没有来源的回答。' }]);
    expect(screen.getByText('这是一段没有来源的回答。')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '查看引用来源' })).not.toBeInTheDocument();
  });

  it('越界 [[cite:99]] → 静默丢弃，不渲染角标也不泄漏原始 token', () => {
    const messages: ChatMessage[] = [
      {
        role: 'assistant',
        content: '一个越界引用[[cite:99]]的句子。',
        citations: [{ index: 0, sourceType: 'news', sourceRef: 1, snippet: '真实新闻标题' }],
      },
    ];
    renderPanel(messages);
    // 不崩溃，正文文本仍在，且不含原始 token
    expect(screen.getByText(/一个越界引用/)).toBeInTheDocument();
    expect(screen.queryByText(/\[\[cite:99\]\]/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '查看引用来源' })).not.toBeInTheDocument();
  });

  it('news 角标 → popover 用本地 newsRef 补原文链接与日期', () => {
    const news: StockNews[] = [
      {
        title: '公司发布季度财报',
        source: '财联社',
        date: '2026-07-10',
        content: '',
        url: 'https://example.com/a',
      },
    ];
    const messages: ChatMessage[] = [
      {
        role: 'assistant',
        content: '财报超预期[[cite:0]]。',
        citations: [{ index: 0, sourceType: 'news', sourceRef: 1, snippet: '公司发布季度财报' }],
      },
    ];
    renderPanel(messages, news);

    fireEvent.click(screen.getByRole('button', { name: '查看引用来源' }));
    expect(screen.getByText('新闻 #1')).toBeInTheDocument();
    expect(screen.getByText('财联社')).toBeInTheDocument();
    expect(screen.getByText('2026-07-10')).toBeInTheDocument();
    const link = screen.getByText('查看原文').closest('a');
    expect(link).toHaveAttribute('href', 'https://example.com/a');
  });

  it('report 角标 → popover 用 citation 自带 sourceMeta/sourceUrl 渲染来源行与原文链接', () => {
    const messages: ChatMessage[] = [
      {
        role: 'assistant',
        content: '营收增长主要来自高端产品放量[[cite:0]]。',
        citations: [
          {
            index: 0,
            sourceType: 'report',
            sourceRef: 1,
            snippet: '问：营收增长的主要驱动是什么？答：主要来自高端产品结构优化与渠道扩张。',
            sourceUrl: 'https://sns.sseinfo.com/company.do?stockcode=600519',
            sourceMeta: {
              title: '投资者互动问答',
              date: '2024-04-01',
              position: '问答 #7',
            },
          },
        ],
      },
    ];
    renderPanel(messages);

    fireEvent.click(screen.getByRole('button', { name: '查看引用来源' }));
    // label 派生为「投资者问答」（本地化的唯一来源；docTitle 是喂给 LLM 的中文 meta，不重复渲染）
    expect(screen.getByText('投资者问答')).toBeInTheDocument();
    expect(screen.queryByText('投资者互动问答')).not.toBeInTheDocument();
    // 来源行：日期直取 meta；position「问答 #7」转译为本地化「问答 #7」（zh 同形，验证走了 i18n key 而非原样透传）
    expect(screen.getByText('2024-04-01')).toBeInTheDocument();
    expect(screen.getByText('问答 #7')).toBeInTheDocument();
    // 「查看原文」链接取自 sourceUrl（交易所官方互动平台链接放行）
    const link = screen.getByText('查看原文').closest('a');
    expect(link).toHaveAttribute('href', 'https://sns.sseinfo.com/company.do?stockcode=600519');
  });

  it('javascript: 协议链接被拦截，不渲染查看原文', () => {
    const news: StockNews[] = [
      // 恶意协议，safeHref 应拦截
      { title: 't', source: 's', date: 'd', content: '', url: 'javascript:alert(1)' },
    ];
    const messages: ChatMessage[] = [
      {
        role: 'assistant',
        content: 'x[[cite:0]]',
        citations: [{ index: 0, sourceType: 'news', sourceRef: 1, snippet: 't' }],
      },
    ];
    renderPanel(messages, news);
    fireEvent.click(screen.getByRole('button', { name: '查看引用来源' }));
    expect(screen.queryByText('查看原文')).not.toBeInTheDocument();
  });

  it('user 消息不做角标切分（即便含 token 字面量也原样显示）', () => {
    renderPanel([{ role: 'user', content: '我问一个 [[cite:0]] 的问题' }]);
    expect(screen.getByText('我问一个 [[cite:0]] 的问题')).toBeInTheDocument();
  });
});

describe('reportPositionLabel', () => {
  it('从 sidecar 写死的中文「问答 #N」提取序号，走 i18n key 而非原样透传', () => {
    const calls: Array<[string, unknown]> = [];
    const t = ((key: string, vars?: unknown) => {
      calls.push([key, vars]);
      return `translated:${key}:${JSON.stringify(vars)}`;
    }) as Parameters<typeof reportPositionLabel>[1];

    const result = reportPositionLabel('问答 #7', t);

    expect(calls).toEqual([['chat_citation_report_position', { n: '7' }]]);
    expect(result).toBe('translated:chat_citation_report_position:{"n":"7"}');
    expect(result).not.toBe('问答 #7'); // 不是原字符串透传
  });

  it('无序号（无 position）→ null，不调用 t', () => {
    const t = vi.fn() as unknown as Parameters<typeof reportPositionLabel>[1];
    expect(reportPositionLabel(undefined, t)).toBeNull();
    expect(t).not.toHaveBeenCalled();
  });

  it('position 不含数字 → null', () => {
    const t = vi.fn() as unknown as Parameters<typeof reportPositionLabel>[1];
    expect(reportPositionLabel('无编号', t)).toBeNull();
  });
});
