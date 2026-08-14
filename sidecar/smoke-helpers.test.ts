import { describe, expect, it } from 'bun:test';
import { fetchOrSkip } from './smoke-helpers';

/**
 * 这个 helper 的判据判错了会**把真故障吞成绿色**——它是冒烟监控唯一的降级开关，
 * 所以正反两侧都要钉住：够不着源必须放行，解析契约破了必须原样抛。
 */
describe('fetchOrSkip', () => {
  const reject = (err: unknown) => () => Promise.reject(err);

  it('取数成功时原样透传返回值', async () => {
    await expect(fetchOrSkip('源', () => Promise.resolve(42))).resolves.toBe(42);
  });

  it('null 是「源说没有数据」，必须透传而不是被当成跳过', async () => {
    // 调用侧用 undefined 判「没够着源」，两者混淆会让 fetchEastmoneyFundFlow
    // 真的返回 null（数据源静默失效）时被误判成限流、直接跳过断言。
    await expect(fetchOrSkip('源', () => Promise.resolve(null))).resolves.toBeNull();
  });

  it.each([
    [
      'ECONNRESET（Bun 挂在 code 上，message 里没有）',
      Object.assign(new Error('boom'), { code: 'ECONNRESET' }),
    ],
    ['socket closed（东财实测文案）', new Error('The socket connection was closed unexpectedly.')],
    ['HTTP 502（东财板块榜实测）', new Error('东财板块榜 HTTP 502')],
    ['HTTP 429 限流', new Error('HTTP 429 Too Many Requests')],
    ['ETIMEDOUT', Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })],
    [
      // fetchWithPolicy 的 AbortSignal.timeout 抛的就是这个：限流常表现为挂起而非报错，
      // 特征只在 name 上（message 是 "The operation timed out."，不含任何 E* 码）
      'AbortSignal.timeout 超时（DOMException，特征只在 name 上）',
      new DOMException('The operation timed out.', 'TimeoutError'),
    ],
  ])('够不着源即跳过：%s', async (_label, err) => {
    await expect(fetchOrSkip('源', reject(err))).resolves.toBeUndefined();
  });

  it.each([
    ['解析为空（备源的沉默会伪装成没有数据）', new Error('东财板块榜解析为空')],
    ['字段缺失（上游改版的典型症状）', new Error('缺少 f51 字段')],
    ['HTTP 404（端点被下线，不是限流）', new Error('HTTP 404 Not Found')],
    ['HTTP 403（反爬封禁，需要人看）', new Error('HTTP 403 Forbidden')],
  ])('契约破了必须原样抛：%s', async (_label, err) => {
    await expect(fetchOrSkip('源', reject(err))).rejects.toThrow(err.message);
  });

  it('expect 断言失败必须原样抛——降级开关不能给它开后门', async () => {
    // Bun 的 expect 失败只是普通 Error（不像 Jest 带 matcherResult），靠错误类型
    // 区分并不可靠。真正的防线是 fetchOrSkip 只包取数、断言留在调用侧，这里再钉一道：
    // 即便断言消息里恰好出现 "502" 这类字样，也不得被当成限流吞掉。
    let assertionError: unknown;
    try {
      expect(502).toBe(200);
    } catch (err) {
      assertionError = err;
    }
    await expect(fetchOrSkip('源', reject(assertionError))).rejects.toThrow(/expect\(/);
  });
});
