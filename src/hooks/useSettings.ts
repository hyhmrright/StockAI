import { useEffect, useSyncExternalStore } from 'react';
import { getStore } from '../lib/store';
import { ProviderType, Language, Role, ModelChoice, RoleModels } from '../../shared/types';
import {
  PROVIDER_PROFILES,
  DEFAULT_SETTINGS as SHARED_DEFAULT_SETTINGS,
  CONFIG_VERSION,
  DEFAULT_SELECTED_MASTERS,
} from '../../shared/constants';

export type { ProviderType, Language, Role, ModelChoice, RoleModels };

export interface ProviderConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface Settings {
  _version: string;
  activeProvider: ProviderType;
  providerConfigs: Partial<Record<ProviderType, ProviderConfig>>;
  /** 按角色分级模型；空对象 = 所有角色跟随 activeProvider（默认） */
  roleModels: RoleModels;
  autoAnalyze: boolean;
  deepMode: boolean;
  masterAnalysis: boolean;
  selectedMasters: string[];
  language: Language;
}

// 重新导出常量以供 UI 组件使用
export { PROVIDER_PROFILES };

export const DEFAULT_SETTINGS: Settings = {
  _version: CONFIG_VERSION,
  ...SHARED_DEFAULT_SETTINGS,
  masterAnalysis: false,
  selectedMasters: DEFAULT_SELECTED_MASTERS,
  // 默认空 = 所有角色跟随 activeProvider；用户在角色矩阵里按需 opt-in 分级
  roleModels: {},
  providerConfigs: {
    ollama: {
      apiKey: '',
      baseUrl: PROVIDER_PROFILES.ollama.baseUrl,
      model: PROVIDER_PROFILES.ollama.model,
    },
  },
};

interface SettingsState {
  settings: Settings;
  isLoading: boolean;
  /**
   * 「从未保存过配置」，首启引导（OnboardingGuide）的触发条件。
   * 初值 false 且只在读盘成功却没有 app_settings 时置 true：读盘本身失败说明「不知道」，
   * 不是「没配过」，不该据此弹引导。
   */
  needsSetup: boolean;
}

/**
 * 模块级单例状态：所有 useSettings() 看到同一份，改一处全局同步。
 *
 * 为什么不能每个 hook 各持一份：useLanguage 建立在 useSettings 之上，而它的调用方遍布
 * 整棵组件树。各自一份的后果是——在设置里改了语言，只有 SettingsModal 那份会更新，
 * 其余界面得重启才跟着切；同理保存配置后 Dashboard 的 needsSetup 不会回落，首启引导关不掉。
 */
let state: SettingsState = { settings: DEFAULT_SETTINGS, isLoading: true, needsSetup: false };
const listeners = new Set<() => void>();

function setState(patch: Partial<SettingsState>) {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

async function loadSettings() {
  try {
    const store = await getStore();
    const saved = await store.get<Partial<Settings>>('app_settings');

    if (saved) {
      // 执行深合并确保 providerConfigs 完整
      const mergedConfigs = { ...DEFAULT_SETTINGS.providerConfigs };
      if (saved.providerConfigs) {
        for (const [p, cfg] of Object.entries(saved.providerConfigs)) {
          const provider = p as ProviderType;
          mergedConfigs[provider] = {
            ...DEFAULT_SETTINGS.providerConfigs[provider],
            ...cfg,
          };
        }
      }

      const migrated = {
        ...DEFAULT_SETTINGS,
        ...saved,
        providerConfigs: mergedConfigs,
        // roleModels 增量补默认：旧配置无此字段时为空对象（全部跟随 active），有则原样保留
        roleModels: { ...DEFAULT_SETTINGS.roleModels, ...(saved.roleModels ?? {}) },
        _version: CONFIG_VERSION,
      };

      if (saved._version !== CONFIG_VERSION) {
        await store.set('app_settings', migrated);
        await store.save();
      }
      setState({ settings: migrated });
    } else {
      setState({ needsSetup: true });
    }
  } catch (error) {
    console.error('加载设置失败:', error);
  } finally {
    setState({ isLoading: false });
  }
}

async function updateSettings(newSettings: Partial<Settings>) {
  try {
    const updated = { ...state.settings, ...newSettings };
    setState({ settings: updated });

    const store = await getStore();
    await store.set('app_settings', updated);
    await store.save();
    setState({ needsSetup: false });
  } catch (error) {
    console.error('保存设置失败:', error);
  }
}

/** 读盘只做一次：多处 useSettings 同时挂载不该各读一遍 store */
let loadOnce: Promise<void> | null = null;

export function useSettings() {
  const snapshot = useSyncExternalStore(subscribe, () => state);

  useEffect(() => {
    loadOnce ??= loadSettings();
  }, []);

  return { ...snapshot, updateSettings };
}
