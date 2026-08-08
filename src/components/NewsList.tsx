import React from 'react';
import { useLanguage } from '../hooks/useLanguage';
import type { StockNews } from '../../shared/types';

/** 最新新闻列表（纯展示，从 Dashboard 抽出以收敛组件行数）；空数组时不渲染 */
const NewsList: React.FC<{ news: StockNews[] }> = ({ news }) => {
  const { t } = useLanguage();
  if (news.length === 0) return null;

  return (
    <div className="mt-10">
      <h2 className="text-gray-400 text-xs font-bold mb-6 uppercase tracking-widest">
        {t('latest_news')}
      </h2>
      <div className="space-y-4">
        {news.map((n, i) => (
          <a
            key={i}
            href={n.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block p-5 bg-panel rounded-2xl border border-white/5 hover:border-emerald-500/30 transition-all group"
          >
            <div className="text-xs text-emerald-500 mb-2 font-mono flex justify-between">
              <span>{n.source}</span>
              <span className="text-gray-500">{n.date}</span>
            </div>
            <div className="text-base font-bold group-hover:text-emerald-400 transition-colors">
              {n.title}
            </div>
          </a>
        ))}
      </div>
    </div>
  );
};

export default NewsList;
