import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import CompanySection from './CompanySection';
import { MOCK_COMPANY } from '../../lib/dev-mocks';

const fetchCompanyF10 = vi.hoisted(() => vi.fn());
vi.mock('../../lib/ipc', () => ({ fetchCompanyF10 }));

// 各用例各自设定实现；不在 beforeEach 里清 mock（见 Market/BillboardPanel.test.tsx 的说明）
describe('CompanySection', () => {
  /**
   * 非 A 股整块不渲染，而不是展开后再报「不支持」——数据源是交易所 F10 披露，
   * 美股压根没有这块，让用户白点一次是纯浪费。
   */
  it('美股不渲染这一块', () => {
    const { container } = render(<CompanySection symbol="AAPL" />);
    expect(container.textContent).toBe('');
  });

  it('A 股渲染标题，但默认折叠、不预取', () => {
    fetchCompanyF10.mockResolvedValue(MOCK_COMPANY);
    render(<CompanySection symbol="600519" />);

    expect(screen.getByText('公司资料')).toBeTruthy();
    // 一次 F10 是四发请求，切标的就自动拉不划算
    expect(fetchCompanyF10).not.toHaveBeenCalled();
  });

  it('展开后才取数，并渲染四块内容', async () => {
    fetchCompanyF10.mockResolvedValue(MOCK_COMPANY);
    render(<CompanySection symbol="600519" />);

    fireEvent.click(screen.getByText('公司资料'));

    await waitFor(() => expect(screen.getByText('贵州茅台酒股份有限公司')).toBeTruthy());
    expect(fetchCompanyF10).toHaveBeenCalledWith('600519');
    expect(screen.getByText('茅台酒')).toBeTruthy(); // 主营构成
    expect(screen.getByText('非常分散')).toBeTruthy(); // 股东结构
    expect(screen.getByText('白酒')).toBeTruthy(); // 所属板块
  });

  /** 数据源允许单块缺失（allSettled 按块降级），UI 不能因此整块炸掉或渲染空壳 */
  it('只有概况、其余三块缺失时照常渲染概况', async () => {
    fetchCompanyF10.mockResolvedValue({
      ...MOCK_COMPANY,
      segments: [],
      reportDate: undefined,
      shareholding: undefined,
      boards: [],
    });
    render(<CompanySection symbol="600519" />);

    fireEvent.click(screen.getByText('公司资料'));

    await waitFor(() => expect(screen.getByText('贵州茅台酒股份有限公司')).toBeTruthy());
    expect(screen.queryByText('主营构成')).toBeNull();
    expect(screen.queryByText('股东结构')).toBeNull();
  });

  /**
   * 缺失的数值字段整行不渲染。补 0 会被读成「这家公司没有员工」——
   * 与持仓那边「未定价不进汇总」是同一条规矩：宁可少显示，不显示假事实。
   */
  it('员工数缺失时不渲染该行，而不是显示 0', async () => {
    fetchCompanyF10.mockResolvedValue({
      ...MOCK_COMPANY,
      overview: { ...MOCK_COMPANY.overview!, employees: undefined },
    });
    render(<CompanySection symbol="600519" />);

    fireEvent.click(screen.getByText('公司资料'));

    await waitFor(() => expect(screen.getByText('贵州茅台酒股份有限公司')).toBeTruthy());
    expect(screen.queryByText('员工人数')).toBeNull();
  });
});
