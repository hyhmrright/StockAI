import React from "react";
import { Download, RefreshCw } from "lucide-react";
import { useUpdater } from "../../hooks/useUpdater";
import { useLanguage } from "../../hooks/useLanguage";

/**
 * 设置页「检查更新」行：手动触发检查，复用 useUpdater 流程。
 * 与顶部 UpdateBanner 各自独立，互不影响。
 */
export const UpdateChecker: React.FC = () => {
  const { status, version, progress, checkForUpdate, downloadAndRestart } = useUpdater();
  const { t } = useLanguage();

  // 按状态给出副标题文案
  function statusDesc(): string {
    switch (status) {
      case "checking":
        return t("update_checking");
      case "uptodate":
        return t("update_uptodate");
      case "available":
        return t("update_available", { version: version ?? "" });
      case "downloading":
        return t("update_downloading", { progress });
      case "error":
        return t("update_error");
      default:
        return t("update_check_desc");
    }
  }

  const canInstall = status === "available" || status === "ready";
  const busy = status === "checking" || status === "downloading";

  return (
    <div className="setting-row">
      <div className="setting-label">
        <span className="setting-title text-gray-200">{t("update_check_label")}</span>
        <span className="setting-desc text-gray-500 text-xs">{statusDesc()}</span>
      </div>
      {canInstall ? (
        <button
          type="button"
          onClick={downloadAndRestart}
          disabled={busy}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 hover:bg-emerald-500/30 transition-all disabled:opacity-50"
        >
          <Download className="w-3.5 h-3.5" />
          {t("update_now")}
        </button>
      ) : (
        <button
          type="button"
          onClick={checkForUpdate}
          disabled={busy}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10 transition-all disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${busy ? "animate-spin" : ""}`} />
          {t("update_check_button")}
        </button>
      )}
    </div>
  );
};
