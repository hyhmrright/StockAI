import { describe, it, expect } from 'vitest';
import { parseServiceResponse, ServiceError } from './ipc';

describe('parseServiceResponse', () => {
  it('成功信封返回 data 字段内容', () => {
    const raw = JSON.stringify({ data: { foo: 'bar', n: 1 } });
    const r = parseServiceResponse<{ foo: string; n: number }>(raw);
    expect(r.foo).toBe('bar');
    expect(r.n).toBe(1);
  });

  it('空字符串或纯空白抛出无响应错误', () => {
    expect(() => parseServiceResponse('')).toThrow('分析服务无响应');
    expect(() => parseServiceResponse('   ')).toThrow('分析服务无响应');
  });

  it('JSON 非法时抛格式错误', () => {
    expect(() => parseServiceResponse('not json {')).toThrow('响应格式错误');
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
