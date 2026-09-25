'use client';

import { useState } from 'react';
import type { MonthDeskClickPrecisionResult } from '@/lib/monthDeskChartClickPrecision';

type Props = {
  result: MonthDeskClickPrecisionResult;
  onSelectTf?: (tf: string) => void;
  onClear?: () => void;
};

/** 차트 하단 얇은 MTF 핫존 스트립 — 폰에서 접기/닫기 가능 */
export function MonthDeskClickPrecisionBar({ result, onSelectTf, onClear }: Props) {
  const [folded, setFolded] = useState(false);

  const stopChart = (e: { stopPropagation: () => void; preventDefault?: () => void }) => {
    e.stopPropagation();
  };

  return (
    <div
      className="month-desk-click-precision-bar"
      data-merged-fold-hud="hotzone"
      style={{
        position: 'absolute',
        left: 8,
        right: 8,
        bottom: 28,
        zIndex: 3600,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        pointerEvents: 'auto',
        isolation: 'isolate',
        touchAction: 'manipulation',
      }}
      onPointerDown={stopChart}
      onTouchStart={stopChart}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          padding: '6px 8px',
          borderRadius: 8,
          background: 'rgba(6,12,24,0.92)',
          border: '1px solid rgba(45,212,191,0.35)',
          fontSize: 11,
        }}
      >
        <span style={{ fontWeight: 800, color: '#5eead4', minWidth: 0, flex: '1 1 auto' }}>
          {folded ? '핫존' : result.headlineKo}
        </span>
        {!folded ? <span style={{ color: '#94a3b8', fontSize: 10 }}>{result.sublineKo}</span> : null}
        <button
          type="button"
          className="tool-chip tool-chip-button"
          style={{ fontSize: 12, fontWeight: 800, padding: '8px 10px', minHeight: 44, minWidth: 48, flexShrink: 0 }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setFolded((v) => !v);
          }}
          title={folded ? '핫존 펼치기' : '핫존 접기'}
        >
          {folded ? '펴기' : '접기'}
        </button>
        {onClear && (
          <button
            type="button"
            className="tool-chip tool-chip-button"
            style={{
              fontSize: 12,
              fontWeight: 800,
              padding: '8px 10px',
              minHeight: 44,
              minWidth: 48,
              flexShrink: 0,
              color: '#fda4af',
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onClear();
            }}
            title="핫존 안내 닫기"
          >
            닫기
          </button>
        )}
      </div>
      {!folded ? (
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
                  fontSize: 11,
                  padding: '8px 10px',
                  minHeight: 40,
                  borderColor: `${accent}55`,
                  color: accent,
                  background: 'rgba(15,23,42,0.85)',
                }}
                title={row.ko}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onSelectTf?.(row.tf);
                }}
              >
                {row.tfLabel} {row.side === 'LONG' ? '▲' : row.side === 'SHORT' ? '▼' : '·'} {row.score}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
