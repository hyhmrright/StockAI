import React from 'react';
import { Loader2 } from 'lucide-react';
import { useLanguage } from '../../hooks/useLanguage';
import { useAsyncOnce } from '../../hooks/useAsyncOnce';
import { fetchCompanyF10 } from '../../lib/ipc';
import { formatServiceError } from '../../lib/service-errors';
import { formatBig } from '../../lib/locale';
import type { CompanyF10, SegmentDimension } from '../../../shared/types';

const DIMENSION_KEYS = {
  industry: 'f10_seg_industry',
  product: 'f10_seg_product',
  region: 'f10_seg_region',
} as const;

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex gap-2 text-xs">
    <span className="text-gray-600 shrink-0">{label}</span>
    <span className="text-gray-300 min-w-0 break-words">{children}</span>
  </div>
);

const Section: React.FC<{ title: string; note?: string; children: React.ReactNode }> = ({
  title,
  note,
  children,
}) => (
  <div className="flex flex-col gap-2">
    <h4 className="text-[11px] font-bold tracking-widest text-gray-500">
      {title}
      {note && <span className="ml-2 font-normal tracking-normal text-gray-600">{note}</span>}
    </h4>
    {children}
  </div>
);

const Overview: React.FC<{ data: CompanyF10 }> = ({ data }) => {
  const { t, language } = useLanguage();
  const o = data.overview;
  if (!o) return null;

  return (
    <Section title={t('f10_overview')}>
      <div className="grid gap-1.5 sm:grid-cols-2">
        <Field label={t('f10_full_name')}>{o.fullName}</Field>
        <Field label={t('f10_industry')}>{o.industry}</Field>
        <Field label={t('f10_board')}>{o.listingBoard}</Field>
        <Field label={t('f10_chairman')}>{o.chairman}</Field>
        {/* 缺失的字段整行不渲染——补 0 或「—」会被读成「这家公司没有员工」 */}
        {o.employees !== undefined && (
          <Field label={t('f10_employees')}>{o.employees.toLocaleString()}</Field>
        )}
        {/* 源数据以万元计，先还原成元再交给 formatBig，否则英日用户的分档会整体差 1e4 */}
        {o.registeredCapital !== undefined && (
          <Field label={t('f10_reg_capital')}>
            {formatBig(o.registeredCapital * 1e4, language)}
          </Field>
        )}
        {o.website && <Field label={t('f10_website')}>{o.website}</Field>}
      </div>
      {o.businessScope && (
        <p className="text-[11px] leading-relaxed text-gray-500">
          <span className="text-gray-600">{t('f10_scope')} </span>
          {o.businessScope}
        </p>
      )}
    </Section>
  );
};

const Segments: React.FC<{ data: CompanyF10 }> = ({ data }) => {
  const { t, language } = useLanguage();
  if (data.segments.length === 0) return null;

  // 维度顺序固定，不随数据源返回顺序漂移
  const order: SegmentDimension[] = ['product', 'industry', 'region'];

  return (
    <Section
      title={t('f10_segments')}
      note={data.reportDate && `${t('f10_report_period')} ${data.reportDate}`}
    >
      <div className="flex flex-wrap gap-x-6 gap-y-3">
        {order.map((dim) => {
          const items = data.segments.filter((s) => s.dimension === dim);
          if (items.length === 0) return null;
          return (
            <div key={dim} className="min-w-[220px] flex-1">
              <div className="mb-1 text-[10px] text-gray-600">{t(DIMENSION_KEYS[dim])}</div>
              {items.map((s) => (
                <div
                  key={s.name}
                  className="flex items-baseline justify-between gap-2 text-xs py-0.5"
                >
                  <span className="truncate text-gray-300">{s.name}</span>
                  <span className="shrink-0 font-mono text-gray-500">
                    {(s.revenueRatio * 100).toFixed(1)}% · {formatBig(s.revenue, language)}
                    {s.grossMargin !== undefined && (
                      <span className="ml-1.5 text-gray-600">
                        {t('f10_gross_margin')} {(s.grossMargin * 100).toFixed(1)}%
                      </span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </Section>
  );
};

const Shareholders: React.FC<{ data: CompanyF10 }> = ({ data }) => {
  const { t } = useLanguage();
  const s = data.shareholding;
  if (!s) return null;

  return (
    <Section title={t('f10_shareholding')} note={`${t('f10_as_of')} ${s.endDate}`}>
      <div className="flex flex-wrap gap-x-6 gap-y-1">
        {s.holderCount !== undefined && (
          <Field label={t('f10_holder_count')}>
            {s.holderCount.toLocaleString()}
            {s.holderCountChange !== undefined && (
              <span className="ml-1 text-gray-600">
                ({s.holderCountChange >= 0 ? '+' : ''}
                {s.holderCountChange.toFixed(2)}%)
              </span>
            )}
          </Field>
        )}
        {s.concentration && <Field label={t('f10_concentration')}>{s.concentration}</Field>}
      </div>
      {s.topHolders.length > 0 && (
        <div className="mt-1">
          <div className="mb-1 text-[10px] text-gray-600">{t('f10_top_holders')}</div>
          {s.topHolders.map((h) => (
            <div key={h.rank} className="flex items-baseline justify-between gap-2 text-xs py-0.5">
              <span className="truncate text-gray-300">
                <span className="mr-1.5 font-mono text-gray-600">{h.rank}</span>
                {h.name}
              </span>
              <span className="shrink-0 font-mono text-gray-500">
                {h.ratio.toFixed(2)}% {t('f10_hold_ratio')}
                <span className="ml-1.5 text-gray-600">{h.change}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
};

/** 一只 A 股的 F10 详情。四块各自按有无渲染——数据源允许单块缺失（见 company-f10.ts）。 */
const CompanyDetails: React.FC<{ symbol: string }> = ({ symbol }) => {
  const { t } = useLanguage();
  const { data, error } = useAsyncOnce(() => fetchCompanyF10(symbol));

  if (error !== null) {
    return <p className="text-xs text-gray-500">{formatServiceError(error, t, 'f10_error')}</p>;
  }
  if (!data) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="w-4 h-4 animate-spin text-gray-600" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <Overview data={data} />
      <Segments data={data} />
      <Shareholders data={data} />
      {data.boards.length > 0 && (
        <Section title={t('f10_boards')}>
          <div className="flex flex-wrap gap-1.5">
            {data.boards.map((b) => (
              <span key={b} className="rounded-md bg-white/5 px-2 py-0.5 text-[11px] text-gray-400">
                {b}
              </span>
            ))}
          </div>
        </Section>
      )}
      {data.overview?.profile && (
        <p className="text-[11px] leading-relaxed text-gray-500">{data.overview.profile}</p>
      )}
    </div>
  );
};

export default CompanyDetails;
