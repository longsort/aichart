'use client';

import { useState } from 'react';
import type { UnifiedMtfAnalysisStatistics, MtfTierStatistics } from '@/lib/unifiedMtfAnalysisStatistics';
import styles from './MergedAnalysisDesk.module.css';

type Props = {
  stats: UnifiedMtfAnalysisStatistics;
  loading?: boolean;
};

function fmt(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n === 0) return '—';
  return n.toLocaleString(undefined, { maximumFractionDigits: n >= 1000 ? 1 : 2 });
}

function dirKo(d: string): string {
  if (d === 'LONG') return '롱';
  if (d === 'SHORT') return '숏';
  return '관망';
}

function StrikeRow({ label, strike, accent }: { label: string; strike: { entry: number; sl: number; tp1: number; tp2: number; tp3: number; rr: number | null } | null; accent: string }) {
  if (!strike) return null;
  return (
    <div className={styles.mtfStatStrikeRow} style={{ borderColor: `${accent}44` }}>
      <span className={styles.mtfStatStrikeLabel} style={{ color: accent }}>
        {label}
      </span>
      <span>E {fmt(strike.entry)}</span>
      <span>SL {fmt(strike.sl)}</span>
      <span>TP1 {fmt(strike.tp1)}</span>
      <span>TP2 {fmt(strike.tp2)}</span>
      <span>TP3 {fmt(strike.tp3)}</span>
      {strike.rr != null ? <span className={styles.mtfStatRr}>RR {strike.rr}</span> : null}
    </div>
  );
}

function TierPanel({ tier, defaultOpen }: { tier: MtfTierStatistics; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen ?? (tier.tier === 'minute' || tier.tier === 'hour'));
  const dom = tier.dominantDirection;
  const barLong = tier.longPct;

  return (
    <div className={styles.mtfStatTier} data-tier={tier.tier} data-verdict={dom}>
      <button type="button" className={styles.mtfStatTierHead} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className={styles.mtfStatTierEmoji}>{tier.emoji}</span>
        <div className={styles.mtfStatTierTitleBlock}>
          <span className={styles.mtfStatTierTitle}>
            {tier.labelKo} · {tier.tfs.join(' · ')}
          </span>
          <span className={styles.mtfStatTierSub}>{tier.headlineKo}</span>
        </div>
        <span
          className={styles.mtfStatTierVerdict}
          style={{
            color: dom === 'LONG' ? '#4ade80' : dom === 'SHORT' ? '#f87171' : '#fcd34d',
          }}
        >
          {dirKo(dom)}
        </span>
        <span className={styles.mtfStatTierToggle}>{open ? '▾' : '▸'}</span>
      </button>

      <div className={styles.mtfStatTierBar}>
        <div className={styles.mtfStatTierBarLong} style={{ width: `${barLong}%` }} />
      </div>

      {open ? (
        <div className={styles.mtfStatTierBody}>
          <StrikeRow label={`${tier.labelKo} 롱`} strike={tier.longStrike} accent="#4ade80" />
          <StrikeRow label={`${tier.labelKo} 숏`} strike={tier.shortStrike} accent="#f87171" />

          <div className={styles.mtfStatTfTable} aria-label={`${tier.labelKo} TF 상세`}>
            {tier.details.map((d) => (
              <div
                key={d.tf}
                className={`${styles.mtfStatTfRow}${d.isChartTf ? ` ${styles.mtfStatTfRowChart}` : ''}${!d.live ? ` ${styles.mtfStatTfRowWait}` : ''}`}
              >
                <span className={styles.mtfStatTfName}>{d.tf}</span>
                <span
                  className={styles.mtfStatTfDir}
                  style={{
                    color: d.direction === 'LONG' ? '#4ade80' : d.direction === 'SHORT' ? '#f87171' : '#94a3b8',
                  }}
                >
                  {dirKo(d.direction)}
                </span>
                <span className={styles.mtfStatTfScores}>
                  L{d.longScore} S{d.shortScore}
                </span>
                {d.activeStrike ? (
                  <span className={styles.mtfStatTfLevels} title={d.summaryKo}>
                    E {fmt(d.activeStrike.entry)} · SL {fmt(d.activeStrike.sl)} · TP {fmt(d.activeStrike.tp1)}
                  </span>
                ) : (
                  <span className={styles.mtfStatTfLevels}>{d.live ? d.summaryKo : '—'}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function UnifiedMtfAnalysisStatisticsPanel({ stats, loading }: Props) {
  const s = stats;
  const verdict = s.statisticalVerdict;
  const verdictColor = verdict === 'LONG' ? '#4ade80' : verdict === 'SHORT' ? '#f87171' : '#fcd34d';

  return (
    <section className={styles.mtfStatPanel} aria-label="MTF 분석 통계">
      <header className={styles.mtfStatHead}>
        <div>
          <span className={styles.mtfStatTag}>통계 집계</span>
          <h3 className={styles.mtfStatTitle}>분·시·일·주·월 MTF 분석 통계</h3>
          <p className={styles.mtfStatSub}>
            {s.symbol} · {s.liveTfCount}/{s.sampleCount} TF 수집
            {loading ? ' · 갱신…' : ''}
          </p>
        </div>
        <div className={styles.mtfStatVerdictPill} style={{ color: verdictColor, borderColor: `${verdictColor}55` }}>
          통계 {dirKo(verdict)}
        </div>
      </header>

      <div className={styles.mtfStatSummary}>{s.summaryKo}</div>

      <div className={styles.mtfStatVoteRow}>
        <div className={styles.mtfStatVoteCell}>
          <span className={styles.mtfStatVoteLabel}>가중 롱</span>
          <strong style={{ color: '#4ade80' }}>{s.weightedLongPct}%</strong>
        </div>
        <div className={styles.mtfStatVoteCell}>
          <span className={styles.mtfStatVoteLabel}>가중 숏</span>
          <strong style={{ color: '#f87171' }}>{s.weightedShortPct}%</strong>
        </div>
        <div className={styles.mtfStatVoteCell}>
          <span className={styles.mtfStatVoteLabel}>표결</span>
          <strong>
            {s.longVotes}L / {s.shortVotes}S
          </strong>
        </div>
        <div className={styles.mtfStatVoteCell}>
          <span className={styles.mtfStatVoteLabel}>신뢰</span>
          <strong>{s.confidence}%</strong>
        </div>
      </div>

      <div className={styles.mtfStatGlobalBar}>
        <div className={styles.mtfStatGlobalBarLong} style={{ width: `${s.weightedLongPct}%` }} />
        <div className={styles.mtfStatGlobalBarShort} style={{ width: `${s.weightedShortPct}%` }} />
      </div>

      <div className={styles.mtfStatStrikeBlock}>
        <StrikeRow label="통계 롱 타점" strike={s.longStrike} accent="#4ade80" />
        <StrikeRow label="통계 숏 타점" strike={s.shortStrike} accent="#f87171" />
        {s.activeStrike ? (
          <div className={styles.mtfStatActiveStrike} data-side={s.activeStrike.side}>
            <span className={styles.mtfStatActiveTag}>활성 {dirKo(s.activeStrike.side)} 타점</span>
            E {fmt(s.activeStrike.entry)} · SL {fmt(s.activeStrike.sl)} · TP1 {fmt(s.activeStrike.tp1)} · TP2{' '}
            {fmt(s.activeStrike.tp2)} · TP3 {fmt(s.activeStrike.tp3)}
            {s.activeStrike.rr != null ? ` · RR ${s.activeStrike.rr}` : ''}
          </div>
        ) : null}
      </div>

      {s.learningKo ? <div className={styles.mtfStatLearning}>{s.learningKo}</div> : null}

      <div className={styles.mtfStatTiers}>
        {s.tiers.map((tier) => (
          <TierPanel key={tier.tier} tier={tier} defaultOpen={tier.tier === 'minute' || tier.tier === 'hour'} />
        ))}
      </div>

      <p className={styles.mtfStatFoot}>TF별 analyze 수집·가중 통계 — 조건부 참고, SL 무효·검증 필수.</p>
    </section>
  );
}
