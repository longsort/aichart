'use client';

/**
 * Doksuri-1 Battle Briefing card — FACT만 표시, 창작 없음.
 */
import { useState } from 'react';
import type { Doksuri1Pack } from '@/lib/doksuri1/types';
import styles from './MergedAnalysisDesk.module.css';

type Props = {
  pack: Doksuri1Pack | null;
  theme?: 'dark' | 'light';
};

export default function Doksuri1BattleCard({ pack }: Props) {
  const [open, setOpen] = useState(false);
  if (!pack) return null;
  const { cardKo, fact } = pack;

  return (
    <div
      className={styles.mergedHqEntryStrip}
      aria-label="독수리1호 전황"
      style={{
        flexDirection: 'column',
        alignItems: 'stretch',
        gap: 6,
        borderColor: 'rgba(56,189,248,0.45)',
        padding: '8px 10px',
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 8,
          background: 'transparent',
          border: 0,
          color: 'inherit',
          cursor: 'pointer',
          padding: 0,
          textAlign: 'left',
          width: '100%',
        }}
      >
        <span style={{ display: 'flex', gap: 8, alignItems: 'center', minWidth: 0 }}>
          <span className={styles.stripHqTag}>독수리전황</span>
          <span className={styles.stripHqText} style={{ fontWeight: 600 }}>
            {cardKo.headline}
          </span>
        </span>
        <span style={{ opacity: 0.7, flexShrink: 0 }}>{open ? '▲' : '▼'}</span>
      </button>

      <div style={{ fontSize: 12, lineHeight: 1.45, opacity: 0.95 }}>
        {cardKo.mapLines.slice(0, 5).map((line) => (
          <div key={line}>{line}</div>
        ))}
        <div style={{ marginTop: 4, opacity: 0.9 }}>{cardKo.longOneLine}</div>
        <div style={{ opacity: 0.9 }}>{cardKo.shortOneLine}</div>
        <div style={{ marginTop: 4 }}>{cardKo.nextBattle}</div>
        <div>
          행동 <strong>{cardKo.action}</strong>
          {fact.badSourceCount >= 2 ? ' · 품질경고 WAIT' : ''}
        </div>
      </div>

      {open && (
        <div
          style={{
            marginTop: 4,
            paddingTop: 6,
            borderTop: '1px solid rgba(148,163,184,0.25)',
            fontSize: 11,
            lineHeight: 1.4,
            opacity: 0.88,
          }}
        >
          <div style={{ marginBottom: 4 }}>▼상세(원시지표)</div>
          {fact.derivCaseKo && fact.dataQuality.derivatives !== 'BAD' && (
            <div>{fact.derivCaseKo}</div>
          )}
          {fact.fundingKo && <div>{fact.fundingKo}</div>}
          {fact.liqKo && <div>{fact.liqKo}</div>}
          {fact.absorptionNoteKo && fact.dataQuality.orderflow !== 'BAD' && (
            <div>{fact.absorptionNoteKo}</div>
          )}
          {fact.learningLineKo && <div>{fact.learningLineKo}</div>}
          {fact.volumeLineKo && <div>{fact.volumeLineKo}</div>}
          {fact.whaleSampleN != null && <div>고래 표본 n={fact.whaleSampleN}</div>}
          {fact.zoneScores.slice(0, 4).map((z) => (
            <div key={z.zoneId}>
              {z.labelKo} A{z.attackScore}/D{z.defenseScore} · {z.state}
            </div>
          ))}
          {fact.paths.map((p) => (
            <div key={p.id}>
              {p.id} {p.conditionKo}
              {p.probabilityPct != null ? ` · 표본확률참고 ${p.probabilityPct}%` : ''}
            </div>
          ))}
          {fact.liveChainKo.map((s, i) => (
            <div key={`live-${i}`}>→ {s}</div>
          ))}
          {fact.tipKo && <div>{fact.tipKo}</div>}
        </div>
      )}
    </div>
  );
}
