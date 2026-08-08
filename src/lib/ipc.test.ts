import { describe, it, expect } from 'vitest';
import { parseServiceResponse, ServiceError, toServiceError } from './ipc';

/** 取一次解析失败的错误码；没抛或抛的不是 ServiceError 都算失败 */
function codeOf(raw: string): string {
  try {
    parseServiceResponse(raw);
  } catch (e) {
    return e instanceof ServiceError ? e.code : `非 ServiceError: ${String(e)}`;
  }
  return '未抛出';
}

describe('parseServiceResponse', () => {
  it('成功信封返回 data 字段内容', () => {
    const raw = JSON.stringify({ data: { foo: 'bar', n: 1 } });
    const r = parseServiceResponse<{ foo: string; n: number }>(raw);
    expect(r.foo).toBe('bar');
    expect(r.n).toBe(1);
  });

  // 传输层失败也必须带 code——UI 只按 code 翻译，断 code 而非 message
  it('空字符串或纯空白抛 ERR_NO_RESPONSE', () => {
    expect(codeOf('')).toBe('ERR_NO_RESPONSE');
    expect(codeOf('   ')).toBe('ERR_NO_RESPONSE');
  });

  it('JSON 非法时抛 ERR_BAD_RESPONSE', () => {
    expect(codeOf('not json {')).toBe('ERR_BAD_RESPONSE');
  });

  it('error 对象信封抛 ServiceError 且保留 code', () => {
    const raw = JSON.stringify({ error: { code: 'ERR_FOO', message: '炸了' } });
    expect(() => parseServiceResponse(raw)).toThrow(ServiceError);
    try {
      parseServiceResponse(raw);
    } catch (e) {
      expect(e).toBeInstanceOf(ServiceError);
      expect((e as ServiceError).code).toBe('ERR_FOO');
      expect((e as ServiceError).message).toBe('炸了');
    }
  });

  it('error 为旧版字符串格式时仍抛 Error（兼容路径）', () => {
    const raw = JSON.stringify({ error: '老格式错误' });
    expect(() => parseServiceResponse(raw)).toThrow('老格式错误');
  });

  it('data 缺失时抛"未返回有效数据"', () => {
    const raw = JSON.stringify({});
    expect(() => parseServiceResponse(raw)).toThrow('未返回有效数据');
  });
});

describe('toServiceError', () => {
  // Tauri 的 invoke 把 Rust 的 Err(String) 抛成裸字符串，丢了 code 就只能在 UI 上
  // 降级成兜底文案——「还没保存过配置」会显示成「操作失败，请稍后重试」
  it('Rust 的带码字符串还原成 ServiceError', () => {
    const e = toServiceError('ERR_NO_SETTINGS: app_settings missing in settings.json');
    expect(e).toBeInstanceOf(ServiceError);
    expect((e as ServiceError).code).toBe('ERR_NO_SETTINGS');
    expect(e.message).toBe('app_settings missing in settings.json');
  });

  it('诊断含冒号与换行时只切第一个冒号', () => {
    const e = toServiceError('ERR_SIDECAR_SPAWN: spawn failed: No such file\n  at line 2');
    expect((e as ServiceError).code).toBe('ERR_SIDECAR_SPAWN');
    expect(e.message).toBe('spawn failed: No such file\n  at line 2');
  });

  it('无码字符串包成普通 Error，不伪造 code', () => {
    const e = toServiceError('something went wrong');
    expect(e).not.toBeInstanceOf(ServiceError);
    expect(e.message).toBe('something went wrong');
  });

  it('已是 Error 的原样返回', () => {
    const original = new ServiceError('ERR_CHAT', 'x');
    expect(toServiceError(original)).toBe(original);
  });
});
