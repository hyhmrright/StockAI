import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const get = vi.fn();
const getStore = vi.fn(() => Promise.resolve({ get, set: vi.fn(), save: vi.fn() }));

vi.mock('../lib/store', () => ({ getStore: () => getStore() }));

import { useSettings } from './useSettings';

describe('useSettings 的 needsSetup', () => {
  beforeEach(() => {
    get.mockReset();
    getStore.mockClear();
    getStore.mockImplementation(() => Promise.resolve({ get, set: vi.fn(), save: vi.fn() }));
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
});
