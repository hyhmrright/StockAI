// 信号/情绪 → 配色与文案的单一来源：原本 5 个函数各自 switch 重复「bullish→emerald」决策，
// 现集中一张表，新增信号或改配色只需改一处。
import type { TFunction } from '../hooks/useLanguage';
import type { TranslationKey } from '../i18n';

type SignalKey = 'bullish' | 'bearish' | 'neutral';

const SIGNAL_VARIANTS: Record<
  SignalKey,
  {
    labelKey: TranslationKey;
    color: string;
    badgeClass: string;
    sentimentBg: string;
    sentimentBadge: string;
  }
> = {
  bullish: {
    labelKey: 'bullish',
    color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    badgeClass: 'bg-emerald-500/20 text-emerald-400',
    sentimentBg: 'bg-emerald-500',
    sentimentBadge: 'bg-emerald-500/20 text-emerald-500',
  },
  bearish: {
    labelKey: 'bearish',
    color: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
    badgeClass: 'bg-rose-500/20 text-rose-400',
    sentimentBg: 'bg-rose-500',
    sentimentBadge: 'bg-rose-500/20 text-rose-500',
  },
  neutral: {
    labelKey: 'neutral',
    color: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    badgeClass: 'bg-amber-500/20 text-amber-400',
    sentimentBg: 'bg-amber-500',
    sentimentBadge: 'bg-amber-500/20 text-amber-500',
  },
};

/** 未知信号一律降级为中性 */
function variant(signal: string) {
  return SIGNAL_VARIANTS[signal as SignalKey] ?? SIGNAL_VARIANTS.neutral;
}

export function signalColor(signal: string): string {
  return variant(signal).color;
}

export function signalLabel(signal: string, t: TFunction): string {
  return t(variant(signal).labelKey);
}

export function signalBadge(signal: string, t: TFunction): { label: string; className: string } {
  const v = variant(signal);
  return { label: t(v.labelKey), className: v.badgeClass };
}

export function sentimentBgClass(sentiment: string): string {
  return variant(sentiment).sentimentBg;
}

export function sentimentBadgeClass(sentiment: string): string {
  return variant(sentiment).sentimentBadge;
}
