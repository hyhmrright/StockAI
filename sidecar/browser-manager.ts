import { chromium, Browser, Page } from 'playwright-core';
import { BROWSER_CONTEXT_DEFAULTS, BROWSER_LAUNCH_ARGS } from './config';
import { logger, toErrorMessage } from './utils';
import * as path from 'path';
import * as fs from 'fs';

/**
 * 浏览器生命周期管理器
 * 封装 Chromium 的启动、上下文创建和销毁逻辑
 * 核心：支持在找不到 Playwright 默认浏览器时自动寻找并使用系统浏览器 (Chrome/Edge)
 */
export class BrowserManager {
  private browser: Browser | null = null;
  private pagePromise: Promise<Page> | null = null;

  /**
   * 获取或创建一个新的页面
   * 采用懒加载模式，仅在需要时启动浏览器
   */
  async getPage(): Promise<Page> {
    if (this.pagePromise) return this.pagePromise;

    this.pagePromise = (async () => {
      logger.info("首次需要浏览器，准备启动...");
      
      // 1. 设置 Playwright 资源目录（browsers.json 所在位置）
      this.setupPlaywrightResources();

      // 2. 尝试启动
      try {
        this.browser = await chromium.launch({ 
          headless: true, 
          args: BROWSER_LAUNCH_ARGS 
        });
      } catch (err) {
        logger.warn(`默认浏览器启动失败: ${toErrorMessage(err)}。尝试寻找系统浏览器...`);
        
        // 3. 回退：寻找系统浏览器
        const executablePath = this.findSystemBrowser();
        if (executablePath) {
          logger.info(`找到系统浏览器: ${executablePath}，尝试使用...`);
          this.browser = await chromium.launch({ 
            executablePath,
            headless: true, 
            args: BROWSER_LAUNCH_ARGS 
          });
        } else {
          throw new Error("无法找到可用浏览器 (默认与系统浏览器均不可用)。请检查环境。");
        }
      }

      const context = await this.browser.newContext(BROWSER_CONTEXT_DEFAULTS);
      return context.newPage();
    })().catch(err => {
      // 启动失败时清空缓存，允许下次调用重试
      this.pagePromise = null;
      throw err;
    });

    return this.pagePromise;
  }

  /**
   * 设置 Playwright 寻找 browsers.json 的路径
   * 适配 Tauri 打包后的目录结构
   */
  private setupPlaywrightResources(): void {
    const exePath = process.execPath;
    const exeDir = path.dirname(exePath);
    
    // 可能存在 browsers.json 的路径列表 (按优先级)
    const candidates = [
      path.join(exeDir, 'browsers.json'), // 与二进制同级 (Sidecar 构建脚本放置处)
      path.join(exeDir, 'bin/browsers.json'), // Tauri 资源路径 (Windows/Linux)
      path.join(exeDir, '../Resources/bin/browsers.json'), // Tauri 资源路径 (macOS)
      path.join(process.cwd(), 'src-tauri/bin/browsers.json'), // 开发模式
    ];

    for (const p of candidates) {
      if (fs.existsSync(p)) {
        logger.debug(`设置 PLAYWRIGHT_BROWSERS_PATH 为: ${path.dirname(p)}`);
        process.env.PLAYWRIGHT_BROWSERS_PATH = path.dirname(p);
        return;
      }
    }
  }

  /**
   * 寻找系统中的 Chromium 内核浏览器
   */
  private findSystemBrowser(): string | null {
    const platform = process.platform;
    let paths: string[] = [];

    if (platform === 'darwin') {
      paths = [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
        '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
        '/Applications/Vivaldi.app/Contents/MacOS/Vivaldi',
      ];
    } else if (platform === 'win32') {
      const programFiles = process.env.PROGRAMFILES || 'C:\\Program Files';
      const programFilesX86 = process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)';
      const localAppData = process.env.LOCALAPPDATA || '';
      
      paths = [
        path.join(programFiles, 'Google\\Chrome\\Application\\chrome.exe'),
        path.join(programFilesX86, 'Google\\Chrome\\Application\\chrome.exe'),
        path.join(programFiles, 'Microsoft\\Edge\\Application\\msedge.exe'),
        path.join(programFilesX86, 'Microsoft\\Edge\\Application\\msedge.exe'),
        path.join(localAppData, 'Google\\Chrome\\Application\\chrome.exe'),
      ];
    } else if (platform === 'linux') {
      paths = [
        '/usr/bin/google-chrome',
        '/usr/bin/microsoft-edge',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
      ];
    }

    return paths.find(p => fs.existsSync(p)) || null;
  }

  /**
   * 关闭浏览器并清理资源
   */
  async close(): Promise<void> {
    if (this.pagePromise) {
      try { await this.pagePromise; } catch { /* 忽略启动期间的错误 */ }
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.pagePromise = null;
    }
  }
}
