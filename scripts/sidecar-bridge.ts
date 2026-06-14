import { spawnSync } from "child_process";
import { join } from "path";
import { tmpdir } from "os";
import { writeFileSync, unlinkSync } from "fs";
import { errorEnvelope } from "../sidecar/utils";
import { CONFIG_VERSION } from "../shared/constants";

/**
 * Sidecar 桥接服务器 (增强版)
 */
const SIDECAR_PATH = join(process.cwd(), "sidecar", "stockai-backend-aarch64-apple-darwin");
const SIDECAR_ENTRY = join(process.cwd(), "sidecar", "index.ts");

const CORS_ORIGIN = "http://localhost:1420";

const server = Bun.serve({
  port: 3001,
  hostname: "127.0.0.1",
  async fetch(req) {
    const url = new URL(req.url);

    if (req.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": CORS_ORIGIN,
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    if (url.pathname === "/invoke" && req.method === "POST") {
      const { cmd, args } = await req.json();
      console.log(`[Bridge] 执行指令: ${cmd}, 目标股票: ${args.symbol}`);

      // K 线 / 实时报价：用 bun 跑源码而非二进制，避免旧版本二进制不识别新 action
      const corsHeaders = { "Access-Control-Allow-Origin": CORS_ORIGIN, "Content-Type": "application/json" };
      const runAndRespond = (sidecarArgs: string[], label: string) => {
        const result = spawnSync("bun", [SIDECAR_ENTRY, ...sidecarArgs], { encoding: "utf-8", env: { ...process.env } });
        if (result.stderr) console.error(`[Bridge][${label}] ${result.stderr}`);
        const fallback = JSON.stringify(errorEnvelope("ERR_BRIDGE", result.error?.message || "no stdout"));
        return new Response(result.stdout || fallback, { headers: corsHeaders });
      };

      if (cmd === "fetch_kline") return runAndRespond(["--kline", JSON.stringify(args.request)], "kline");
      if (cmd === "fetch_realtime_quote") return runAndRespond(["--quote", args.symbol], "quote");
      if (cmd === "fetch_quant_bundle") return runAndRespond(["--quant", args.symbol], "quant");

      // sidecar 期望的 raw config 形态：需要 _version + providerConfigs 结构（参考 configResolver.ts）
      const buildSettingsJson = () => {
        const provider = process.env.AI_PROVIDER || "openai";
        return JSON.stringify({
          _version: CONFIG_VERSION,
          activeProvider: provider,
          providerConfigs: {
            [provider]: {
              apiKey: process.env.OPENAI_API_KEY || "",
              baseUrl: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
              model: process.env.AI_MODEL || "gpt-4o-mini",
            },
          },
          deepMode: true,
        });
      };

      if (cmd === "fetch_market_bundle") {
        return runAndRespond(["--bundle", buildSettingsJson(), args.symbol], "bundle");
      }
      if (cmd === "analyze_news") {
        // 与 Rust 端保持一致：news 走临时文件而非 argv，避免 ARG_MAX。
        // 用 hrtime.bigint() 取纳秒精度文件名，避免同毫秒内并发碰撞（Date.now() 仅 ms）。
        const tempPath = join(tmpdir(), `stockai-news-bridge-${process.pid}-${process.hrtime.bigint()}.json`);
        writeFileSync(tempPath, JSON.stringify(args.news ?? []), "utf-8");
        try {
          return runAndRespond(["--analyze-only", buildSettingsJson(), args.symbol, tempPath], "analyze");
        } finally {
          try { unlinkSync(tempPath); } catch { /* ignore */ }
        }
      }

      if (cmd === "start_analysis") {
        const config = {
          provider: process.env.AI_PROVIDER || "openai",
          apiKey: process.env.OPENAI_API_KEY || "",
          baseUrl: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
          modelName: process.env.AI_MODEL || "gpt-4o-mini",
          deepMode: true
        };

        console.log(`[Bridge] 使用配置: Provider=${config.provider}, Model=${config.modelName}`);

        const tempPath = join(tmpdir(), `stockai-config-bridge-${process.pid}-${process.hrtime.bigint()}.json`);
        writeFileSync(tempPath, JSON.stringify(config), { mode: 0o600 });
        try {
          const result = spawnSync(SIDECAR_PATH, [args.symbol, `@${tempPath}`], {
            encoding: "utf-8",
            env: { ...process.env }
          });

          if (result.error) {
            console.error("[Bridge] Sidecar 运行致命错误:", result.error);
            return Response.json({ error: result.error.message }, { headers: { "Access-Control-Allow-Origin": CORS_ORIGIN } });
          }

          console.log(`[Bridge] Sidecar 返回长度: ${result.stdout.length}`);
          if (result.stderr) console.error(`[Bridge] Sidecar Stderr: ${result.stderr}`);

          return new Response(result.stdout, {
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": CORS_ORIGIN
            },
          });
        } finally {
          try { unlinkSync(tempPath); } catch { /* ignore */ }
        }
      }
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log(`🚀 增强型桥接器已启动: ${server.url}`);
