'use client';

import type { SmcDeskCompositeModel, SmcDeskCompositeLayerMask } from '@/lib/smcDeskCompositeModel';

function ConfluenceRing({ score, max }: { score: number; max: number }) {
  const pct = max > 0 ? Math.round((score / max) * 100) : 0;
  const deg = (pct / 100) * 360;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: '50%',
          background: `conic-gradient(#62efe0 ${deg}deg, rgba(148,163,184,0.25) 0deg)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: '50%',
            background: 'rgba(15,23,42,0.95)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 13,
            fontWeight: 800,
            color: '#f8fafc',
          }}
        >
          {pct}
        </div>
      </div>
      <div style={{ fontSize: 10, color: '#94a3b8', lineHeight: 1.4 }}>
        합성 컨플루언스
        <br />
        <span style={{ color: '#cbd5e1' }}>(ON 레이어 가중·참고)</span>
      </div>
    </div>
  );
}

const LAYER_ROWS: Array<{ key: keyof SmcDeskCompositeLayerMask; label: string }> = [
  { key: 'showStructure', label: '구조' },
  { key: 'showZones', label: '존(OB/FVG)' },
  { key: 'showChartPrimeTrendChannels', label: '채널' },
  { key: 'showScenario', label: '시나리오' },
  { key: 'showWhaleZone', label: '고래' },
  { key: 'showRsi', label: 'RSI' },
];

export function SmcDeskCompositePanel({
  model,
  layers,
  replayOffset,
  onReplayOffsetChange,
  maxReplay,
  mtfSignals,
}: {
  model: SmcDeskCompositeModel;
  layers: SmcDeskCompositeLayerMask;
  replayOffset: number;
  onReplayOffsetChange: (v: number) => void;
  maxReplay: number;
  mtfSignals?: Array<{
    tf: string;
    verdict: string;
    confidence: number;
    depthDeltaRegime?: 'buy' | 'sell' | 'neutral';
    depthDeltaSmoothedPct?: number;
  }>;
}) {
  const fmt = (p: number | null) =>
    p != null && Number.isFinite(p) ? p.toLocaleString('en-US', { maximumFractionDigits: 6 }) : '—';

  const mtfDeltaAlignment = (() => {
    if (!model.depthDelta || !mtfSignals?.length) return null;
    const me = model.tradePlan.direction;
    if (me !== 'LONG' && me !== 'SHORT') return null;
    const rows = mtfSignals.filter((m) => m.depthDeltaRegime && m.depthDeltaRegime !== 'neutral');
    if (!rows.length) return null;
    const aligned = rows.filter((m) =>
      me === 'LONG' ? m.depthDeltaRegime === 'buy' : m.depthDeltaRegime === 'sell'
    ).length;
    return `${aligned}/${rows.length} Δ정렬`;
  })();

  return (
    <div
      role="region"
      aria-label="SMC 데스크 합성 패널"
      className="smc-desk-composite-panel"
      style={{
        position: 'absolute',
        right: 8,
        top: 8,
        zIndex: 14,
        width: 'min(92vw, 300px)',
        maxHeight: 'min(82vh, 640px)',
        overflowY: 'auto',
        padding: '10px 11px',
        fontSize: 11,
        lineHeight: 1.45,
        color: '#e2e8f0',
        background: 'rgba(15,23,42,0.96)',
        border: '1px solid rgba(98,239,224,0.35)',
        borderRadius: 10,
        pointerEvents: 'auto',
        boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
      }}
    >
      <div style={{ fontWeight: 800, letterSpacing: 0.02, color: '#62efe0', marginBottom: 8 }}>SMC 데스크 · 합성</div>

      <div style={{ marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <ConfluenceRing score={model.confluenceScore} max={model.confluenceMax} />
        {model.tags.length > 0 ? (
          <div style={{ marginTop: 8, fontSize: 10, color: '#cbd5e1' }}>
            <span style={{ color: '#94a3b8' }}>근거 태그: </span>
            {model.tags.join(' · ')}
          </div>
        ) : (
          <div style={{ marginTop: 8, fontSize: 10, color: '#64748b' }}>매칭된 근거 태그 없음 — 레이어를 켜거나 분석을 확인하세요.</div>
        )}
      </div>

      <div style={{ marginBottom: 10, fontSize: 10, color: '#94a3b8' }}>레이어(현재 모드에서 ON인 항목만 점수 반영)</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
        {LAYER_ROWS.map(({ key, label }) => (
          <span
            key={key}
            style={{
              padding: '2px 6px',
              borderRadius: 4,
              fontSize: 9,
              color: layers[key] ? '#86efac' : '#64748b',
              background: 'rgba(15,23,42,0.75)',
              border: `1px solid ${layers[key] ? 'rgba(34,197,94,0.45)' : 'rgba(148,163,184,0.25)'}`,
            }}
          >
            {layers[key] ? '●' : '○'} {label}
          </span>
        ))}
      </div>

      <div style={{ marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ fontWeight: 700, color: '#94a3b8', marginBottom: 4 }}>시나리오 트리 (분기·무효화)</div>
        <div style={{ fontSize: 10, color: '#cbd5e1', marginBottom: 6 }}>
          <span style={{ color: '#4ade80' }}>롱</span> — 무효: {model.longScenario.invalidation}
          <br />
          다음 확인: {model.longScenario.nextCheck}
        </div>
        <div style={{ fontSize: 10, color: '#cbd5e1' }}>
          <span style={{ color: '#f87171' }}>숏</span> — 무효: {model.shortScenario.invalidation}
          <br />
          다음 확인: {model.shortScenario.nextCheck}
        </div>
      </div>

      <div style={{ marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ fontWeight: 700, color: '#94a3b8', marginBottom: 4 }}>타점·손절·익절 (한 세트)</div>
        <div style={{ fontSize: 10, fontVariantNumeric: 'tabular-nums' }}>
          <div>
            진입: <span style={{ color: '#4ade80' }}>{fmt(model.tradePlan.entry)}</span>{' '}
            {model.tradePlan.layerNotes.entry ? (
              <span style={{ color: '#64748b' }}>({model.tradePlan.layerNotes.entry})</span>
            ) : null}
          </div>
          <div>
            SL: <span style={{ color: '#fca5a5' }}>{fmt(model.tradePlan.stopLoss)}</span>{' '}
            {model.tradePlan.layerNotes.sl ? <span style={{ color: '#64748b' }}>({model.tradePlan.layerNotes.sl})</span> : null}
          </div>
          <div>
            TP1~3:{' '}
            <span style={{ color: '#86efac' }}>
              {fmt(model.tradePlan.targets[0])} / {fmt(model.tradePlan.targets[1])} / {fmt(model.tradePlan.targets[2])}
            </span>{' '}
            {model.tradePlan.layerNotes.tp ? <span style={{ color: '#64748b' }}>({model.tradePlan.layerNotes.tp})</span> : null}
          </div>
        </div>
        <div style={{ marginTop: 6, fontSize: 9, color: '#64748b' }}>
          참고용이며 실제 주문·리스크는 본인 판단입니다. 확정 수익·승률 표현 없음.
        </div>
      </div>

      <div style={{ marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ fontWeight: 700, color: '#94a3b8', marginBottom: 4 }}>상위 TF 맥락</div>
        {model.htfStrip.length > 0 ? (
          model.htfStrip.map((line, i) => (
            <div key={i} style={{ fontSize: 10, color: '#cbd5e1' }}>
              {line}
            </div>
          ))
        ) : (
          <div style={{ fontSize: 10, color: '#64748b' }}>MTF 요약 없음</div>
        )}
        {mtfSignals && mtfSignals.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 8 }}>
            {mtfSignals.slice(0, 4).map((m) => (
              <div
                key={m.tf}
                style={{
                  padding: '4px 6px',
                  borderRadius: 6,
                  background: 'rgba(30,41,59,0.9)',
                  border: '1px solid rgba(148,163,184,0.2)',
                  fontSize: 9,
                  color: '#94a3b8',
                }}
              >
                <div style={{ fontWeight: 700, color: '#e2e8f0' }}>{m.tf}</div>
                <div>
                  {m.verdict} · {m.confidence}%
                </div>
                {m.depthDeltaRegime && (
                  <div style={{ color: m.depthDeltaRegime === 'buy' ? '#86efac' : m.depthDeltaRegime === 'sell' ? '#fca5a5' : '#94a3b8' }}>
                    Δ {m.depthDeltaRegime} {Number(m.depthDeltaSmoothedPct ?? 0).toFixed(0)}%
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {mtfDeltaAlignment && (
          <div style={{ marginTop: 8, fontSize: 10, color: '#22d3ee' }}>타점 대비 {mtfDeltaAlignment}</div>
        )}
      </div>

      <div style={{ marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ fontWeight: 700, color: '#94a3b8', marginBottom: 4 }}>워치 규칙 (프리셋)</div>
        {model.watchRules.map((w) => (
          <div key={w.id} style={{ fontSize: 10, color: w.matched ? '#86efac' : '#64748b', marginBottom: 2 }}>
            {w.matched ? '●' : '○'} {w.label}
          </div>
        ))}
      </div>

      <div>
        <div style={{ fontWeight: 700, color: '#94a3b8', marginBottom: 4 }}>리플레이·검증 (근사)</div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10, color: '#cbd5e1' }}>
          <span style={{ flexShrink: 0 }}>과거 봉 {replayOffset}</span>
          <input
            type="range"
            min={0}
            max={Math.max(0, maxReplay)}
            value={Math.min(replayOffset, maxReplay)}
            onChange={(e) => onReplayOffsetChange(parseInt(e.target.value, 10) || 0)}
            style={{ flex: 1, accentColor: '#62efe0' }}
          />
        </label>
        {model.replayNote && <div style={{ marginTop: 6, fontSize: 9, color: '#fbbf24' }}>{model.replayNote}</div>}
      </div>
    </div>
  );
}
