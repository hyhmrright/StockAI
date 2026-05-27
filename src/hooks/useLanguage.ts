import { useMemo } from 'react';
import { useSettings } from './useSettings';
import { getTranslations } from '../i18n';
import type { Language, TranslationKey } from '../i18n';

export type { Language };

export function useLanguage() {
  const { settings } = useSettings();
  const lang = settings.language;
  const translations = useMemo(() => getTranslations(lang), [lang]);

  function t(key: TranslationKey, vars?: Record<string, string | number>): string {
    let str = translations[key] ?? key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        str = str.replace(`{${k}}`, String(v));
      }
    }
    return str;
  }

  return { language: lang, t };
}
