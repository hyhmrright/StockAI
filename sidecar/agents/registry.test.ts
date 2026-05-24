import { describe, test, expect } from 'bun:test';
import { getMaster, getAllMasters, getSelectedMasters, DEFAULT_MASTER_IDS } from './registry';

describe('master registry', () => {
  test('getAllMasters returns 13 agents', () => {
    expect(getAllMasters()).toHaveLength(13);
  });
  test('getMaster returns agent by id', () => {
    const b = getMaster('warren-buffett');
    expect(b).toBeTruthy();
    expect(b!.meta.id).toBe('warren-buffett');
  });
  test('getMaster returns undefined for unknown id', () => {
    expect(getMaster('unknown')).toBeUndefined();
  });
  test('getSelectedMasters filters by id list', () => {
    const s = getSelectedMasters(['warren-buffett', 'ben-graham']);
    expect(s).toHaveLength(2);
    expect(s[0].meta.id).toBe('warren-buffett');
  });
  test('getSelectedMasters ignores invalid ids', () => {
    expect(getSelectedMasters(['warren-buffett', 'invalid'])).toHaveLength(1);
  });
  test('DEFAULT_MASTER_IDS has 5 entries', () => {
    expect(DEFAULT_MASTER_IDS).toHaveLength(5);
  });
  test('all default masters exist in registry', () => {
    for (const id of DEFAULT_MASTER_IDS) expect(getMaster(id)).toBeTruthy();
  });
});
