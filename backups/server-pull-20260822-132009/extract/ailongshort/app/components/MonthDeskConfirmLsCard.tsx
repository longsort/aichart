'use client';

import type { AnalyzeResponse } from '@/types';

const READINESS_LABEL: Record<
  'none' | 'building' | 'prepared' | 'strong' | 'full' | 'mtf_veto',
  string
> = {
  none: '확정 0/5',
  building: '확정 쌓는 중',
  prepared: '확정 3/5',
  strong: '확정 4/5',
  full: '5/5 (MTF 통과)',
  mtf_veto: '5/5 (MTF 반대·확정 억제)',
};

/**
 * 마감·안착 차트 좌상단 — 롱/숏·5요소 확정·AI 합성·연합·MTF·$$$$ (표시 전용).
 */
export function MonthDeskConfirmLsCard({
  analysis,
  isNarrowUi,
  fusionHeadline,
  fusionTooltip,
  mtfSummaryKo,
  closingRefKo,
  coreMoneyKo,
  unifiedCoreTooltip,
  afNarrativeKo,
}: {
  analysis: AnalyzeResponse;
  isNarrowUi?: boolean;
  fusionHeadline?: string | null;
  fusionTooltip?: string | null;
  mtfSummaryKo?: string | null;
  closingRefKo?: string | null;
  coreMoneyKo?: string | null;
  unifiedCoreTooltip?: string | null;
  afNarrativeKo?: string | null;
}) {
  const fs = isNarrowUi ? 10 : 11;
  const v = analysis.verdict;
  const vc = v === 'LONG' ? '#4ade80' : v === 'SHORT' ? '#f87171' : '#fcd34d';
  const vLabel = v === 'LONG' ? '롱' : v === 'SHORT' ? '숏' : '관망';
  const tradeLabel = v === 'LONG' ? '매수' : v === 'SHORT' ? '매도' : '관망';
  const cs = analysis.confirmedSignal;
  const af = analysis.aiFusionSignal;
  const tier = cs?.readinessTier;
  const readiness =
    tier && tier in READINESS_LABEL ? READINESS_LABEL[tier as keyof typeof READINESS_LABEL] : null;
  const gateItems = cs
    ? [
        { label: '구조', pass: cs.structure },
        { label: 'RSI', pass: cs.rsi },
        { label: 'S/R', pass: cs.supportResistance },
        { label: '종가', pass: cs.close },
        { label: 'FVG', pass: cs.fvgZone },
      ]
    : null;
  const nGates = gateItems?.filter((g) => g.pass).length ?? 0;
  const confirmedOk = Boolean(cs?.confirmed && cs.direction);
  const confirmTradeKo =
    cs?.direction === 'LONG' ? '확정 매수' : cs?.direction === 'SHORT' ? '확정 매도' : null;
  const afTierKo =
    af?.tier === 'confirmed' ? '확정' : af?.tier === 'likely' ? '유력' : af ? '관망' : null;
  const afDirKo = af?.verdict === 'LONG' ? '롱' : af?.verdict === 'SHORT' ? '숏' : '관망';
  const border = confirmedOk
    ? 'rgba(250,204,21,0.65)'
    : v === 'LONG'
      ? 'rgba(34,197,94,0.5)'
      : v === 'SHORT'
        ? 'rgba(248,113,113,0.5)'
        : 'rgba(98,239,224,0.35)';

  return (
    <div
      role="region"
      aria-label="마감안착 롱숏 확정분석"
      className="month-desk-confirm-ls-card"
      style={{
        position: 'absolute',
        left: 8,
        top: 8,
        zIndex: 14,
        maxWidth: 'min(92vw, 320px)',
        padding: isNarrowUi ? '8px 10px' : '10px 12px',
        fontSize: fs,
        lineHeight: 1.45,
        color: '#e2e8f0',
        background: 'rgba(8,12,28,0.94)',
        border: `1px solid ${border}`,
        borderRadius: 12,
        pointerEvents: 'none',
        boxShadow: '0 12px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)',
        backdropFilter: 'blur(6px)',
      }}
    >
      <div style={{ fontWeight: 800, fontSize: fs + 1, color: '#62efe0', marginBottom: 6, letterSpacing: '-0.02em' }}>
        마감·안착 · 고급 확정 분석
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 8px', marginBottom: 8 }}>
        <span
          style={{
            padding: '4px 10px',
            borderRadius: 8,
            fontWeight: 900,
            fontSize: fs + 2,
            color: vc,
            background:
              v === 'LONG'
                ? 'rgba(34,197,94,0.2)'
                : v === 'SHORT'
                  ? 'rgba(239,68,68,0.2)'
                  : 'rgba(252,211,77,0.12)',
            border: `1.5px solid ${vc}88`,
          }}
        >
          {vLabel} · {tradeLabel}
        </span>
        {typeof analysis.confidence === 'number' && (
          <span style={{ fontWeight: 800, fontSize: fs + 1, color: '#67e8f9', fontVariantNumeric: 'tabular-nums' }}>
            {analysis.confidence}%
          </span>
        )}
      </div>

      {coreMoneyKo ? (
        <div
          style={{
            marginBottom: 8,
            padding: '5px 8px',
            borderRadius: 8,
            fontWeight: 800,
            fontSize: fs,
            color: '#fde047',
            background: 'rgba(120,53,15,0.35)',
            border: '1px solid rgba(250,204,21,0.45)',
          }}
          title={unifiedCoreTooltip ?? coreMoneyKo}
        >
          {coreMoneyKo}
          {unifiedCoreTooltip && /복합|통합/.test(coreMoneyKo) ? (
            <div style={{ fontWeight: 500, fontSize: fs - 1, color: '#cbd5e1', marginTop: 4 }}>
              롱·숏 유동성 단일 구간 — 우세 방향만 강조
            </div>
          ) : null}
        </div>
      ) : null}

      {fusionHeadline ? (
        <div
          style={{ marginBottom: 6, fontSize: fs - 1, color: '#cbd5e1', fontWeight: 700 }}
          title={fusionTooltip ?? fusionHeadline}
        >
          <span style={{ color: '#a5b4fc' }}>연합</span> · {fusionHeadline}
        </div>
      ) : null}

      {mtfSummaryKo ? (
        <div style={{ marginBottom: 6, fontSize: fs - 1, color: '#94a3b8' }}>
          <span style={{ color: '#67e8f9', fontWeight: 700 }}>MTF</span> · {mtfSummaryKo}
        </div>
      ) : null}

      {closingRefKo ? (
        <div style={{ marginBottom: 6, fontSize: fs - 1, color: '#94a3b8' }} title={closingRefKo}>
          {closingRefKo}
        </div>
      ) : null}

      {confirmedOk && confirmTradeKo && (
        <div
          style={{
            marginBottom: 8,
            padding: '6px 8px',
            borderRadius: 8,
            fontWeight: 800,
            fontSize: fs + 1,
            color: '#fde047',
            background: 'rgba(120,53,15,0.45)',
            border: '1px solid rgba(250,204,21,0.55)',
          }}
        >
          ✓ 5요소 {confirmTradeKo}
        </div>
      )}

      {cs && gateItems && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: fs - 1, color: '#94a3b8', marginBottom: 5 }}>
            {readiness ?? `게이트 ${nGates}/5`}
            {typeof cs.gatesPassCount === 'number' && readiness ? ` · ${cs.gatesPassCount}/5` : null}
            {cs.mtfBlocked ? <span style={{ color: '#fb7185', marginLeft: 6 }}>MTF 블록</span> : null}
            {!confirmedOk && cs.direction && (
              <span style={{ color: '#cbd5e1', marginLeft: 6 }}>
                준비·{cs.direction === 'LONG' ? '매수' : '매도'} 방향
              </span>
            )}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {gateItems.map((g) => (
              <span
                key={g.label}
                style={{
                  fontSize: fs - 1,
                  fontWeight: 700,
                  padding: '2px 6px',
                  borderRadius: 6,
                  background: g.pass ? 'rgba(34,197,94,0.18)' : 'rgba(51,65,85,0.5)',
                  border: `1px solid ${g.pass ? 'rgba(34,197,94,0.45)' : 'rgba(71,85,105,0.5)'}`,
                  color: g.pass ? '#86efac' : '#64748b',
                }}
              >
                {g.pass ? '✓' : '·'} {g.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {af && (
        <div
          style={{
            marginBottom: 6,
            paddingTop: 6,
            borderTop: '1px solid rgba(148,163,184,0.2)',
            fontSize: fs - 1,
            color: '#cbd5e1',
          }}
        >
          <span style={{ color: '#38bdf8', fontWeight: 800 }}>AI 합성</span>
          {' · '}
          <span style={{ fontWeight: 700, color: '#f8fafc' }}>
            {afDirKo}
            {afTierKo ? ` · ${afTierKo}` : ''}
          </span>
          {typeof af.confidence === 'number' && (
            <span style={{ color: '#94a3b8', marginLeft: 6 }}>신뢰 {af.confidence}%</span>
          )}
        </div>
      )}

      {afNarrativeKo ? (
        <div
          style={{
            fontSize: fs - 1,
            color: '#94a3b8',
            marginBottom: 6,
            maxHeight: 40,
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical' as const,
          }}
          title={afNarrativeKo}
        >
          {afNarrativeKo}
        </div>
      ) : null}

      {analysis.smcDeskConfluenceLs && (
        <div style={{ fontSize: fs - 1, color: '#94a3b8', marginBottom: 4 }}>
          SMC 합류:{' '}
          <span style={{ color: analysis.smcDeskConfluenceLs.side === 'LONG' ? '#86efac' : '#fca5a5', fontWeight: 700 }}>
            {analysis.smcDeskConfluenceLs.side === 'LONG' ? '롱' : '숏'}
          </span>
          {analysis.smcDeskConfluenceLs.differsFromVerdict ? ' · verdict와 상이' : ' · verdict 부합'}
        </div>
      )}

      {(analysis.summary || '').trim() ? (
        <div
          style={{
            fontSize: fs - 1,
            color: '#94a3b8',
            maxHeight: 44,
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical' as const,
          }}
          title={analysis.summary}
        >
          {analysis.summary}
        </div>
      ) : null}

      <div style={{ fontSize: fs - 2, color: '#64748b', marginTop: 6 }}>참고용 · 확정≠수익 보장</div>
    </div>
  );
}
