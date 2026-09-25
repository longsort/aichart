'use client';

import type { MonthDeskSettleChartGuide as GuideModel } from '@/lib/monthDeskSettleChartGuide';

type Props = {
  guide: GuideModel;
  timeframe: string;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
};

const STEPS = [
  { n: 1, label: '돌파' },
  { n: 2, label: '안착' },
  { n: 3, label: '확인' },
] as const;

function stepAccent(guide: GuideModel, n: number): string {
  if (guide.step === 'fake' || guide.step === 'failed') return '#64748b';
  if (guide.stepIndex >= n) return guide.bias === 'SHORT' ? '#f87171' : '#4ade80';
  if (guide.stepIndex === n - 1 && guide.step !== 'wait') return '#facc15';
  return '#334155';
}

export function MonthDeskSettleChartGuideHud({
  guide,
  timeframe,
  collapsed,
  onToggleCollapse,
}: Props) {
  const biasKo = guide.bias === 'LONG' ? '롱' : guide.bias === 'SHORT' ? '숏' : '–';
  const warn = guide.step === 'fake' || guide.step === 'failed';

  return (
    <div
      className="month-desk-settle-chart-guide"
      style={{
        position: 'absolute',
        left: 8,
        bottom: 52,
        zIndex: 2486,
        pointerEvents: onToggleCollapse ? 'auto' : 'none',
        maxWidth: 'min(92vw, 300px)',
        padding: collapsed ? '6px 10px' : '8px 10px',
        background: 'rgba(6,12,24,0.92)',
        border: `1px solid ${warn ? 'rgba(248,113,113,0.5)' : 'rgba(34,197,94,0.35)'}`,
        borderRadius: 10,
        boxShadow: '0 6px 18px rgba(0,0,0,0.45)',
      }}
      aria-label="마감·안착 3단계 가이드"
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', letterSpacing: '0.03em' }}>
          마감·안착 · {timeframe} · {biasKo}
        </div>
        {onToggleCollapse && (
          <button
            type="button"
            className="tool-chip tool-chip-button"
            style={{ fontSize: 9, padding: '2px 7px' }}
            onClick={onToggleCollapse}
          >
            {collapsed ? '펼치기' : '접기'}
          </button>
        )}
      </div>

      {!collapsed && (
        <>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              marginTop: 8,
              marginBottom: 6,
            }}
          >
            {STEPS.map((s, i) => (
              <div key={s.n} style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    flex: 1,
                    textAlign: 'center',
                    fontSize: 9,
                    fontWeight: 800,
                    padding: '4px 2px',
                    borderRadius: 6,
                    background: stepAccent(guide, s.n),
                    color: guide.stepIndex >= s.n ? '#0f172a' : '#e2e8f0',
                    border: `1px solid ${stepAccent(guide, s.n)}88`,
                  }}
                >
                  {s.n}.{s.label}
                </div>
                {i < STEPS.length - 1 && (
                  <span style={{ color: '#475569', fontSize: 10, padding: '0 2px' }}>→</span>
                )}
              </div>
            ))}
          </div>

          <div
            style={{
              fontSize: 11,
              fontWeight: 800,
              color: warn ? '#fca5a5' : '#e2e8f0',
              lineHeight: 1.35,
              marginBottom: 4,
            }}
          >
            {guide.headlineKo}
          </div>
          <div style={{ fontSize: 9, color: '#94a3b8', lineHeight: 1.4, marginBottom: 6 }}>{guide.sublineKo}</div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
            {guide.checklist.map((c) => (
              <span
                key={c.label}
                style={{
                  fontSize: 8,
                  fontWeight: 700,
                  padding: '2px 6px',
                  borderRadius: 4,
                  background: c.done ? 'rgba(34,197,94,0.2)' : 'rgba(51,65,85,0.5)',
                  color: c.done ? '#86efac' : '#94a3b8',
                  border: `1px solid ${c.done ? 'rgba(74,222,128,0.4)' : 'rgba(71,85,105,0.5)'}`,
                }}
              >
                {c.done ? '✓' : '○'} {c.label}
              </span>
            ))}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, borderTop: '1px solid rgba(51,65,85,0.6)', paddingTop: 6 }}>
            {guide.legend.map((row) => (
              <span key={row.label} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 8, color: '#cbd5e1' }}>
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: row.swatch,
                    border: '1px solid rgba(255,255,255,0.25)',
                  }}
                />
                {row.label}
              </span>
            ))}
          </div>
        </>
      )}

      {collapsed && (
        <div style={{ fontSize: 10, fontWeight: 700, color: '#e2e8f0', marginTop: 4 }}>
          {guide.stepKo} — {guide.levelKo}
        </div>
      )}
    </div>
  );
}
