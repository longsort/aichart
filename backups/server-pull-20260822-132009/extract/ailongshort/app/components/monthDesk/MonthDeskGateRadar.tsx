'use client';

import { useId, useMemo } from 'react';
import type { MonthDeskGatePartial } from '@/lib/monthDeskPrecisionAnalysis';

const AXES = ['structure', 'rsi', 'sr', 'close', 'fvg'] as const;
const LABELS: Record<string, string> = {
  structure: '구조',
  rsi: 'RSI',
  sr: 'S/R',
  close: '종가',
  fvg: 'FVG',
};

export default function MonthDeskGateRadar({
  partials,
  size = 160,
  accent = '#a78bfa',
  passColor = '#4ade80',
  trackColor = 'rgba(51,65,85,0.6)',
  animated = true,
}: {
  partials: MonthDeskGatePartial[];
  size?: number;
  accent?: string;
  passColor?: string;
  trackColor?: string;
  animated?: boolean;
}) {
  const rid = useId();
  const cx = size / 2;
  const cy = size / 2;
  const maxR = size * 0.38;

  const scores = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of partials) map[p.key] = p.score;
    return AXES.map((k) => Math.min(100, map[k] ?? 0) / 100);
  }, [partials]);

  const pointAt = (i: number, scale: number) => {
    const angle = (-Math.PI / 2) + (i * 2 * Math.PI) / AXES.length;
    const r = maxR * scale;
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  };

  const dataPoints = scores.map((s, i) => pointAt(i, s));
  const poly = dataPoints.map((p) => `${p.x},${p.y}`).join(' ');
  const gridLevels = [0.25, 0.5, 0.75, 1];

  const fillGrad = `radarFill-${rid.replace(/:/g, '')}`;

  return (
    <div className={`md-gate-radar ${animated ? 'md-gauge-enter' : ''}`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-label="5요소 레이더">
        <defs>
          <radialGradient id={fillGrad} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={passColor} stopOpacity="0.45" />
            <stop offset="100%" stopColor={accent} stopOpacity="0.12" />
          </radialGradient>
        </defs>
        {gridLevels.map((lv) => {
          const pts = AXES.map((_, i) => pointAt(i, lv));
          return (
            <polygon
              key={lv}
              points={pts.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke={trackColor}
              strokeWidth={1}
              opacity={0.55}
            />
          );
        })}
        {AXES.map((_, i) => {
          const o = pointAt(i, 1);
          return <line key={i} x1={cx} y1={cy} x2={o.x} y2={o.y} stroke={trackColor} strokeWidth={1} opacity={0.4} />;
        })}
        <polygon
          className={animated ? 'md-radar-polygon-pulse' : undefined}
          points={poly}
          fill={`url(#${fillGrad})`}
          stroke={passColor}
          strokeWidth={2}
          style={{ filter: `drop-shadow(0 0 10px ${passColor}66)` }}
        />
        {dataPoints.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={3.5} fill={scores[i] >= 0.55 ? passColor : accent} />
        ))}
        {AXES.map((k, i) => {
          const o = pointAt(i, 1.12);
          return (
            <text
              key={k}
              x={o.x}
              y={o.y + 4}
              textAnchor="middle"
              fill="#94a3b8"
              fontSize={9}
              fontWeight="800"
            >
              {LABELS[k]}
            </text>
          );
        })}
        <text x={cx} y={cy + 4} textAnchor="middle" fill="#f8fafc" fontSize={11} fontWeight="900">
          RADAR
        </text>
      </svg>
      <div className="md-premium-gauge__label">5요소 레이더</div>
    </div>
  );
}
