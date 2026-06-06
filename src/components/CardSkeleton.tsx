import React from 'react';

/** 卡片加载骨架：量化/估值/风险等信息卡共用，避免各卡重复同一骨架结构 */
const CardSkeleton: React.FC<{ titleWidth?: string }> = ({ titleWidth = 'w-24' }) => (
  <div className="mb-6 p-4 bg-white/5 rounded-2xl border border-white/5 animate-pulse">
    <div className={`h-4 bg-white/10 rounded ${titleWidth} mb-3`} />
    <div className="h-3 bg-white/10 rounded w-full" />
  </div>
);

export default CardSkeleton;
