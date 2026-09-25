/**
 * PHASE 17 — Telegram report formatter. Engine does not depend on send success.
 * Squeeze / A+ 문구는 SqueezeRadar·MtfSmartZone과 동일 소스(공통화).
 */
import { EAGLE1_ENGINE_VERSION } from './rawTypes';
import { eagle1DecisionKo, formatPriceCompact } from './chartUx';
import type { Eagle1MainPlan } from './signalEngine';
import type { Eagle1ConsensusReport } from './consensusEngine';
import type { Eagle1SmartPath } from './smartPath';
import type { SqueezeRadarReport } from './squeezeRadarEngine';
import type { MtfSmartZoneReport } from './mtfSmartZoneEngine';
import type { LiqZoneReport } from './liqZoneEngine';
import type { ReEntryReport } from './reEntryEngine';
import type { LegendaryFusionReport } from './legendaryStrategyFusion';
import type { TradeOpportunityReport } from './tradeOpportunityEngine';

export type Eagle1TelegramPayload = {
  symbol?: string;
  timeframe?: string;
  plan: Eagle1MainPlan;
  consensus?: Eagle1ConsensusReport | null;
  smartPath?: Eagle1SmartPath | null;
  squeezeRadar?: SqueezeRadarReport | null;
  mtfSmartZone?: MtfSmartZoneReport | null;
  liqZones?: LiqZoneReport | null;
  reEntry?: ReEntryReport | null;
  legendaryFusion?: LegendaryFusionReport | null;
  tradeOpportunity?: TradeOpportunityReport | null;
  previousVersion?: string | null;
};

/** 텔레그램·HUD 공통 한 줄 — 확률/확정 수익 문구 금지 */
export function formatSqueezeTelegramLine(sq: SqueezeRadarReport | null | undefined): string | null {
  if (!sq) return null;
  if (sq.long.state === 'NONE' && sq.short.state === 'NONE') return null;
  const tag = sq.chartTag && sq.chartTag !== '×' ? sq.chartTag : null;
  const active =
    sq.activeSide === 'LONG'
      ? sq.long
      : sq.activeSide === 'SHORT'
        ? sq.short
        : sq.long.state !== 'NONE'
          ? sq.long
          : sq.short;
  if (!active || active.state === 'NONE') return null;
  const bits = [
    `스퀴즈 ${active.side}`,
    active.labelEn,
    tag ? `차트 ${tag}` : null,
    active.score != null ? `준비도 ${active.score}` : null,
  ].filter(Boolean);
  return `${bits.join(' · ')} · 확률 아님`;
}

export function formatMtfSmartZoneTelegramLine(
  z: MtfSmartZoneReport | null | undefined
): string | null {
  if (!z?.primary) return null;
  const p = z.primary;
  return `${p.labelEn} ${formatPriceCompact(p.lower)}~${formatPriceCompact(p.upper)} · n=${p.sampleSize} · ${p.note}`;
}

export function formatLiqZoneTelegramLine(z: LiqZoneReport | null | undefined): string | null {
  if (!z?.primary) return null;
  const p = z.primary;
  return `${p.labelEn} ${formatPriceCompact(p.lower)}~${formatPriceCompact(p.upper)} · ${p.note}`;
}

export function formatReEntryTelegramLine(r: ReEntryReport | null | undefined): string | null {
  if (!r || r.state === 'NONE') return null;
  return `재진입 ${r.labelEn} · ${r.labelKo} · ${r.note}`;
}

export function formatLegendaryTelegramLine(f: LegendaryFusionReport | null | undefined): string | null {
  if (!f?.chartTag) return null;
  /** 내부 전략 이름(Turtle 등) 절대 노출 금지 */
  return `합의 ${f.chartTag} · ${f.labelKo} · ${f.note}`;
}

export function formatTradeOpportunityTelegramLine(
  o: TradeOpportunityReport | null | undefined
): string | null {
  if (!o) return null;
  return `기회 ${o.labelEn} · ${o.labelKo} · ${o.note}`;
}

export function formatEagle1TelegramReport(p: Eagle1TelegramPayload): string {
  try {
    const plan = p.plan;
    const d = eagle1DecisionKo(plan.status);
    const entry =
      plan.entryLow != null && plan.entryHigh != null
        ? `${formatPriceCompact(plan.entryLow)}~${formatPriceCompact(plan.entryHigh)}`
        : '대기';
    const prob =
      plan.calibratedProbability != null && plan.sampleSize >= 30
        ? `${Math.round(plan.calibratedProbability * 100)}%`
        : '통계 부족';
    const rr = plan.netRr != null ? `1:${plan.netRr.toFixed(2)}` : '통계 부족';
    const ver =
      p.previousVersion && p.previousVersion !== EAGLE1_ENGINE_VERSION
        ? `${p.previousVersion} → ${EAGLE1_ENGINE_VERSION}`
        : EAGLE1_ENGINE_VERSION;
    const ood = p.consensus?.ood.flagged ? `\nOOD: ${p.consensus.note}` : '';
    const path = p.smartPath ? `\n경로: ${p.smartPath.main.labelKo} ${p.smartPath.main.state}` : '';
    const squeeze = formatSqueezeTelegramLine(p.squeezeRadar);
    const zone = formatMtfSmartZoneTelegramLine(p.mtfSmartZone);
    const liq = formatLiqZoneTelegramLine(p.liqZones);
    const re = formatReEntryTelegramLine(p.reEntry);
    const leg = formatLegendaryTelegramLine(p.legendaryFusion);
    const opp = formatTradeOpportunityTelegramLine(p.tradeOpportunity);
    return [
      `독수리1호 ${p.symbol ?? 'BTCUSDT'} ${p.timeframe ?? ''}`.trim(),
      `${d}`,
      `진입 ${entry}`,
      `손절 ${formatPriceCompact(plan.sl)}`,
      `목표 ${formatPriceCompact(plan.tp1)} / ${formatPriceCompact(plan.tp2)} / ${formatPriceCompact(plan.tp3)}`,
      `RR ${rr} · 검증확률 ${prob}`,
      `무효 ${plan.invalidation || '데이터 없음'}`,
      squeeze ? squeeze : null,
      zone ? zone : null,
      liq ? liq : null,
      re ? re : null,
      leg ? leg : null,
      opp ? opp : null,
      `버전 ${ver}${ood}${path}`,
      '확정 수익·투자 권유 아님',
    ]
      .filter((x): x is string => Boolean(x))
      .join('\n');
  } catch {
    return '데이터 없음';
  }
}

/** Never throws into the trading pipeline. */
export function safeEagle1TelegramReport(p: Eagle1TelegramPayload): string {
  try {
    return formatEagle1TelegramReport(p);
  } catch {
    return '데이터 없음';
  }
}
