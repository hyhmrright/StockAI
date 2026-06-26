import { describe, it, expect } from 'bun:test';
import { successEnvelope, errorEnvelope, errorEnvelopeFromUnknown, isSuccess } from './utils';

describe('信封工厂', () => {
  it('successEnvelope 只有 data，没有 error', () => {
    const env = successEnvelope({ x: 1 });
    expect(env).toEqual({ data: { x: 1 } });
    expect('error' in env).toBe(false);
  });

  it('errorEnvelope 只有 error，没有 data', () => {
    const env = errorEnvelope('ERR_X', 'boom');
    expect(env).toEqual({ error: { code: 'ERR_X', message: 'boom' } });
    expect('data' in env).toBe(false);
  });

  it('errorEnvelopeFromUnknown 支持 Error 实例', () => {
    const env = errorEnvelopeFromUnknown('ERR_X', new Error('x failed'));
    expect(env.error.code).toBe('ERR_X');
    expect(env.error.message).toBe('x failed');
  });

  it('errorEnvelopeFromUnknown 支持非 Error 输入', () => {
    const env = errorEnvelopeFromUnknown('ERR_X', 'string error');
    expect(env.error.message).toBe('string error');
  });

  it('isSuccess 区分成功/失败信封', () => {
    expect(isSuccess(successEnvelope({ ok: true }))).toBe(true);
    expect(isSuccess(errorEnvelope('ERR', 'x'))).toBe(false);
  });

  it('信封是合法 JSON（round-trip 一致）', () => {
    const env = successEnvelope([1, 2, 3]);
    const roundTrip = JSON.parse(JSON.stringify(env));
    expect(roundTrip).toEqual({ data: [1, 2, 3] });
  });
});
