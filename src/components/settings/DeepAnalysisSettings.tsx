import React from 'react';
import { getAllMasterMeta } from '../DeepAnalysis/master-meta';

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
        <label className="text-sm text-gray-300">启用深度大师分析</label>
        <input
          type="checkbox"
          checked={masterAnalysis}
          onChange={(e) => onMasterAnalysisChange(e.target.checked)}
          className="rounded"
        />
      </div>
      {masterAnalysis && (
        <div className="space-y-2">
          <p className="text-xs text-gray-500">选择参与分析的投资大师（每位消耗 1 次 LLM 调用）</p>
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
                <span className="text-xs text-white">{m.nameZh}</span>
                <span className="text-[10px] text-gray-500">{m.styleZh}</span>
              </label>
            ))}
          </div>
          <p className="text-[10px] text-gray-600">
            预计消耗: {selectedMasters.length + 2} 次 LLM 调用（{selectedMasters.length} 位大师 +
            情绪 + 综合）
          </p>
        </div>
      )}
    </div>
  );
};

export default DeepAnalysisSettings;
