import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const get = vi.fn();
const getStore = vi.fn(() => Promise.resolve({ get, set: vi.fn(), save: vi.fn() }));

vi.mock('../lib/store', () => ({ getStore: () => getStore() }));

// useSettings 的状态与「只读盘一次」的闸门都在模块级（单例，见该文件注释），
// 会跨用例残留。每例重新 import 一份干净模块，而不是给生产代码加个测试专用的 reset 出口。
let useSettings: typeof import('./useSettings').useSettings;

describe('useSettings 的 needsSetup', () => {
  beforeEach(async () => {
    get.mockReset();
    getStore.mockClear();
    getStore.mockImplementation(() => Promise.resolve({ get, set: vi.fn(), save: vi.fn() }));
    vi.resetModules();
    ({ useSettings } = await import('./useSettings'));
  });

  it('读盘成功但没有 app_settings 时为 true（首次启动）', async () => {
    get.mockResolvedValue(null);
    const { result } = renderHook(() => useSettings());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.needsSetup).toBe(true);
  });

  it('已有 app_settings 时为 false', async () => {
    get.mockResolvedValue({ _version: '3', activeProvider: 'openai' });
    const { result } = renderHook(() => useSettings());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.needsSetup).toBe(false);
  });

  it('读盘失败时为 false——「不知道」不等于「没配过」，不该据此弹引导', async () => {
    // 浏览器 dev 模式无 Tauri store 即属此列；弹引导会变成每次启动都骚扰
    getStore.mockImplementation(() => Promise.reject(new Error('no tauri')));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderHook(() => useSettings());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.needsSetup).toBe(false);
  });

  it('多个实例共享同一份状态：一处保存，另一处立即看到', async () => {
    // 回归保护：状态曾是每个 hook 各一份，后果是在设置里改了语言，
    // 只有 SettingsModal 自己那份更新，其余界面（都经 useLanguage → useSettings）要重启才切。
    get.mockResolvedValue({ _version: '3', language: 'zh' });
    const a = renderHook(() => useSettings());
    const b = renderHook(() => useSettings());
    await waitFor(() => expect(a.result.current.isLoading).toBe(false));

    await act(async () => {
      await a.result.current.updateSettings({ language: 'en' });
    });

    expect(b.result.current.settings.language).toBe('en');
    expect(b.result.current.needsSetup).toBe(false);
  });

  it('并发挂载只读一次盘', async () => {
    get.mockResolvedValue({ _version: '3' });
    renderHook(() => useSettings());
    renderHook(() => useSettings());
    renderHook(() => useSettings());

    await waitFor(() => expect(getStore).toHaveBeenCalled());
    expect(getStore).toHaveBeenCalledTimes(1);
  });
});
