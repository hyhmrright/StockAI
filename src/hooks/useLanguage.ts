import { useCallback, useMemo } from 'react';
import { useSettings } from './useSettings';
import { getTranslations } from '../i18n';
import type { Language, TranslationKey } from '../i18n';

export type { Language };

export type TFunction = (key: TranslationKey, vars?: Record<string, string | number>) => string;

export function useLanguage() {
  const { settings } = useSettings();
  const lang = settings.language;
  const translations = useMemo(() => getTranslations(lang), [lang]);

  // t 必须随语言稳定：图表叠加层等 hook 会把它放进 effect deps，
  // 每次渲染换身份会让 series/价位线无谓重建。
  const t = useCallback<TFunction>(
    (key, vars) => {
      let str = translations[key] ?? key;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          str = str.replace(`{${k}}`, String(v));
        }
      }
      return str;
    },
    [translations],
  );

  return { language: lang, t };
}
