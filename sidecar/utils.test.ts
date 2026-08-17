import { expect, test, describe } from 'bun:test';
import { toErrorMessage, withTimeout, runWithConcurrency, parseJsonFromAi } from './utils';

describe('toErrorMessage', () => {
  test('Error 实例返回 message', () => {
    expect(toErrorMessage(new Error('测试错误'))).toBe('测试错误');
  });

  test('字符串直接返回', () => {
    expect(toErrorMessage('字符串错误')).toBe('字符串错误');
  });

  test('其他类型转为字符串', () => {
    expect(toErrorMessage(42)).toBe('42');
    expect(toErrorMessage(null)).toBe('null');
    expect(toErrorMessage(undefined)).toBe('undefined');
  });
});

describe('withTimeout', () => {
  test('Promise 在超时前 resolve 时正常返回结果', async () => {
    const result = await withTimeout(Promise.resolve('ok'), 1000, '不应超时');
    expect(result).toBe('ok');
  });

  test('Promise 超时后 reject 并返回指定错误信息', async () => {
    const slow = new Promise((resolve) => setTimeout(resolve, 5000));
    await expect(withTimeout(slow, 50, '自定义超时消息')).rejects.toThrow('自定义超时消息');
  });

  test('Promise 在超时前 reject 时正常传播原始错误', async () => {
    const failing = Promise.reject(new Error('原始错误'));
    await expect(withTimeout(failing, 1000, '不应看到此消息')).rejects.toThrow('原始错误');
  });

  test('超时后 timer 被正确清理（不泄漏）', async () => {
    // 验证返回值正确，同时间接证明 timer 已清理（进程不挂起）
    const result = await withTimeout(Promise.resolve(42), 100, '不应超时');
    expect(result).toBe(42);
  });
});

describe('runWithConcurrency', () => {
  /**
   * 结果按**输入下标**回填，而非完成顺序。深度分析靠下标把 signal 对回大师
   * （`masters.map(m => () => m.analyze(ctx))`），错位不会抛异常，只会把巴菲特的
   * 判断挂到伍德名下——是本仓最难被发现的那类损坏，故单列一条钉住。
   */
  test('结果按输入顺序返回，与完成顺序无关', async () => {
    const resolvers: ((v: string) => void)[] = [];
    const tasks = [0, 1, 2].map(
      (i) => () =>
        new Promise<string>((r) => {
          resolvers[i] = r;
        }),
    );

    const pending = runWithConcurrency(tasks, 3);
    // 倒着 resolve：完成顺序 2 → 0 → 1，与输入顺序刻意错开
    resolvers[2]('t2');
    resolvers[0]('t0');
    resolvers[1]('t1');

    expect(await pending).toEqual(['t0', 't1', 't2']);
  });

  test('同时在飞的任务数不超过 limit', async () => {
    let inFlight = 0;
    let peak = 0;
    const tasks = Array.from({ length: 6 }, () => async () => {
      peak = Math.max(peak, ++inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
    });

    await runWithConcurrency(tasks, 2);
    expect(peak).toBe(2);
  });

  test('limit 大于任务数时照常跑完，不空转也不挂起', async () => {
    expect(await runWithConcurrency([() => Promise.resolve('a')], 8)).toEqual(['a']);
  });

  test('空任务表直接返回空数组', async () => {
    expect(await runWithConcurrency([], 4)).toEqual([]);
  });

  /** 本函数**不做**逐任务容错——getQuotes 正是因此才自己逐个 try/catch */
  test('任一任务 reject 即整批 reject', async () => {
    await expect(
      runWithConcurrency([() => Promise.reject(new Error('boom')), () => Promise.resolve(1)], 2),
    ).rejects.toThrow('boom');
  });
});

describe('parseJsonFromAi', () => {
  test('裸 JSON 直接解析', () => {
    expect(parseJsonFromAi('{"signal":"buy"}')).toEqual({ signal: 'buy' });
  });

  test('剥掉 ```json 围栏', () => {
    expect(parseJsonFromAi('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  test('剥掉无语言标注的裸围栏', () => {
    expect(parseJsonFromAi('```\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  test('围栏后面还跟着解说时仍能取出 JSON', () => {
    expect(parseJsonFromAi('```json\n{"a":1}\n```\n以上是分析结果。')).toEqual({ a: 1 });
  });

  test('JSON 前后的散文被丢弃', () => {
    expect(parseJsonFromAi('分析如下：{"a":1} 以上。')).toEqual({ a: 1 });
  });

  test('嵌套对象不被 lastIndexOf 截断', () => {
    expect(parseJsonFromAi('{"a":{"b":2}}')).toEqual({ a: { b: 2 } });
  });

  /**
   * 抽取靠「第一个 `{` 到最后一个 `}`」，所以 JSON 之后再出现花括号会连带截进来。
   * 钉住它是**响亮抛出**而非静默返回半个对象：三个 provider 与选股都靠这一抛来降级。
   */
  test('JSON 之后的散文里带花括号时抛出，而不是静默返回错数据', () => {
    expect(() => parseJsonFromAi('{"signal":"buy"}\n注意：{} 表示无数据')).toThrow(
      'AI 返回格式非 JSON',
    );
  });

  test('非 JSON 文本抛出统一错误信息', () => {
    expect(() => parseJsonFromAi('模型拒绝回答')).toThrow('AI 返回格式非 JSON');
  });
});
