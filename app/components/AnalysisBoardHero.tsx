'use client';

import type { AnalyzeResponse } from '@/types';

type Props = {
  analysis: AnalyzeResponse | null;
  symbol: string;
  timeframe: string;
  loading: boolean;
};

const READINESS_LABEL: Record<'none' | 'building' | 'prepared' | 'strong' | 'full' | 'mtf_veto', { text: string }> = {
  none: { text: '확정 0/5' },
  building: { text: '확정 쌓는 중' },
  prepared: { text: '확정 3/5' },
  strong: { text: '확정 4/5' },
  full: { text: '5/5 (MTF 통과)' },
  mtf_veto: { text: '5/5 (MTF 반대·확정 억제)' },
};

export default function AnalysisBoardHero({ analysis, symbol, timeframe, loading }: Props) {
  const v = analysis?.verdict;
  const vc = v === 'LONG' ? '#22C55E' : v === 'SHORT' ? '#EF4444' : '#fcd34d';
  const vLabel = v === 'LONG' ? '롱' : v === 'SHORT' ? '숏' : '관망';
  const conf = analysis?.confidence;
  const mtf = analysis?.mtf;
  const sum = (analysis?.summary || '').trim();
  const prob = analysis?.probability;
  const cs = analysis?.confirmedSignal;
  const zc = analysis?.zoneBiasCard;
  const tier = cs?.readinessTier;
  const readiness = tier && tier in READINESS_LABEL ? READINESS_LABEL[tier] : null;
  const gateItems = cs
    ? [
        { key: 'structure', label: '구조', pass: cs.structure },
        { key: 'rsi', label: 'RSI', pass: cs.rsi },
        { key: 'sr', label: 'S/R', pass: cs.supportResistance },
        { key: 'close', label: '종가', pass: cs.close },
        { key: 'fvg', label: 'FVG', pass: cs.fvgZone },
      ]
    : null;
  const fmtPrice = (p: number) =>
    p >= 1 ? p.toLocaleString(undefined, { maximumFractionDigits: 2 }) : p.toLocaleString(undefined, { maximumFractionDigits: 6 });

  return (
    <div
      className="analysis-board-hero"
      style={{
        marginBottom: 16,
        padding: '16px 18px',
        borderRadius: 16,
        background: 'linear-gradient(145deg, rgba(8,12,28,0.98) 0%, rgba(49,46,99,0.42) 48%, rgba(8,15,30,0.96) 100%)',
        border: '1px solid rgba(98,239,224,0.28)',
        boxShadow:
          '0 0 48px -20px rgba(98,239,224,0.45), 0 20px 50px -28px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.08)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
          marginBottom: 12,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <span
              style={{
                fontSize: 19,
                fontWeight: 900,
                letterSpacing: '-0.04em',
                color: '#f8fafc',
                textShadow: '0 0 28px rgba(98,239,224,0.25)',
              }}
            >
              분석 보드
            </span>
            <span
              style={{
                fontSize: 14,
                fontWeight: 800,
                color: '#67e8f9',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {symbol} · {timeframe}
            </span>
            {loading && (
              <span style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8' }}>갱신 중…</span>
            )}
          </div>
          {prob && (prob.longProbability != null || prob.shortProbability != null) && (
            <div style={{ fontSize: 11, color: '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>
              확률 모델 L {prob.longProbability ?? '–'}% / S {prob.shortProbability ?? '–'}%
              {typeof prob.score === 'number' && ` · 점수 ${prob.score}`}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {analysis && (
            <>
              <span
                style={{
                  padding: '7px 16px',
                  borderRadius: 999,
                  fontWeight: 900,
                  fontSize: 15,
                  color: vc,
                  background:
                    v === 'LONG' ? 'rgba(34,197,94,0.22)' : v === 'SHORT' ? 'rgba(239,68,68,0.22)' : 'rgba(252,211,77,0.14)',
                  border: `2px solid ${v === 'LONG' ? 'rgba(34,197,94,0.5)' : v === 'SHORT' ? 'rgba(239,68,68,0.5)' : 'rgba(252,211,77,0.4)'}`,
                  boxShadow: `0 0 20px -6px ${v === 'LONG' ? 'rgba(34,197,94,0.5)' : v === 'SHORT' ? 'rgba(239,68,68,0.45)' : 'rgba(252,211,77,0.35)'}`,
                }}
              >
                {vLabel}
              </span>
              <span
                style={{
                  fontSize: 16,
                  fontWeight: 900,
                  color: '#62efe0',
                  fontVariantNumeric: 'tabular-nums',
                  textShadow: '0 0 18px rgba(98,239,224,0.35)',
                }}
              >
                {typeof conf === 'number' ? `${conf}%` : '–'}
              </span>
              {mtf && typeof mtf.alignmentScore === 'number' && (
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 800,
                    color: '#c4b5fd',
                    padding: '5px 12px',
                    borderRadius: 10,
                    background: 'rgba(99,102,241,0.2)',
                    border: '1px solid rgba(129,140,248,0.45)',
                  }}
                >
                  MTF 정렬 {mtf.alignmentScore}
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {mtf && (mtf.htfBias || mtf.mtfBias || mtf.ltfBias) && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px 14px',
            marginBottom: 12,
            fontSize: 11,
            fontWeight: 700,
            color: '#cbd5e1',
          }}
        >
          {mtf.htfBias && (
            <span>
              <span style={{ color: '#818cf8' }}>HTF</span> {mtf.htfBias}
            </span>
          )}
          {mtf.mtfBias && (
            <span>
              <span style={{ color: '#38bdf8' }}>MTF</span> {mtf.mtfBias}
            </span>
          )}
          {mtf.ltfBias && (
            <span>
              <span style={{ color: '#2dd4bf' }}>LTF</span> {mtf.ltfBias}
            </span>
          )}
        </div>
      )}

      {sum ? (
        <p
          style={{
            margin: 0,
            fontSize: 13,
            lineHeight: 1.6,
            color: '#e2e8f0',
            fontWeight: 500,
            display: '-webkit-box',
            WebkitLineClamp: 5,
            WebkitBoxOrient: 'vertical' as const,
            overflow: 'hidden',
          }}
          title={sum}
        >
          {sum}
        </p>
      ) : (
        !loading && (
          <div style={{ fontSize: 12, color: '#64748b' }}>요약이 없습니다. 분석을 불러오면 한눈에 표시됩니다.</div>
        )
      )}

      {cs && gateItems && (
        <div
          style={{
            marginTop: 12,
            padding: '12px 14px',
            borderRadius: 12,
            background: 'rgba(15,23,42,0.55)',
            border: '1px solid rgba(98,239,224,0.2)',
          }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 12px', marginBottom: 8 }}>
            {readiness && (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  color: tier === 'full' ? '#4ade80' : tier === 'mtf_veto' ? '#fb7185' : '#94a3b8',
                }}
              >
                {readiness.text}
                {typeof cs.gatesPassCount === 'number' && (
                  <span style={{ color: '#64748b', fontWeight: 600 }}> · {cs.gatesPassCount}/5</span>
                )}
              </span>
            )}
            {cs.mtfBlocked && <span style={{ fontSize: 10, color: '#fb7185' }}>MTF 블록</span>}
            {cs.confirmed && <span style={{ fontSize: 10, color: '#4ade80' }}>다요소 확정</span>}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {gateItems.map((g) => (
              <span
                key={g.key}
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  padding: '4px 8px',
                  borderRadius: 8,
                  background: g.pass ? 'rgba(34,197,94,0.2)' : 'rgba(100,116,139,0.2)',
                  border: `1px solid ${g.pass ? 'rgba(34,197,94,0.4)' : 'rgba(100,116,139,0.4)'}`,
                  color: g.pass ? '#86efac' : '#94a3b8',
                }}
              >
                {g.pass ? '✓' : '·'} {g.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {zc && (
        <div
          style={{
            marginTop: 10,
            padding: '12px 14px',
            borderRadius: 12,
            background: 'linear-gradient(135deg, rgba(30,27,75,0.4) 0%, rgba(15,23,42,0.65) 100%)',
            border: '1px solid rgba(168,85,247,0.3)',
          }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: '#c4b5fd' }}>감시 구간 (OB·무효)</span>
            {zc.side && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 900,
                  color: zc.side === 'LONG' ? '#4ade80' : '#f87171',
                  padding: '2px 8px',
                  borderRadius: 6,
                  background: zc.side === 'LONG' ? 'rgba(34,197,94,0.15)' : 'rgba(248,113,113,0.15)',
                }}
              >
                {zc.side === 'LONG' ? '롱 박스' : '숏 박스'}
              </span>
            )}
            <span style={{ fontSize: 10, color: '#a8a29e' }}>참고 {zc.confidence}%</span>
            <span style={{ fontSize: 10, color: '#e7e5e4', fontVariantNumeric: 'tabular-nums' }}>
              {fmtPrice(zc.low)} – {fmtPrice(zc.high)}
            </span>
          </div>
          {(zc.invalidateBelow != null || zc.invalidateAbove != null) && (
            <div style={{ fontSize: 10, color: '#a8a29e', marginBottom: 6, fontVariantNumeric: 'tabular-nums' }}>
              {zc.invalidateBelow != null && <span>무효(아래): {fmtPrice(zc.invalidateBelow)} · </span>}
              {zc.invalidateAbove != null && <span>무효(위): {fmtPrice(zc.invalidateAbove)}</span>}
            </div>
          )}
          {zc.summaryLines.length > 0 && (
            <ul style={{ margin: 0, paddingLeft: 16, fontSize: 10, lineHeight: 1.5, color: '#d6d3d1' }}>
              {zc.summaryLines.map((line, i) => (
                <li key={i} style={{ marginBottom: 4 }}>
                  {line}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {analysis?.riskFlags && analysis.riskFlags.length > 0 && (
        <div
          style={{
            marginTop: 10,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 6,
            alignItems: 'center',
          }}
        >
          <span style={{ fontSize: 10, fontWeight: 800, color: '#fbbf24', letterSpacing: '0.04em' }}>리스크</span>
          {analysis.riskFlags.map((f, i) => (
            <span
              key={`${f}-${i}`}
              style={{
                fontSize: 10,
                fontWeight: 700,
                padding: '3px 8px',
                borderRadius: 6,
                background: 'rgba(251,191,36,0.12)',
                border: '1px solid rgba(251,191,36,0.35)',
                color: '#fde68a',
              }}
            >
              {f}
            </span>
          ))}
        </div>
      )}

      {(mtf?.summary || analysis?.recallSummary) && (
        <div
          style={{
            marginTop: 12,
            paddingTop: 12,
            borderTop: '1px solid rgba(255,255,255,0.1)',
            fontSize: 11,
            color: '#94a3b8',
            lineHeight: 1.55,
          }}
        >
          {mtf?.summary && (
            <div>
              <strong style={{ color: '#a5b4fc' }}>MTF 요약</strong> {mtf.summary}
            </div>
          )}
          {analysis?.recallSummary && (
            <div style={{ marginTop: mtf?.summary ? 8 : 0 }}>
              <strong style={{ color: '#f472b6' }}>패턴 회상</strong> {analysis.recallSummary}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
