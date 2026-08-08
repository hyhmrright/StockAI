import { describe, test, expect } from 'bun:test';
import { getAllMasters, getSelectedMasters, DEFAULT_MASTER_IDS } from './registry';

describe('master registry', () => {
  test('getAllMasters returns 13 agents', () => {
    expect(getAllMasters()).toHaveLength(13);
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
  // getSelectedMasters 对未注册 id 是静默过滤，长度相等才能证明默认列表没拼错
  test('all default masters exist in registry', () => {
    expect(getSelectedMasters(DEFAULT_MASTER_IDS)).toHaveLength(DEFAULT_MASTER_IDS.length);
  });
});
