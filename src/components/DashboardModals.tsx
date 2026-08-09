import React, { useState } from 'react';
import { SettingsModal } from './SettingsModal';
import OnboardingGuide from './OnboardingGuide';
import NlScreenerModal from './Screener/NlScreenerModal';
import PortfolioModal from './Portfolio/PortfolioModal';
import MarketOverviewModal from './Market/MarketOverviewModal';
import { useSettings } from '../hooks/useSettings';
import type { ModalName } from '../hooks/useModalRouter';

interface Props {
  active: ModalName | null;
  onOpen: (name: ModalName) => void;
  onClose: () => void;
  /** 浮层内选中标的 → 切换主视图（浮层自行关闭） */
  onSelect: (symbol: string) => void;
}

/**
 * Dashboard 的全部全屏浮层，连同各自的挂载策略。
 *
 * 抽出来是为了让 Dashboard 只管「三栏布局 + 标的路由」这一件事——浮层的开合、
 * 首启引导的显示条件都不该占据主布局的篇幅。
 *
 * 挂载策略有两种，按浮层自身开销区分：
 *  - 内部持有表单态、需要跨开合保留的（设置 / 选股）走 `isOpen` 常驻挂载
 *  - 一打开就拉数据的（持仓 / 市场概览）条件挂载，不开就完全不跑
 */
const DashboardModals: React.FC<Props> = ({ active, onOpen, onClose, onSelect }) => {
  const { needsSetup } = useSettings();
  // 引导只在本次运行内可关：不落盘「已看过」，因为真正的退出条件是保存一次配置——
  // 保存后 needsSetup 会经 useSettings 单例回落，引导自行消失。
  const [guideDismissed, setGuideDismissed] = useState(false);

  // 浮层内选中标的：切换主视图并关闭自己
  const selectAndClose = (symbol: string) => {
    onSelect(symbol);
    onClose();
  };

  return (
    <>
      <SettingsModal isOpen={active === 'settings'} onClose={onClose} />

      {/* 选股模态选中结果行后自己会调 onClose，故这里传裸 onSelect 而非 selectAndClose */}
      <NlScreenerModal isOpen={active === 'screener'} onClose={onClose} onSelect={onSelect} />

      {active === 'portfolio' && <PortfolioModal onClose={onClose} onSelect={selectAndClose} />}

      {active === 'overview' && <MarketOverviewModal onClose={onClose} onSelect={selectAndClose} />}

      {/* 首启引导：从未保存过配置时挡在最前，指路到设置面板 */}
      <OnboardingGuide
        isOpen={needsSetup && !guideDismissed}
        onConfigure={() => {
          setGuideDismissed(true);
          onOpen('settings');
        }}
        onDismiss={() => setGuideDismissed(true)}
      />
    </>
  );
};

export default DashboardModals;
