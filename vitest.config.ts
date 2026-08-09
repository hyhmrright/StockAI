import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'happy-dom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    /**
     * 默认 5s 在 Windows CI 上偏紧：同一套件本地跑 2s、Windows runner 上跑 45s（约 20 倍），
     * 于是 5s 只相当于本地 250ms 的预算，PriceChart 那条渲染用例已因此偶发红过一次
     * （run 31290983434，重跑即绿）。
     *
     * **20 倍的慢从何而来尚未定位**，这里只是把阈值放到对最慢 runner 也说得通的量级，
     * 不是掩盖挂死——真正卡住的用例照样会失败，只是晚 15 秒。
     */
    testTimeout: 20_000,
  },
});
