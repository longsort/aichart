'use client';

import { memo, useRef } from 'react';
import type { AnalyzeResponse } from '@/types';

export type ExecutionPositions = {
  entryY: number;
  stopY: number;
  tpY: number[];
  xStart: number;
  xEnd: number;
  entryPrice: number;
  stopPrice: number;
  tpPrices: number[];
  isLong: boolean;
};

const CONFIRMED_STICKY_MS = 30000;

type ExecutionOverlayProps = {
  analysis: AnalyzeResponse | null;
  positions: ExecutionPositions | null;
  theme?: 'dark' | 'light';
};

const ExecutionOverlayInner = ({ analysis, positions, theme }: ExecutionOverlayProps) => {
  const lastConfirmedAtRef = useRef<number>(0);

  if (!analysis || !positions) return null;

  if (analysis.executionState === 'CONFIRMED' && (analysis.confidence ?? 0) >= 80) {
    lastConfirmedAtRef.current = Date.now();
  }
  const showConfirmed =
    (analysis.executionState === 'CONFIRMED' && (analysis.confidence ?? 0) >= 80) ||
    (lastConfirmedAtRef.current > 0 && Date.now() - lastConfirmedAtRef.current < CONFIRMED_STICKY_MS);

  const isLong = analysis.verdict === 'LONG';
  const isDark = theme !== 'light';
  const lineColor = isLong ? '#22C55E' : '#EF4444';
  const textColor = isDark ? '#e2e8f0' : '#1e293b';
  const { entryY, stopY, tpY, xStart, xEnd } = positions;

  const zoneTop = Math.min(entryY, stopY);
  const lblShadow = '0 1px 3px rgba(0,0,0,.95), 0 0 10px rgba(0,0,0,.5)';

  return (
    <div className="execution-overlay" style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, pointerEvents: 'none', zIndex: 7 }}>
      {/* 구간 박스 없음 — 가는 가로선 + 그림자 글자만 */}
      <div style={{ position: 'absolute', left: xStart, top: entryY, width: xEnd - xStart, height: 1, background: lineColor, opacity: 0.75 }} />
      <span style={{ position: 'absolute', left: xEnd + 6, top: entryY - 8, fontSize: 10.5, color: textColor, fontWeight: 600, textShadow: lblShadow }}>E {analysis.entry}</span>
      <div style={{ position: 'absolute', left: xStart, top: stopY, width: xEnd - xStart, height: 1, background: lineColor, opacity: 0.65 }} />
      <span style={{ position: 'absolute', left: xEnd + 6, top: stopY - 8, fontSize: 10, color: textColor, textShadow: lblShadow }}>SL {analysis.stopLoss}</span>
      {tpY.map((y, i) => (
        <div key={i}>
          <div style={{ position: 'absolute', left: xStart, top: y, width: xEnd - xStart, height: 1, background: lineColor, opacity: 0.45 }} />
          <span style={{ position: 'absolute', left: xEnd + 6, top: y - 6, fontSize: 9.5, color: textColor, textShadow: lblShadow }}>TP{i + 1} {analysis.targets?.[i] ?? ''}</span>
        </div>
      ))}
      {showConfirmed && (
        <div style={{ position: 'absolute', left: xStart, top: zoneTop - 22, padding: '3px 8px', background: isDark ? 'rgba(15,23,42,0.88)' : 'rgba(255,255,255,0.92)', border: `1px solid ${isLong ? 'rgba(34,197,94,0.35)' : 'rgba(239,68,68,0.35)'}`, borderRadius: 6, fontSize: 10, fontWeight: 600, color: lineColor }}>
          확정 · {analysis.confidence}%
        </div>
      )}
    </div>
  );
};

export default memo(ExecutionOverlayInner);
