import { describe, it, expect } from 'bun:test';
import { classifyListModelsError, withTimeout } from './utils';

describe('classifyListModelsError', () => {
  it('识别 withTimeout 抛出的超时错误', async () => {
    const slow = new Promise((resolve) => setTimeout(resolve, 100));
    const err = await withTimeout(slow, 10, '测试超时').catch((e) => e);
    expect(classifyListModelsError(err).code).toBe('ERR_LIST_MODELS_TIMEOUT');
  });

  it('识别 401 状态码为 AUTH', () => {
    const e = Object.assign(new Error('Unauthorized'), { status: 401 });
    expect(classifyListModelsError(e).code).toBe('ERR_LIST_MODELS_AUTH');
  });

  it('识别 403 状态码为 AUTH', () => {
    const e = Object.assign(new Error('Forbidden'), { status: 403 });
    expect(classifyListModelsError(e).code).toBe('ERR_LIST_MODELS_AUTH');
  });

  it('识别 5xx 状态码为 SERVER', () => {
    const e = Object.assign(new Error('Bad Gateway'), { status: 502 });
    expect(classifyListModelsError(e).code).toBe('ERR_LIST_MODELS_SERVER');
  });

  it('识别 4xx（非鉴权）为 BAD_REQUEST', () => {
    const e = Object.assign(new Error('Not Found'), { status: 404 });
    expect(classifyListModelsError(e).code).toBe('ERR_LIST_MODELS_BAD_REQUEST');
  });

  it('ECONNREFUSED 走 NETWORK 分支', () => {
    const e = new Error('connect ECONNREFUSED 127.0.0.1:11434');
    expect(classifyListModelsError(e).code).toBe('ERR_LIST_MODELS_NETWORK');
  });

  it("'fetch failed' 走 NETWORK 分支", () => {
    const e = new Error('fetch failed');
    expect(classifyListModelsError(e).code).toBe('ERR_LIST_MODELS_NETWORK');
  });

  it("消息含 'Invalid API Key' 但无 status 时走 AUTH 分支", () => {
    const e = new Error('Invalid API Key provided');
    expect(classifyListModelsError(e).code).toBe('ERR_LIST_MODELS_AUTH');
  });

  it('不可识别错误兜底为 ERR_LIST_MODELS', () => {
    const e = new Error('something completely unrelated');
    expect(classifyListModelsError(e).code).toBe('ERR_LIST_MODELS');
  });

  it('非 Error 输入也能安全处理', () => {
    const result = classifyListModelsError('a string error');
    expect(result.code).toBe('ERR_LIST_MODELS');
    expect(result.message).toContain('a string error');
  });

  it("status 优先于消息（500 不被 'unauthorized' 关键词误判）", () => {
    const e = Object.assign(new Error('unauthorized something'), { status: 500 });
    expect(classifyListModelsError(e).code).toBe('ERR_LIST_MODELS_SERVER');
  });
});
