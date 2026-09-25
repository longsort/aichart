'use client';

/** SVG 호(arc) 게이지 — 135°~405° (270° 스윕) */
export function ArcGauge({
  value,
  max = 100,
  size = 132,
  stroke = 9,
  color = '#62efe0',
  trackColor = 'rgba(51,65,85,0.85)',
  label,
  sublabel,
  displayValue,
  textColor = '#f8fafc',
  subtextColor = '#94a3b8',
  animated = false,
}: {
  value: number;
  max?: number;
  size?: number;
  stroke?: number;
  color?: string;
  trackColor?: string;
  label?: string;
  sublabel?: string;
  displayValue?: string;
  textColor?: string;
  subtextColor?: string;
  animated?: boolean;
}) {
  const pct = Math.min(1, Math.max(0, max > 0 ? value / max : 0));
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const sweep = 270;
  const startDeg = 135;
  const circ = 2 * Math.PI * r;
  const arcLen = (sweep / 360) * circ;
  const dash = `${arcLen * pct} ${circ}`;

  const rot = (deg: number) => {
    const rad = ((deg - 90) * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  };
  const start = rot(startDeg);
  const end = rot(startDeg + sweep);
  const d = `M ${start.x} ${start.y} A ${r} ${r} 0 ${sweep > 180 ? 1 : 0} 1 ${end.x} ${end.y}`;
  const animClass = animated ? 'md-gauge-arc-fill' : undefined;

  return (
    <div className={animated ? 'md-gauge-enter' : undefined} style={{ width: size, textAlign: 'center' }}>
      <svg width={size} height={size * 0.78} viewBox={`0 0 ${size} ${size * 0.78}`} aria-hidden>
        <path d={d} fill="none" stroke={trackColor} strokeWidth={stroke} strokeLinecap="round" />
        <path
          className={animClass}
          d={d}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={dash}
          style={{ filter: `drop-shadow(0 0 6px ${color}88)` }}
        />
        <text x={cx} y={cy - 2} textAnchor="middle" fill={textColor} fontSize={size * 0.2} fontWeight="900" fontFamily="system-ui, sans-serif">
          {displayValue ?? (Number.isFinite(value) ? Math.round(value) : '–')}
        </text>
        {sublabel && (
          <text x={cx} y={cy + size * 0.12} textAnchor="middle" fill={subtextColor} fontSize={size * 0.09} fontWeight="700" fontFamily="system-ui, sans-serif">
            {sublabel}
          </text>
        )}
      </svg>
      {label && <div style={{ fontSize: 11, fontWeight: 800, color: subtextColor, marginTop: -4 }}>{label}</div>}
    </div>
  );
}

export function DualVerdictGauge({
  longPct,
  shortPct,
  size = 200,
  longColor = '#4ade80',
  shortColor = '#f87171',
  trackColor = 'rgba(51,65,85,0.9)',
  animated = false,
}: {
  longPct: number;
  shortPct: number;
  size?: number;
  longColor?: string;
  shortColor?: string;
  trackColor?: string;
  animated?: boolean;
}) {
  const w = size;
  const h = size * 0.55;
  const cx = w / 2;
  const cy = h - 8;
  const r = w * 0.38;
  const stroke = 10;
  const animClass = animated ? 'md-gauge-arc-fill' : undefined;

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

  const longSweep = (longPct / 100) * 90;
  const shortSweep = (shortPct / 100) * 90;

  return (
    <div className={animated ? 'md-gauge-enter' : undefined}>
      <svg width={w} height={h + 24} viewBox={`0 0 ${w} ${h + 24}`} aria-hidden>
        <path d={arcPath(180, 270)} fill="none" stroke={trackColor} strokeWidth={stroke} strokeLinecap="round" />
        <path d={arcPath(270, 360)} fill="none" stroke={trackColor} strokeWidth={stroke} strokeLinecap="round" />
        {longSweep > 0.5 && (
          <path
            className={animClass}
            d={arcPath(180, 180 + longSweep)}
            fill="none"
            stroke={longColor}
            strokeWidth={stroke}
            strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 8px ${longColor}88)` }}
          />
        )}
        {shortSweep > 0.5 && (
          <path
            className={animClass}
            d={arcPath(360 - shortSweep, 360)}
            fill="none"
            stroke={shortColor}
            strokeWidth={stroke}
            strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 8px ${shortColor}88)` }}
          />
        )}
        <text x={cx} y={cy - 6} textAnchor="middle" fill="#94a3b8" fontSize="10" fontWeight="700">
          L {longPct}% · S {shortPct}%
        </text>
      </svg>
    </div>
  );
}

export function GateRing({
  gates,
  size = 100,
  passColor = '#4ade80',
  failColor = 'rgba(100,116,139,0.5)',
  textColor = '#f8fafc',
  animated = false,
}: {
  gates: { pass: boolean }[];
  size?: number;
  passColor?: string;
  failColor?: string;
  textColor?: string;
  animated?: boolean;
}) {
  const n = Math.max(1, gates.length);
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.38;
  const stroke = size * 0.09;
  const gap = 0.06;

  return (
    <div className={animated ? 'md-gauge-enter' : undefined}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        {gates.map((g, i) => {
          const a0 = (i / n) * 2 * Math.PI - Math.PI / 2 + gap;
          const a1 = ((i + 1) / n) * 2 * Math.PI - Math.PI / 2 - gap;
          const x0 = cx + r * Math.cos(a0);
          const y0 = cy + r * Math.sin(a0);
          const x1 = cx + r * Math.cos(a1);
          const y1 = cy + r * Math.sin(a1);
          const large = a1 - a0 > Math.PI ? 1 : 0;
          return (
            <path
              key={i}
              className={animated && g.pass ? 'md-gate-seg-pulse' : undefined}
              d={`M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`}
              fill="none"
              stroke={g.pass ? passColor : failColor}
              strokeWidth={stroke}
              strokeLinecap="round"
            />
          );
        })}
        <text x={cx} y={cy + 4} textAnchor="middle" fill={textColor} fontSize={size * 0.18} fontWeight="900">
          {gates.filter((g) => g.pass).length}/{n}
        </text>
      </svg>
    </div>
  );
}

export function Sparkline({
  points,
  width = 120,
  height = 36,
  color = '#a78bfa',
  animated = false,
}: {
  points: number[];
  width?: number;
  height?: number;
  color?: string;
  animated?: boolean;
}) {
  if (!points.length) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = Math.max(max - min, 1e-9);
  const pad = 2;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const coords = points.map((p, i) => {
    const x = pad + (i / Math.max(1, points.length - 1)) * innerW;
    const y = pad + innerH - ((p - min) / range) * innerH;
    return `${x},${y}`;
  });
  const area = `${pad},${height - pad} ${coords.join(' ')} ${width - pad},${height - pad}`;
  const gradId = `mdSpark-${width}-${height}`;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden className={animated ? 'md-spark-enter' : undefined}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${gradId})`} />
      <polyline points={coords.join(' ')} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
