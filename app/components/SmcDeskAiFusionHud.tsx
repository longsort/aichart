'use client';

import type { AnalyzeResponse } from '@/types';

/**
 * SMC 데스크 전용: 차트 우상단 — `aiFusionSignal`(다소스 합성) + `confirmedSignal`(5요소) + SMC 합류 요약.
 */
export function SmcDeskAiFusionHud({
  analysis,
  isNarrowUi,
}: {
  analysis: AnalyzeResponse;
  isNarrowUi: boolean;
}) {
  const af = analysis.aiFusionSignal;
  const cs = analysis.confirmedSignal;
  const smcLs = analysis.smcDeskConfluenceLs;
  const tierKo = af?.tier === 'confirmed' ? '확정' : af?.tier === 'likely' ? '유력' : '관망';
  const dirKo = af?.verdict === 'LONG' ? '롱' : af?.verdict === 'SHORT' ? '숏' : '관망';
  const border =
    af?.tier === 'confirmed'
      ? 'rgba(251,191,36,0.55)'
      : af?.tier === 'likely'
        ? 'rgba(56,189,248,0.45)'
        : 'rgba(148,163,184,0.4)';

  const pill = (ok: boolean | undefined, label: string) => (
    <span
      key={label}
      style={{
        display: 'inline-block',
        marginRight: 5,
        marginBottom: 2,
        padding: '1px 5px',
        borderRadius: 4,
        fontSize: isNarrowUi ? 8 : 9,
        color: ok ? '#86efac' : '#64748b',
        background: 'rgba(15,23,42,0.65)',
      }}
    >
      {ok ? '●' : '○'} {label}
    </span>
  );

  const showFive = cs && (analysis.verdict === 'LONG' || analysis.verdict === 'SHORT');

  return (
    <div
      role="region"
      aria-label="AI 롱숏 합성 확정분석"
      className="smc-desk-ai-fusion-hud"
      style={{
        position: 'absolute',
        right: 8,
        top: 8,
        zIndex: 13,
        maxWidth: 'min(92vw, 340px)',
        padding: isNarrowUi ? '6px 8px' : '8px 10px',
        fontSize: isNarrowUi ? 10 : 11,
        lineHeight: 1.4,
        color: '#e2e8f0',
        background: 'rgba(15,23,42,0.94)',
        border: `1px solid ${border}`,
        borderRadius: 10,
        pointerEvents: 'none',
        boxShadow: '0 10px 28px rgba(0,0,0,0.4)',
      }}
    >
      <div style={{ fontWeight: 800, letterSpacing: 0.02, color: '#62efe0', marginBottom: 4 }}>
        AI 롱·숏 합성 · {tierKo}
      </div>
      <div style={{ fontWeight: 700, fontSize: isNarrowUi ? 12 : 14, color: '#f8fafc', marginBottom: 2 }}>
        {dirKo}
        {af && (
          <span style={{ fontWeight: 600, color: '#94a3b8', marginLeft: 8 }}>신뢰 {af.confidence}%</span>
        )}
      </div>
      {smcLs && (
        <div style={{ fontSize: isNarrowUi ? 9 : 10, color: '#cbd5e1', marginBottom: 4 }}>
          SMC합류: {smcLs.side === 'LONG' ? '롱' : '숏'}
          {smcLs.differsFromVerdict ? ' · 엔진 verdict와 상이' : ' · verdict 부합'}
        </div>
      )}
      {showFive && cs && (
        <div style={{ marginBottom: 4 }}>
          {pill(cs.structure, '구조')}
          {pill(cs.rsi, 'RSI')}
          {pill(cs.supportResistance, 'S/R')}
          {pill(cs.close, '종가')}
          {pill(cs.fvgZone, 'FVG')}
          {cs.confirmed && (
            <span style={{ marginLeft: 4, color: '#fcd34d', fontWeight: 700 }}>5요소 확정</span>
          )}
        </div>
      )}
      {af?.narrative && (
        <div
          style={{
            fontSize: isNarrowUi ? 9 : 10,
            color: '#94a3b8',
            maxHeight: 52,
            overflow: 'hidden',
          }}
          title={af.narrative}
        >
          {af.narrative.length > 200 ? `${af.narrative.slice(0, 198)}…` : af.narrative}
        </div>
      )}
      {!af && <div style={{ fontSize: 10, color: '#64748b' }}>aiFusion 분석 대기…</div>}
    </div>
  );
}
