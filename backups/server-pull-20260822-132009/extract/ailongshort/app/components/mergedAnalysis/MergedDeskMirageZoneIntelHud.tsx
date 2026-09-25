'use client';

import type { OverlayItem } from '@/types';
import type { MirageZoneProactiveIntel } from '@/lib/mergedDeskMirageZoneExchangeIntel';
import { inferMirageZoneRole } from '@/lib/mergedDeskMirageZoneExchangeIntel';
import { buildMirageZoneBeginnerCard } from '@/lib/mergedDeskMirageZoneBeginnerKo';
import {
  mergedDeskPatternZoneHint,
  type MergedDeskActionablePatternBrief,
} from '@/lib/mergedDeskActionablePattern';
import type { MasterFuturesDecision } from '@/lib/mergedDeskMasterFuturesDecision';
import type { HqEntryZonesPack } from '@/lib/mergedDeskHqEntryZones';
import type { MergedTradeJudgment } from '@/lib/mergedAnalysisTradeJudgment';
import type { MergedDeskHotZoneEntryPack } from '@/lib/mergedDeskHotZoneEntry';
import type { MergedBounceScenario } from '@/lib/mergedAnalysisBounceTargets';
import type { ZoneHoldLive } from '@/lib/mergedDeskMirageZoneBeginnerKo';

type Props = {
  overlay: OverlayItem;
  intel: MirageZoneProactiveIntel | null;
  patternBrief?: MergedDeskActionablePatternBrief | null;
  superAiHint?: string | null;
  currentPrice?: number | null;
  masterFutures?: MasterFuturesDecision | null;
  hqEntryZones?: HqEntryZonesPack | null;
  tradeJudgment?: MergedTradeJudgment | null;
  hotZoneEntry?: MergedDeskHotZoneEntryPack | null;
  bounceScenarios?: MergedBounceScenario[] | null;
  zoneHold?: ZoneHoldLive | null;
  exchangeTapeKo?: string | null;
  onClose: () => void;
};

function toneClass(tone: string): string {
  if (tone === 'bull') return 'is-bull';
  if (tone === 'bear') return 'is-bear';
  if (tone === 'wait') return 'is-wait';
  return 'is-neutral';
}

function verdictClass(v: string): string {
  if (v === 'ENTER_LONG') return 'is-enter-long';
  if (v === 'ENTER_SHORT') return 'is-enter-short';
  if (v === 'AVOID') return 'is-avoid';
  return 'is-wait';
}

function stanceClass(s: string): string {
  if (s === 'GO') return 'is-go';
  if (s === 'WAIT') return 'is-hold';
  return 'is-watch';
}

const KIND_ICON: Record<string, string> = {
  volume: '▣',
  indicator: '◈',
  signal: '✦',
  structure: '◇',
  risk: '⚠',
};

export function MergedDeskMirageZoneIntelHud({
  overlay,
  intel,
  patternBrief,
  superAiHint,
  currentPrice,
  masterFutures,
  hqEntryZones,
  tradeJudgment,
  hotZoneEntry,
  bounceScenarios,
  zoneHold,
  exchangeTapeKo,
  onClose,
}: Props) {
  const p1 = Number(overlay.price1);
  const p2 = Number(overlay.price2);
  const top = Math.max(p1, p2);
  const bot = Math.min(p1, p2);
  const role = inferMirageZoneRole(overlay);

  const enLabel =
    `${overlay.zoneFaceBase ?? ''}${overlay.zoneFaceSignal ? `·${overlay.zoneFaceSignal}` : ''}`.trim() ||
    String(overlay.label || '').trim();

  const card = buildMirageZoneBeginnerCard({
    role,
    overlay,
    intel,
    enLabel,
    bot,
    top,
    patternHint: mergedDeskPatternZoneHint(patternBrief ?? null, role),
    assetsRefKo: superAiHint ?? null,
    currentPrice,
    masterFutures,
    hqEntryZones,
    tradeJudgment,
    hotZoneEntry,
    bounceScenarios,
    zoneHold,
    exchangeTapeKo,
  });

  return (
    <div
      className={`merged-desk-mirage-zone-mini-card merged-desk-mirage-zone-mini-card--rich ${verdictClass(card.verdict)} ${stanceClass(card.stance)}`}
      role="dialog"
      aria-label="Zone 진입·대기·관망 판단"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="merged-desk-mirage-zone-mini-card__head">
        {card.enLabel && (
          <span className="merged-desk-mirage-zone-mini-card__en">{card.enLabel}</span>
        )}
        <button
          type="button"
          className="merged-desk-mirage-zone-mini-card__close"
          onClick={onClose}
          aria-label="닫기"
        >
          ×
        </button>
      </div>

      <div
        className={`merged-desk-mirage-zone-mini-card__stance ${stanceClass(card.stance)}`}
        aria-label={`자세 ${card.stanceKo}`}
      >
        <div className="merged-desk-mirage-zone-mini-card__stance-row">
          <span className="merged-desk-mirage-zone-mini-card__stance-big">{card.stanceKo}</span>
          {card.stanceSideKo && (
            <span className="merged-desk-mirage-zone-mini-card__stance-side">{card.stanceSideKo}</span>
          )}
          <span className="merged-desk-mirage-zone-mini-card__confluence" title="신호 합류 점수 (승률 아님)">
            합류 {card.confluenceScore}
          </span>
        </div>
        <p className="merged-desk-mirage-zone-mini-card__stance-hint">{card.verdictHintKo}</p>
        <p className="merged-desk-mirage-zone-mini-card__action">{card.actionKo}</p>
      </div>

      <div className="merged-desk-mirage-zone-mini-card__checks" aria-label="체크리스트">
        {card.checklist.map((c) => (
          <div
            key={c.id}
            className={`merged-desk-mirage-zone-mini-card__check ${c.ok ? 'is-ok' : 'is-no'}`}
          >
            <span className="merged-desk-mirage-zone-mini-card__check-mark" aria-hidden>
              {c.ok ? '✓' : '·'}
            </span>
            <span className="merged-desk-mirage-zone-mini-card__check-label">{c.labelKo}</span>
            <span className="merged-desk-mirage-zone-mini-card__check-detail">{c.detailKo}</span>
          </div>
        ))}
      </div>

      {(card.holdLiveKo || card.exchangeTapeKo) && (
        <div className="merged-desk-mirage-zone-mini-card__live" aria-label="거래소 실시간">
          {card.holdLiveKo && (
            <div className="merged-desk-mirage-zone-mini-card__live-hold">{card.holdLiveKo}</div>
          )}
          {card.exchangeTapeKo && (
            <div className="merged-desk-mirage-zone-mini-card__live-ex">{card.exchangeTapeKo}</div>
          )}
        </div>
      )}

      {card.upsideTargets.length > 0 && (
        <div className="merged-desk-mirage-zone-mini-card__upside" aria-label="목표가">
          <div className="merged-desk-mirage-zone-mini-card__upside-title">
            {card.stanceSideKo?.includes('롱') || card.verdict === 'ENTER_LONG'
              ? '지지 유지 시 상승 참고'
              : card.verdict === 'ENTER_SHORT'
                ? '저항 유지 시 하락 참고'
                : '목표가 (참고)'}
          </div>
          <div className="merged-desk-mirage-zone-mini-card__upside-rows">
            {card.upsideTargets.map((t) => (
              <div
                key={`${t.label}-${t.price}`}
                className={`merged-desk-mirage-zone-mini-card__upside-row ${t.hit ? 'is-hit' : ''}`}
              >
                <strong>{t.label}</strong>
                <span>{t.price >= 1000 ? t.price.toFixed(0) : t.price.toFixed(1)}</span>
                <em>{t.sourceKo}{t.hit ? ' · 도달' : ''}</em>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="merged-desk-mirage-zone-mini-card__title-row">
        <div className="merged-desk-mirage-zone-mini-card__title">{card.title}</div>
        {card.distanceKo && (
          <span className="merged-desk-mirage-zone-mini-card__dist">{card.distanceKo}</span>
        )}
      </div>

      <div className="merged-desk-mirage-zone-mini-card__meters" aria-label="거래량·지표·시그널">
        {card.meters.map((m) => (
          <div key={m.id} className={`merged-desk-mirage-zone-mini-card__meter ${toneClass(m.tone)}`}>
            <div className="merged-desk-mirage-zone-mini-card__meter-head">
              <span>{m.labelKo}</span>
              <strong>{m.value}</strong>
            </div>
            <div className="merged-desk-mirage-zone-mini-card__meter-track">
              <div
                className="merged-desk-mirage-zone-mini-card__meter-fill"
                style={{ width: `${Math.max(4, Math.min(100, m.value))}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="merged-desk-mirage-zone-mini-card__evidence" aria-label="근거">
        {card.evidence.map((e) => (
          <div key={e.id} className={`merged-desk-mirage-zone-mini-card__ev ${toneClass(e.tone)}`}>
            <span className="merged-desk-mirage-zone-mini-card__ev-ico" aria-hidden>
              {KIND_ICON[e.kind] ?? '·'}
            </span>
            <div className="merged-desk-mirage-zone-mini-card__ev-body">
              <div className="merged-desk-mirage-zone-mini-card__ev-label">
                {e.labelKo}
                {e.score != null && Number.isFinite(e.score) ? (
                  <em>{Math.round(e.score)}</em>
                ) : null}
              </div>
              <div className="merged-desk-mirage-zone-mini-card__ev-text">{e.textKo}</div>
            </div>
          </div>
        ))}
      </div>

      {(card.priceLine || card.touchKo) && (
        <div className="merged-desk-mirage-zone-mini-card__meta">
          {card.priceLine && <span>{card.priceLine}</span>}
          {card.touchKo && <span>{card.touchKo}</span>}
        </div>
      )}
      {card.warnLine && (
        <div className="merged-desk-mirage-zone-mini-card__warn">{card.warnLine}</div>
      )}
      <div className="merged-desk-mirage-zone-mini-card__foot">
        참고용 · 합류 점수≠승률 · 확정 수익·투자 권유 아님
      </div>
    </div>
  );
}
