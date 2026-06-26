import React, { useState } from 'react';
import { Send, Loader2, Trash2 } from 'lucide-react';
import clsx from 'clsx';
import type { ChatMessage } from '../../shared/types';
import { useLanguage } from '../hooks/useLanguage';

interface ChatPanelProps {
  messages: ChatMessage[];
  sending: boolean;
  error: string | null;
  disabled?: boolean; // 无新闻上下文时不可用
  onAsk: (question: string) => void;
  onReset: () => void;
}

/** 对话式追问面板：基于当前股票已抓上下文做多轮问答 */
const ChatPanel: React.FC<ChatPanelProps> = ({
  messages,
  sending,
  error,
  disabled,
  onAsk,
  onReset,
}) => {
  const { t } = useLanguage();
  const [input, setInput] = useState('');

  const submit = () => {
    const q = input.trim();
    if (!q || sending || disabled) return;
    onAsk(q);
    setInput('');
  };

  return (
    <div className="mt-6 border-t border-gray-700/60 pt-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-gray-400 text-xs font-bold uppercase tracking-widest">
          {t('chat_title')}
        </h2>
        {messages.length > 0 && (
          <button
            onClick={onReset}
            className="text-gray-500 hover:text-gray-300 transition-colors"
            title={t('chat_reset')}
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>

      <div className="space-y-2 max-h-72 overflow-y-auto mb-3">
        {messages.length === 0 && (
          <p className="text-gray-500 text-xs leading-relaxed">{t('chat_empty')}</p>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={clsx('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}
          >
            <div
              className={clsx(
                'max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words',
                m.role === 'user' ? 'bg-blue-600/80 text-white' : 'bg-gray-700/60 text-gray-200',
              )}
            >
              {m.content}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex items-center gap-2 text-gray-400 text-xs">
            <Loader2 size={14} className="animate-spin" />
            {t('chat_sending')}
          </div>
        )}
      </div>

      {error && <p className="text-rose-400 text-xs mb-2">{error}</p>}

      <div className="flex items-center gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
          placeholder={disabled ? t('chat_need_data') : t('chat_placeholder')}
          disabled={disabled || sending}
          className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500 disabled:opacity-50"
        />
        <button
          onClick={submit}
          disabled={disabled || sending || !input.trim()}
          className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg p-2 transition-colors"
          title={t('chat_send')}
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
};

export default ChatPanel;
