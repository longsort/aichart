'use client';

import { memo } from 'react';
import type { AnalyzeResponse } from '@/types';
import { getRecentFailedCount, RECENT_FAIL_SKIP_THRESHOLD } from '@/lib/virtualTradeStore';

type Props = { analysis: AnalyzeResponse | null; symbol?: string; timeframe?: string };

const cLong = '#22C55E';
const cShort = '#EF4444';
const cWatch = '#ffd666';
const accent = '#62efe0';

function BriefingResultCardInner({ analysis, symbol: propSymbol, timeframe: propTf }: Props) {
  if (!analysis) {
    return (
      <div
        className="briefing-result-card"
        style={{
          padding: '12px 14px',
          marginBottom: 12,
          borderRadius: 10,
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.1)',
        }}
      >
        <div style={{ fontSize: '0.7rem', color: '#64748b' }}>차트 브리핑</div>
        <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 6 }}>분석 대기 중</div>
      </div>
    );
  }

  const confirmed = (analysis as any).confirmedSignal as { confirmed?: boolean; direction?: 'LONG' | 'SHORT' | null; reasons?: string[] } | undefined;
  const isConfirmed = Boolean(confirmed?.confirmed && confirmed?.direction);
  const dir = isConfirmed ? confirmed!.direction! : (analysis.verdict === 'LONG' || analysis.verdict === 'SHORT' ? analysis.verdict : null);
  const label = dir === 'LONG' ? '롱' : dir === 'SHORT' ? '숏' : '관망';

  const sym = propSymbol ?? analysis.symbol;
  const tf = propTf ?? analysis.timeframe;
  const recentFails = dir ? getRecentFailedCount(sym, tf, dir, 24) : 0;

  return (
    <div
      className="briefing-result-card"
      style={{
        padding: '12px 14px',
        marginBottom: 12,
        borderRadius: 10,
        background: dir === 'LONG' ? 'rgba(34,197,94,0.1)' : dir === 'SHORT' ? 'rgba(239,68,68,0.1)' : 'rgba(255,214,102,0.06)',
        border: `2px solid ${dir === 'LONG' ? 'rgba(34,197,94,0.45)' : dir === 'SHORT' ? 'rgba(239,68,68,0.45)' : 'rgba(255,214,102,0.3)'}`,
      }}
    >
      <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginBottom: 6 }}>차트 브리핑 · 결론</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <span
          style={{
            fontSize: '1.4rem',
            fontWeight: 900,
            color: dir === 'LONG' ? cLong : dir === 'SHORT' ? cShort : cWatch,
            letterSpacing: '-0.02em',
          }}
        >
          {label.toUpperCase()}
        </span>
        {dir && (
          isConfirmed ? (
            <span className="badge" style={{ padding: '3px 8px', fontSize: 10, background: 'rgba(34,197,94,0.25)', color: cLong }}>
              5요소 확정
            </span>
          ) : (
            <span className="badge" style={{ padding: '3px 8px', fontSize: 10, background: 'rgba(255,214,102,0.2)', color: cWatch }}>
              준비
            </span>
          )
        )}
        <span style={{ color: accent, fontWeight: 700, fontSize: 12 }}>{analysis.confidence ?? '–'}%</span>
        <span style={{ color: '#64748b', fontSize: 11 }}>{analysis.symbol} {analysis.timeframe}</span>
      </div>
      <div style={{ fontSize: 10, lineHeight: 1.5, color: '#94a3b8' }}>
        {(analysis as any).summary && (
          <div style={{ marginBottom: 4 }}>
            <span style={{ color: accent, fontWeight: 600 }}>구조 </span>
            <span>{String((analysis as any).summary).split('|').slice(0, 2).join(' | ')}</span>
          </div>
        )}
        {(analysis as any).multiTF?.trend1M && (
          <div style={{ marginBottom: 4 }}>
            <span style={{ color: accent, fontWeight: 600 }}>MTF </span>
            <span className={(analysis as any).multiTF.trend1M === '상승' ? 'c-long' : (analysis as any).multiTF.trend1M === '하락' ? 'c-short' : ''}>
              1M {(analysis as any).multiTF.trend1M}
            </span>
          </div>
        )}
        {(analysis as any).rsiDivergenceSignal && (
          <div style={{ marginBottom: 4 }}>
            <span style={{ color: accent, fontWeight: 600 }}>RSI </span>
            <span className={(analysis as any).rsiDivergenceSignal.verdict === 'LONG' ? 'c-long' : (analysis as any).rsiDivergenceSignal.verdict === 'SHORT' ? 'c-short' : ''}>
              {(analysis as any).rsiDivergenceSignal.verdict}
            </span>
            {' '}L {(analysis as any).rsiDivergenceSignal.longScore ?? '–'} / S {(analysis as any).rsiDivergenceSignal.shortScore ?? '–'}
          </div>
        )}
        {confirmed?.reasons && confirmed.reasons.length > 0 && (
          <div>
            <span style={{ color: accent, fontWeight: 600 }}>5요소 </span>
            <span>{confirmed.reasons.slice(0, 2).join(' · ')}{confirmed.reasons.length > 2 ? ' …' : ''}</span>
          </div>
        )}
        {recentFails > 0 && (
          <div style={{ marginTop: 8, padding: '6px 8px', borderRadius: 6, background: 'rgba(255,214,102,0.12)', border: '1px solid rgba(255,214,102,0.3)' }}>
            <span style={{ color: '#fbbf24', fontWeight: 600 }}>⚠ 자율보정 </span>
            <span style={{ color: '#94a3b8', fontSize: 10 }}>
              최근 24h 손절 {recentFails}건
              {recentFails >= RECENT_FAIL_SKIP_THRESHOLD && ' · 가상 진입 억제'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(BriefingResultCardInner);
