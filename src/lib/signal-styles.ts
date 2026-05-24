export function signalColor(signal: string): string {
  switch (signal) {
    case 'bullish': return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
    case 'bearish': return 'text-rose-400 bg-rose-500/10 border-rose-500/20';
    default: return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
  }
}

export function signalLabel(signal: string): string {
  switch (signal) {
    case 'bullish': return '看涨';
    case 'bearish': return '看跌';
    default: return '中性';
  }
}

export function signalBadge(signal: string): { label: string; className: string } {
  switch (signal) {
    case 'bullish': return { label: '看涨', className: 'bg-emerald-500/20 text-emerald-400' };
    case 'bearish': return { label: '看跌', className: 'bg-rose-500/20 text-rose-400' };
    default: return { label: '中性', className: 'bg-amber-500/20 text-amber-400' };
  }
}

export function sentimentBgClass(sentiment: string): string {
  switch (sentiment) {
    case 'bullish': return 'bg-emerald-500';
    case 'bearish': return 'bg-rose-500';
    default: return 'bg-amber-500';
  }
}

export function sentimentBadgeClass(sentiment: string): string {
  switch (sentiment) {
    case 'bullish': return 'bg-emerald-500/20 text-emerald-500';
    case 'bearish': return 'bg-rose-500/20 text-rose-500';
    default: return 'bg-amber-500/20 text-amber-500';
  }
}
