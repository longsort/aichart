'use client';

import { useState } from 'react';
import type { MtfDumpBounceTargetPack } from '@/lib/mergedDeskMtfBounceTargetByTf';

/**
 * TF별 반등 1차 구간 — 차트 좌하단 컴팩트 스트립 (카드/HUD 아님).
 * 폭락「반등진행·반등구간 터치」 시 1h·1d·1w·1M 한도 요약.
 */
export default function MergedDeskDumpBounceTargetStrip({
  pack,
  pathScenarioKo,
  compact,
}: {
  pack: MtfDumpBounceTargetPack;
  pathScenarioKo?: string;
  compact?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const rows = pack.rows ?? [];
  if (!rows.length) return null;

  const show =
    pathScenarioKo === '반등진행' ||
    pathScenarioKo === '감시' ||
    rows.some((r) => r.inBounceZone || r.touchedSupport);
  if (!show) return null;

  const activeTf = pack.activeRow?.sourceTf;

  return (
    <div
      className="merged-desk-dump-bounce-strip"
      data-compact={compact ? '1' : undefined}
      style={{
        position: 'absolute',
        left: 8,
        bottom: compact ? 48 : 36,
        zIndex: 132,
        maxWidth: compact ? 'min(96vw, 340px)' : 380,
        pointerEvents: 'auto',
        touchAction: 'manipulation',
      }}
    >
      <div className="merged-desk-dump-bounce-strip__head">
        <span className="merged-desk-dump-bounce-strip__title">
          {pathScenarioKo === '반등진행' ? '반등 1차 구간' : 'TF 반등한도'}
        </span>
        {pack.activeRow && pathScenarioKo === '반등진행' && (
          <span className="merged-desk-dump-bounce-strip__active">
            {pack.activeRow.sourceTfKo}{' '}
            {pack.activeRow.bounce1Px != null ? Math.round(pack.activeRow.bounce1Px) : '—'}
            {pack.activeRow.gapPct != null ? ` (+${pack.activeRow.gapPct}%)` : ''}
          </span>
        )}
        <button
          type="button"
          className="tool-chip tool-chip-button merged-desk-dump-bounce-strip__toggle"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setCollapsed((v) => !v)}
        >
          {collapsed ? '펼침' : '접기'}
        </button>
      </div>
      {!collapsed && (
        <div className="merged-desk-dump-bounce-strip__body">
          {rows.map((r) => (
            <div
              key={r.sourceTf}
              className="merged-desk-dump-bounce-strip__row"
              data-active={r.sourceTf === activeTf ? '1' : undefined}
              data-touch={r.inBounceZone || r.touchedSupport ? '1' : undefined}
              title={`${r.lineKo} · 한도·목표가 보장 아님`}
            >
              <span className="merged-desk-dump-bounce-strip__tf">{r.sourceTfKo}</span>
              <span className="merged-desk-dump-bounce-strip__path">
                {r.supportPx != null ? Math.round(r.supportPx) : '—'}
                {' → '}
                {r.bounce1Px != null ? Math.round(r.bounce1Px) : '—'}
                {r.gapPct != null ? ` (+${r.gapPct}%)` : ''}
              </span>
              {(r.inBounceZone || r.touchedSupport) && (
                <span className="merged-desk-dump-bounce-strip__tag">
                  {r.inBounceZone && r.touchedSupport ? '터치' : r.inBounceZone ? '구간' : '지지'}
                </span>
              )}
            </div>
          ))}
          <div className="merged-desk-dump-bounce-strip__hint">조건부 한도 · 확정 목표·승률 아님</div>
        </div>
      )}
    </div>
  );
}
