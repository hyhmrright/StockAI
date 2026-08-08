import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ServiceError } from './ipc';
import { formatServiceError, serviceErrorKey } from './service-errors';
import zh from '../i18n/zh.json';
import en from '../i18n/en.json';
import ja from '../i18n/ja.json';
import type { TranslationKey } from '../i18n';

/** 最小 t：只做 zh 查表 + {var} 插值，与 useLanguage 的实现同口径 */
const t = (key: TranslationKey, vars?: Record<string, string | number>): string => {
  let s: string = zh[key] ?? key;
  for (const [k, v] of Object.entries(vars ?? {})) s = s.replace(`{${k}}`, String(v));
  return s;
};

describe('serviceErrorKey', () => {
  it('已登记的 code 返回对应 i18n key', () => {
    expect(serviceErrorKey(new ServiceError('ERR_SCRAPE_EMPTY', 'x'))).toBe('err_scrape_empty');
  });

  it('未登记的 code 返回 null', () => {
    expect(serviceErrorKey(new ServiceError('ERR_NEVER_HEARD_OF', 'x'))).toBeNull();
  });

  it('非 ServiceError 返回 null', () => {
    expect(serviceErrorKey(new Error('boom'))).toBeNull();
    expect(serviceErrorKey('boom')).toBeNull();
  });
});

describe('formatServiceError', () => {
  it('带 {message} 的译文接上原始诊断', () => {
    const err = new ServiceError('ERR_ANALYSIS_FAILED', '401 Unauthorized');
    expect(formatServiceError(err, t, 'data_fetch_error')).toContain('401 Unauthorized');
  });

  it('不带 {message} 的译文不泄漏 sidecar 原文', () => {
    const err = new ServiceError('ERR_SCRAPE_EMPTY', '所有策略均未返回新闻');
    expect(formatServiceError(err, t, 'data_fetch_error')).not.toContain('所有策略');
  });

  it('未登记的 code 退到调用方兜底 key，而不是裸 message', () => {
    const err = new ServiceError('ERR_NEVER_HEARD_OF', '不可翻译的原文');
    const out = formatServiceError(err, t, 'data_fetch_error');
    expect(out).toBe(zh.data_fetch_error);
    expect(out).not.toContain('不可翻译的原文');
  });

  it('裸 Error 同样走兜底 key', () => {
    expect(formatServiceError(new Error('raw'), t, 'quant_error')).toBe(zh.quant_error);
  });
});

describe('Sidecar 错误码的翻译覆盖', () => {
  /**
   * 与 Rust 侧的 test_error_codes_registered_in_frontend 同一目的：**加了码却忘登记不会
   * 有任何运行时报错**，只会让 UI 静默降级成兜底文案（en / ja 用户尤其无从下手）。
   * 只有跨文件比对能拦。
   *
   * 读源码文本而不是 import：src/ 不得依赖 sidecar/（单向依赖），这里只是把它当文本扫一遍，
   * 与 Rust 那条 include_str! 同一手法。
   */
  // 走 cwd 而不是 import.meta.url：vitest 把测试文件按 vite 的 http 模块 URL 加载，
  // import.meta.url 不是 file: 协议，喂给 node:fs 会直接抛。
  const SIDECAR_DIR = resolve(process.cwd(), 'sidecar');

  /** 明确不需要译文的码——每条都得说清为什么它到不了 UI，否则就是漏登记 */
  const NOT_USER_FACING: Record<string, string> = {
    ERR_INFO: '--info 是 ipc: false 的 CLI 调试入口，无前端调用方',
    ERR_NOT_FOUND: '同上，handleInfo 的另一个出口',
    ERR_FIN_HISTORY: '--fundamentals-history，ipc: false',
    ERR_MARKET_SNAPSHOT: '--market-snapshot，ipc: false',
  };

  /** 递归收集 sidecar 源码里出现的错误码字面量；跳过测试与构建产物 */
  function collectCodes(dir: string, into = new Set<string>()): Set<string> {
    for (const entry of readdirSync(dir)) {
      if (entry === 'dist' || entry === 'node_modules') continue;
      const child = join(dir, entry);
      if (statSync(child).isDirectory()) {
        collectCodes(child, into);
      } else if (entry.endsWith('.ts') && !/\.(test|integration)\.ts$/.test(entry)) {
        for (const m of readFileSync(child, 'utf8').matchAll(/'(ERR_[A-Z0-9_]+)'/g)) into.add(m[1]);
      }
    }
    return into;
  }

  const codes = collectCodes(SIDECAR_DIR);

  // 目录扫错会让下面两条空集比空集、永远绿。先钉死「确实扫到了东西」。
  it('确实扫到了 sidecar 的错误码', () => {
    expect(codes.size).toBeGreaterThan(20);
    expect(codes.has('ERR_ANALYSIS_FAILED')).toBe(true);
  });

  it('每个码要么有译文，要么在豁免名单里', () => {
    const unregistered = [...codes].filter(
      (code) => !serviceErrorKey(new ServiceError(code, '')) && !(code in NOT_USER_FACING),
    );
    expect(unregistered).toEqual([]);
  });

  it('豁免名单里没有失效条目', () => {
    // 码被删/改名后名单会留下死条目，下次真漏登记时就少一层保护
    expect(Object.keys(NOT_USER_FACING).filter((code) => !codes.has(code))).toEqual([]);
  });
});

describe('三语 locale 一致性', () => {
  // TranslationKey 由 zh.json 推导，编译器只能保证「用到的 key 在 zh 里有」，
  // 管不到 en/ja 缺 key（运行期回落成 key 字面量上屏）或多出废 key。
  const zhKeys = Object.keys(zh).sort();

  it.each([
    ['en', en],
    ['ja', ja],
  ])('%s 的 key 集合与 zh 完全一致', (_name, locale) => {
    expect(Object.keys(locale).sort()).toEqual(zhKeys);
  });

  // 只查 en：中文出现在英文文案里必是漏翻。ja 查不了——「保存」「上限」「高速」等
  // 日文汉字与中文同形，逐字相同恰恰是正确翻译，查了只会得到一串误报。
  it('en 没有漏翻（值里仍带中文）', () => {
    const untranslated = zhKeys.filter((k) => /[一-龥]/.test(en[k as keyof typeof en]));
    expect(untranslated).toEqual([]);
  });
});
