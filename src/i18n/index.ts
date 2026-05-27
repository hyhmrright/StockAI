import zhData from './zh.json';
import enData from './en.json';
import jaData from './ja.json';
import type { Language } from '../../shared/types';

export type { Language };
export type TranslationKey = keyof typeof zhData;

const TRANSLATIONS: Record<Language, Record<TranslationKey, string>> = {
  zh: zhData,
  en: enData,
  ja: jaData,
};

export function getTranslations(lang: Language): Record<TranslationKey, string> {
  return TRANSLATIONS[lang];
}
