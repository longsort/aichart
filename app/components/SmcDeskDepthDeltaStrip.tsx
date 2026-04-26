'use client';

export function SmcDeskDepthDeltaStrip({
  depthDelta,
}: {
  depthDelta:
    | {
        regime: 'buy' | 'sell' | 'neutral';
        smoothedPct: number;
        persistenceBars: number;
        seriesPct: number[];
      }
    | null
    | undefined;
}) {
  if (!depthDelta) return null;
  const series = depthDelta.seriesPct?.slice(-18) ?? [];
  if (!series.length) return null;
  const maxAbs = Math.max(8, ...series.map((v) => Math.abs(v)));
  return (
    <div
      className="smc-desk-depth-delta-strip"
      style={{
        position: 'absolute',
        right: 6,
        top: '44%',
        transform: 'translateY(-50%)',
        zIndex: 15,
        width: 30,
        padding: '4px 3px 6px',
        borderRadius: 8,
        border: '1px solid rgba(148,163,184,0.3)',
        background: 'rgba(2,6,23,0.72)',
        pointerEvents: 'none',
      }}
      title={`Depth Δ ${depthDelta.smoothedPct.toFixed(1)}% · ${depthDelta.regime} · ${depthDelta.persistenceBars}봉`}
    >
      <div style={{ display: 'flex', alignItems: 'end', gap: 1, height: 46 }}>
        {series.map((v, i) => {
          const h = Math.max(2, Math.round((Math.abs(v) / maxAbs) * 42));
          return (
            <span
              key={`${i}-${v.toFixed(2)}`}
              style={{
                width: 1.2,
                height: h,
                borderRadius: 1,
                background: v >= 0 ? 'rgba(34,197,94,0.95)' : 'rgba(239,68,68,0.95)',
                opacity: i >= series.length - 2 ? 1 : 0.82,
              }}
            />
          );
        })}
      </div>
      <div style={{ marginTop: 4, fontSize: 8, textAlign: 'center', color: '#cbd5e1' }}>
        Δ{depthDelta.smoothedPct > 0 ? '+' : ''}
        {depthDelta.smoothedPct.toFixed(0)}
      </div>
    </div>
  );
}
