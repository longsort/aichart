'use client';

import { useMemo } from 'react';
import type { CandleBattlePack, BattlePaneSeries, BattleAnalysisMarker } from '@/lib/candleBattle';
import styles from './MergedAnalysisDesk.module.css';

type Props = {
  pack: CandleBattlePack | null;
  lookback?: number;
};

function eventTimes(markers: BattleAnalysisMarker[], lookbackStart: number): number[] {
  const keep = new Set(['SWEEP', 'SFP', 'ABSORPTION', 'CHOCH', 'DISPLACEMENT', 'RETEST', 'ENTRY']);
  return markers
    .filter((m) => keep.has(m.type) && m.availability !== 'NOT_AVAILABLE' && m.timestamp >= lookbackStart)
    .map((m) => m.timestamp);
}

function PaneSvg({
  pane,
  lookback,
  colorPos,
  colorNeg,
  eventTs,
}: {
  pane: BattlePaneSeries;
  lookback: number;
  colorPos: string;
  colorNeg: string;
  eventTs: number[];
}) {
  const pts = useMemo(() => pane.points.slice(-lookback), [pane.points, lookback]);
  if (pane.availability === 'NOT_AVAILABLE' || pts.length < 2) {
    return (
      <div className={styles.candleBattlePaneEmpty}>
        {pane.key.toUpperCase()} · {pane.availability}
        <span>{pane.noteKo}</span>
      </div>
    );
  }
  const vals = pts.map((p) => p.value);
  const min = Math.min(...vals, 0);
  const max = Math.max(...vals, 0);
  const span = Math.max(1e-12, max - min);
  const w = 640;
  const h = 56;
  const t0 = pts[0]!.time;
  const t1 = pts[pts.length - 1]!.time;
  const tSpan = Math.max(1, t1 - t0);
  const xAt = (t: number) => ((t - t0) / tSpan) * w;
  const isBar = pane.key === 'volume' || pane.key === 'delta';

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={styles.candleBattlePaneSvg} preserveAspectRatio="none">
      {eventTs.map((t) => (
        <line
          key={`ev-${t}`}
          x1={xAt(t)}
          x2={xAt(t)}
          y1={0}
          y2={h}
          stroke="rgba(251,191,36,0.45)"
          strokeWidth={1}
          strokeDasharray="3 3"
        />
      ))}
      {isBar
        ? pts.map((p, i) => {
            const barW = Math.max(1, w / pts.length - 0.4);
            const x = (i / Math.max(1, pts.length - 1)) * (w - barW);
            const zeroY = h - ((0 - min) / span) * (h - 4) - 2;
            const y = h - ((p.value - min) / span) * (h - 4) - 2;
            const top = Math.min(y, zeroY);
            const bh = Math.max(1, Math.abs(y - zeroY));
            const pos = p.value >= 0;
            return (
              <rect
                key={`${p.time}-${i}`}
                x={x}
                y={pane.key === 'volume' ? y : top}
                width={barW}
                height={pane.key === 'volume' ? Math.max(1, h - 2 - y) : bh}
                fill={pos ? colorPos : colorNeg}
                opacity={0.88}
              />
            );
          })
        : (() => {
            const d = pts
              .map((p, i) => {
                const x = (i / Math.max(1, pts.length - 1)) * w;
                const y = h - ((p.value - min) / span) * (h - 4) - 2;
                return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
              })
              .join(' ');
            return <path d={d} fill="none" stroke={colorPos} strokeWidth={1.6} />;
          })()}
    </svg>
  );
}

export default function CandleBattlePanes({ pack, lookback = 100 }: Props) {
  if (!pack?.panes?.length) return null;
  const pts0 = pack.panes.find((p) => p.points.length)?.points.slice(-lookback) ?? [];
  const lookbackStart = pts0[0]?.time ?? 0;
  const ev = eventTimes(pack.markers, lookbackStart);
  const labels: Record<string, string> = {
    volume: '거래량',
    delta: '델타',
    cvd: 'CVD',
    oi: 'OI',
  };
  return (
    <div className={styles.candleBattlePanes} aria-label="실캔들 전투 보조패널" data-battle-panes="1">
      {pack.panes.map((pane) => (
        <div key={pane.key} className={styles.candleBattlePane} data-key={pane.key}>
          <div className={styles.candleBattlePaneHead}>
            <strong>{labels[pane.key] || pane.key}</strong>
            <span data-av={pane.availability}>{pane.availability}</span>
          </div>
          <PaneSvg
            pane={pane}
            lookback={lookback}
            colorPos={pane.key === 'volume' ? '#38bdf8' : '#4ade80'}
            colorNeg="#f87171"
            eventTs={ev}
          />
          <div className={styles.candleBattlePaneNote}>{pane.noteKo}</div>
        </div>
      ))}
      <div className={styles.candleBattlePaneFoot}>
        노란 점선 = 스윕/SFP/흡수/CHoCH/Displ 시각 동기 · OI·REP·히트맵은 데이터 없으면 N/A
      </div>
    </div>
  );
}
