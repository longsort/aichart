'use client';

import type { MonthDeskClickPrecisionResult } from '@/lib/monthDeskChartClickPrecision';

type Props = {
  result: MonthDeskClickPrecisionResult;
  onSelectTf?: (tf: string) => void;
  onClear?: () => void;
};

/** 차트 하단 얇은 MTF 핫존 스트립 (카드 아님) */
export function MonthDeskClickPrecisionBar({ result, onSelectTf, onClear }: Props) {
  return (
    <div
      className="month-desk-click-precision-bar"
      style={{
        position: 'absolute',
        left: 8,
        right: 8,
        bottom: 28,
        zIndex: 2488,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        pointerEvents: 'auto',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          padding: '4px 8px',
          borderRadius: 8,
          background: 'rgba(6,12,24,0.88)',
          border: '1px solid rgba(45,212,191,0.35)',
          fontSize: 9,
        }}
      >
        <span style={{ fontWeight: 800, color: '#5eead4' }}>{result.headlineKo}</span>
        <span style={{ color: '#94a3b8' }}>{result.sublineKo}</span>
        {onClear && (
          <button
            type="button"
            className="tool-chip tool-chip-button"
            style={{ fontSize: 8, padding: '1px 6px', flexShrink: 0 }}
            onClick={onClear}
          >
            ✕
          </button>
        )}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {result.rows.map((row) => {
          const accent =
            row.side === 'LONG' ? '#4ade80' : row.side === 'SHORT' ? '#f87171' : '#94a3b8';
          return (
            <button
              key={row.tf}
              type="button"
              className="tool-chip tool-chip-button"
              style={{
                fontSize: 8,
                padding: '3px 7px',
                borderColor: `${accent}55`,
                color: accent,
                background: 'rgba(15,23,42,0.85)',
              }}
              title={row.ko}
              onClick={() => onSelectTf?.(row.tf)}
            >
              {row.tfLabel} {row.side === 'LONG' ? '▲' : row.side === 'SHORT' ? '▼' : '·'}{' '}
              {row.score}
            </button>
          );
        })}
      </div>
    </div>
  );
}
