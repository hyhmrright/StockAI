import { useEffect } from 'react';
import { updateWorkspace } from '../lib/research-store';
import { snapshotEvents } from '../lib/research-changes';
import type { ResearchSnapshot } from '../../shared/types';
/** 保存可复查的数据快照，跨重启去重；只在当前标的的数据齐备后捕获。 */
export function useCaptureResearch(snapshot: ResearchSnapshot) {
  useEffect(() => {
    if (!snapshot.quant || snapshot.quant.symbol !== snapshot.symbol) return;
    void updateWorkspace((state) => {
      const history = state.snapshots[snapshot.symbol] ?? [];
      const previous = history[history.length - 1];
      if (
        previous?.quant?.fetchedAt === snapshot.quant?.fetchedAt &&
        previous?.deep?.analysisId === snapshot.deep?.analysisId &&
        JSON.stringify(previous?.news) === JSON.stringify(snapshot.news)
      )
        return state;
      const known = new Set(state.events.map((e) => e.id));
      const events = snapshotEvents(previous, snapshot).filter((e) => !known.has(e.id));
      return {
        ...state,
        snapshots: { ...state.snapshots, [snapshot.symbol]: [...history, snapshot].slice(-200) },
        events: [...events, ...state.events].slice(0, 2000),
      };
    }).catch((e) => console.error('保存研究快照失败', e));
  }, [snapshot.symbol, snapshot.quant, snapshot.news, snapshot.deep]);
}
