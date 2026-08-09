import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Building2 } from 'lucide-react';
import { useLanguage } from '../../hooks/useLanguage';
import { detectMarket } from '../../../shared/market';
import CompanyDetails from './CompanyDetails';

/**
 * 公司资料（F10）折叠区。
 *
 * 两条约束决定了这个形态：
 *  - **仅 A 股**：数据源是交易所 F10 披露，美股没有对应形态，故非 A 股整块不渲染，
 *    而不是展开后再报「不支持」——后者让用户白点一次。
 *  - **默认折叠、展开才拉**：一次 F10 是四发请求。切标的时自动拉四发，
 *    只为一块多数人不会展开的参考资料，不划算。
 *
 * `key={symbol}` 让换标的时整块重挂载：CompanyDetails 内部用的 useAsyncOnce
 * 只在挂载时取一次，靠重挂载完成换股重取，同时顺带把展开态收回。
 */
const CompanySection: React.FC<{ symbol: string }> = ({ symbol }) => {
  const { t } = useLanguage();
  const [expanded, setExpanded] = useState(false);

  if (detectMarket(symbol) !== 'A股') return null;

  return (
    <div className="mt-8 border-t border-white/5 pt-4">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-gray-500 transition-colors hover:text-gray-300"
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5" />
        )}
        <Building2 className="h-3.5 w-3.5" />
        {t('f10_title')}
      </button>

      {expanded && (
        <div className="mt-4">
          <CompanyDetails key={symbol} symbol={symbol} />
        </div>
      )}
    </div>
  );
};

export default CompanySection;
