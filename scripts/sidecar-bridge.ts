import { spawnSync } from "child_process";
import { join } from "path";

/**
 * Sidecar 桥接服务器 (增强版)
 */
const SIDECAR_PATH = join(process.cwd(), "sidecar", "stockai-backend-aarch64-apple-darwin");

const server = Bun.serve({
  port: 3001,
  async fetch(req) {
    const url = new URL(req.url);
    
    if (req.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    if (url.pathname === "/invoke" && req.method === "POST") {
      const { cmd, args } = await req.json();
      console.log(`[Bridge] 执行指令: ${cmd}, 目标股票: ${args.symbol}`);

      if (cmd === "start_analysis") {
        // 尝试从环境变量获取 OpenAI Key 作为测试兜底
        const config = {
          provider: process.env.AI_PROVIDER || "openai",
          apiKey: process.env.OPENAI_API_KEY || "",
          baseUrl: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
          modelName: process.env.AI_MODEL || "gpt-4o-mini",
          deepMode: true
        };
        
        console.log(`[Bridge] 使用配置: Provider=${config.provider}, Model=${config.modelName}`);
        
        const result = spawnSync(SIDECAR_PATH, [args.symbol, JSON.stringify(config)], { 
          encoding: "utf-8",
          env: { ...process.env } // 继承环境变量
        });
        
        if (result.error) {
          console.error("[Bridge] Sidecar 运行致命错误:", result.error);
          return Response.json({ error: result.error.message }, { headers: { "Access-Control-Allow-Origin": "*" } });
        }

        console.log(`[Bridge] Sidecar 返回长度: ${result.stdout.length}`);
        if (result.stderr) console.error(`[Bridge] Sidecar Stderr: ${result.stderr}`);

        return new Response(result.stdout, {
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*" 
          },
        });
      }
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log(`🚀 增强型桥接器已启动: ${server.url}`);
