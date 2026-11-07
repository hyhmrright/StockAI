import { useLanguage } from '../../hooks/useLanguage';
import { createBackup, restoreBackup } from '../../lib/research-backup';
import { downloadText } from '../../lib/download';
import { buttonClass, type WorkspaceProps } from './common';
export default function BackupTab({ run }: WorkspaceProps) {
  const { t } = useLanguage();
  return (
    <div className="space-y-5">
      <p className="text-sm text-gray-400">{t('research_backup_hint')}</p>
      <div className="flex gap-3">
        <button
          className={buttonClass}
          onClick={() =>
            run(async () =>
              downloadText(
                `stockai-backup-${new Date().toISOString().slice(0, 10)}.json`,
                JSON.stringify(await createBackup(), null, 2),
              ),
            )
          }
        >
          {t('research_export')}
        </button>
        <label className={buttonClass}>
          {t('research_restore')}
          <input
            type="file"
            className="hidden"
            accept=".json"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file)
                run(async () => {
                  if (file.size > 100 * 1024 * 1024) throw new Error('Backup exceeds 100 MB');
                  await restoreBackup(JSON.parse(await file.text()));
                });
              e.target.value = '';
            }}
          />
        </label>
      </div>
    </div>
  );
}
