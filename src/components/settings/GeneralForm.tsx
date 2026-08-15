import React from 'react';
import { appLogDir } from '@tauri-apps/api/path';
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import { Settings } from '../../hooks/useSettings';
import { useLanguage, type Language } from '../../hooks/useLanguage';
import { UpdateChecker } from './UpdateChecker';

interface GeneralFormProps {
  settings: Settings;
  onChange: (s: Partial<Settings>) => void;
}

interface ToggleProps {
  enabled: boolean;
  onToggle: () => void;
}

function Toggle({ enabled, onToggle }: ToggleProps) {
  return (
    <button
      onClick={onToggle}
      className={`w-10 h-5 rounded-full relative transition-colors ${
        enabled ? 'bg-emerald-500/30' : 'bg-gray-800'
      }`}
    >
      <div
        className={`absolute top-0.5 w-4 h-4 rounded-full shadow-sm transition-all ${
          enabled ? 'right-0.5 bg-emerald-400' : 'left-0.5 bg-gray-500'
        }`}
      />
    </button>
  );
}

const LANGUAGES: { value: Language; label: string }[] = [
  { value: 'zh', label: '中文' },
  { value: 'en', label: 'English' },
  { value: 'ja', label: '日本語' },
];

/**
 * 在文件管理器里定位日志目录。
 *
 * 打包后的应用没有终端，用户手上唯一的一手证据就是这个目录里的 sidecar.log；
 * 没有这个入口，日志写得再全也送不到维护者手上。浏览器 dev 模式无 Tauri API，
 * 读不到属预期，留痕即可、不打断 UI。
 */
function openLogDir(): void {
  appLogDir()
    .then(revealItemInDir)
    .catch((e) => console.error('[GeneralForm] 打开日志目录失败:', e));
}

export const GeneralForm: React.FC<GeneralFormProps> = ({ settings, onChange }) => {
  const { t } = useLanguage();
  return (
    <div className="space-y-6">
      <div className="setting-row">
        <div className="setting-label">
          <span className="setting-title text-gray-200">{t('auto_analyze_label')}</span>
          <span className="setting-desc text-gray-500 text-xs">{t('auto_analyze_desc')}</span>
        </div>
        <Toggle
          enabled={settings.autoAnalyze}
          onToggle={() => onChange({ autoAnalyze: !settings.autoAnalyze })}
        />
      </div>
      <div className="setting-row">
        <div className="setting-label">
          <span className="setting-title text-gray-200">{t('deep_mode_label')}</span>
          <span className="setting-desc text-gray-500 text-xs">{t('deep_mode_desc')}</span>
        </div>
        <Toggle
          enabled={settings.deepMode}
          onToggle={() => onChange({ deepMode: !settings.deepMode })}
        />
      </div>
      <div className="setting-row">
        <div className="setting-label">
          <span className="setting-title text-gray-200">{t('language_label')} / Language</span>
          <span className="setting-desc text-gray-500 text-xs">{t('language_desc')}</span>
        </div>
        <div className="flex gap-2">
          {LANGUAGES.map(({ value, label }) => (
            <button
              type="button"
              key={value}
              onClick={() => onChange({ language: value })}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                settings.language === value
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                  : 'bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="setting-row">
        <div className="setting-label">
          <span className="setting-title text-gray-200">{t('log_dir_label')}</span>
          <span className="setting-desc text-gray-500 text-xs">{t('log_dir_desc')}</span>
        </div>
        <button
          type="button"
          onClick={openLogDir}
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10 hover:text-gray-100 transition-all"
        >
          {t('log_dir_open')}
        </button>
      </div>
      <UpdateChecker />
    </div>
  );
};
