'use client';

import type { AnalyzeResponse } from '@/types';
import type {
  TemporalAxisVerdict,
  TemporalCompareColumn,
  TemporalCompareDigest,
  TemporalCompareItem,
  TemporalPathBar,
} from '@/lib/temporalCompareDigest';
import { ArcGauge } from '@/app/components/monthDesk/MonthDeskSvgGauges';
import styles from './TemporalComparePanel.module.css';

const DIR_COLOR = { LONG: '#4ade80', SHORT: '#f87171', WATCH: '#fcd34d' } as const;
const AXIS_COLOR = { past: '#c4b5fd', present: '#67e8f9', future: '#fcd34d' } as const;

function extractPct(value: string): number | null {
  const m = value.match(/(\d+(?:\.\d+)?)\s*%/);
  return m ? Math.min(100, parseFloat(m[1])) : null;
}

function primaryValue(value: string): string {
  const parts = value.split('·').map((s) => s.trim());
  return parts[0] ?? value;
}

function accentIcon(accent?: TemporalCompareItem['accent']): string {
  if (accent === 'long') return '▲';
  if (accent === 'short') return '▼';
  if (accent === 'warn') return '⚠';
  if (accent === 'wait') return '◆';
  return '●';
}

function accentColor(accent?: TemporalCompareItem['accent']): string {
  if (accent === 'long') return '#4ade80';
  if (accent === 'short') return '#f87171';
  if (accent === 'warn') return '#fb923c';
  if (accent === 'wait') return '#fcd34d';
  return '#94a3b8';
}

export function TemporalFlowGauges({
  past,
  present,
  future,
  conflict,
}: {
  past: TemporalAxisVerdict;
  present: TemporalAxisVerdict;
  future: TemporalAxisVerdict;
  conflict: boolean;
}) {
  const axes: { key: 'past' | 'present' | 'future'; label: string; v: TemporalAxisVerdict }[] = [
    { key: 'past', label: '과거', v: past },
    { key: 'present', label: '현재', v: present },
    { key: 'future', label: '미래', v: future },
  ];

  return (
    <div className={styles.flowGaugeRow}>
      {axes.map((ax, i) => {
        const dc = DIR_COLOR[ax.v.direction];
        return (
          <div key={ax.key} className={styles.flowGaugeCell}>
            <div className={styles.flowGaugeLabel} style={{ color: AXIS_COLOR[ax.key] }}>
              {ax.label}
            </div>
            <ArcGauge
              value={ax.v.strength0to100}
              max={100}
              size={96}
              stroke={8}
              color={dc}
              trackColor="rgba(51,65,85,0.85)"
              textColor="#f8fafc"
              subtextColor="#94a3b8"
              displayValue={`${ax.v.strength0to100}`}
              sublabel="%"
              animated
            />
            <div className={styles.flowGaugeDir} style={{ color: dc }}>
              {ax.v.directionKo}
            </div>
            <div className={styles.flowGaugeStatus}>{ax.v.statusKo}</div>
            {i < axes.length - 1 && <span className={styles.flowGaugeArrow}>→</span>}
          </div>
        );
      })}
      {conflict && (
        <div className={styles.flowConflictBadge} title="경로 vs 빔 분기">
          ⚠ 분기
        </div>
      )}
    </div>
  );
}

export function TemporalBeamSparkline({ analysis }: { analysis: AnalyzeResponse | null }) {
  const points = analysis?.beamPathForecast?.points;
  if (!points?.length) return null;

  const w = 280;
  const h = 56;
  const pad = 6;
  const n = points.length;
  const toX = (i: number) => pad + (i / Math.max(1, n - 1)) * (w - pad * 2);
  const toY = (pct: number) => pad + (1 - pct / 100) * (h - pad * 2);

  const longPts = points.map((p, i) => `${toX(i)},${toY(p.longProb)}`).join(' ');
  const shortPts = points.map((p, i) => `${toX(i)},${toY(p.shortProb)}`).join(' ');

  return (
    <div className={styles.beamSpark}>
      <div className={styles.pathBarsTitle}>빔 확률 추이 (+봉)</div>
      <svg width="100%" viewBox={`0 0 ${w} ${h}`} className={styles.beamSparkSvg} role="img" aria-label="빔 롱숏 확률 추이">
        {[25, 50, 75].map((g) => (
          <line key={g} x1={pad} x2={w - pad} y1={toY(g)} y2={toY(g)} stroke="rgba(148,163,184,0.15)" strokeWidth={1} />
        ))}
        <polyline points={longPts} fill="none" stroke="#4ade80" strokeWidth={2.5} strokeLinejoin="round" />
        <polyline points={shortPts} fill="none" stroke="#f87171" strokeWidth={2.5} strokeLinejoin="round" />
        {points.map((p, i) => (
          <text key={p.horizon} x={toX(i)} y={h - 1} textAnchor="middle" fill="#64748b" fontSize={8} fontWeight="700">
            +{p.horizon}
          </text>
        ))}
      </svg>
      <div className={styles.beamLegend}>
        <span style={{ color: '#4ade80' }}>롱%</span>
        <span style={{ color: '#f87171' }}>숏%</span>
      </div>
    </div>
  );
}

export function TemporalPathDonut({ bars }: { bars: TemporalPathBar[] }) {
  if (!bars.length) return null;
  const total = Math.max(1, bars.reduce((s, b) => s + b.pct, 0));
  const size = 100;
  const r = 36;
  const cx = size / 2;
  const cy = size / 2;
  let angle = -90;

  const slices = bars.map((b) => {
    const sweep = (b.pct / total) * 360;
    const start = angle;
    angle += sweep;
    const c = b.direction === 'LONG' ? '#4ade80' : b.direction === 'SHORT' ? '#f87171' : '#94a3b8';
    const rad = (deg: number) => ((deg - 90) * Math.PI) / 180;
    const x1 = cx + r * Math.cos(rad(start));
    const y1 = cy + r * Math.sin(rad(start));
    const x2 = cx + r * Math.cos(rad(start + sweep));
    const y2 = cy + r * Math.sin(rad(start + sweep));
    const large = sweep > 180 ? 1 : 0;
    const d = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
    return { ...b, d, c };
  });

  return (
    <div className={styles.pathDonut}>
      <div className={styles.pathBarsTitle}>경로 비중</div>
      <div className={styles.pathDonutInner}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {slices.map((s) => (
            <path key={s.key} d={s.d} fill={s.c} opacity={0.92} stroke="#0f172a" strokeWidth={1} />
          ))}
          <circle cx={cx} cy={cy} r={22} fill="rgba(15,23,42,0.92)" />
          <text x={cx} y={cy + 4} textAnchor="middle" fill="#e2e8f0" fontSize={11} fontWeight="900">
            {Math.round(total)}%
          </text>
        </svg>
        <div className={styles.pathDonutLegend}>
          {bars.map((b) => {
            const c = b.direction === 'LONG' ? '#4ade80' : b.direction === 'SHORT' ? '#f87171' : '#94a3b8';
            return (
              <div key={b.key} className={styles.pathDonutLegRow}>
                <span className={styles.pathDonutDot} style={{ background: c }} />
                <span style={{ color: c, fontWeight: 800 }}>{b.label}</span>
                <span style={{ color: '#94a3b8', marginLeft: 'auto' }}>{b.pct}%</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ColumnVisualTiles({ col }: { col: TemporalCompareColumn }) {
  const axisColor = AXIS_COLOR[col.key];
  const items = col.items.slice(0, 5);

  return (
    <div className={`${styles.colVisual} ${styles[`colVisual_${col.key}`]}`}>
      <div className={styles.colVisualHead}>
        <span style={{ color: axisColor, fontWeight: 900 }}>{col.title}</span>
        <span className={styles.colVisualCount}>{col.items.length}항목</span>
      </div>
      {items.length === 0 ? (
        <div className={styles.colVisualEmpty}>{col.empty}</div>
      ) : (
        <div className={styles.colVisualTiles}>
          {items.map((it, i) => {
            const pct = extractPct(it.value);
            const color = accentColor(it.accent);
            return (
              <div key={`${col.key}-${i}`} className={styles.colVisualTile} style={{ borderColor: `${color}44` }}>
                <div className={styles.colVisualTileTop}>
                  <span className={styles.colVisualIcon} style={{ color }}>
                    {accentIcon(it.accent)}
                  </span>
                  <span className={styles.colVisualTileLabel}>{it.label}</span>
                </div>
                <div className={styles.colVisualTileValue} style={{ color: it.accent === 'long' || it.accent === 'short' ? color : '#f1f5f9' }}>
                  {primaryValue(it.value)}
                </div>
                {pct != null && (
                  <div className={styles.colVisualBarTrack}>
                    <div className={styles.colVisualBarFill} style={{ width: `${pct}%`, background: color }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function TemporalColumnVisualGrid({ digest }: { digest: TemporalCompareDigest }) {
  return (
    <div className={styles.colVisualGrid}>
      {digest.columns.map((col) => (
        <ColumnVisualTiles key={col.key} col={col} />
      ))}
    </div>
  );
}

export function TemporalAlignmentStrip({ digest }: { digest: TemporalCompareDigest }) {
  const segments = [
    { label: '과거', v: digest.pastVerdict, color: AXIS_COLOR.past },
    { label: '현재', v: digest.presentVerdict, color: AXIS_COLOR.present },
    { label: '미래', v: digest.futureVerdict, color: AXIS_COLOR.future },
  ];

  return (
    <div className={styles.alignStrip}>
      {segments.map((s, i) => {
        const dc = DIR_COLOR[s.v.direction];
        return (
          <div key={s.label} className={styles.alignStripSeg} style={{ flex: Math.max(1, s.v.strength0to100) }}>
            <div className={styles.alignStripBar} style={{ background: `linear-gradient(90deg, ${s.color}55, ${dc})` }} />
            <div className={styles.alignStripMeta}>
              <span style={{ color: s.color, fontWeight: 900 }}>{s.label}</span>
              <span style={{ color: dc, fontWeight: 800 }}>{s.v.directionKo}</span>
              <span style={{ color: '#94a3b8' }}>{s.v.strength0to100}%</span>
            </div>
            {i < segments.length - 1 && <span className={styles.alignStripArrow}>›</span>}
          </div>
        );
      })}
    </div>
  );
}
