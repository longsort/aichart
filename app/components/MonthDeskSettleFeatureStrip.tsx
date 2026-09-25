'use client';

import type { MonthDeskFeatureSettleLabel } from '@/lib/monthDeskFeatureSettleLabels';

type Props = {
  rows: MonthDeskFeatureSettleLabel[];
};

/** 마감·안착 — 기능별 상태 한눈에 (우측 라벨과 동일 데이터) */
export function MonthDeskSettleFeatureStrip({ rows }: Props) {
  if (!rows.length) return null;

  return (
    <div
      className="month-desk-settle-feature-strip"
      style={{
        position: 'absolute',
        left: 8,
        top: 8,
        zIndex: 2485,
        maxWidth: 'min(92vw, 340px)',
        maxHeight: 'min(42vh, 220px)',
        overflow: 'auto',
        pointerEvents: 'none',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        padding: '6px 8px',
        background: 'rgba(8,12,24,0.88)',
        border: '1px solid rgba(100,116,139,0.45)',
        borderRadius: 8,
        boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
      }}
      aria-label="마감·안착 기능 상태"
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 800,
          color: '#94a3b8',
          letterSpacing: '0.04em',
          marginBottom: 2,
        }}
      >
        라인·존별 상태
      </div>
      {rows.map((r) => (
        <div
          key={r.overlayId}
          title={r.tooltipLines.join('\n')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 10,
            lineHeight: 1.3,
          }}
        >
          <span style={{ color: '#cbd5e1', fontWeight: 700, minWidth: 52 }}>{r.featureKo}</span>
          <span
            style={{
              fontWeight: 800,
              color: r.color,
              background: r.bgColor,
              border: `1px solid ${r.borderColor}`,
              padding: '1px 6px',
              borderRadius: 4,
              whiteSpace: 'nowrap',
            }}
          >
            {r.dirKo ? `${r.dirKo} ` : ''}
            {r.statusKo}
          </span>
        </div>
      ))}
    </div>
  );
}
