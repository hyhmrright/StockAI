import { sortScreenMatches } from '../../shared/screen-values';
import { useRef, useState } from 'react';
import type { ScreenQuery, ScreenResponse } from '../../shared/types';
import { useLanguage } from './useLanguage';
import { screenStocks } from '../lib/ipc';

export function useScreenWorkbench() {
  const { t } = useLanguage();
  const [text, setText] = useState(''),
    [editor, setEditor] = useState(''),
    [response, setResponse] = useState<ScreenResponse | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const epoch = useRef(0);
  const run = (task: (id: number) => Promise<void>) => {
    if (busy) return;
    const id = ++epoch.current;
    setBusy(true);
    setError('');
    void task(id)
      .catch(() => {
        if (id === epoch.current) setError(t('research_error'));
      })
      .finally(() => {
        if (id === epoch.current) setBusy(false);
      });
  };
  const execute = (more = false) =>
    run(async (id) => {
      const query = JSON.parse(editor) as ScreenQuery;
      if (more && JSON.stringify(query) !== JSON.stringify(response?.query))
        throw new Error('Query changed; run a new scan');
      const result = await screenStocks(
        JSON.stringify({ query, offset: more ? response?.nextOffset : 0 }),
      );
      if (id !== epoch.current) return;
      if (more && response && result.fetchedAt !== response.fetchedAt)
        throw new Error('Market snapshot changed; restart scan');
      setEditor(JSON.stringify(result.query, null, 2));
      setResponse(
        more && response
          ? {
              ...result,
              matches: sortScreenMatches(
                [
                  ...response.matches,
                  ...result.matches.filter(
                    (m) => !response.matches.some((p) => p.symbol === m.symbol),
                  ),
                ],
                result.query,
              ),
              refinedCount: response.refinedCount + result.refinedCount,
              coverage: result.coverage
                ? {
                    ...result.coverage,
                    attempted: (response.coverage?.attempted ?? 0) + result.coverage.attempted,
                    failed: (response.coverage?.failed ?? 0) + result.coverage.failed,
                    complete: result.coverage.complete && !response.coverage?.failed,
                  }
                : undefined,
            }
          : result,
      );
    });
  return {
    t,
    text,
    setText,
    editor,
    setEditor,
    response,
    setResponse,
    busy,
    setBusy,
    error,
    epoch,
    run,
    execute,
  };
}
