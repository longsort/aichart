'use client';

import type { OverlayItem } from '@/types';
import type { SmcZoneBattleVerdict } from '@/lib/assets353SmcZoneConflictIntel';
import type { MtfZoneBattlePack } from '@/lib/assets353SmcZoneBattleMtf';
import { ZONE_BATTLE_TF_KO } from '@/lib/assets353SmcZoneBattleMtf';

type Props = {
  overlay?: OverlayItem | null;
  zoneBot?: number;
  zoneTop?: number;
  chartBattle: SmcZoneBattleVerdict | null;
  mtfPack: MtfZoneBattlePack | null;
  onClose: () => void;
};

export function MergedDeskZoneBattleDetailPanel({
  overlay,
  zoneBot: zoneBotProp,
  zoneTop: zoneTopProp,
  chartBattle,
  mtfPack,
  onClose,
}: Props) {
  let top = zoneTopProp ?? mtfPack?.zoneTop;
  let bot = zoneBotProp ?? mtfPack?.zoneBot;
  if (overlay) {
    const p1 = Number(overlay.price1);
    const p2 = Number(overlay.price2);
    if (Number.isFinite(p1) && Number.isFinite(p2)) {
      top = Math.max(p1, p2);
      bot = Math.min(p1, p2);
    }
  }
  const battle = chartBattle ?? mtfPack?.aggregate ?? null;

  return (
    <div
      className="merged-desk-zone-battle-detail"
      role="dialog"
      aria-label="Zone Battle 상세"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="merged-desk-zone-battle-detail__head">
        <span className="merged-desk-zone-battle-detail__title">⚔ Zone Battle Breakdown</span>
        <button type="button" className="merged-desk-zone-battle-detail__close" onClick={onClose}>
          ×
        </button>
      </div>
      <div className="merged-desk-zone-battle-detail__zone">
        {bot != null && top != null ? (
          <>
            {bot.toLocaleString(undefined, { maximumFractionDigits: 2 })} ~{' '}
            {top.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </>
        ) : (
          '가격 구간 — MTF 참조'
        )}
      </div>
      {battle && (
        <div className="merged-desk-zone-battle-detail__hero">
          <div className="merged-desk-zone-battle-detail__pct">
            <span className="merged-desk-zone-battle-detail__long">롱 {battle.longPct}%</span>
            <span className="merged-desk-zone-battle-detail__short">숏 {battle.shortPct}%</span>
            <span className="merged-desk-zone-battle-detail__brk">돌파 {battle.breakoutPct}%</span>
          </div>
          <div className="merged-desk-zone-battle-detail__strength">
            {battle.buyStrength === 'strong' ? '매수 강함' : battle.buyStrength === 'medium' ? '매수 보통' : '매수 약함'}
            {' · '}
            {battle.sellStrength === 'strong' ? '매도 강함' : battle.sellStrength === 'medium' ? '매도 보통' : '매도 약함'}
          </div>
          <div className="merged-desk-zone-battle-detail__dom">
            우세:{' '}
            {battle.dominant === 'LONG' ? '▲ 롱' : battle.dominant === 'SHORT' ? '▼ 숏' : '◆ 혼조'}
          </div>
        </div>
      )}
      {chartBattle && (
        <>
          <div className="merged-desk-zone-battle-detail__section">현재 차트 TF</div>
          <ul className="merged-desk-zone-battle-detail__list">
            {chartBattle.reasonsKo.map((line) => (
              <li key={line}>{line}</li>
            ))}
            {chartBattle.reasonsKo.length === 0 && <li>{chartBattle.detailKo}</li>}
          </ul>
        </>
      )}
      {mtfPack && (
        <>
          <div className="merged-desk-zone-battle-detail__section">
            MTF 합산 (1m · 3m · 5m · 15m · 1h · 4h · 1d · 1w · 1M)
          </div>
          <div className="merged-desk-zone-battle-detail__mtf-table">
            {mtfPack.rows.map((r) => (
              <div
                key={r.tf}
                className={`merged-desk-zone-battle-detail__mtf-row${r.active ? ' is-active' : ''}`}
              >
                <span className="merged-desk-zone-battle-detail__mtf-tf">{ZONE_BATTLE_TF_KO[r.tf] ?? r.tf}</span>
                <span>L{r.longPct}%</span>
                <span>S{r.shortPct}%</span>
                <span>돌파{r.breakoutPct}%</span>
                <span>
                  {r.dominant === 'LONG' ? '▲' : r.dominant === 'SHORT' ? '▼' : '—'}
                </span>
              </div>
            ))}
          </div>
          <div className="merged-desk-zone-battle-detail__summary">{mtfPack.summaryKo}</div>
        </>
      )}
      <div className="merged-desk-zone-battle-detail__foot">
        OB·S/R·353AI·구조·거래량·MTF 가중 — 참고용, 검증 필요
      </div>
    </div>
  );
}
