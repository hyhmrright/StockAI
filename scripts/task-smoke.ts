import { CONFIG_VERSION } from '../shared/constants';
import { CONFIG_SLOT, PAYLOAD_SLOT } from '../shared/actions';
/** 真 Sidecar + 本地模型桩：验证逐步用量事件与进程取消，不访问真实模型。 */
function freePort() {
  const s = Bun.listen({ hostname: '127.0.0.1', port: 0, socket: { data() {} } });
  const p = s.port;
  s.stop(true);
  return p;
}
const model = Bun.serve({
  hostname: '127.0.0.1',
  port: 0,
  async fetch(req) {
    const body = await req.json();
    const slow = body.messages.some((m: { content: string }) => m.content === 'slow');
    if (slow)
      return new Response(new ReadableStream({ start() {} }), {
        headers: { 'Content-Type': 'application/json' },
      });
    return Response.json({
      id: 'local-test',
      object: 'chat.completion',
      created: 1,
      model: 'test',
      choices: [
        {
          index: 0,
          finish_reason: 'stop',
          message: { role: 'assistant', content: 'Local fixture answer' },
        },
      ],
      usage: { prompt_tokens: 12, completion_tokens: 4, total_tokens: 16 },
    });
  },
});
const port = freePort(),
  base = `http://127.0.0.1:${port}`;
const bridge = Bun.spawn(['bun', 'scripts/sidecar-bridge.ts'], {
  env: { ...process.env, STOCKAI_BRIDGE_PORT: String(port) },
  stdout: 'ignore',
  stderr: 'pipe',
});
const configOverride = {
  _version: CONFIG_VERSION,
  activeProvider: 'openai',
  providerConfigs: {
    openai: {
      apiKey: 'local-test-only',
      baseUrl: `http://127.0.0.1:${model.port}/v1`,
      model: 'test',
    },
  },
  language: 'en',
  deepMode: false,
};
const invoke = (requestId: string, question: string) =>
  fetch(`${base}/invoke`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requestId,
      args: ['--chat', CONFIG_SLOT, PAYLOAD_SLOT],
      payload: { symbol: 'AAPL', question, history: [], context: {} },
      configOverride,
    }),
  });
try {
  let ready = false;
  for (let i = 0; i < 50; i++) {
    try {
      await fetch(base);
      ready = true;
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  if (!ready) throw new Error('Bridge startup failed');
  const response = await invoke('progress-test', 'hello');
  const events = (await response.text())
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  if (
    !events.some(
      (e) => e.kind === 'progress' && e.data.type === 'usage' && e.data.inputTokens === 12,
    )
  )
    throw new Error('Usage event missing');
  const result = events.find((e) => e.kind === 'result');
  if (JSON.parse(result?.raw ?? '{}').data?.reply !== 'Local fixture answer')
    throw new Error('Final reply missing');
  console.log('✅ Sidecar 用量事件与最终 JSON 均到达');
  const slow = await invoke('cancel-test', 'slow');
  await new Promise((r) => setTimeout(r, 250));
  const cancelledAt = Date.now();
  await fetch(`${base}/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestId: 'cancel-test' }),
  });
  const cancelled = await Promise.race([
    slow.text(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Cancelled process did not exit')), 5000),
    ),
  ]);
  if (!cancelled.includes('ERR_BRIDGE')) throw new Error('Cancelled task returned a success');
  console.log(`✅ 取消后 Sidecar 在 ${Date.now() - cancelledAt}ms 内退出`);
} finally {
  bridge.kill();
  await bridge.exited;
  model.stop(true);
}
