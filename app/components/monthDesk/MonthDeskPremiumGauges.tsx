'use client';

import { useId, useMemo } from 'react';
import type { MonthDeskGateItem } from '@/lib/monthDeskBoardMetrics';

const GATE_LABELS: Record<string, string> = {
  structure: '구조',
  rsi: 'RSI',
  sr: 'S/R',
  close: '종가',
  fvg: 'FVG',
};

function uid(prefix: string, id: string) {
  return `${prefix}-${id.replace(/:/g, '')}`;
}

/** 프리미엄 호 게이지 — 그라데이션·글로우·눈금 */
export function PremiumArcGauge({
  value,
  max = 100,
  size = 128,
  stroke = 10,
  color = '#62efe0',
  color2,
  trackColor = 'rgba(51,65,85,0.85)',
  label,
  sublabel,
  displayValue,
  textColor = '#f8fafc',
  subtextColor = '#94a3b8',
  animated = false,
  status = 'neutral',
}: {
  value: number;
  max?: number;
  size?: number;
  stroke?: number;
  color?: string;
  color2?: string;
  trackColor?: string;
  label?: string;
  sublabel?: string;
  displayValue?: string;
  textColor?: string;
  subtextColor?: string;
  animated?: boolean;
  status?: 'good' | 'warn' | 'neutral';
}) {
  const rid = useId();
  const pct = Math.min(1, Math.max(0, max > 0 ? value / max : 0));
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const sweep = 270;
  const startDeg = 135;
  const circ = 2 * Math.PI * r;
  const arcLen = (sweep / 360) * circ;
  const dash = `${arcLen * pct} ${circ}`;
  const c2 = color2 ?? color;

  const rot = (deg: number) => {
    const rad = ((deg - 90) * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  };
  const start = rot(startDeg);
  const end = rot(startDeg + sweep);
  const d = `M ${start.x} ${start.y} A ${r} ${r} 0 ${sweep > 180 ? 1 : 0} 1 ${end.x} ${end.y}`;

  const gradStroke = uid('arcGrad', rid);
  const glowFilter = uid('arcGlow', rid);
  const ticks = [0, 0.25, 0.5, 0.75, 1];

  const statusClass =
    status === 'good' ? 'md-premium-gauge--good' : status === 'warn' ? 'md-premium-gauge--warn' : '';

  return (
    <div
      className={`md-premium-gauge ${animated ? 'md-gauge-enter' : ''} ${statusClass}`}
      style={{ width: size }}
    >
      <svg width={size} height={size * 0.82} viewBox={`0 0 ${size} ${size * 0.82}`} aria-hidden>
        <defs>
          <linearGradient id={gradStroke} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={c2} />
            <stop offset="55%" stopColor={color} />
            <stop offset="100%" stopColor={color} stopOpacity="0.75" />
          </linearGradient>
          <filter id={glowFilter} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <circle
          cx={cx}
          cy={cy}
          r={r + stroke * 0.35}
          fill="none"
          stroke={trackColor}
          strokeWidth={1}
          opacity={0.35}
        />
        <path d={d} fill="none" stroke={trackColor} strokeWidth={stroke} strokeLinecap="round" opacity={0.55} />
        {ticks.map((t) => {
          const deg = startDeg + sweep * t;
          const inner = rot(deg);
          const outerR = r + stroke * 0.45;
          const rad = ((deg - 90) * Math.PI) / 180;
          const ox = cx + outerR * Math.cos(rad);
          const oy = cy + outerR * Math.sin(rad);
          return (
            <line
              key={t}
              x1={inner.x}
              y1={inner.y}
              x2={ox}
              y2={oy}
              stroke={subtextColor}
              strokeWidth={t === pct ? 2 : 1}
              opacity={t <= pct ? 0.9 : 0.25}
            />
          );
        })}
        <path
          className={animated ? 'md-gauge-arc-fill' : undefined}
          d={d}
          fill="none"
          stroke={`url(#${gradStroke})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={dash}
          filter={`url(#${glowFilter})`}
        />
        <text
          x={cx}
          y={cy - 4}
          textAnchor="middle"
          fill={textColor}
          fontSize={size * 0.19}
          fontWeight="900"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
        >
          {displayValue ?? (Number.isFinite(value) ? Math.round(value) : '–')}
        </text>
        {sublabel && (
          <text
            x={cx}
            y={cy + size * 0.11}
            textAnchor="middle"
            fill={subtextColor}
            fontSize={size * 0.085}
            fontWeight="700"
            fontFamily="ui-sans-serif, system-ui, sans-serif"
          >
            {sublabel}
          </text>
        )}
      </svg>
      {label && <div className="md-premium-gauge__label">{label}</div>}
    </div>
  );
}

/** 5요소 게이트 — 라벨·호버 힌트 */
export function PremiumGateRing({
  gates,
  partialScores,
  size = 108,
  passColor = '#4ade80',
  failColor = 'rgba(100,116,139,0.45)',
  textColor = '#f8fafc',
  subtextColor = '#94a3b8',
  animated = false,
}: {
  gates: MonthDeskGateItem[];
  /** 정밀 분석 부분점수 0~100 (키: structure, rsi, …) */
  partialScores?: Record<string, number>;
  size?: number;
  passColor?: string;
  failColor?: string;
  textColor?: string;
  subtextColor?: string;
  animated?: boolean;
}) {
  const rid = useId();
  const n = Math.max(1, gates.length);
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.36;
  const stroke = size * 0.085;
  const gap = 0.08;
  const pass = gates.filter((g) => g.pass).length;
  const gradId = uid('gateGrad', rid);

  return (
    <div className={`md-premium-gauge ${animated ? 'md-gauge-enter' : ''}`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#22d3ee" />
            <stop offset="100%" stopColor={passColor} />
          </linearGradient>
        </defs>
        <circle cx={cx} cy={cy} r={r + stroke} fill="none" stroke={failColor} strokeWidth={1} opacity={0.4} />
        {gates.map((g, i) => {
          const a0 = (i / n) * 2 * Math.PI - Math.PI / 2 + gap;
          const a1 = ((i + 1) / n) * 2 * Math.PI - Math.PI / 2 - gap;
          const x0 = cx + r * Math.cos(a0);
          const y0 = cy + r * Math.sin(a0);
          const x1 = cx + r * Math.cos(a1);
          const y1 = cy + r * Math.sin(a1);
          const large = a1 - a0 > Math.PI ? 1 : 0;
          const mid = (a0 + a1) / 2;
          const lx = cx + (r + stroke * 1.8) * Math.cos(mid);
          const ly = cy + (r + stroke * 1.8) * Math.sin(mid);
          const shortLabel = GATE_LABELS[g.key] ?? g.label?.slice(0, 3) ?? `${i + 1}`;
          const partial = partialScores?.[g.key];
          const segOpacity =
            partial != null ? 0.35 + (Math.min(100, partial) / 100) * 0.65 : g.pass ? 1 : 0.45;
          return (
            <g key={g.key}>
              <path
                className={animated && g.pass ? 'md-gate-seg-pulse' : undefined}
                d={`M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`}
                fill="none"
                stroke={g.pass ? `url(#${gradId})` : failColor}
                strokeWidth={stroke}
                strokeLinecap="round"
                opacity={segOpacity}
                style={g.pass ? { filter: `drop-shadow(0 0 6px ${passColor}99)` } : undefined}
              />
              <text
                x={lx}
                y={ly + 3}
                textAnchor="middle"
                fill={g.pass ? passColor : subtextColor}
                fontSize={size * 0.09}
                fontWeight="800"
                opacity={g.pass ? 1 : 0.55}
              >
                {shortLabel}
              </text>
            </g>
          );
        })}
        <text x={cx} y={cy + 5} textAnchor="middle" fill={textColor} fontSize={size * 0.2} fontWeight="900">
          {pass}/{n}
        </text>
      </svg>
      <div className="md-premium-gauge__label">확정 게이트</div>
    </div>
  );
}

/** 롱/숏 전장 — 중앙 방향 오브 */
export function PremiumBattleGauge({
  longPct,
  shortPct,
  verdict,
  size = 156,
  longColor = '#4ade80',
  shortColor = '#f87171',
  trackColor = 'rgba(51,65,85,0.9)',
  animated = false,
}: {
  longPct: number;
  shortPct: number;
  verdict: 'LONG' | 'SHORT' | 'WAIT';
  size?: number;
  longColor?: string;
  shortColor?: string;
  trackColor?: string;
  animated?: boolean;
}) {
  const rid = useId();
  const w = size;
  const h = size * 0.58;
  const cx = w / 2;
  const cy = h - 6;
  const r = w * 0.4;
  const stroke = 11;
  const animClass = animated ? 'md-gauge-arc-fill' : undefined;
  const longGrad = uid('longG', rid);
  const shortGrad = uid('shortG', rid);

  const arcPath = (fromDeg: number, toDeg: number) => {
    const pt = (deg: number) => {
      const rad = ((deg - 180) * Math.PI) / 180;
      return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
    };
    const a = pt(fromDeg);
    const b = pt(toDeg);
    const large = toDeg - fromDeg > 180 ? 1 : 0;
    return `M ${a.x} ${a.y} A ${r} ${r} 0 ${large} 1 ${b.x} ${b.y}`;
  };

  const longSweep = (longPct / 100) * 88;
  const shortSweep = (shortPct / 100) * 88;
  const centerColor = verdict === 'LONG' ? longColor : verdict === 'SHORT' ? shortColor : '#94a3b8';

  return (
    <div className={`md-premium-gauge md-premium-battle ${animated ? 'md-gauge-enter' : ''}`}>
      <svg width={w} height={h + 28} viewBox={`0 0 ${w} ${h + 28}`} aria-hidden>
        <defs>
          <linearGradient id={longGrad} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#14532d" />
            <stop offset="100%" stopColor={longColor} />
          </linearGradient>
          <linearGradient id={shortGrad} x1="100%" y1="0%" x2="0%" y2="0%">
            <stop offset="0%" stopColor="#7f1d1d" />
            <stop offset="100%" stopColor={shortColor} />
          </linearGradient>
        </defs>
        <path d={arcPath(180, 270)} fill="none" stroke={trackColor} strokeWidth={stroke} strokeLinecap="round" />
        <path d={arcPath(270, 360)} fill="none" stroke={trackColor} strokeWidth={stroke} strokeLinecap="round" />
        {longSweep > 0.5 && (
          <path
            className={animClass}
            d={arcPath(180, 180 + longSweep)}
            fill="none"
            stroke={`url(#${longGrad})`}
            strokeWidth={stroke}
            strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 10px ${longColor}aa)` }}
          />
        )}
        {shortSweep > 0.5 && (
          <path
            className={animClass}
            d={arcPath(360 - shortSweep, 360)}
            fill="none"
            stroke={`url(#${shortGrad})`}
            strokeWidth={stroke}
            strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 10px ${shortColor}aa)` }}
          />
        )}
        <circle cx={cx} cy={cy - 8} r={22} fill="rgba(8,12,28,0.85)" stroke={centerColor} strokeWidth={1.5} opacity={0.95} />
        <text x={cx} y={cy - 4} textAnchor="middle" fill={centerColor} fontSize="11" fontWeight="900">
          {verdict}
        </text>
        <text x={cx - 36} y={cy + 14} textAnchor="middle" fill={longColor} fontSize="9" fontWeight="800">
          L {longPct}%
        </text>
        <text x={cx + 36} y={cy + 14} textAnchor="middle" fill={shortColor} fontSize="9" fontWeight="800">
          S {shortPct}%
        </text>
      </svg>
      <div className="md-premium-gauge__label">롱·숏 전장</div>
    </div>
  );
}

/** AI 융합 점수 — 풀 링 도넛 */
export function FusionScoreRing({
  value,
  label,
  sublabel,
  color = '#a78bfa',
  color2 = '#22d3ee',
  size = 100,
  trackColor = 'rgba(51,65,85,0.85)',
  textColor = '#f8fafc',
  animated = false,
}: {
  value: number;
  label: string;
  sublabel?: string;
  color?: string;
  color2?: string;
  size?: number;
  trackColor?: string;
  textColor?: string;
  animated?: boolean;
}) {
  const rid = useId();
  const pct = Math.min(1, Math.max(0, value / 100));
  const stroke = 9;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circ = 2 * Math.PI * r;
  const dash = `${circ * pct} ${circ}`;
  const gradId = uid('fusion', rid);

  return (
    <div className={`md-premium-gauge ${animated ? 'md-gauge-enter' : ''}`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={color2} />
            <stop offset="50%" stopColor={color} />
            <stop offset="100%" stopColor={color} stopOpacity="0.6" />
          </linearGradient>
        </defs>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={trackColor} strokeWidth={stroke} opacity={0.5} />
        <circle
          className={animated ? 'md-gauge-arc-fill' : undefined}
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={dash}
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{ filter: `drop-shadow(0 0 8px ${color}88)` }}
        />
        <text x={cx} y={cy + 2} textAnchor="middle" fill={textColor} fontSize={size * 0.22} fontWeight="900">
          {value}
        </text>
      </svg>
      <div className="md-premium-gauge__label">{label}</div>
      {sublabel && <div className="md-premium-gauge__sublabel">{sublabel}</div>}
    </div>
  );
}

export function MetricSparkline({
  points,
  width = 100,
  height = 32,
  color = '#a78bfa',
  color2 = '#22d3ee',
  animated = false,
}: {
  points: number[];
  width?: number;
  height?: number;
  color?: string;
  color2?: string;
  animated?: boolean;
}) {
  const rid = useId();
  const gradId = uid('spark', rid);
  const glowId = uid('sparkGlow', rid);

  const { coords, area } = useMemo(() => {
    if (!points.length) return { coords: '', area: '' };
    const min = Math.min(...points);
    const max = Math.max(...points);
    const range = Math.max(max - min, 1e-9);
    const pad = 2;
    const innerW = width - pad * 2;
    const innerH = height - pad * 2;
    const c = points.map((p, i) => {
      const x = pad + (i / Math.max(1, points.length - 1)) * innerW;
      const y = pad + innerH - ((p - min) / range) * innerH;
      return `${x},${y}`;
    });
    const a = `${pad},${height - pad} ${c.join(' ')} ${width - pad},${height - pad}`;
    return { coords: c.join(' '), area: a };
  }, [points, width, height]);

  if (!points.length) return null;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden
      className={`md-premium-spark ${animated ? 'md-spark-enter' : ''}`}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={color2} stopOpacity="0.5" />
          <stop offset="100%" stopColor={color} stopOpacity="0.9" />
        </linearGradient>
        <filter id={glowId}>
          <feGaussianBlur stdDeviation="1.5" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <polygon points={area} fill={`url(#${gradId})`} opacity={0.35} />
      <polyline
        points={coords}
        fill="none"
        stroke={`url(#${gradId})`}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        filter={`url(#${glowId})`}
      />
    </svg>
  );
}
