import { describe, it, expect } from 'vitest';
import { detectMarket, upColor, downColor, isTradingHours } from './market-hours';

describe('detectMarket', () => {
  it('6/0/3/4/8 开头 6 位数 → A 股', () => {
    expect(detectMarket('600519')).toBe('A股');
    expect(detectMarket('000001')).toBe('A股');
    expect(detectMarket('300750')).toBe('A股');
    expect(detectMarket('sh600519')).toBe('A股');
  });

  it('纯字母 → 美股', () => {
    expect(detectMarket('AAPL')).toBe('美股');
    expect(detectMarket('gb_aapl')).toBe('美股');
  });
});

describe('upColor/downColor', () => {
  it('A 股 → 红涨绿跌', () => {
    expect(upColor('A股')).toBe('#FF4D4F');
    expect(downColor('A股')).toBe('#10B981');
  });
  it('美股 → 绿涨红跌', () => {
    expect(upColor('美股')).toBe('#10B981');
    expect(downColor('美股')).toBe('#FF4D4F');
  });
});

describe('isTradingHours', () => {
  it('A 股工作日 10:00 北京时间 → true', () => {
    // 2026-05-20 (周三) 02:00 UTC = 10:00 北京
    const t = new Date('2026-05-20T02:00:00Z').getTime();
    expect(isTradingHours('A股', t)).toBe(true);
  });

  it('A 股工作日 12:00 北京时间（午休）→ false', () => {
    const t = new Date('2026-05-20T04:00:00Z').getTime();
    expect(isTradingHours('A股', t)).toBe(false);
  });

  it('A 股周六 → false', () => {
    const t = new Date('2026-05-23T02:00:00Z').getTime();
    expect(isTradingHours('A股', t)).toBe(false);
  });

  it('美股工作日 10:00 ET → true', () => {
    // 2026-05-20 (周三) 14:00 UTC = 10:00 ET (EDT)
    const t = new Date('2026-05-20T14:00:00Z').getTime();
    expect(isTradingHours('美股', t)).toBe(true);
  });

  it('美股盘前 06:00 ET → true（含盘前盘后）', () => {
    const t = new Date('2026-05-20T10:00:00Z').getTime();
    expect(isTradingHours('美股', t)).toBe(true);
  });

  it('美股深夜 22:00 ET → false', () => {
    const t = new Date('2026-05-21T02:00:00Z').getTime();
    expect(isTradingHours('美股', t)).toBe(false);
  });
});
