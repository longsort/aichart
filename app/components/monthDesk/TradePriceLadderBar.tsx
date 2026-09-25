'use client';

import { useMemo } from 'react';
import type { MonthDeskCoreLevels } from '@/lib/monthDeskCoreLevels';
import { buildTradePriceLadder } from '@/lib/tradePriceLadder';
import styles from '../MonthDeskAnalysisBoard.module.css';

function fmtPx(n: number): string {
  return n >= 1000 ? n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : n.toFixed(2);
}

export default function TradePriceLadderBar({
  levels,
  verdict,
  compact,
  visual,
}: {
  levels: MonthDeskCoreLevels;
  verdict: 'LONG' | 'SHORT' | 'WAIT';
  compact?: boolean;
  visual?: boolean;
}) {
  const ladder = useMemo(() => buildTradePriceLadder(levels, verdict), [levels, verdict]);
  if (!ladder) return null;

  const closeMark = ladder.marks.find((m) => m.kind === 'close');
  const invalidMark = ladder.marks.find((m) => m.kind === 'invalid');
  const tpMark = ladder.marks.find((m) => m.kind === 'tp');

  return (
    <div className={`${styles.ladderWrap} ${compact ? styles.ladderWrapCompact : ''} ${visual ? styles.ladderWrapVisual : ''}`}>
      <div className={styles.ladderHead}>
        <span>{visual ? '가격 레일 · 리스크 ↔ 리워드' : '가격 레일'}</span>
        <span className={styles.ladderSpan}>{ladder.spanLabel}</span>
      </div>
      <div className={styles.ladderTrack} style={visual ? { height: 36 } : undefined}>
        {visual && invalidMark && closeMark && (
          <div
            className={styles.ladderRiskZone}
            style={{
              left: `${Math.min(invalidMark.pct, closeMark.pct)}%`,
              width: `${Math.abs(closeMark.pct - invalidMark.pct)}%`,
            }}
          />
        )}
        {visual && closeMark && tpMark && (
          <div
            className={styles.ladderRewardZone}
            style={{
              left: `${Math.min(closeMark.pct, tpMark.pct)}%`,
              width: `${Math.abs(tpMark.pct - closeMark.pct)}%`,
            }}
          />
        )}
        {ladder.marks.map((m) => (
          <div
            key={m.key}
            className={`${styles.ladderMark} ${m.kind === 'close' ? styles.ladderMarkClose : ''} ${visual ? styles.ladderMarkVisual : ''}`}
            style={{ left: `${m.pct}%`, borderColor: m.color, color: m.color }}
            title={`${m.label} ${m.price}`}
          >
            <div className={`${styles.ladderTick} ${visual ? styles.ladderTickVisual : ''}`} style={{ background: m.color }} />
            {(!compact || visual) && (
              <span className={styles.ladderMarkLabel}>
                {m.label}
                {visual && <span className={styles.ladderMarkPrice}>{fmtPx(m.price)}</span>}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
