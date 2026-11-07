import { join } from 'path';
import { tmpdir } from 'os';
import { writeFileSync, unlinkSync } from 'fs';
import { errorEnvelope } from '../sidecar/protocol';
import { CONFIG_VERSION } from '../shared/constants';
import { CONFIG_SLOT, PAYLOAD_SLOT } from '../shared/actions';

/**
 * Sidecar 开发桥接器 — 浏览器 dev 模式下替代 Tauri Core。
 *
 * 与 src-tauri/src/lib.rs 的 invoke_sidecar 同构：只认 shared/actions.ts 的两个哨兵，
 * 不认识任何具体 action。所以新增 sidecar 能力时本文件无需改动（旧版按 cmd 名逐条 if
 * 分支，永远只覆盖一部分命令，这正是要消除的漂移面）。
 */
const SIDECAR_ENTRY = join(process.cwd(), 'sidecar', 'index.ts');
const CORS_ORIGIN = 'http://localhost:1420';

/** 开发用配置：从环境变量拼出 sidecar 期望的 raw config 形态（参考 configResolver.ts） */
function devSettings() {
  const provider = process.env.AI_PROVIDER || 'openai';
  return {
    _version: CONFIG_VERSION,
    activeProvider: provider,
    providerConfigs: {
      [provider]: {
        apiKey: process.env.OPENAI_API_KEY || '',
        baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
        model: process.env.AI_MODEL || 'gpt-4o-mini',
      },
    },
    deepMode: true,
  };
}

/** 写临时 JSON（配置用 0o600），返回路径 */
function writeTemp(label: string, value: unknown, mode?: number): string {
  const path = join(
    tmpdir(),
    `stockai-${label}-bridge-${process.pid}-${process.hrtime.bigint()}.json`,
  );
  writeFileSync(path, JSON.stringify(value), mode ? { mode } : undefined);
  return path;
}

const jobs = new Map<string, ReturnType<typeof Bun.spawn>>();
const server = Bun.serve({
  idleTimeout: 0,
  port: Number(process.env.STOCKAI_BRIDGE_PORT ?? 3001),
  hostname: '127.0.0.1',
  async fetch(req) {
    const url = new URL(req.url);

    if (req.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': CORS_ORIGIN,
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    if (url.pathname === '/cancel' && req.method === 'POST') {
      const { requestId } = await req.json();
      jobs.get(requestId)?.kill();
      return new Response('{}', {
        headers: { 'Access-Control-Allow-Origin': CORS_ORIGIN, 'Content-Type': 'application/json' },
      });
    }
    if (url.pathname !== '/invoke' || req.method !== 'POST') {
      return new Response('Not Found', { status: 404 });
    }

    const corsHeaders = {
      'Access-Control-Allow-Origin': CORS_ORIGIN,
      'Content-Type': 'application/json',
    };
    const {
      args = [],
      payload,
      configOverride,
      requestId = crypto.randomUUID(),
    } = await req.json();
    console.log(`[Bridge] argv: ${JSON.stringify(args)}`);

    // 哨兵替换：与 Rust 侧逐字对应
    const tempPaths: string[] = [];
    const resolved: string[] = args.map((arg: string) => {
      if (arg === CONFIG_SLOT) {
        const path = writeTemp('config', configOverride ?? devSettings(), 0o600);
        tempPaths.push(path);
        return `@${path}`;
      }
      if (arg === PAYLOAD_SLOT) {
        const path = writeTemp('payload', payload ?? null);
        tempPaths.push(path);
        return path;
      }
      return arg;
    });

    // NDJSON 只用于开发 HTTP；Sidecar stdout 仍是单个最终 JSON。
    const child = Bun.spawn(['bun', SIDECAR_ENTRY, ...resolved], {
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env },
    });
    jobs.set(requestId, child);
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        const send = (value: unknown) => {
          try {
            controller.enqueue(encoder.encode(JSON.stringify(value) + '\n'));
          } catch {
            child.kill();
          }
        };
        send({ kind: 'progress', data: { type: 'phase', phase: 'started' } });
        const stderr = (async () => {
          const reader = child.stderr.getReader(),
            decoder = new TextDecoder();
          let buffer = '';
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';
            for (const line of lines)
              if (line.startsWith('STOCKAI_EVENT:')) {
                try {
                  send({ kind: 'progress', data: JSON.parse(line.slice('STOCKAI_EVENT:'.length)) });
                } catch {
                  /* 非法事件不能污染结果 */
                }
              }
          }
        })();
        try {
          const stdout = await new Response(child.stdout).text();
          await child.exited;
          await stderr;
          send({
            kind: 'result',
            raw: stdout || JSON.stringify(errorEnvelope('ERR_BRIDGE', 'no stdout')),
          });
        } catch {
          send({
            kind: 'result',
            raw: JSON.stringify(errorEnvelope('ERR_BRIDGE', 'process failed')),
          });
        } finally {
          jobs.delete(requestId);
          for (const path of tempPaths) {
            try {
              unlinkSync(path);
            } catch {
              /* 已清理 */
            }
          }
          try {
            controller.close();
          } catch {
            /* 请求已断开 */
          }
        }
      },
      cancel() {
        child.kill();
      },
    });
    return new Response(stream, {
      headers: { ...corsHeaders, 'Content-Type': 'application/x-ndjson' },
    });
  },
});

console.log(`🚀 Sidecar 开发桥接器已启动: ${server.url}`);
