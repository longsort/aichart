/**
 * 마감·안착 — 롱확정·숏확정·구조(BOS/CHOCH) 차트 핀 (모든 TF).
 */
import type { AnalyzeResponse, Candle, OverlayItem } from '@/types';
import type { ClosingEnvelopeFuturesScenario } from '@/lib/institutionalSuperBand';
import type { MonthDeskSmcMoneyPackHud } from '@/lib/monthDeskSmcMoneyPack';
import type { TfCloseSettleRow } from '@/lib/tfCloseSettleAssessment';
import { MONTH_DESK_TRAINER } from '@/lib/monthDeskChartTrainerTheme';
import { assessMonthDeskZoneSettleReaction } from '@/lib/monthDeskZoneSettleReaction';

function barStepMs(candles: Candle[]): number {
  const n = candles.length;
  if (n < 2) return 86_400_000;
  const d = Number(candles[n - 1]?.time) - Number(candles[n - 2]?.time);
  return Number.isFinite(d) && d > 0 ? d : 86_400_000;
}

export function buildMonthDeskChartSignalPins(input: {
  candles: Candle[];
  analysis?: AnalyzeResponse | null;
  moneyHud?: MonthDeskSmcMoneyPackHud | null;
  pack?: OverlayItem[];
  timeframe?: string;
  scenario?: ClosingEnvelopeFuturesScenario | null;
  settleRow?: TfCloseSettleRow | null;
  /** true: 캔들 색 모드 — 마지막 봉 zone-reaction 핀 생략 */
  preferCandlePaint?: boolean;
  /** true: 우측 라인 `[…]` 라벨 사용 — 마지막 봉 안착/불안 핀 중복 생략 */
  featureSettleLineLabels?: boolean;
}): OverlayItem[] {
  const { candles, analysis, moneyHud, pack = [], timeframe, scenario, settleRow } = input;
  const n = candles.length;
  if (n < 8) return [];

  const last = candles[n - 1]!;
  const lastT = Number(last.time);
  const step = barStepMs(candles);
  const tPin = lastT + step * 2;
  const out: OverlayItem[] = [];

  const cs = analysis?.confirmedSignal;
  const gates = cs?.gatesPassCount ?? 0;

  if (cs?.confirmed && cs.direction && Number.isFinite(lastT)) {
    const isL = cs.direction === 'LONG';
    out.push({
      id: 'month-desk-pin-confirmed',
      kind: 'label',
      label: isL ? '★롱확정' : '★숏확정',
      x1: 0,
      y1: 0,
      time1: tPin,
      price1: isL ? Number(last.low) : Number(last.high),
      confidence: 96,
      color: isL ? MONTH_DESK_TRAINER.long.labelText : MONTH_DESK_TRAINER.short.labelText,
      labelBackgroundColor: isL ? MONTH_DESK_TRAINER.long.labelBg : MONTH_DESK_TRAINER.short.labelBg,
      labelTextColor: isL ? MONTH_DESK_TRAINER.long.labelText : MONTH_DESK_TRAINER.short.labelText,
      lineLabelColor: isL ? MONTH_DESK_TRAINER.long.border : MONTH_DESK_TRAINER.short.border,
      category: 'scenario',
      labelTooltip: `5요소 게이트 ${gates}/5 · 확정 ${isL ? '롱' : '숏'} — 참고`,
      overlayZoneExtraClass: 'overlay-pin--monthdesk-signal overlay-pin--monthdesk-signal-confirmed',
      noProject: true,
    });
  } else if (gates >= 4 && analysis?.verdict) {
    const isL = analysis.verdict === 'LONG';
    const isS = analysis.verdict === 'SHORT';
    if (isL || isS) {
      out.push({
        id: 'month-desk-pin-candidate',
        kind: 'label',
        label: isL ? `후보롱${gates}/5` : `후보숏${gates}/5`,
        x1: 0,
        y1: 0,
        time1: tPin,
        price1: isL ? Number(last.low) : Number(last.high),
        confidence: 88,
        color: MONTH_DESK_TRAINER.wait.lineLabel,
        labelBackgroundColor: 'rgba(69,26,3,0.92)',
        labelTextColor: MONTH_DESK_TRAINER.wait.lineLabel,
        category: 'scenario',
        labelTooltip: `확정 후보 — 게이트 ${gates}/5`,
        overlayZoneExtraClass: 'overlay-pin--monthdesk-signal overlay-pin--monthdesk-signal-candidate',
        noProject: true,
      });
    }
  }

  const bos = moneyHud?.latestBos;
  const choch = moneyHud?.latestChoch;
  if (bos && Number.isFinite(bos.price)) {
    out.push({
      id: 'month-desk-pin-structure-bos',
      kind: 'label',
      label: `구조·${bos.tag}`,
      x1: 0,
      y1: 0,
      time1: Number(bos.barTime),
      price1: bos.price,
      confidence: 84,
      color: bos.bias === 'bullish' ? MONTH_DESK_TRAINER.long.caption : MONTH_DESK_TRAINER.short.caption,
      labelBackgroundColor: 'rgba(15,23,42,0.92)',
      labelTextColor: bos.bias === 'bullish' ? MONTH_DESK_TRAINER.long.caption : MONTH_DESK_TRAINER.short.caption,
      category: 'scenario',
      labelTooltip: `구조 ${bos.tag} — ${bos.bias === 'bullish' ? '상승' : '하락'} · $$$$ 연동`,
      overlayZoneExtraClass: 'overlay-pin--monthdesk-signal overlay-pin--monthdesk-signal-structure',
      noProject: true,
    });
  }
  if (choch && Number.isFinite(choch.price) && choch.barIndex !== bos?.barIndex) {
    out.push({
      id: 'month-desk-pin-structure-choch',
      kind: 'label',
      label: `구조·${choch.tag}`,
      x1: 0,
      y1: 0,
      time1: Number(choch.barTime),
      price1: choch.price,
      confidence: 82,
      color: choch.bias === 'bullish' ? MONTH_DESK_TRAINER.long.caption : MONTH_DESK_TRAINER.short.caption,
      labelBackgroundColor: 'rgba(15,23,42,0.92)',
      labelTextColor: choch.bias === 'bullish' ? MONTH_DESK_TRAINER.long.caption : MONTH_DESK_TRAINER.short.caption,
      category: 'scenario',
      labelTooltip: `구조 ${choch.tag} — ${choch.bias === 'bullish' ? '상승' : '하락'} · 전환 참고`,
      overlayZoneExtraClass: 'overlay-pin--monthdesk-signal overlay-pin--monthdesk-signal-structure',
      noProject: true,
    });
  }

  const zoneReaction =
    input.preferCandlePaint === true || input.featureSettleLineLabels === true
      ? null
      : assessMonthDeskZoneSettleReaction({
        candles,
        pack,
        timeframe,
        analysis: analysis ?? null,
        scenario: scenario ?? null,
        settleRow: settleRow ?? null,
      });
  if (zoneReaction && Number.isFinite(lastT)) {
    const isL = zoneReaction.bias === 'LONG';
    const isS = zoneReaction.bias === 'SHORT';
    const pal = isL ? MONTH_DESK_TRAINER.long : isS ? MONTH_DESK_TRAINER.short : MONTH_DESK_TRAINER.wait;
    out.push({
      id: 'month-desk-pin-zone-reaction',
      kind: 'label',
      label: zoneReaction.pinLabel,
      x1: 0,
      y1: 0,
      time1: lastT,
      price1: Number(last.close),
      confidence: zoneReaction.state === 'confirmed' ? 94 : 82,
      color: zoneReaction.color,
      labelBackgroundColor: zoneReaction.bgColor,
      labelTextColor: zoneReaction.color,
      lineLabelColor: zoneReaction.borderColor,
      category: 'scenario',
      labelTooltip: [
        zoneReaction.headlineKo,
        zoneReaction.levelKo,
        ...zoneReaction.bullets,
        '참고용 · 단독 진입 근거 아님',
      ].join('\n'),
      overlayZoneExtraClass: `overlay-pin--monthdesk-signal overlay-pin--monthdesk-zone-reaction overlay-pin--monthdesk-zone-reaction--${zoneReaction.state}`,
      noProject: true,
    });
    if (zoneReaction.state === 'confirmed' && (isL || isS)) {
      out.push({
        id: 'month-desk-pin-zone-confirmed-banner',
        kind: 'label',
        label: zoneReaction.headlineKo,
        x1: 0,
        y1: 0,
        time1: tPin,
        price1: isL ? Number(last.low) : Number(last.high),
        confidence: 92,
        color: 'labelText' in pal ? pal.labelText : pal.caption,
        labelBackgroundColor: zoneReaction.bgColor,
        labelTextColor: zoneReaction.color,
        category: 'scenario',
        labelTooltip: zoneReaction.bullets.join('\n'),
        overlayZoneExtraClass: 'overlay-pin--monthdesk-signal overlay-pin--monthdesk-zone-confirmed',
        noProject: true,
      });
    }
  }

  const sz = analysis?.settlementZone;
  if (sz && sz.state !== 'none' && Number.isFinite(lastT)) {
    const ok = sz.state === 'confirmed';
    const fail = sz.state === 'failed';
    const stateKo = ok ? '확인' : fail ? '실패' : '후보';
    out.push({
      id: 'month-desk-pin-settle',
      kind: 'label',
      /** 차트 캡션은 1글자 — 상세는 툴팁·좌측 패널 */
      label: ok ? '✓' : fail ? '✗' : '?',
      x1: 0,
      y1: 0,
      time1: lastT,
      price1: Number(last.close),
      confidence: 80,
      color: ok ? MONTH_DESK_TRAINER.long.caption : fail ? MONTH_DESK_TRAINER.short.caption : MONTH_DESK_TRAINER.wait.caption,
      labelBackgroundColor: ok ? 'rgba(6,78,59,0.88)' : fail ? 'rgba(69,10,10,0.88)' : 'rgba(69,26,3,0.88)',
      labelTextColor: ok ? '#86efac' : fail ? '#fda4af' : '#fcd34d',
      category: 'scenario',
      labelTooltip: [
        `마감 안착 ${stateKo} (${sz.state})`,
        `${sz.direction ?? '–'} · 등급 ${sz.grade ?? '–'} · 점수 ${typeof sz.score === 'number' ? Math.round(sz.score) : '–'}`,
        fail
          ? '돌파 후 리테스트에서 레벨 이탈 — 참고(확정 진입 신호 아님)'
          : ok
            ? '2봉 유지·리테스트 통과 — 게이트·방향과 함께 확인'
            : '안착 판정 대기 — 단독 진입 근거 아님',
      ].join('\n'),
      overlayZoneExtraClass: 'overlay-pin--monthdesk-signal overlay-pin--monthdesk-signal-settle',
      noProject: true,
    });
  }

  return out;
}
