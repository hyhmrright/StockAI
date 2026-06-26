import { useCallback, useState } from 'react';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

/** 更新流程状态机 */
export type UpdateStatus =
  | 'idle' // 未检查
  | 'checking' // 正在检查
  | 'available' // 发现新版本
  | 'downloading' // 下载安装中
  | 'ready' // 已安装，待重启
  | 'uptodate' // 已是最新
  | 'error'; // 检查或下载失败

interface UpdaterState {
  status: UpdateStatus;
  version?: string; // 新版本号
  progress: number; // 下载进度 0-100
  error?: string;
}

/**
 * 封装 Tauri 自动更新：检查 → 下载安装 → 重启。
 * 所有异常都被捕获并落到 status="error"，调用方按需展示（启动静默检查不打扰用户）。
 */
export function useUpdater() {
  const [state, setState] = useState<UpdaterState>({ status: 'idle', progress: 0 });
  const [update, setUpdate] = useState<Update | null>(null);

  const checkForUpdate = useCallback(async () => {
    setState({ status: 'checking', progress: 0 });
    try {
      const found = await check();
      if (found) {
        setUpdate(found);
        setState({ status: 'available', version: found.version, progress: 0 });
      } else {
        setState({ status: 'uptodate', progress: 0 });
      }
    } catch (e) {
      setState({ status: 'error', progress: 0, error: String(e) });
    }
  }, []);

  const downloadAndRestart = useCallback(async () => {
    if (!update) return;
    try {
      let total = 0;
      let downloaded = 0;
      setState((s) => ({ ...s, status: 'downloading', progress: 0 }));
      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case 'Started':
            total = event.data.contentLength ?? 0;
            break;
          case 'Progress':
            downloaded += event.data.chunkLength;
            setState((s) => ({
              ...s,
              status: 'downloading',
              progress: total ? Math.round((downloaded / total) * 100) : 0,
            }));
            break;
          case 'Finished':
            setState((s) => ({ ...s, status: 'ready', progress: 100 }));
            break;
        }
      });
      // 安装完成后重启进入新版本
      await relaunch();
    } catch (e) {
      setState({ status: 'error', progress: 0, error: String(e) });
    }
  }, [update]);

  return { ...state, checkForUpdate, downloadAndRestart };
}
