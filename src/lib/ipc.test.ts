import { describe, it, expect } from 'vitest';
import { parseServiceResponse, ServiceError } from './ipc';

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
