import type { Page } from 'playwright-core';
import { BrowserManager } from '../sidecar/browser-manager';

/**
 * 前端 E2E 冒烟：用真浏览器把应用跑起来，断言主界面确实画出来了。
 *
 * 为什么需要它：vitest 跑在 happy-dom 上，没有 canvas，PriceChart 的单测把
 * lightweight-charts 整个 mock 掉了（见 PriceChart.test.tsx 顶部注释）——
 * 也就是说「图表还画不画得出来」这件事在默认套件里是结构性失明的，
 * 改坏了也全绿。这里补上那一刀：读回 canvas 像素，断言 K 线实体真的画上去了。
 *
 * 不走 Tauri 外壳：tauri-driver 不支持 macOS。浏览器模式下 ipc.ts 的 isTauri()
 * 为假，自动退回 dev-mocks，因此本脚本只验证「前端渲染管线」，不验证数据源
 * ——数据源由 datasource-smoke.yml 的每日集成测试守着，两者互补。
 *
 * 用法：bun scripts/e2e-smoke.ts
 */

const PORT = 1425; // 不用 1420，避开可能开着的 `bun tauri dev`
const BASE_URL = `http://localhost:${PORT}`;
const SERVER_READY_TIMEOUT_MS = 60_000;
const PAGE_TIMEOUT_MS = 30_000;

/** 涨跌色（见 src/lib/market-hours.ts）；两个市场只是对调，颜色集合相同 */
const CANDLE_COLORS: number[][] = [
  [0xff, 0x4d, 0x4f],
  [0x10, 0xb9, 0x81],
];

/** K 线实体至少要铺开这么多像素行，否则只是根水平线或一片空图 */
const MIN_CANDLE_ROWS = 20;

async function waitForServer(): Promise<void> {
  const deadline = Date.now() + SERVER_READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const resp = await fetch(BASE_URL, { signal: AbortSignal.timeout(2000) });
      if (resp.ok) return;
    } catch {
      // 还没起来，继续轮询
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Vite 在 ${SERVER_READY_TIMEOUT_MS}ms 内没有在 ${BASE_URL} 就绪`);
}

/**
 * 数「有多少条像素行出现了 K 线实体色」。
 *
 * 为什么不是「canvas 非空白就算过」：空数据的图表照样会画网格、坐标轴和边框，
 * 那种断言在把 setData 整个注释掉之后依然通过——试过，确实不红。
 * 也不能只数像素总数：现价水平线同样是涨跌色，横跨整幅宽度、轻松上千像素。
 * 行数才能把二者分开——水平线只占 1–2 行，而 K 线实体沿价格轴铺开几十行。
 */
async function countCandleRows(page: Page): Promise<number> {
  return page.evaluate((colors: number[][]) => {
    let best = 0;
    for (const canvas of Array.from(document.querySelectorAll('canvas'))) {
      if (canvas.width === 0 || canvas.height === 0) continue;
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      let rows = 0;
      for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
          const i = (y * canvas.width + x) * 4;
          if (
            colors.some((c) => data[i] === c[0] && data[i + 1] === c[1] && data[i + 2] === c[2])
          ) {
            rows++;
            break;
          }
        }
      }
      best = Math.max(best, rows);
    }
    return best;
  }, CANDLE_COLORS);
}

/**
 * 浏览器模式下必然出现、且不代表回归的错误。
 *
 * 只放行两类，都是「没有桌面外壳」这一个原因的两种表现——放宽到别的模式
 * 就等于把真回归也一起吞掉：
 * - Tauri IPC 缺席：@tauri-apps/api 在浏览器里没有 window.__TAURI_INTERNALS__，
 *   凡走 store / sql 插件的调用都炸在读 `invoke` 上（useSettings、useWatchlist）
 * - :3001 拒连：sidecar-bridge 没启动，ipc.ts 按设计退回 dev-mocks
 */
function isExpectedBrowserModeError(text: string): boolean {
  return (
    text.includes("Cannot read properties of undefined (reading 'invoke')") ||
    text.includes('ERR_CONNECTION_REFUSED')
  );
}

async function runChecks(page: Page, pageErrors: string[]): Promise<void> {
  page.setDefaultTimeout(PAGE_TIMEOUT_MS);

  console.log(`阶段 1: 打开 ${BASE_URL} ...`);
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });

  console.log('阶段 2: 等待主界面挂载...');
  const searchInput = page.locator('input[placeholder]').first();
  await searchInput.waitFor({ state: 'visible' });
  console.log('✅ 搜索框已渲染');

  console.log('阶段 3: 等待 K 线画出来...');
  const deadline = Date.now() + PAGE_TIMEOUT_MS;
  let rows = 0;
  while (Date.now() < deadline) {
    rows = await countCandleRows(page);
    if (rows >= MIN_CANDLE_ROWS) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  if (rows < MIN_CANDLE_ROWS) {
    throw new Error(
      `K 线实体只覆盖了 ${rows} 条像素行（要求 ≥ ${MIN_CANDLE_ROWS}）——图表渲染链路可能已经坏了`,
    );
  }
  console.log(`✅ K 线实体覆盖 ${rows} 条像素行`);

  console.log('阶段 4: 检查启动期未捕获错误...');
  if (pageErrors.length > 0) {
    throw new Error(`启动过程中有 ${pageErrors.length} 条未捕获错误:\n${pageErrors.join('\n')}`);
  }
  console.log('✅ 无未捕获错误');
}

async function main() {
  console.log('🚀 前端 E2E 冒烟开始');

  const vite = Bun.spawn(['bunx', 'vite', '--port', String(PORT), '--strictPort'], {
    cwd: new URL('..', import.meta.url).pathname,
    stdout: 'inherit',
    stderr: 'inherit',
  });

  const browserManager = new BrowserManager();
  const pageErrors: string[] = [];
  let failure: unknown = null;

  try {
    await waitForServer();

    const page = await browserManager.getPage();
    const record = (label: string, text: string) => {
      if (!isExpectedBrowserModeError(text)) pageErrors.push(`[${label}] ${text}`);
    };
    page.on('pageerror', (err) => record('pageerror', err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') record('console.error', msg.text());
    });

    await runChecks(page, pageErrors);
  } catch (err) {
    failure = err;
  } finally {
    await browserManager.close().catch(() => {});
    vite.kill();
    await vite.exited;
  }

  if (failure) {
    console.error(`\n❌ E2E 冒烟失败: ${failure instanceof Error ? failure.message : failure}`);
    process.exit(1);
  }
  console.log('\n🎉 E2E 冒烟通过');
}

main();
