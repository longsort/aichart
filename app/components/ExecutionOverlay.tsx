'use client';

import { memo } from 'react';
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

type ExecutionOverlayProps = {
  analysis: AnalyzeResponse | null;
  positions: ExecutionPositions | null;
  theme?: 'dark' | 'light';
};

const ExecutionOverlayInner = ({ analysis, positions, theme }: ExecutionOverlayProps) => {
  if (!analysis || !positions) return null;

  const isLong = analysis.verdict === 'LONG';
  const isDark = theme !== 'light';
  const lineColor = isLong ? '#62efe0' : '#ff7b7b';
  const zoneFill = isLong ? 'rgba(98,239,224,0.12)' : 'rgba(255,123,123,0.12)';
  const textColor = isDark ? '#e2e8f0' : '#1e293b';
  const { entryY, stopY, tpY, xStart, xEnd } = positions;

  const zoneTop = Math.min(entryY, stopY);
  const zoneHeight = Math.abs(entryY - stopY) || 1;

  return (
    <div className="execution-overlay" style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, pointerEvents: 'none', zIndex: 7 }}>
      {/* Execution zone box */}
      <div
        style={{
          position: 'absolute',
          left: xStart,
          top: zoneTop,
          width: Math.max(40, xEnd - xStart),
          height: zoneHeight,
          background: zoneFill,
          border: `2px solid ${lineColor}`,
          borderRadius: 4,
        }}
      />
      {/* Entry line */}
      <div style={{ position: 'absolute', left: xStart, top: entryY, width: xEnd - xStart, height: 2, background: lineColor }} />
      <span style={{ position: 'absolute', left: xEnd + 6, top: entryY - 8, fontSize: 11, color: textColor, fontWeight: 600 }}>진입 {analysis.entry}</span>
      {/* Stop line */}
      <div style={{ position: 'absolute', left: xStart, top: stopY, width: xEnd - xStart, height: 2, background: lineColor, opacity: 0.9 }} />
      <span style={{ position: 'absolute', left: xEnd + 6, top: stopY - 8, fontSize: 11, color: textColor }}>손절 {analysis.stopLoss}</span>
      {/* Targets */}
      {tpY.map((y, i) => (
        <div key={i}>
          <div style={{ position: 'absolute', left: xStart, top: y, width: xEnd - xStart, height: 1, background: lineColor, opacity: 0.6 }} />
          <span style={{ position: 'absolute', left: xEnd + 6, top: y - 6, fontSize: 10, color: textColor }}>목표{i + 1} {analysis.targets?.[i] ?? ''}</span>
        </div>
      ))}
      {/* 롱/숏 확정 80% 이상이고 진입가 도달 시에만 확정 뱃지 표시 */}
      {analysis.executionState === 'CONFIRMED' && (analysis.confidence ?? 0) >= 80 && (
        <div style={{ position: 'absolute', left: xStart, top: zoneTop - 24, padding: '4px 10px', background: isDark ? 'rgba(15,23,42,0.95)' : 'rgba(255,255,255,0.95)', border: `1px solid ${lineColor}`, borderRadius: 6, fontSize: 11, fontWeight: 600, color: lineColor }}>
          확정 · {analysis.confidence}%
        </div>
      )}
    </div>
  );
};

export default memo(ExecutionOverlayInner);
