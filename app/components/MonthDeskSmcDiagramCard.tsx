'use client';

import type { SmcEntryPlaybook } from '@/lib/smcPlaybook/types';
import { MONTH_DESK_MONEY_LABEL } from '@/lib/monthDeskMoneyZone';
import type { MonthDeskSmcMoneyPackHud } from '@/lib/monthDeskSmcMoneyPack';

export function MonthDeskSmcDiagramCard({
  playbook,
  isNarrowUi,
  density = 'lite',
  moneyHud,
  coreMoneyKo,
  unifiedCoreTooltip,
}: {
  playbook: SmcEntryPlaybook | null;
  isNarrowUi?: boolean;
  density?: 'lite' | 'full';
  moneyHud?: MonthDeskSmcMoneyPackHud | null;
  /** 좌상단 확정 카드와 동일한 통합 $$$$ 라벨 */
  coreMoneyKo?: string | null;
  unifiedCoreTooltip?: string | null;
}) {
  const fs = isNarrowUi ? 9 : 10;
  const dirKo =
    playbook?.direction === 'LONG' ? '롱' : playbook?.direction === 'SHORT' ? '숏' : '—';
  const dirColor =
    playbook?.direction === 'LONG' ? '#86efac' : playbook?.direction === 'SHORT' ? '#fca5a5' : '#94a3b8';
  const nextStep = playbook?.steps.find((s) => !s.done);

  return (
    <div
      role="region"
      aria-label="SMC"
      className="month-desk-smc-diagram-card"
      style={{
        position: 'absolute',
        left: 8,
        bottom: 48,
        zIndex: 14,
        maxWidth: 'min(94vw, 280px)',
        padding: isNarrowUi ? '6px 8px' : '8px 10px',
        fontSize: fs,
        lineHeight: 1.35,
        color: '#e2e8f0',
        background: 'rgba(8,12,28,0.9)',
        border: '1px solid rgba(250,204,21,0.35)',
        borderRadius: 10,
        pointerEvents: 'none',
      }}
    >
      <div style={{ fontWeight: 800, color: '#fde047', marginBottom: 4 }}>
        SMC {density === 'lite' ? '· 핵심' : '· 전체'}
      </div>
      {coreMoneyKo ? (
        <div style={{ marginBottom: 6 }} title={unifiedCoreTooltip ?? coreMoneyKo}>
          <div
            style={{
              color: /롱/.test(coreMoneyKo) && !/숏 우세/.test(coreMoneyKo) ? '#86efac' : /숏/.test(coreMoneyKo) ? '#fca5a5' : '#fde047',
              fontWeight: 800,
              fontSize: fs + 1,
              marginBottom: 4,
            }}
          >
            {coreMoneyKo}
          </div>
          <div style={{ color: '#64748b', fontSize: fs - 1, lineHeight: 1.3 }}>
            통합 타점 — 롱·숏 풀 단일화
          </div>
        </div>
      ) : (
        <div style={{ color: '#64748b', fontSize: fs - 1, marginBottom: 6 }}>
          {MONTH_DESK_MONEY_LABEL} 통합타점 탐색 중…
        </div>
      )}
      {(moneyHud?.latestBos || moneyHud?.latestChoch) && (
        <div style={{ marginBottom: 6, fontSize: fs - 1, color: '#94a3b8', lineHeight: 1.35 }}>
          {moneyHud.latestBos ? (
            <div>
              <span style={{ color: '#fde047', fontWeight: 700 }}>{moneyHud.latestBos.tag}</span>{' '}
              {moneyHud.latestBos.bias === 'bullish' ? '상방' : '하방'} @ {moneyHud.latestBos.price}
            </div>
          ) : null}
          {moneyHud.latestChoch && moneyHud.latestChoch.barIndex !== moneyHud.latestBos?.barIndex ? (
            <div>
              <span style={{ color: '#fcd34d', fontWeight: 700 }}>{moneyHud.latestChoch.tag}</span>{' '}
              {moneyHud.latestChoch.bias === 'bullish' ? '상방' : '하방'} @ {moneyHud.latestChoch.price}
            </div>
          ) : null}
        </div>
      )}
      {playbook ? (
        <>
          <div style={{ marginBottom: 4 }}>
            <span style={{ fontWeight: 800, color: dirColor }}>{dirKo}</span>
            <span> {playbook.phaseLabel}</span>
          </div>
          {nextStep && (
            <div style={{ color: '#94a3b8', fontSize: fs - 1 }}>{nextStep.labelKo}</div>
          )}
        </>
      ) : (
        <div style={{ color: '#64748b', fontSize: fs - 1 }}>분석 대기…</div>
      )}
    </div>
  );
}
