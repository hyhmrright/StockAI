import { useEffect, useState } from 'react';
import {
  emptyWorkspace,
  readWorkspace,
  subscribeWorkspace,
  updateWorkspace,
} from '../lib/research-store';
import type { ResearchWorkspace } from '../../shared/types';

export function useResearchWorkspace() {
  const [state, setState] = useState(emptyWorkspace);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    const read = () => {
      void readWorkspace()
        .then((value) => {
          if (alive) {
            setState(value);
            setError(null);
          }
        })
        .catch((e) => {
          if (alive) setError(String(e));
        })
        .finally(() => {
          if (alive) setLoading(false);
        });
    };
    read();
    const unsubscribe = subscribeWorkspace(read);
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);
  const change = async (fn: (state: ResearchWorkspace) => ResearchWorkspace) => {
    try {
      await updateWorkspace(fn);
      setError(null);
    } catch (e) {
      setError(String(e));
      throw e;
    }
  };
  return { state, change, error, loading };
}
