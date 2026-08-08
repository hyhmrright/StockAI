import React from 'react';
import { Rocket, KeyRound, Search, Sparkles } from 'lucide-react';
import { useLanguage } from '../hooks/useLanguage';
import type { TranslationKey } from '../i18n';

interface OnboardingGuideProps {
  isOpen: boolean;
  /** 去设置：调用方负责同时关掉本引导并打开设置面板 */
  onConfigure: () => void;
  onDismiss: () => void;
}

/** 三步走的文案与图标；顺序即用户实际操作顺序 */
const STEPS: { icon: React.ElementType; titleKey: TranslationKey; descKey: TranslationKey }[] = [
  { icon: KeyRound, titleKey: 'onboarding_step1_title', descKey: 'onboarding_step1_desc' },
  { icon: Search, titleKey: 'onboarding_step2_title', descKey: 'onboarding_step2_desc' },
  { icon: Sparkles, titleKey: 'onboarding_step3_title', descKey: 'onboarding_step3_desc' },
];

/**
 * 首启引导：从未保存过配置时挡在主界面前。
 *
 * 为什么必须有：Rust 的 required_settings 在无 app_settings 时会拒掉**所有** sidecar 调用，
 * 新用户第一眼看到的是行情/量化/AI 一起报错，而错误文案里没有"去设置里保存一次"这条出路。
 */
export const OnboardingGuide: React.FC<OnboardingGuideProps> = ({
  isOpen,
  onConfigure,
  onDismiss,
}) => {
  const { t } = useLanguage();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-panel border border-white/10 rounded-2xl shadow-2xl w-full max-w-lg p-8 space-y-6 animate-in zoom-in-95 duration-200">
        <header className="space-y-2">
          <div className="w-11 h-11 rounded-xl bg-emerald-500/15 flex items-center justify-center">
            <Rocket className="w-5 h-5 text-emerald-400" />
          </div>
          <h2 className="text-xl font-bold text-gray-100">{t('onboarding_title')}</h2>
          <p className="text-sm text-gray-400 leading-relaxed">{t('onboarding_subtitle')}</p>
        </header>

        <ol className="space-y-4">
          {STEPS.map((step, i) => (
            <li key={step.titleKey} className="flex gap-3">
              <div className="w-7 h-7 shrink-0 rounded-lg bg-white/5 flex items-center justify-center text-gray-400">
                <step.icon className="w-4 h-4" />
              </div>
              <div className="space-y-0.5">
                <div className="text-sm font-medium text-gray-200">
                  {i + 1}. {t(step.titleKey)}
                </div>
                <div className="text-xs text-gray-500 leading-relaxed">{t(step.descKey)}</div>
              </div>
            </li>
          ))}
        </ol>

        <p className="text-[11px] text-amber-400/80 bg-amber-500/5 border border-amber-500/20 rounded-lg px-3 py-2 leading-relaxed">
          {t('onboarding_note')}
        </p>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onDismiss}
            className="px-5 py-2 text-sm font-medium text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-xl transition-all"
          >
            {t('onboarding_later')}
          </button>
          <button
            type="button"
            onClick={onConfigure}
            className="px-6 py-2 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl shadow-lg shadow-emerald-900/20 transition-all active:scale-95"
          >
            {t('onboarding_configure')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default OnboardingGuide;
