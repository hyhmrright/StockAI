import type { ResearchSnapshot, ResearchEvent } from '../../shared/types';
export interface ResearchChange {
  field: string;
  before: string;
  after: string;
}
/** 确定性差异不调用模型；相同材料不会被描述成新消息。 */
export function compareResearch(
  before: ResearchSnapshot | undefined,
  after: ResearchSnapshot,
): ResearchChange[] {
  if (!before) return [];
  const changes: ResearchChange[] = [];
  const add = (field: string, a: unknown, b: unknown) => {
    if (a !== b)
      changes.push({
        field,
        before: a == null ? '—' : String(a),
        after: b == null ? '—' : String(b),
      });
  };
  add('score', before.quant?.composite.score, after.quant?.composite.score);
  add('technical', before.quant?.technical.signal, after.quant?.technical.signal);
  add('fundamental', before.quant?.fundamental.signal, after.quant?.fundamental.signal);
  add('valuation', before.quant?.valuation?.signal, after.quant?.valuation?.signal);
  add('risk', before.quant?.risk?.riskLevel, after.quant?.risk?.riskLevel);
  const seen = new Set(before.news.map((n) => n.url || n.title));
  for (const n of after.news)
    if (!seen.has(n.url || n.title)) changes.push({ field: 'news', before: '—', after: n.title });
  if (before.deep && after.deep)
    for (const m of after.deep.masterSignals) {
      const previous = before.deep.masterSignals.find((p) => p.masterId === m.masterId);
      if (previous) add(m.masterId, previous.signal, m.signal);
    }
  return changes;
}
export function snapshotEvents(
  before: ResearchSnapshot | undefined,
  after: ResearchSnapshot,
): ResearchEvent[] {
  const changes = compareResearch(before, after);
  const day = new Date(after.capturedAt).toISOString().slice(0, 10);
  const events: ResearchEvent[] = after.news.map((n) => ({
    id: `news:${after.symbol}:${n.url || n.title}`,
    symbol: after.symbol,
    title: n.title,
    url: n.url,
    date: day,
    kind: 'news',
    read: false,
  }));
  for (const c of changes.filter((c) => c.field === 'score'))
    events.push({
      id: `score:${after.symbol}:${after.capturedAt}`,
      symbol: after.symbol,
      title: `${c.before} → ${c.after}`,
      date: day,
      kind: 'score',
      read: false,
    });
  return events;
}
