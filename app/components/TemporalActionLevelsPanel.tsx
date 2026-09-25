'use client';

import type { TemporalActionPlan, TemporalTradeLevel } from '@/lib/temporalActionLevels';
import { fmtTemporalLevelPrice } from '@/lib/temporalActionLevels';
import TradePriceLadderBar from '@/app/components/monthDesk/TradePriceLadderBar';
import styles from './TemporalComparePanel.module.css';

const VERDICT_COLOR = { LONG: '#4ade80', SHORT: '#f87171', WAIT: '#fcd34d' } as const;

function ActionTile({ r, hint, large }: { r: TemporalTradeLevel; hint?: string; large?: boolean }) {
  return (
    <div
      className={`${styles.actionLevelTile} ${large ? styles.actionLevelTileLarge : ''}`}
      style={{ borderColor: `${r.color}55`, boxShadow: `0 0 20px -10px ${r.color}66` }}
    >
      <div className={styles.actionLevelTileBar} style={{ background: r.color }} />
      <div className={styles.actionLevelTileLabel} style={{ color: r.color }}>
        {r.label}
      </div>
      <div className={styles.actionLevelTilePrice}>{fmtTemporalLevelPrice(r)}</div>
      <div className={styles.actionLevelTileDist} style={{ color: r.color }}>
        {r.distKo}
      </div>
      {hint && <div className={styles.actionLevelTileHint}>{hint}</div>}
    </div>
  );
}

export default function TemporalActionLevelsPanel({ plan }: { plan: TemporalActionPlan }) {
  const accent = VERDICT_COLOR[plan.verdict];
  const entry = plan.rows.find((r) => r.key === 'entry');
  const stop = plan.rows.find((r) => r.key === 'stop');
  const tp1 = plan.rows.find((r) => r.key === 'tp1');
  const tp2 = plan.rows.find((r) => r.key === 'tp2');
  const tp3 = plan.rows.find((r) => r.key === 'tp3');
  const close = plan.rows.find((r) => r.key === 'close');

  return (
    <section className={styles.actionLevelPanel}>
      <div className={styles.actionLevelHead}>
        <div>
          <div className={styles.actionLevelTitle}>미래 핵심 타점 · 손절 · TP</div>
          <div className={styles.actionLevelSub}>{plan.summaryKo}</div>
        </div>
        <div className={styles.actionLevelVerdict} style={{ color: accent, borderColor: `${accent}66` }}>
          {plan.verdict}
        </div>
      </div>

      <div className={styles.actionLevelHero}>
        {entry && <ActionTile r={entry} hint={plan.entrySource} large />}
        {stop && <ActionTile r={stop} hint={plan.stopSource} large />}
        {tp1 && <ActionTile r={tp1} hint={plan.targetSource} />}
        {tp2 && <ActionTile r={tp2} />}
        {tp3 && <ActionTile r={tp3} />}
      </div>

      {close?.price != null && (
        <div className={styles.actionLevelClose}>
          <span style={{ color: '#94a3b8' }}>현재가</span>
          <span style={{ color: '#f8fafc', fontWeight: 900 }}>{fmtTemporalLevelPrice(close)}</span>
        </div>
      )}

      <TradePriceLadderBar levels={plan.levels} verdict={plan.verdict} visual />

      {plan.pathTargets.length > 0 && (
        <div className={styles.actionLevelPaths}>
          <div className={styles.pathBarsTitle}>경로별 목표 (참고)</div>
          <div className={styles.actionLevelPathGrid}>
            {plan.pathTargets.map((p) => {
              const c =
                p.direction === 'bullish' ? '#4ade80' : p.direction === 'bearish' ? '#f87171' : '#94a3b8';
              return (
                <div key={p.path} className={styles.actionLevelPathChip} style={{ borderColor: `${c}44` }}>
                  <span style={{ color: c, fontWeight: 900 }}>경로 {p.path}</span>
                  <span style={{ color: '#94a3b8' }}>{p.prob}%</span>
                  <span style={{ color: '#e2e8f0', fontWeight: 800 }}>
                    {p.target != null
                      ? p.target >= 1000
                        ? p.target.toLocaleString(undefined, { maximumFractionDigits: 0 })
                        : p.target.toFixed(2)
                      : '—'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {plan.pastSimilar && (
        <div className={styles.actionLevelPast}>
          <span className={styles.pathBarsTitle}>과거 유사 케이스 ({plan.pastSimilar.similarity}%)</span>
          <div className={styles.actionLevelPastRow}>
            <span>
              타점{' '}
              {plan.pastSimilar.entry != null
                ? plan.pastSimilar.entry.toLocaleString(undefined, { maximumFractionDigits: 0 })
                : '—'}
            </span>
            <span>
              손절{' '}
              {plan.pastSimilar.stop != null
                ? plan.pastSimilar.stop.toLocaleString(undefined, { maximumFractionDigits: 0 })
                : '—'}
            </span>
            <span>
              목표{' '}
              {plan.pastSimilar.target != null
                ? plan.pastSimilar.target.toLocaleString(undefined, { maximumFractionDigits: 0 })
                : '—'}
            </span>
          </div>
        </div>
      )}
    </section>
  );
}

export function TemporalActionLevelsCompact({ plan }: { plan: TemporalActionPlan }) {
  const entry = plan.rows.find((r) => r.key === 'entry');
  const stop = plan.rows.find((r) => r.key === 'stop');
  const tp1 = plan.rows.find((r) => r.key === 'tp1');
  if (!entry || !stop || !tp1) return null;
  return (
    <div className={styles.actionLevelCompact}>
      <span style={{ color: '#a78bfa', fontWeight: 900 }}>타점 {fmtTemporalLevelPrice(entry)}</span>
      <span style={{ color: '#f87171' }}>손절 {fmtTemporalLevelPrice(stop)}</span>
      <span style={{ color: '#38bdf8' }}>TP1 {fmtTemporalLevelPrice(tp1)}</span>
    </div>
  );
}
