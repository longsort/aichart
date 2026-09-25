'use client';

import type { MergedAnalysisTimelineTrack } from '@/lib/mergedAnalysisDeskEngine';
import type { Candle } from '@/types';
import { visibleLimit } from '@/lib/constants';
import styles from './MergedAnalysisDesk.module.css';

type Props = {
  tracks: MergedAnalysisTimelineTrack[];
  candles: Candle[] | null;
  timeframe: string;
  theme?: 'dark' | 'light';
};

function timeframeIsDailyOrHigher(tf: string): boolean {
  return tf === '1d' || tf === '1w' || tf === '1M' || tf === '1Y';
}

function fmtTime(t: number, timeframe: string): string {
  const d = new Date(t * 1000);
  const mo = d.getMonth() + 1;
  const day = d.getDate();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  if (timeframeIsDailyOrHigher(timeframe)) return `${mo}/${day}`;
  return `${mo}/${day} ${hh}:${mm}`;
}

export default function MergedAnalysisStructureTimeline({
  tracks,
  candles,
  timeframe,
  theme = 'dark',
}: Props) {
  const lim = Math.min(120, visibleLimit(timeframe));
  const window = candles?.slice(Math.max(0, (candles?.length ?? 0) - lim)) ?? [];
  const tMin = window.length ? Number(window[0]!.time) : 0;
  const tMax = window.length ? Number(window[window.length - 1]!.time) : 1;
  const span = Math.max(1, tMax - tMin);
  const totalEvents = tracks.reduce((n, tr) => n + tr.events.length, 0);

  const xPct = (t: number) => {
    if (!Number.isFinite(t) || span <= 0) return 50;
    return Math.max(4, Math.min(96, ((t - tMin) / span) * 100));
  };

  return (
    <div className={styles.timeline} data-theme={theme} aria-label="시장 구조 타임라인">
      <div className={styles.timelineHead}>
        <div className={styles.timelineTitle}>시장 구조 타임라인</div>
        <div className={styles.timelineMeta}>
          {timeframe} · {window.length}봉 · 이벤트 {totalEvents}건
        </div>
      </div>

      {totalEvents === 0 && (
        <div className={styles.timelineEmpty}>이 TF 구간에 표시할 이벤트 없음 — zone·확정·돌파 대기</div>
      )}

      {tracks.map((track) => (
        <div key={track.key} className={styles.timelineRow}>
          <div className={styles.timelineLabel}>{track.labelKo}</div>
          <div className={styles.timelineTrack}>
            <div className={styles.timelineRail} />
            {track.events.length === 0 && (
              <span className={styles.timelineTrackEmpty}>—</span>
            )}
            {track.events.map((ev, i) => (
              <div
                key={`${track.key}-${ev.time}-${ev.labelKo}-${i}`}
                className={`${styles.timelineEvent}${ev.hot ? ` ${styles.timelineEventHot}` : ''}`}
                style={{ left: `${xPct(ev.time)}%` }}
                title={`${ev.labelKo} · ${fmtTime(ev.time, timeframe)} · ${timeframe}`}
              >
                <span
                  className={`${styles.timelineChip}${ev.hot ? ` ${styles.timelineChipHot}` : ''}`}
                  style={{
                    borderColor: ev.color,
                    color: ev.hot ? '#fff' : ev.color,
                    background: ev.hot ? `${ev.color}33` : 'rgba(15,23,42,0.88)',
                  }}
                >
                  {ev.labelKo}
                </span>
                <span
                  className={`${styles.timelineDot}${ev.hot ? ` ${styles.timelineDotHot}` : ''}`}
                  style={{
                    background: ev.color,
                    boxShadow: ev.hot ? `0 0 8px ${ev.color}` : undefined,
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
