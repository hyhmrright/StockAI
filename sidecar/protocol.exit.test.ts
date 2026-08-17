import { describe, test, expect } from 'bun:test';

/**
 * 「写完结果就退出」这条不变量的回归测试。
 *
 * 背景：Sidecar 是 spawn-per-call 的一次性进程，写完那行 JSON 活就干完了。但活干完不等于
 * 进程会退出——Bun 的事件循环只要还挂着活的句柄就不退。`browser-manager` 的清理一旦撞上
 * `browserClose` 上限就放弃等待，留下孤儿 Chromium 子进程和它的管道；此时结果早已躺在
 * stdout 里，Rust 侧却卡在 `rx.recv()` 上等管道关闭，整条 IPC 调用永不返回、UI 无限转圈。
 *
 * 两条断言缺一不可：
 *  - **退出**：有活子进程句柄时也必须立刻退（否则 bug 原样复现）
 *  - **不截断**：超过管道缓冲区（实测 64KB）的输出要完整落地。直接 `process.exit` 能满足
 *    上一条却会把大结果拦腰截断成非法 JSON——这正是修这个 bug 时最容易踩的坑，
 *    所以必须与「退出」同时断言，只断一条会让另一条悄悄回归。
 */
describe('exitAfterFlush', () => {
  test('有残留子进程句柄时仍立即退出，且大输出不被截断', async () => {
    const protocolPath = `${import.meta.dir}/protocol.ts`;
    // sleep 20s 的子进程 = 清理超时后残留的孤儿 Chromium 的等价物
    const script = `
      import { outputJson, exitAfterFlush } from ${JSON.stringify(protocolPath)};
      Bun.spawn(['sleep', '20'], { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' });
      outputJson({ pad: 'x'.repeat(200_000), tail: 'END' });
      await exitAfterFlush(0);
    `;

    const started = Date.now();
    const proc = Bun.spawn(['bun', '-e', script], { stdout: 'pipe', stderr: 'ignore' });
    const stdout = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    const elapsed = Date.now() - started;

    expect(exitCode).toBe(0);
    // 宽松上限：只要没被那个 20s 的子进程吊住即可，不去卡启动耗时
    expect(elapsed).toBeLessThan(10_000);

    // 完整且可解析——截断的话 JSON.parse 直接抛
    const parsed = JSON.parse(stdout.trim()) as { pad: string; tail: string };
    expect(parsed.tail).toBe('END');
    expect(parsed.pad.length).toBe(200_000);
  }, 20_000);
});
