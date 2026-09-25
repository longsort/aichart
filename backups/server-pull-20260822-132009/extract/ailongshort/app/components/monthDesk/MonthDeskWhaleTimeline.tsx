'use client';

import type { CSSProperties } from 'react';
import type { WhaleTimelineBar, WhaleTimelineKind } from '@/lib/monthDeskWhaleDesk';
import styles from '../MonthDeskAnalysisBoard.module.css';

const KIND_META: Record<
  WhaleTimelineKind,
  { color: string; glow: string; label: string; h: number }
> = {
  idle: { color: '#334155', glow: 'transparent', label: '·', h: 0.35 },
  buy: { color: '#4ade80', glow: '#4ade8088', label: '매수', h: 0.85 },
  sell: { color: '#f87171', glow: '#f8717188', label: '매도', h: 0.85 },
  buy_zone: { color: '#2dd4bf', glow: '#2dd4bf66', label: '매수존', h: 0.55 },
  sell_zone: { color: '#fb923c', glow: '#fb923c66', label: '매도존', h: 0.55 },
  conf_long: { color: '#22d3ee', glow: '#22d3eecc', label: '유입▲', h: 1 },
  conf_short: { color: '#fb7185', glow: '#fb7185cc', label: '유출▼', h: 1 },
};

type Props = {
  bars: WhaleTimelineBar[];
  compact?: boolean;
};

export default function MonthDeskWhaleTimeline({ bars, compact }: Props) {
  return (
    <div className={`${styles.whaleTimeline} ${compact ? styles.whaleTimelineCompact : ''}`}>
      <div className={styles.whaleTimelineHead}>
        <span className={styles.whaleTimelineTitle}>최근 {bars.length}봉 · WAD·존</span>
        <span className={styles.whaleTimelineHint}>← 과거 · 최신 →</span>
      </div>
      <div className={styles.whaleTimelineTrack} role="list" aria-label="고래 WAD 타임라인">
        {bars.map((bar, i) => {
          const m = KIND_META[bar.kind];
          return (
            <div
              key={i}
              role="listitem"
              className={`${styles.whaleTimelineBar} ${bar.isLast ? styles.whaleTimelineBarLast : ''} ${bar.kind !== 'idle' ? styles.whaleTimelineBarHot : ''}`}
              style={
                {
                  ['--whale-bar-color' as string]: m.color,
                  ['--whale-bar-glow' as string]: m.glow,
                  ['--whale-bar-h' as string]: String(m.h),
                } as CSSProperties
              }
              title={m.label}
            >
              <div className={styles.whaleTimelineBarFill} />
              {bar.isLast && <div className={styles.whaleTimelineNow}>NOW</div>}
            </div>
          );
        })}
      </div>
      <div className={styles.whaleTimelineLegend}>
        <span style={{ color: '#22d3ee' }}>● 유입</span>
        <span style={{ color: '#4ade80' }}>● WAD매수</span>
        <span style={{ color: '#2dd4bf' }}>● 매수존</span>
        <span style={{ color: '#fb7185' }}>● 유출</span>
        <span style={{ color: '#fb923c' }}>● 매도존</span>
      </div>
    </div>
  );
}
