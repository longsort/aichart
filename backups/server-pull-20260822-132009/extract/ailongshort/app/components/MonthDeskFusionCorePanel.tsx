'use client';

import { useMemo } from 'react';
import type { AnalyzeResponse, Candle } from '@/types';
import { buildMonthDeskBoardMetrics } from '@/lib/monthDeskBoardMetrics';
import { buildMonthDeskUnifiedCoreMoneyTooltip } from '@/lib/monthDeskUnifiedCoreMoney';
import { useTfCloseSettleBoard } from '@/lib/useTfCloseSettleBoard';

type Props = {
  symbol: string;
  timeframe: string;
  analysis: AnalyzeResponse | null;
  candles: Candle[] | null;
};

function fmtPx(n: number): string {
  if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (n >= 1) return n.toFixed(2);
  return n.toFixed(4);
}

export default function MonthDeskFusionCorePanel({ symbol, timeframe, analysis, candles }: Props) {
  const { board } = useTfCloseSettleBoard(symbol, true);

  const snapshot = useMemo(
    () => buildMonthDeskBoardMetrics({ analysis, candles, board, timeframe }),
    [analysis, candles, board, timeframe]
  );

  const { mtfBoost, ucm, longScore, shortScore, fusionLine, verdict, longPct, shortPct } = snapshot;

  if (!mtfBoost && !ucm && !fusionLine && longScore <= 0 && shortScore <= 0) {
    return (
      <div
        style={{
          padding: '14px 16px',
          borderRadius: 12,
          border: '1px solid rgba(167,139,250,0.22)',
          background: 'rgba(15,23,42,0.65)',
          fontSize: 11,
          color: '#94a3b8',
        }}
      >
        연합·$$$$ 요약은 분석·캔들 로드 후 표시됩니다.
      </div>
    );
  }

  return (
    <div
      style={{
        padding: '16px 18px',
        borderRadius: 14,
        border: '1px solid rgba(167,139,250,0.32)',
        background: 'linear-gradient(145deg, rgba(30,27,75,0.55) 0%, rgba(15,23,42,0.92) 100%)',
        boxShadow: '0 0 32px -14px rgba(167,139,250,0.35)',
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 14, fontWeight: 900, color: '#ede9fe' }}>연합 · $$$$ · MTF</span>
        <span style={{ fontSize: 10, color: '#a78bfa' }}>
          {symbol} · {timeframe}
          {verdict !== 'WAIT' && (
            <span style={{ marginLeft: 8, fontWeight: 800, color: verdict === 'LONG' ? '#4ade80' : '#f87171' }}>
              분석 {verdict === 'LONG' ? '롱' : '숏'}
            </span>
          )}
        </span>
      </div>

      {(longScore > 0 || shortScore > 0) && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontWeight: 800, marginBottom: 6 }}>
            <span style={{ color: '#4ade80' }}>롱 {longScore.toFixed(1)}</span>
            <span style={{ color: '#f87171' }}>숏 {shortScore.toFixed(1)}</span>
          </div>
          <div style={{ display: 'flex', height: 10, borderRadius: 999, overflow: 'hidden', border: '1px solid rgba(148,163,184,0.25)' }}>
            <div style={{ width: `${longPct}%`, background: 'linear-gradient(90deg, #166534, #4ade80)' }} title={`롱 ${longPct}%`} />
            <div style={{ width: `${shortPct}%`, background: 'linear-gradient(90deg, #f87171, #991b1b)' }} title={`숏 ${shortPct}%`} />
          </div>
        </div>
      )}

      {mtfBoost && (
        <div
          style={{
            marginBottom: 12,
            padding: '10px 12px',
            borderRadius: 10,
            background: 'rgba(49,46,129,0.35)',
            border: '1px solid rgba(129,140,248,0.35)',
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 800, color: '#c4b5fd', marginBottom: 6 }}>
            MTF 마감 연합
            {mtfBoost.conflict && (
              <span style={{ marginLeft: 8, color: '#fde68a', fontWeight: 700 }}>혼재</span>
            )}
          </div>
          <p style={{ margin: 0, fontSize: 12, lineHeight: 1.55, color: '#e2e8f0' }}>{mtfBoost.summaryKo}</p>
          {mtfBoost.reasonsKo.length > 0 && (
            <ul style={{ margin: '8px 0 0', paddingLeft: 16, fontSize: 10, color: '#94a3b8', lineHeight: 1.5 }}>
              {mtfBoost.reasonsKo.slice(0, 6).map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {ucm && (
        <div
          style={{
            padding: '12px 14px',
            borderRadius: 10,
            border: `2px solid ${ucm.side === 'LONG' ? 'rgba(34,197,94,0.45)' : 'rgba(248,113,113,0.45)'}`,
            background: ucm.side === 'LONG' ? 'rgba(6,78,59,0.22)' : 'rgba(127,29,29,0.18)',
          }}
          title={buildMonthDeskUnifiedCoreMoneyTooltip(ucm)}
        >
          <div style={{ fontSize: 12, fontWeight: 900, color: ucm.side === 'LONG' ? '#86efac' : '#fca5a5', marginBottom: 6 }}>
            통합 $$$$ 핵심타점
          </div>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#f8fafc', fontVariantNumeric: 'tabular-nums' }}>
            {fmtPx(ucm.priceBot)} – {fmtPx(ucm.priceTop)}
            <span style={{ marginLeft: 8, fontSize: 11, color: '#cbd5e1' }}>중심 {fmtPx(ucm.priceMid)}</span>
          </div>
          <p style={{ margin: '8px 0 0', fontSize: 11, lineHeight: 1.55, color: '#d6d3d1' }}>{ucm.headlineKo}</p>
          <p style={{ margin: '6px 0 0', fontSize: 10, color: '#94a3b8' }}>
            점수 롱 {ucm.scoreLong.toFixed(1)} vs 숏 {ucm.scoreShort.toFixed(1)}
            {ucm.squeeze ? ' · 좁은 복합 구간' : ''}
          </p>
        </div>
      )}

      {fusionLine && (
        <p style={{ margin: '12px 0 0', fontSize: 11, lineHeight: 1.6, color: '#cbd5e1' }}>{fusionLine}</p>
      )}

      <p style={{ margin: '10px 0 0', fontSize: 9, color: '#64748b', lineHeight: 1.45 }}>
        교육·참고용 — 확정 매매·손익 보장 아님. 상위 TF 맥락과 무효 조건을 함께 확인하세요.
      </p>
    </div>
  );
}
