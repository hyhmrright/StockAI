import React from 'react';
import type { MasterNavPoint } from '../../../shared/types';

interface NavSparklineProps {
  points: MasterNavPoint[];
  width?: number;
  height?: number;
}

/**
 * 净值迷你曲线（纯 SVG，无图表库依赖）。
 * 起点隐含 1.0；末值 ≥ 1 显绿、< 1 显红。单点时退化为一条水平线。
 */
const NavSparkline: React.FC<NavSparklineProps> = ({ points, width = 64, height = 20 }) => {
  if (points.length === 0) return <div style={{ width, height }} />;

  // 把隐含起点 1.0 也纳入取值范围，避免单点曲线无高度
  const values = [1, ...points.map((p) => p.value)];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1; // 全平时避免除零
  const n = values.length;

  const coords = values.map((v, i) => {
    const x = n === 1 ? width / 2 : (i / (n - 1)) * width;
    const y = height - ((v - min) / span) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const last = points[points.length - 1].value;
  const stroke = last >= 1 ? '#34d399' : '#fb7185'; // emerald-400 / rose-400

  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline
        points={coords.join(' ')}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

export default NavSparkline;
