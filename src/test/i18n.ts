import { getTranslations } from '../i18n';
import type { TFunction } from '../hooks/useLanguage';

const zh = getTranslations('zh');

/**
 * 测试用的 t：走真实 zh 翻译表而非假桩——key 拼错或漏译会让断言直接失败，
 * 保留了「文案确实存在于 locale 里」这层守卫。
 */
export const zhT: TFunction = (key, vars) => {
  let str: string = zh[key] ?? key;
  for (const [k, v] of Object.entries(vars ?? {})) str = str.replace(`{${k}}`, String(v));
  return str;
};
