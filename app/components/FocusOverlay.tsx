'use client';

import { memo } from 'react';
import type { AnalyzeResponse } from '@/types';

type FocusData = {
  buyZonePct?: number;
  sellZonePct?: number;
  freshnessState?: string;
  holdPct?: number;
  breakPct?: number;
  trapPct?: number;
};

function getFocusData(analysis: AnalyzeResponse | null): FocusData {
  if (!analysis) return {};
  const a = analysis as Record<string, unknown>;
  return {
    buyZonePct: typeof a.buyZoneProbability === 'number' ? a.buyZoneProbability : (analysis.verdict === 'LONG' ? analysis.confidence : undefined),
    sellZonePct: typeof a.sellZoneProbability === 'number' ? a.sellZoneProbability : (analysis.verdict === 'SHORT' ? analysis.confidence : undefined),
    freshnessState: typeof a.freshnessState === 'string' ? a.freshnessState : 'FRESH',
    holdPct: typeof a.holdProbability === 'number' ? a.holdProbability : undefined,
    breakPct: typeof a.breakProbability === 'number' ? a.breakProbability : undefined,
    trapPct: typeof a.trapRisk === 'number' ? a.trapRisk : undefined,
  };
}

const FocusOverlayInner = ({ analysis, theme, standalone }: { analysis: AnalyzeResponse | null; theme?: 'dark' | 'light'; standalone?: boolean }) => {
  const data = getFocusData(analysis);
  const isDark = theme !== 'light';
  const bg = isDark ? 'rgba(15,23,42,0.92)' : 'rgba(255,255,255,0.92)';
  const text = isDark ? '#e2e8f0' : '#1e293b';
  const muted = isDark ? '#94a3b8' : '#64748b';
  const buyColor = '#62efe0';
  const sellColor = '#ff7b7b';

  return (
    <div
      className="focus-overlay-panel"
      style={{
        ...(standalone ? {} : { position: 'absolute' as const, left: 12, top: 12, zIndex: 8, pointerEvents: 'none' as const }),
        padding: '10px 14px',
        background: bg,
        border: `1px solid ${isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)'}`,
        borderRadius: 10,
        fontSize: 12,
        minWidth: 160,
      }}
    >
      <div style={{ fontWeight: 700, color: muted, marginBottom: 8, fontSize: 11 }}>구간 · 포커스</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: buyColor }}>매수 구간</span>
          <span style={{ color: text, fontWeight: 600 }}>{data.buyZonePct != null ? `${data.buyZonePct}%` : '–'}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: sellColor }}>매도 구간</span>
          <span style={{ color: text, fontWeight: 600 }}>{data.sellZonePct != null ? `${data.sellZonePct}%` : '–'}</span>
        </div>
        <div style={{ borderTop: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}`, paddingTop: 6, marginTop: 2 }}>
          <div style={{ color: muted, fontSize: 10, marginBottom: 4 }}>신선도</div>
          <div style={{ color: text, fontWeight: 600 }}>{data.freshnessState ?? '–'}</div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {data.holdPct != null && <span style={{ color: text }}>유지 <strong>{data.holdPct}</strong>%</span>}
          {data.breakPct != null && <span style={{ color: text }}>이탈 <strong>{data.breakPct}</strong>%</span>}
          {data.trapPct != null && <span style={{ color: muted }}>함정 <strong>{data.trapPct}</strong>%</span>}
        </div>
      </div>
    </div>
  );
};

export default memo(FocusOverlayInner);
