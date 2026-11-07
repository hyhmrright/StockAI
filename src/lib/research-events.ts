import { readWorkspace, updateWorkspace } from './research-store';
import { getStore } from './store';
import { fetchMarketBundle, fetchAnnouncements } from './ipc';
import { snapshotEvents } from './research-changes';
import type { ResearchEvent } from '../../shared/types';
/** 用户显式刷新关注列表；只抓材料，不自动调用模型。 */
export async function refreshResearchEvents() {
  const store = await getStore();
  const watchlist = (await store.get<{ sym: string }[]>('watchlist')) ?? [];
  const state = await readWorkspace();
  const events: ResearchEvent[] = [];
  let failed = 0;
  for (let i = 0; i < watchlist.length; i += 3)
    await Promise.all(
      watchlist.slice(i, i + 3).map(async ({ sym }) => {
        const result = await fetchMarketBundle(sym).catch(() => null);
        if (result)
          events.push(
            ...snapshotEvents(undefined, {
              symbol: sym,
              capturedAt: Date.now(),
              news: result.news,
            }),
          );
        else failed++;
        if (/\d{6}/.test(sym)) {
          const announcements = await fetchAnnouncements(sym).catch(() => []);
          events.push(
            ...announcements.map((a) => ({
              id: a.id,
              symbol: sym,
              title: a.title,
              url: a.url,
              date: a.date,
              kind: 'news' as const,
              read: false,
            })),
          );
        }
      }),
    );
  const known = new Set(state.events.map((e) => e.id));
  await updateWorkspace((s) => ({
    ...s,
    events: [
      ...events.filter((e) => !known.has(e.id) && !s.events.some((x) => x.id === e.id)),
      ...s.events,
    ].slice(0, 2000),
  }));
  if (failed) throw new Error(`${failed} symbols failed`);
}
