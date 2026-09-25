'use client';

import type { CSSProperties } from 'react';
import type { MonthDeskMergedSignal } from '@/lib/monthDeskMergedSignal';
import type { MergedTradeJudgment } from '@/lib/mergedAnalysisTradeJudgment';
import type { MasterFuturesDecision } from '@/lib/mergedDeskMasterFuturesDecision';
import type { SwingMidEntryPack } from '@/lib/mergedDeskSwingMidEntry';

type Props = {
  signal: MonthDeskMergedSignal | null;
  judgment: MergedTradeJudgment | null;
  master?: MasterFuturesDecision | null;
  swingMid?: SwingMidEntryPack | null;
  approachZoneCaption?: string | null;
  compact?: boolean;
};

const cardStyle: CSSProperties = {
  position: 'absolute',
  right: 10,
  top: 10,
  zIndex: 2490,
  minWidth: 200,
  maxWidth: 'min(92vw, 360px)',
  padding: '9px 11px',
  borderRadius: 10,
  border: '1px solid rgba(56,189,248,0.42)',
  background: 'rgba(2,6,23,0.9)',
  backdropFilter: 'blur(6px)',
  boxShadow: '0 8px 24px rgba(2,6,23,0.45)',
  pointerEvents: 'none',
  color: '#e2e8f0',
};

function fmt(p: number): string {
  if (!Number.isFinite(p) || p <= 0) return '—';
  return p >= 1000 ? p.toLocaleString(undefined, { maximumFractionDigits: 0 }) : p.toFixed(1);
}

/** 통합·분석 플로팅 HUD — 스윙진입 → 마스터 확정 우선 */
export function MergedDeskFloatingSignalHud({
  signal,
  judgment,
  master,
  swingMid,
  approachZoneCaption,
  compact,
}: Props) {
  if (!swingMid && !master && !signal && !judgment && !approachZoneCaption) return null;

  if (swingMid && (swingMid.active || swingMid.side !== 'WAIT')) {
    const go = swingMid.stance === 'ENTER_LONG' || swingMid.stance === 'ENTER_SHORT';
    const color =
      swingMid.side === 'LONG' ? '#22d3ee' : swingMid.side === 'SHORT' ? '#f87171' : '#fbbf24';
    return (
      <div
        style={{
          ...cardStyle,
          maxWidth: compact ? 300 : 'min(92vw, 380px)',
          borderColor: go ? 'rgba(74,222,128,0.55)' : `${color}66`,
        }}
        aria-live="polite"
      >
        <div style={{ fontSize: 10, fontWeight: 800, color: '#7dd3fc', marginBottom: 4 }}>
          스윙·중투 진입자리
        </div>
        <div style={{ fontSize: 14, fontWeight: 900, color }}>
          {swingMid.headlineKo}
        </div>
        <div style={{ fontSize: 11, fontWeight: 800, color: '#a5f3fc', marginTop: 4, lineHeight: 1.4 }}>
          {swingMid.whereKo}
        </div>
        <div style={{ fontSize: 10, color: '#e2e8f0', marginTop: 4, lineHeight: 1.4 }}>
          {swingMid.actionKo}
        </div>
        {swingMid.entryMid > 0 && (
          <div style={{ marginTop: 6, fontSize: 9, fontWeight: 800, color: '#cbd5e1' }}>
            E {fmt(swingMid.entryLow)}~{fmt(swingMid.entryHigh)} · SL {fmt(swingMid.stopLoss)} · TP1{' '}
            {fmt(swingMid.tp1)} · {swingMid.leverage.suggestX}x
          </div>
        )}
        <div style={{ fontSize: 8, color: '#64748b', marginTop: 6 }}>합류≠승률 · 참고용</div>
      </div>
    );
  }

  if (master) {
    const sideKo = master.side === 'LONG' ? '롱' : master.side === 'SHORT' ? '숏' : '관망';
    return (
      <div
        style={{
          ...cardStyle,
          maxWidth: compact ? 280 : 'min(92vw, 360px)',
          borderColor: `${master.color}66`,
        }}
        aria-live="polite"
      >
        <div style={{ fontSize: 10, fontWeight: 800, color: '#7dd3fc', marginBottom: 4 }}>
          마스터 확정
        </div>
        <div style={{ fontSize: 14, fontWeight: 900, color: master.color }}>
          {sideKo} · {master.grade} · {master.strength}점
        </div>
        <div style={{ fontSize: 10, color: '#cbd5e1', marginTop: 4, lineHeight: 1.45 }}>
          {master.reasonKo}
        </div>
        <div
          style={{
            marginTop: 6,
            fontSize: 9,
            fontWeight: 800,
            color: master.entryAllowed ? '#86efac' : '#fde68a',
          }}
        >
          {master.entryAllowed ? '진입가능' : '진입잠금'} · 게이트 {master.gatesPassCount}/
          {master.gatesRequired}
          {master.rr > 0 ? ` · ${master.rr.toFixed(2)}R` : ''}
        </div>
        <div style={{ fontSize: 8, color: '#f87171', marginTop: 6, lineHeight: 1.35 }}>
          {master.invalidationKo}
        </div>
        <div style={{ fontSize: 8, color: '#64748b', marginTop: 6, lineHeight: 1.35 }}>
          조건부 참고 · 승률·수익 보장 아님
        </div>
      </div>
    );
  }

  const dir = signal?.direction ?? judgment?.direction ?? 'WAIT';
  const dirKo =
    dir === 'LONG' ? '롱' : dir === 'SHORT' ? '숏' : dir === 'WAIT' || dir === 'NEUTRAL' ? '관망' : String(dir);
  const dirColor = dir === 'LONG' ? '#4ade80' : dir === 'SHORT' ? '#f87171' : '#94a3b8';

  return (
    <div style={{ ...cardStyle, maxWidth: compact ? 280 : 'min(92vw, 360px)' }} aria-live="polite">
      <div style={{ fontSize: 10, fontWeight: 800, color: '#7dd3fc', marginBottom: 4 }}>
        통합·분석 AI
      </div>
      {signal ? (
        <>
          <div style={{ fontSize: 13, fontWeight: 900, color: dirColor }}>
            병합시그널 {dirKo}
            {signal.confluence > 0 ? ` · 합류${Math.round(signal.confluence)}%` : ''}
          </div>
          <div style={{ fontSize: 10, color: '#cbd5e1', marginTop: 4, lineHeight: 1.45 }}>
            {signal.headlineKo}
          </div>
          {signal.sublineKo ? (
            <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 3 }}>{signal.sublineKo}</div>
          ) : null}
        </>
      ) : judgment ? (
        <>
          <div style={{ fontSize: 13, fontWeight: 900, color: dirColor }}>
            {judgment.stanceKo}
          </div>
          {judgment.summaryKo ? (
            <div style={{ fontSize: 10, color: '#cbd5e1', marginTop: 4, lineHeight: 1.45 }}>
              {judgment.summaryKo}
            </div>
          ) : null}
        </>
      ) : null}
      {approachZoneCaption ? (
        <div
          style={{
            marginTop: 8,
            paddingTop: 6,
            borderTop: '1px solid rgba(51,65,85,0.65)',
            fontSize: 9,
            color: '#fde047',
            fontWeight: 700,
          }}
        >
          접근 zone · {approachZoneCaption}
        </div>
      ) : null}
      <div style={{ fontSize: 8, color: '#64748b', marginTop: 8, lineHeight: 1.35 }}>
        조건부 참고 · SL·무효화 검증 필요
      </div>
    </div>
  );
}
