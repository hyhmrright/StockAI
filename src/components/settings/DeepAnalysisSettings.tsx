import React from 'react';
import { getAllMasterMeta, masterName, masterStyle } from '../DeepAnalysis/master-meta';
import { useLanguage } from '../../hooks/useLanguage';

interface DeepAnalysisSettingsProps {
  masterAnalysis: boolean;
  selectedMasters: string[];
  onMasterAnalysisChange: (enabled: boolean) => void;
  onSelectedMastersChange: (ids: string[]) => void;
}

const DeepAnalysisSettings: React.FC<DeepAnalysisSettingsProps> = ({
  masterAnalysis,
  selectedMasters,
  onMasterAnalysisChange,
  onSelectedMastersChange,
}) => {
  const allMasters = getAllMasterMeta();
  const { language, t } = useLanguage();

  function toggleMaster(id: string) {
    if (selectedMasters.includes(id)) {
      if (selectedMasters.length <= 1) return;
      onSelectedMastersChange(selectedMasters.filter((m) => m !== id));
    } else {
      onSelectedMastersChange([...selectedMasters, id]);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="text-sm text-gray-300">{t('deep_enable')}</label>
        <input
          type="checkbox"
          checked={masterAnalysis}
          onChange={(e) => onMasterAnalysisChange(e.target.checked)}
          className="rounded"
        />
      </div>
      {masterAnalysis && (
        <div className="space-y-2">
          <p className="text-xs text-gray-500">{t('deep_select_hint')}</p>
          <div className="grid grid-cols-1 gap-1.5 max-h-48 overflow-y-auto">
            {allMasters.map((m) => (
              <label
                key={m.id}
                className="flex items-center gap-2 p-2 rounded-lg hover:bg-white/5 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selectedMasters.includes(m.id)}
                  onChange={() => toggleMaster(m.id)}
                  className="rounded"
                />
                <span className="text-xs text-white">{masterName(m, language)}</span>
                <span className="text-[10px] text-gray-500">{masterStyle(m, language)}</span>
              </label>
            ))}
          </div>
          <p className="text-[10px] text-gray-600">
            {t('deep_cost_estimate', {
              total: selectedMasters.length + 2,
              n: selectedMasters.length,
            })}
          </p>
        </div>
      )}
    </div>
  );
};

export default DeepAnalysisSettings;
