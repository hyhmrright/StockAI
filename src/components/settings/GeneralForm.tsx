import React from "react";

/**
 * 常规设置表单组件（目前包含占位开关）
 */
export const GeneralForm: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="setting-row">
        <div className="setting-label">
          <span className="setting-title text-gray-200">自动分析</span>
          <span className="setting-desc text-gray-500 text-xs">点击关注列表时自动开始分析</span>
        </div>
        <div className="w-10 h-5 bg-emerald-500/20 rounded-full relative cursor-pointer">
          <div className="absolute right-0.5 top-0.5 w-4 h-4 bg-emerald-500 rounded-full shadow-sm" />
        </div>
      </div>
      <div className="setting-row">
        <div className="setting-label">
          <span className="setting-title text-gray-200">深度模式</span>
          <span className="setting-desc text-gray-500 text-xs">分析时提取新闻全文，耗时较长但准确度更高</span>
        </div>
        <div className="w-10 h-5 bg-gray-800 rounded-full relative cursor-pointer">
          <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-gray-500 rounded-full shadow-sm" />
        </div>
      </div>
    </div>
  );
};
