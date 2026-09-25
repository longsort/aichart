'use client';

import { useMemo, useState } from 'react';
import type { AnalyzeResponse } from '@/types';
import type { MonthDeskVerdictValidationSummary } from '@/lib/monthDeskClosingEngine';
import { buildTemporalCompareDigest, type TemporalAxisStatus, type TemporalAxisVerdict } from '@/lib/temporalCompareDigest';
import { buildTemporalActionPlan } from '@/lib/temporalActionLevels';
import TemporalActionLevelsPanel, { TemporalActionLevelsCompact } from '@/app/components/TemporalActionLevelsPanel';
import {
  TemporalAlignmentStrip,
  TemporalBeamSparkline,
  TemporalColumnVisualGrid,
  TemporalFlowGauges,
  TemporalPathDonut,
} from './TemporalCompareVisual';
import styles from './TemporalComparePanel.module.css';

type Props = {
  analysis: AnalyzeResponse | null;
  symbol: string;
  timeframe: string;
  chartVerdictValidation?: MonthDeskVerdictValidationSummary | null;
  compact?: boolean;
};

const COL_CLASS = {
  past: styles.colPast,
  present: styles.colPresent,
  future: styles.colFuture,
} as const;

const TITLE_COLOR = {
  past: '#c4b5fd',
  present: '#67e8f9',
  future: '#fcd34d',
} as const;

const DIR_COLOR = { LONG: '#4ade80', SHORT: '#f87171', WATCH: '#fcd34d' } as const;

const STATUS_STYLE: Record<TemporalAxisStatus, string> = {
  confirmed: styles.statusConfirmed,
  failed: styles.statusFailed,
  candidate: styles.statusCandidate,
  split: styles.statusSplit,
  watch: styles.statusWatch,
};

function AxisVerdictBadge({ label, v }: { label: string; v: TemporalAxisVerdict }) {
  const dc = DIR_COLOR[v.direction];
  return (
    <div className={`${styles.verdictCard} ${STATUS_STYLE[v.status]}`}>
      <div className={styles.verdictCardLabel}>{label}</div>
      <div className={styles.verdictCardDir} style={{ color: dc }}>
        {v.directionKo}
      </div>
      <div className={styles.verdictCardStatus}>{v.statusKo}</div>
      <div className={styles.verdictCardLine}>{v.oneLine}</div>
    </div>
  );
}

function PathBars({ bars }: { bars: { key: string; label: string; pct: number; direction: 'LONG' | 'SHORT' | 'NEUTRAL' }[] }) {
  if (!bars.length) return null;
  return (
    <div className={styles.pathBars}>
      <div className={styles.pathBarsTitle}>미래 경로 확률</div>
      {bars.map((b) => {
        const c = b.direction === 'LONG' ? '#4ade80' : b.direction === 'SHORT' ? '#f87171' : '#94a3b8';
        return (
          <div key={b.key} className={styles.pathBarRow}>
            <span className={styles.pathBarLabel}>{b.label}</span>
            <div className={styles.pathBarTrack}>
              <div className={styles.pathBarFill} style={{ width: `${Math.min(100, b.pct)}%`, background: c }} />
            </div>
            <span className={styles.pathBarPct} style={{ color: c }}>
              {b.pct}%
            </span>
          </div>
        );
      })}
    </div>
  );
}

function BeamBar({ longPct, shortPct }: { longPct: number; shortPct: number }) {
  const total = Math.max(1, longPct + shortPct);
  const lW = (longPct / total) * 100;
  const sW = (shortPct / total) * 100;
  return (
    <div className={styles.beamBar}>
      <div className={styles.pathBarsTitle}>빔 우세 (봉별 예상)</div>
      <div className={styles.beamTrack}>
        <div className={styles.beamLong} style={{ width: `${lW}%` }} title={`롱 ${longPct}%`} />
        <div className={styles.beamShort} style={{ width: `${sW}%` }} title={`숏 ${shortPct}%`} />
      </div>
      <div className={styles.beamLegend}>
        <span style={{ color: '#4ade80' }}>롱 {longPct}%</span>
        <span style={{ color: '#f87171' }}>숏 {shortPct}%</span>
      </div>
    </div>
  );
}

export default function TemporalComparePanel({
  analysis,
  symbol,
  timeframe,
  chartVerdictValidation,
  compact,
}: Props) {
  const [viewMode, setViewMode] = useState<'visual' | 'detail'>('visual');
  const digest = useMemo(
    () =>
      buildTemporalCompareDigest(analysis, {
        chartVerdictValidation,
        symbol,
        timeframe,
      }),
    [analysis, chartVerdictValidation, symbol, timeframe]
  );
  const actionPlan = useMemo(() => buildTemporalActionPlan(analysis), [analysis]);

  if (!digest) {
    return (
      <div className={compact ? styles.zoneCompact : styles.zone}>
        <div className={styles.inner}>
          <div className={styles.sub}>분석 로드 후 과거·현재·미래 ZONE이 표시됩니다.</div>
        </div>
      </div>
    );
  }

  const g = digest.glance;
  const gc = DIR_COLOR[g.direction];

  if (compact) {
    return (
      <div className={styles.zoneCompact}>
        <div className={styles.inner} style={{ padding: '10px 12px' }}>
          <div className={styles.glanceCompact}>
            <span className={styles.glanceCompactDir} style={{ color: gc }}>
              미래 {digest.futureVerdict.directionKo}
            </span>
            <span className={`${styles.glanceCompactStatus} ${STATUS_STYLE[digest.futureVerdict.status]}`}>
              {digest.futureVerdict.statusKo}
            </span>
            {digest.conflict && <span className={styles.glanceConflict}>분기</span>}
          </div>
          <div className={styles.align} style={{ marginTop: 6, marginBottom: 0, fontSize: 10 }}>
            {digest.alignmentKo}
          </div>
          {actionPlan && <TemporalActionLevelsCompact plan={actionPlan} />}
        </div>
      </div>
    );
  }

  return (
    <section className={styles.zone}>
      <div className={styles.inner}>
        <header className={styles.head}>
          <div>
            <div className={styles.title}>과거 · 현재 · 미래 ZONE</div>
            <div className={styles.sub}>타임라인·게이지·경로 그래프 (참고용, 확정 수익 아님)</div>
          </div>
          <div className={styles.headRight}>
            <div className={styles.viewToggle}>
              <button
                type="button"
                className={`${styles.viewToggleBtn} ${viewMode === 'visual' ? styles.viewToggleBtnActive : ''}`}
                onClick={() => setViewMode('visual')}
              >
                그래프
              </button>
              <button
                type="button"
                className={`${styles.viewToggleBtn} ${viewMode === 'detail' ? styles.viewToggleBtnActive : ''}`}
                onClick={() => setViewMode('detail')}
              >
                상세글
              </button>
            </div>
            <div className={styles.meta}>
              {digest.symbol} · {digest.timeframe}
            </div>
          </div>
        </header>

        <div
          className={`${styles.glanceHero} ${STATUS_STYLE[g.status]} ${digest.conflict ? styles.glanceHeroConflict : ''}`}
        >
          <div className={styles.glanceHeroLeft}>
            <div className={styles.glanceHeroLabel}>한눈 결론 · 미래</div>
            <div className={styles.glanceHeroDir} style={{ color: gc }}>
              {g.directionKo}
              <span className={styles.glanceHeroSub}>{g.statusKo}</span>
            </div>
            <div className={styles.glanceHeroLine}>{g.oneLine}</div>
          </div>
          {digest.conflict && (
            <div className={styles.conflictBox}>
              <div className={styles.conflictTitle}>⚠ 분기</div>
              <div className={styles.conflictText}>{digest.conflictKo}</div>
            </div>
          )}
        </div>

        {actionPlan && <TemporalActionLevelsPanel plan={actionPlan} />}

        <TemporalFlowGauges
          past={digest.pastVerdict}
          present={digest.presentVerdict}
          future={digest.futureVerdict}
          conflict={digest.conflict}
        />

        <TemporalAlignmentStrip digest={digest} />

        <div className={styles.chartRow}>
          <PathBars bars={digest.pathBars} />
          <BeamBar longPct={digest.beamLongPct} shortPct={digest.beamShortPct} />
        </div>

        <div className={styles.chartRow}>
          <TemporalPathDonut bars={digest.pathBars} />
          <TemporalBeamSparkline analysis={analysis} />
        </div>

        {viewMode === 'visual' ? (
          <TemporalColumnVisualGrid digest={digest} />
        ) : (
          <div className={styles.grid}>
            {digest.columns.map((col) => (
              <div key={col.key} className={`${styles.col} ${COL_CLASS[col.key]}`}>
                <div className={styles.colHead}>
                  <div className={styles.colTitle} style={{ color: TITLE_COLOR[col.key] }}>
                    {col.title}
                  </div>
                  <div className={styles.colSub}>{col.subtitle}</div>
                </div>
                <div className={styles.colBody}>
                  {col.items.length === 0 ? (
                    <div className={styles.empty}>{col.empty}</div>
                  ) : (
                    col.items.map((it, i) => (
                      <div
                        key={`${col.key}-${i}`}
                        className={`${styles.item} ${it.accent ? styles[`accent_${it.accent}`] : ''}`}
                      >
                        <span className={styles.itemLabel}>{it.label}</span>
                        <span className={styles.itemValue}>{it.value}</span>
                        {it.hint && <div className={styles.itemHint}>{it.hint}</div>}
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className={styles.align}>{digest.alignmentKo}</div>

        <p className={styles.risk}>{digest.riskNote}</p>
      </div>
    </section>
  );
}
