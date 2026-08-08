import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],

  build: {
    // 不做代码分包，只是把「单 chunk 超 500 KB」的警告调到不误报的位置。
    // 分包是给网页优化首屏下载的：省的是网络往返和跨版本的 HTTP 缓存复用。
    // Tauri 里资源随二进制走本地自定义协议，两样都不存在；而主界面（Dashboard
    // + 图表 + 各面板）本来就是启动即全部挂载，拆成多个 chunk 也是一起加载，
    // 解析耗时一点不少，徒增请求数。真要提速得靠「按需才加载」的懒加载，
    // 不是 manualChunks——所以这里不留一个看起来在优化、实则没优化的配置。
    chunkSizeWarningLimit: 800,
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
