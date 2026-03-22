'use client';

import { memo } from 'react';
import type { AnalyzeResponse } from '@/types';
import { closeTfLabelSolid } from '@/lib/overlayColors';

function formatPrice(n: number): string {
  if (n >= 1000) return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (n >= 1) return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  return n.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 6 });
}

const ExecutionModeStripInner = ({
  analysis,
  theme,
}: {
  analysis: AnalyzeResponse | null;
  theme?: 'dark' | 'light';
}) => {
  if (!analysis) return null;

  const isDark = theme !== 'light';
  const engine = (analysis as any).engine;
  const eq = typeof engine?.equilibrium === 'number' ? engine.equilibrium : null;
  const strongHigh = typeof engine?.strongHighPrice === 'number' ? engine.strongHighPrice : null;
  const strongLow = typeof engine?.strongLowPrice === 'number' ? engine.strongLowPrice : null;
  const obImb = typeof (analysis as any).orderbookImbalance === 'number' ? (analysis as any).orderbookImbalance : null;
  const liquidityState = (analysis as any).liquidityState;

  const closeSettlement = analysis.closeSettlement ?? [];
  const closeOrder = ['1m', '5m', '15m', '1h', '4h', '1d', '1w', '1M'];
  const closeRows = closeOrder.map((tf) => closeSettlement.find((r) => r.tf === tf)).filter(Boolean) as typeof closeSettlement;

  const bg = isDark ? 'rgba(15,23,42,0.95)' : 'rgba(255,255,255,0.95)';
  const border = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)';
  const text = isDark ? '#e2e8f0' : '#1e293b';
  const muted = isDark ? '#94a3b8' : '#64748b';
  const cLong = '#22C55E';
  const cShort = '#EF4444';

  const liquidityLabel =
    obImb != null
      ? `${obImb > 0 ? '매수' : '매도'} ${Math.abs(obImb).toFixed(1)}%`
      : liquidityState === 'above'
        ? '위'
        : liquidityState === 'below'
          ? '아래'
          : '–';

  const rsiDiv = (analysis as any).rsiDivergenceSignal as
    | { verdict: 'LONG' | 'SHORT' | 'WATCH'; longScore: number; shortScore: number }
    | undefined;

  return (
    <div
      className="execution-mode-strip"
      style={{
        padding: '10px 14px',
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: 10,
        fontSize: 12,
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '12px 20px',
      }}
    >
      <div style={{ fontWeight: 700, color: muted, marginRight: 4, fontSize: 11 }}>실행 스트립</div>
      {(analysis as any)?.multiTF?.trend1M && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '4px 8px',
            borderRadius: 6,
            border: '1px solid rgba(255,255,255,0.15)',
            background: 'rgba(255,255,255,0.05)',
          }}
          title="달봉 트렌드 (분·시간·일·주 공통)"
        >
          <span style={{ color: muted, fontSize: 10 }}>1M</span>
          <span style={{ color: text, fontWeight: 700, fontSize: 11 }}>{(analysis as any).multiTF.trend1M}</span>
        </div>
      )}
      {rsiDiv && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '4px 10px',
            borderRadius: 8,
            border: `1px solid ${rsiDiv.verdict === 'LONG' ? 'rgba(98,239,224,0.45)' : rsiDiv.verdict === 'SHORT' ? 'rgba(255,123,123,0.45)' : 'rgba(255,204,102,0.35)'}`,
            background:
              rsiDiv.verdict === 'LONG'
                ? 'rgba(78,242,162,0.12)'
                : rsiDiv.verdict === 'SHORT'
                  ? 'rgba(255,123,123,0.12)'
                  : 'rgba(255,204,102,0.1)',
          }}
          title="RSI 다이버전스·거래량·캔들 패턴 점수 (상세는 우측 패널 → 트레이드)"
        >
          <span style={{ color: muted, fontSize: 10 }}>RSI 다이버</span>
          <span
            style={{
              fontWeight: 800,
              fontSize: 12,
              color: rsiDiv.verdict === 'LONG' ? '#22C55E' : rsiDiv.verdict === 'SHORT' ? '#EF4444' : '#ffd666',
            }}
          >
            {rsiDiv.verdict === 'LONG' ? 'LONG' : rsiDiv.verdict === 'SHORT' ? 'SHORT' : 'WATCH'}
          </span>
          <span style={{ color: muted, fontSize: 10 }}>
            L {rsiDiv.longScore} · S {rsiDiv.shortScore}
          </span>
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ color: muted, fontSize: 11 }}>유동성</span>
        <span style={{ color: text, fontWeight: 600 }}>{liquidityLabel}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ color: muted, fontSize: 11 }}>균형선(VWAP)</span>
        <span style={{ color: text, fontWeight: 600 }}>{eq != null ? formatPrice(eq) : '–'}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ color: cShort, fontSize: 11 }}>강한고점</span>
        <span style={{ color: text, fontWeight: 600 }}>{strongHigh != null ? formatPrice(strongHigh) : '–'}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ color: cLong, fontSize: 11 }}>강한저점</span>
        <span style={{ color: text, fontWeight: 600 }}>{strongLow != null ? formatPrice(strongLow) : '–'}</span>
      </div>
      {closeRows.length > 0 && (
        <>
          <div style={{ width: '100%', flexBasis: '100%', height: 0, margin: 0 }} />
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 14px', fontSize: 11 }}>
            {closeRows.map((row) => {
              const remainStr = row.status === '확정' ? '마감' : `${Math.floor(row.remainingSec / 60)}분`;
              const tfColor = closeTfLabelSolid(row.tf);
              return (
                <div key={row.tf} style={{ display: 'flex', alignItems: 'center', gap: 4 }} title={`${row.label} ${row.lastCandleBullish ? '양봉' : '음봉'}`}>
                  <span style={{ color: tfColor, fontWeight: 700 }}>{row.label}</span>
                  <span style={{ color: text }}>{row.status} · {remainStr}</span>
                  <span className={row.goodBad === 'good' ? 'c-long' : row.goodBad === 'bad' ? 'c-short' : ''}>
                    {row.goodBad === 'good' ? '✓' : row.goodBad === 'bad' ? '✗' : '–'}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

export default memo(ExecutionModeStripInner);
