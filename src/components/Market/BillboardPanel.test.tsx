import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import BillboardPanel from './BillboardPanel';
import { ServiceError } from '../../lib/service-errors';
import type { Billboard, BillboardEntry } from '../../../shared/types';

const fetchBillboard = vi.hoisted(() => vi.fn());
vi.mock('../../lib/ipc', () => ({ fetchBillboard }));

function entry(over: Partial<BillboardEntry>): BillboardEntry {
  return {
    symbol: '000831',
    name: '中国稀土',
    price: 57.19,
    changePercent: 10.0,
    netAmount: 631_735_592,
    buyAmount: 810_284_873,
    sellAmount: 178_549_280,
    turnover: 3_390_463_975,
    netRatio: 18.63,
    reason: '日涨幅偏离值达到7%的前5只证券',
    ...over,
  };
}

function board(over: Partial<Billboard> = {}): Billboard {
  return {
    tradeDate: '2026-08-07',
    topBuy: [entry({})],
    topSell: [entry({ symbol: '002212', name: '天融信', netAmount: -124_955_304 })],
    fetchedAt: 0,
    ...over,
  };
}

// 各用例各自设定实现（后设的完全覆盖前设的），因此不需要 beforeEach 清 mock。
// 加了反而有害：实测在 beforeEach 里调 mockReset/mockClear 会让被拒 promise
// 被 vitest 记成 unhandled rejection，用例断言明明通过却判失败。
describe('BillboardPanel', () => {
  it('标出榜单归属交易日——盘中看到的永远是上一个交易日的榜', async () => {
    fetchBillboard.mockResolvedValue(board());
    render(<BillboardPanel onSelect={() => {}} />);
    await waitFor(() => expect(screen.getByText(/2026-08-07/)).toBeTruthy());
  });

  it('净买入显示 + 号、净卖出显示 − 号，金额收敛为亿', async () => {
    fetchBillboard.mockResolvedValue(board());
    render(<BillboardPanel onSelect={() => {}} />);

    await waitFor(() => expect(screen.getByText('+6.32 亿')).toBeTruthy());
    expect(screen.getByText('−1.25 亿')).toBeTruthy();
  });

  /**
   * 同股同日多次上榜是真实形态（不同统计窗口，净额不等）。这条守的是
   * **渲染层不得按代码去重**——一去重就少掉一个窗口的数字（已反向验证：
   * 在 map 前加一次 by-symbol 去重，此条必红）。
   *
   * 它守不住 React key：实测把 key 换成裸 `e.symbol` 后两条照样都渲染，
   * React 对重复 key 只告警不合并。复合 key 保留是为了消除该告警。
   */
  it('同一代码的多条上榜记录全部渲染，各带各自的上榜原因', async () => {
    fetchBillboard.mockResolvedValue(
      board({
        topBuy: [
          entry({
            symbol: '000603',
            name: '盛达资源',
            netAmount: 113_039_557,
            reason: '连续三日累计20%',
          }),
          entry({
            symbol: '000603',
            name: '盛达资源',
            netAmount: 210_000_000,
            reason: '日振幅15%',
          }),
        ],
        topSell: [],
      }),
    );
    render(<BillboardPanel onSelect={() => {}} />);

    await waitFor(() => expect(screen.getAllByText('盛达资源')).toHaveLength(2));
    expect(screen.getByText('连续三日累计20%')).toBeTruthy();
    expect(screen.getByText('日振幅15%')).toBeTruthy();
    expect(screen.getByText('+1.13 亿')).toBeTruthy();
    expect(screen.getByText('+2.10 亿')).toBeTruthy();
  });

  it('某一侧为空时给出空态文案，而不是渲染成一片空白', async () => {
    fetchBillboard.mockResolvedValue(board({ topSell: [] }));
    render(<BillboardPanel onSelect={() => {}} />);
    await waitFor(() => expect(screen.getByText('该交易日无上榜记录')).toBeTruthy());
  });

  it('拉取失败时显示可本地化的错误文案，不是空榜单', async () => {
    // 用带码的 ServiceError 而非裸 Error：真实链路里 callSidecar 抛的就是它，
    // 这样断的才是 ERR_BILLBOARD → billboard_error 这条新加的映射本身
    fetchBillboard.mockImplementation(() =>
      Promise.reject(new ServiceError('ERR_BILLBOARD', '东财龙虎榜 HTTP 503')),
    );
    render(<BillboardPanel onSelect={() => {}} />);
    await waitFor(() => expect(screen.getByText(/龙虎榜加载失败/)).toBeTruthy());
  });
});
