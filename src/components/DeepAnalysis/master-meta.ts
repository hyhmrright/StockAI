import type { Language, MasterMeta } from '../../../shared/types';
import { MASTER_META } from '../../../shared/constants';

/**
 * 大师元数据的前端取用层。
 *
 * 数据本身在 `shared/constants.ts`——前端与 sidecar 共用同一张表（前端不能 import
 * `sidecar/`，但两侧都能 import `shared/`）。这里只放前端专属的取用与按语言选字段。
 */

// 整表直接转发：包一层 getAllMasterMeta() 给不出任何 MASTER_META 这个名字之外的信息
export { MASTER_META };

export function getMasterMeta(id: string): MasterMeta | undefined {
  return MASTER_META.find((m) => m.id === id);
}

/**
 * MasterMeta 是双语数据表（name/nameZh、style/styleZh 成对），
 * 「按语言取哪个字段」的决策收敛在这两个函数里——此前散在三个组件各写一遍。
 */
export function masterName(
  meta: MasterMeta | undefined,
  language: Language,
  fallback = '',
): string {
  if (!meta) return fallback;
  return language === 'zh' ? meta.nameZh : meta.name;
}

export function masterStyle(meta: MasterMeta | undefined, language: Language): string {
  if (!meta) return '';
  return language === 'zh' ? meta.styleZh : meta.style;
}
