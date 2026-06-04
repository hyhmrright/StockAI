import React from "react";
import type { KlinePoint } from "../../../shared/types";
import { upColor, downColor } from "../../lib/market-hours";
import { MA_COLORS } from "./types";

interface Props {
  point: KlinePoint | null;
  market: "A股" | "美股";
  prevClose?: number;
  maValues?: { short: number | null; mid: number | null; long: number | null };
}

function fmt(n: number, digits = 2): string {
  return n.toLocaleString("zh-CN", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

const CrosshairTooltip: React.FC<Props> = ({ point, market, prevClose, maValues }) => {
  if (!point) return null;

  const ref = prevClose ?? point.open;
  const isUp = point.close >= ref;
  const color = isUp ? upColor(market) : downColor(market);
  const change = point.close - ref;
  const changePct = ref ? (change / ref) * 100 : 0;

  const date = new Date(point.time * 1000);
  const dateStr = date.toLocaleDateString("zh-CN");
  const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
  const week = weekdays[date.getDay()];

  return (
    <div className="absolute top-3 left-3 bg-black/70 backdrop-blur-sm rounded-lg p-3 text-xs font-mono border border-white/10 pointer-events-none z-10 min-w-[200px]">
      <div className="text-gray-300 mb-1.5">{dateStr} (周{week})</div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
        <div>开 <span className="text-gray-100">{fmt(point.open)}</span></div>
        <div>高 <span className="text-gray-100">{fmt(point.high)}</span></div>
        <div>低 <span className="text-gray-100">{fmt(point.low)}</span></div>
        <div>收 <span style={{ color }}>{fmt(point.close)}</span></div>
      </div>
      <div className="mt-1" style={{ color }}>
        {isUp ? "▲" : "▼"} {change >= 0 ? "+" : ""}{fmt(change)} ({change >= 0 ? "+" : ""}{fmt(changePct)}%)
      </div>
      <div className="mt-1 text-gray-400">量 <span className="text-gray-100">{point.volume.toLocaleString("zh-CN")}</span></div>
      {maValues && (
        <div className="mt-1.5 pt-1.5 border-t border-white/10 space-y-0.5">
          {maValues.short != null && <div style={{ color: MA_COLORS.short }}>MA短 {fmt(maValues.short)}</div>}
          {maValues.mid != null   && <div style={{ color: MA_COLORS.mid }}>MA中 {fmt(maValues.mid)}</div>}
          {maValues.long != null  && <div style={{ color: MA_COLORS.long }}>MA长 {fmt(maValues.long)}</div>}
        </div>
      )}
    </div>
  );
};

export default CrosshairTooltip;
