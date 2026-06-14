import React from "react";
import { Settings, Role, ModelChoice } from "../../hooks/useSettings";
import { useLanguage } from "../../hooks/useLanguage";
import { RoleRow } from "./RoleRow";

interface RoleModelMatrixProps {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
}

const ROLES: Role[] = ["brain", "quick", "summarize"];

/**
 * 角色分级模型矩阵：为 brain/quick/summarize 各指定 provider+model。
 * 留空（跟随活跃）时不写入 roleModels，运行时回退 activeProvider，开箱即与现状一致。
 */
export function RoleModelMatrix({ settings, onChange }: RoleModelMatrixProps): React.ReactElement {
  const { t } = useLanguage();

  function handleRoleChange(role: Role, choice: ModelChoice | undefined) {
    const next = { ...settings.roleModels };
    if (choice) next[role] = choice;
    else delete next[role]; // 清空 = 跟随活跃 provider
    onChange({ roleModels: next });
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">
          {t("role_models_title")}
        </label>
        <p className="text-[10px] text-gray-500 mt-1">{t("role_models_desc")}</p>
      </div>

      <div className="space-y-3">
        {ROLES.map((role) => (
          <RoleRow
            key={role}
            role={role}
            choice={settings.roleModels?.[role]}
            providerConfigs={settings.providerConfigs}
            activeProvider={settings.activeProvider}
            onChange={(choice) => handleRoleChange(role, choice)}
          />
        ))}
      </div>
    </div>
  );
}
