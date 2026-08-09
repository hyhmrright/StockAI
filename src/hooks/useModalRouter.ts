import { useCallback, useState } from 'react';

/** Dashboard 的全屏浮层清单 */
export type ModalName = 'settings' | 'screener' | 'portfolio' | 'overview';

export interface ModalRouter {
  /** 当前打开的浮层；null = 都没开 */
  active: ModalName | null;
  open: (name: ModalName) => void;
  close: () => void;
}

/**
 * 全屏浮层的互斥路由。
 *
 * 用**一个** `active` 而非每个浮层一个 boolean：这些浮层全是铺满视口的遮罩，
 * 同时开两个在产品上没有意义。四个 boolean 能表达 16 种状态，其中 11 种是
 * 「两层遮罩叠着」的无效态——把它们从类型里去掉，就不必再靠调用方自觉维护互斥。
 */
export function useModalRouter(): ModalRouter {
  const [active, setActive] = useState<ModalName | null>(null);
  const close = useCallback(() => setActive(null), []);
  return { active, open: setActive, close };
}
