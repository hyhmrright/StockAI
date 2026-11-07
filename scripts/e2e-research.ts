import type { Page } from 'playwright-core';
import zh from '../src/i18n/zh.json';
import { mkdir } from 'node:fs/promises';
/** 用真实浏览器验证本地资料保存、重新挂载、账本和 PDF 解析。 */
export async function checkResearchWorkspace(page: Page) {
  const later = page.getByRole('button', { name: zh.onboarding_later, exact: true });
  if (await later.isVisible()) await later.click();
  await page.getByRole('button', { name: zh.workbench, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: zh.workbench });
  await dialog.getByLabel(zh.research_thesis).fill('E2E durable thesis');
  await dialog.getByLabel(zh.research_counter).fill('Margin deterioration invalidates thesis');
  await dialog.getByRole('button', { name: zh.research_save, exact: true }).click();
  await dialog.getByRole('button', { name: 'E2E durable thesis', exact: true }).waitFor();
  await dialog.getByRole('button', { name: zh.close, exact: true }).click();
  await page.getByRole('button', { name: zh.workbench, exact: true }).click();
  await dialog.getByRole('button', { name: 'E2E durable thesis', exact: true }).waitFor();
  await dialog.getByRole('button', { name: zh.research_ledger, exact: true }).click();
  await dialog.getByLabel(zh.research_kind, { exact: true }).selectOption('deposit');
  await dialog.getByLabel(zh.research_amount, { exact: true }).fill('10000');
  await dialog.getByRole('button', { name: zh.research_save, exact: true }).click();
  await dialog
    .getByText(/10000\.00/)
    .first()
    .waitFor();
  await dialog.getByRole('button', { name: zh.research_documents, exact: true }).click();
  await dialog.getByLabel(zh.research_title, { exact: true }).fill('E2E report');
  await dialog.getByLabel(zh.research_date, { exact: true }).fill('2026-11-07');
  await dialog
    .getByLabel(zh.research_text, { exact: true })
    .fill('Revenue 100 USD\n---\nNet income 20 USD');
  await dialog.getByRole('button', { name: zh.research_save, exact: true }).click();
  await dialog.locator('summary').filter({ hasText: 'E2E report' }).waitFor();
  // 可选真 PDF：本地准备的公开财报不进仓库，CI 仍保持完全离线。
  if (process.env.STOCKAI_E2E_PDF) {
    await dialog.locator('input[type=file]').setInputFiles(process.env.STOCKAI_E2E_PDF);
    const textarea = dialog.getByLabel(zh.research_text, { exact: true });
    await page.waitForFunction(
      () => {
        const box = document.querySelector('textarea[rows="8"]') as HTMLTextAreaElement | null;
        return !!box && box.value.length > 1000;
      },
      null,
      { timeout: 60000 },
    );
    const text = await textarea.inputValue();
    if (!text.includes('\f')) throw new Error('PDF page boundaries missing');
    console.log(`✅ 真 PDF 提取 ${text.length} 字符，保留分页`);
  }
  await mkdir('/tmp/stockai-research-qa', { recursive: true });
  await page.screenshot({ path: '/tmp/stockai-research-qa/workspace.png', fullPage: true });
  for (const label of [
    zh.research_events,
    zh.research_changes,
    zh.research_peers,
    zh.research_risk,
    zh.research_tasks,
    zh.research_masters,
    zh.research_performance,
  ])
    await dialog.getByRole('button', { name: label, exact: true }).click();
  await dialog.getByRole('button', { name: zh.research_backup, exact: true }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    dialog.getByRole('button', { name: zh.research_export, exact: true }).click(),
  ]);
  const path = await download.path();
  if (!path) throw new Error('Backup download missing');
  const backup = await Bun.file(path).json();
  if (!backup.workspace.notes.some((n: { thesis: string }) => n.thesis === 'E2E durable thesis'))
    throw new Error('Backup lost saved notes');
  if (backup.app_settings || backup.apiKey) throw new Error('Backup contains credentials');
  await dialog.locator('input[type=file]').setInputFiles(path);
  await page.waitForTimeout(500);
  const noteCount = await page.evaluate(
    () => JSON.parse(localStorage.getItem('stockai-research') ?? '{}').notes.length,
  );
  if (noteCount !== 1) throw new Error(`Restore duplicated notes: ${noteCount}`);
  console.log('✅ 研究笔记持久化、流水、资料、各页签与备份恢复通过');
}
