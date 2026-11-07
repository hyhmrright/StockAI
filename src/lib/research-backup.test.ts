import { describe, it, expect, beforeEach } from 'vitest';
import { createBackup, restoreBackup, validateBackup } from './research-backup';
import { emptyWorkspace, readWorkspace, updateWorkspace } from './research-store';
describe('backup and restore', () => {
  beforeEach(() => localStorage.clear());
  it('roundtrips research data and merges repeated restores without duplicates', async () => {
    await updateWorkspace((s) => ({
      ...s,
      notes: [
        {
          id: 'note',
          symbol: 'A',
          thesis: 'Revenue grows',
          counterEvidence: 'Margin falls',
          reviewDate: '2026-12-01',
          status: 'open',
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    }));
    const backup = await createBackup();
    localStorage.clear();
    await restoreBackup(backup);
    await restoreBackup(backup);
    expect((await readWorkspace()).notes).toHaveLength(1);
    expect(backup).not.toHaveProperty('app_settings');
  });
  it('validates all snapshot histories before changing storage', async () => {
    const b = await createBackup();
    (b.workspace.snapshots as unknown as Record<string, unknown>).A = 'invalid';
    expect(() => validateBackup(b)).toThrow();
    expect(await readWorkspace()).toEqual(emptyWorkspace());
  });
  it('rejects unsupported versions and impossible ledger histories', async () => {
    const b = await createBackup();
    expect(() => validateBackup({ ...b, version: 2 })).toThrow();
    b.workspace.ledger = [
      {
        id: 'x',
        account: 'a',
        symbol: 'A',
        currency: 'USD',
        kind: 'sell',
        date: '2026-01-01',
        shares: 1,
        price: 1,
        fees: 0,
        amount: 0,
        note: '',
      },
    ];
    await expect(restoreBackup(b)).rejects.toThrow();
    expect((await readWorkspace()).ledger).toEqual([]);
  });
  it('strips unrelated configuration fields on input', async () => {
    const b = await createBackup();
    const validated = validateBackup({ ...b, apiKey: 'do-not-save', app_settings: { secret: 1 } });
    expect(validated).not.toHaveProperty('apiKey');
    expect(validated).not.toHaveProperty('app_settings');
  });
});
