import React from 'react';
import { ProviderType, ProviderConfig, ModelChoice, Role } from '../../hooks/useSettings';
import { PROVIDER_PROFILES } from '../../../shared/constants';
import { useLanguage } from '../../hooks/useLanguage';
import type { TranslationKey } from '../../i18n';
import { ModelSelect } from './ModelSelect';

interface RoleRowProps {
  role: Role;
  choice?: ModelChoice; // undefined = 跟随 activeProvider
  providerConfigs: Partial<Record<ProviderType, ProviderConfig>>;
  activeProvider: ProviderType;
  onChange: (choice: ModelChoice | undefined) => void;
}

const PROVIDERS = Object.keys(PROVIDER_PROFILES) as ProviderType[];

/** 该 provider 是否可用：本地 Ollama 无需 key，云端需已配 apiKey */
function isProviderReady(
  provider: ProviderType,
  configs: RoleRowProps['providerConfigs'],
): boolean {
  return provider === 'ollama' || !!configs[provider]?.apiKey;
}

const ROLE_TITLE_KEY: Record<Role, TranslationKey> = {
  brain: 'role_brain',
  quick: 'role_quick',
  summarize: 'role_summarize',
};
const ROLE_DESC_KEY: Record<Role, TranslationKey> = {
  brain: 'role_brain_desc',
  quick: 'role_quick_desc',
  summarize: 'role_summarize_desc',
};

/** 角色矩阵的一行：选 provider（空 = 跟随活跃）+ 选模型 */
export function RoleRow({
  role,
  choice,
  providerConfigs,
  activeProvider,
  onChange,
}: RoleRowProps): React.ReactElement {
  const { t } = useLanguage();
  const provider = choice?.provider;

  function handleProviderChange(next: string) {
    if (!next) {
      onChange(undefined); // 跟随活跃 provider
      return;
    }
    const p = next as ProviderType;
    const defaultModel = providerConfigs[p]?.model ?? PROVIDER_PROFILES[p].model;
    onChange({ provider: p, model: choice?.provider === p ? choice.model : defaultModel });
  }

  const cfg = provider ? providerConfigs[provider] : undefined;

  return (
    <div className="space-y-3 p-4 rounded-xl bg-black/20 border border-white/5">
      <div>
        <div className="text-sm font-medium text-gray-200">{t(ROLE_TITLE_KEY[role])}</div>
        <div className="text-[10px] text-gray-500">{t(ROLE_DESC_KEY[role])}</div>
      </div>

      <select
        value={provider ?? ''}
        onChange={(e) => handleProviderChange(e.target.value)}
        className="w-full bg-black/30 border border-white/5 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all appearance-none cursor-pointer"
      >
        <option value="">
          {t('role_follow_active', {
            provider: t(`provider_name_${activeProvider}` as TranslationKey),
          })}
        </option>
        {PROVIDERS.map((p) => {
          const ready = isProviderReady(p, providerConfigs);
          const name = t(`provider_name_${p}` as TranslationKey);
          return (
            <option key={p} value={p} disabled={!ready}>
              {ready ? name : t('role_provider_no_key', { provider: name })}
            </option>
          );
        })}
      </select>

      {provider && cfg && (
        <ModelSelect
          provider={provider}
          baseUrl={cfg.baseUrl}
          apiKey={cfg.apiKey}
          value={choice?.model ?? ''}
          onChange={(model) => onChange({ provider, model })}
        />
      )}
    </div>
  );
}
