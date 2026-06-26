import React, { useEffect, useState } from 'react';
import { Download, RefreshCw, X } from 'lucide-react';
import { useUpdater } from '../hooks/useUpdater';
import { useLanguage } from '../hooks/useLanguage';

/**
 * 顶部非阻塞更新提示条：启动时静默检查，仅在有新版本/下载中/待重启时出现。
 * 检查中、已最新、出错等状态一律不打扰用户。
 */
export const UpdateBanner: React.FC = () => {
  const { status, version, progress, checkForUpdate, downloadAndRestart } = useUpdater();
  const { t } = useLanguage();
  const [dismissed, setDismissed] = useState(false);

  // 启动时静默检查一次
  useEffect(() => {
    checkForUpdate();
  }, [checkForUpdate]);

  const visible =
    !dismissed && (status === 'available' || status === 'downloading' || status === 'ready');
  if (!visible) return null;

  return (
    <div className="flex items-center justify-center gap-3 px-4 py-2 bg-emerald-600/90 text-white text-sm shadow-lg">
      {status === 'available' && (
        <>
          <Download className="w-4 h-4 shrink-0" />
          <span>{t('update_available', { version: version ?? '' })}</span>
          <button
            onClick={downloadAndRestart}
            className="px-3 py-1 rounded-lg bg-white/20 hover:bg-white/30 font-medium transition-colors"
          >
            {t('update_now')}
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="p-1 rounded-lg hover:bg-white/20 transition-colors"
            aria-label={t('update_later')}
          >
            <X className="w-4 h-4" />
          </button>
        </>
      )}
      {status === 'downloading' && (
        <>
          <RefreshCw className="w-4 h-4 shrink-0 animate-spin" />
          <span>{t('update_downloading', { progress })}</span>
        </>
      )}
      {status === 'ready' && (
        <>
          <RefreshCw className="w-4 h-4 shrink-0 animate-spin" />
          <span>{t('update_restarting')}</span>
        </>
      )}
    </div>
  );
};
