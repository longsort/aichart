'use client';

import type { MonthDeskCandleZoneIntel } from '@/lib/monthDeskCandleZoneIntel';
import type { MonthDeskChartLayerMode } from '@/lib/monthDeskChartLayerPolicy';
import type { MonthDeskStrikeDeskBundle } from '@/lib/monthDeskStrikeDesk';
import type { MonthDeskSettleChartGuide } from '@/lib/monthDeskSettleChartGuide';

type Props = {
  intel: MonthDeskCandleZoneIntel;
  layerMode: MonthDeskChartLayerMode;
  strike?: MonthDeskStrikeDeskBundle | null;
  settleGuide?: { guide: MonthDeskSettleChartGuide } | null;
  timeframe: string;
  collapsed?: boolean;
  onToggle?: () => void;
};

const MODE_KO: Record<MonthDeskChartLayerMode, string> = {
  strike: 'Strike · 타점만',
  standard: 'Standard · zone+line',
  full: 'Full · 전체',
  zoneLinePro: '존·라인 · LinReg+CP+HotZone',
};

const STEPS = [
  { n: 1, label: '돌파' },
  { n: 2, label: '안착' },
  { n: 3, label: '확인' },
] as const;

function stepAccent(
  guide: MonthDeskSettleChartGuide | undefined,
  n: number
): string {
  if (!guide) return '#334155';
  if (guide.step === 'fake' || guide.step === 'failed') return '#64748b';
  if (guide.stepIndex >= n) return guide.bias === 'SHORT' ? '#f87171' : '#4ade80';
  if (guide.stepIndex === n - 1 && guide.step !== 'wait') return '#facc15';
  return '#334155';
}

export function MonthDeskChartIntelHud({
  intel,
  layerMode,
  strike,
  settleGuide,
  timeframe,
  collapsed,
  onToggle,
}: Props) {
  const guide = settleGuide?.guide;
  const biasColor =
    intel.bias === 'LONG' ? '#4ade80' : intel.bias === 'SHORT' ? '#f87171' : '#94a3b8';
  const stepKo = guide?.stepKo ?? '–';
  const warn = guide?.step === 'fake' || guide?.step === 'failed';

  return (
    <div
      style={{
        position: 'absolute',
        left: 8,
        bottom: 52,
        zIndex: 2492,
        maxWidth: 'min(94vw, 340px)',
        pointerEvents: onToggle ? 'auto' : 'none',
        padding: collapsed ? '6px 10px' : '10px 12px',
        borderRadius: 10,
        border: `1px solid ${warn ? 'rgba(248,113,113,0.5)' : `${biasColor}55`}`,
        background: 'rgba(4,10,22,0.94)',
        boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
      }}
      aria-label="마감·안착 캔들·zone 인텔"
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 900, color: '#e2e8f0' }}>캔들·Zone 인텔</div>
          <div style={{ fontSize: 8, color: '#64748b', marginTop: 2 }}>
            {timeframe} · {MODE_KO[layerMode]}
          </div>
        </div>
        {onToggle && (
          <button type="button" className="tool-chip tool-chip-button" style={{ fontSize: 8, padding: '2px 6px' }} onClick={onToggle}>
            {collapsed ? '+' : '−'}
          </button>
        )}
      </div>

      {!collapsed && (
        <>
          {guide && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                marginTop: 8,
                marginBottom: 4,
              }}
            >
              {STEPS.map((s, i) => (
                <div key={s.n} style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      flex: 1,
                      textAlign: 'center',
                      fontSize: 8,
                      fontWeight: 800,
                      padding: '3px 2px',
                      borderRadius: 5,
                      background: stepAccent(guide, s.n),
                      color: guide.stepIndex >= s.n ? '#0f172a' : '#e2e8f0',
                    }}
                  >
                    {s.n}.{s.label}
                  </div>
                  {i < STEPS.length - 1 && (
                    <span style={{ color: '#475569', fontSize: 9, padding: '0 2px' }}>→</span>
                  )}
                </div>
              ))}
            </div>
          )}

          <div style={{ fontSize: 11, fontWeight: 800, color: biasColor, marginTop: 6, lineHeight: 1.35 }}>
            {intel.headlineKo}
          </div>
          <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 4, lineHeight: 1.4 }}>{intel.sublineKo}</div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            <span style={{ fontSize: 8, padding: '2px 6px', borderRadius: 4, background: 'rgba(51,65,85,0.6)', color: '#cbd5e1' }}>
              레벨 {intel.activeLevelKo}
            </span>
            <span style={{ fontSize: 8, padding: '2px 6px', borderRadius: 4, background: 'rgba(51,65,85,0.6)', color: '#cbd5e1' }}>
              안착 {stepKo}
            </span>
            {strike && (
              <span style={{ fontSize: 8, padding: '2px 6px', borderRadius: 4, background: 'rgba(51,65,85,0.6)', color: '#fde047' }}>
                {strike.primaryKo}
              </span>
            )}
          </div>

          <div style={{ fontSize: 8, color: '#64748b', marginTop: 8, lineHeight: 1.45 }}>
            캔들 색 = 돌파·안착·확인·가짜 · zone·line 종가 기준 · 참고용
          </div>
        </>
      )}
    </div>
  );
}
