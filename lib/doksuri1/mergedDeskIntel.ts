/**
 * Doksuri-1 — 통합·분석 데스크 실측 요약 (폭락TF·$$$$·초강·세력존·캔들하단마커).
 * 확정 수익·승률 아님.
 */
import type { AnalyzeResponse, Candle, OverlayItem } from '@/types';
import type { MtfDumpZoneSpec } from '@/lib/mergedDeskMtfDumpZoneBridge';
import type { WhaleBeamIntelPack } from '@/lib/whaleVolumeBeamIntel';
import type { HqEntryZonesPack } from '@/lib/mergedDeskHqEntryZones';
import { detectMonthDeskMoneyZones, MONTH_DESK_MONEY_LABEL } from '@/lib/monthDeskMoneyZone';
import { detectMergedDeskAiForceZones } from '@/lib/mergedDeskAiForceZones';
import { detectMergedAnalysisKeyZones } from '@/lib/mergedAnalysisKeyZones';
import { detectMergedCriticalZones } from '@/lib/mergedAnalysisCriticalZones';
import { scanMergedLeadingCandleSignals } from '@/lib/mergedAnalysisLeadingSignals';
import {
  buildMergedDeskCandleEventVerdictPack,
  candleEventEmitWorthy,
} from '@/lib/mergedDeskCandleEventVerdict';
import { normalizeChartTimeframe } from '@/lib/constants';
import {
  sanitizeTelegramPrice,
  telegramAssetPricePlausible,
  telegramPriceCompatibleWithAnchor,
} from '@/lib/telegramSymbolPriceGuard';

const TF_ORDER = ['15m', '1h', '4h', '1d', '1w', '1M'] as const;

export type Doksuri1MergedDeskIntel = {
  chartTf: string;
  /** 텔레그램 HTML/평문 줄 */
  linesKo: string[];
  /** $$$$ 분석 요약 (핵심 섹션용) */
  moneyAnalysisKo: string[];
  /** 캔들 이벤트 요약 */
  candleEventLinesKo: string[];
  candleEventFingerprint: string;
  candleEventEmitWorthy: boolean;
  flags: {
    nearDump: boolean;
    nearMoney: boolean;
    nearUltra: boolean;
    nearForce: boolean;
    nearWhale: boolean;
    candleMarkOn: boolean;
  };
};

/** Hot/HUD 문자열에 BTC↔ETH급 이상가격이 있으면 생략 */
function hotZoneTextPlausible(symbol: string, price: number, text: string): boolean {
  const nums = String(text || '').match(/\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+\.\d+|\d{4,}/g);
  if (!nums?.length) return true;
  for (const raw of nums) {
    const n = Number(String(raw).replace(/,/g, ''));
    if (!(n > 0) || !Number.isFinite(n)) continue;
    /** 작은 점수·배수 스킵 */
    if (n < 50) continue;
    if (!telegramAssetPricePlausible(symbol, n)) return false;
    if (price > 0 && !telegramPriceCompatibleWithAnchor(price, n, 3)) return false;
  }
  return true;
}

function fmt(n: number): string {
  if (!(n > 0) || !Number.isFinite(n)) return '—';
  return n >= 1000 ? n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : n.toFixed(2);
}

function distPct(price: number, mid: number): number {
  if (!(price > 0) || !(mid > 0)) return 99;
  return (Math.abs(price - mid) / price) * 100;
}

function nearBand(price: number, top: number, bot: number, padPct = 0.45): boolean {
  const lo = Math.min(top, bot);
  const hi = Math.max(top, bot);
  const pad = price * (padPct / 100);
  return price >= lo - pad && price <= hi + pad;
}

function lifeKo(z: MtfDumpZoneSpec): string {
  return (
    z.viewModel?.lifeKo ||
    z.viewModel?.faceRoleKo ||
    z.lifeState ||
    z.bandRole ||
    ''
  );
}

function overlayUltraMoney(overlays: OverlayItem[] | undefined, price: number): {
  ultra: string[];
  money: string[];
} {
  const ultra: string[] = [];
  const money: string[] = [];
  if (!overlays?.length) return { ultra, money };
  for (const o of overlays) {
    const label = String(o.label || o.zoneFaceBase || '');
    const extra = String(o.overlayZoneExtraClass || '');
    const p1 = Number(o.price1);
    const p2 = Number(o.price2);
    const mid =
      Number.isFinite(p1) && Number.isFinite(p2) ? (p1 + p2) / 2 : Number.isFinite(p1) ? p1 : NaN;
    if (!(mid > 0)) continue;
    if (distPct(price, mid) > 2.5) continue;
    const isUltra =
      /초강|초강력|ultra/i.test(label) ||
      extra.includes('rb-bounce-grade--ultra') ||
      extra.includes('strongest-analysis');
    const isMoney =
      /\$\$\$\$/.test(label) ||
      extra.includes('merged-desk-money-zone') ||
      label.includes(MONTH_DESK_MONEY_LABEL);
    if (isUltra) {
      ultra.push(`★초강 ${label.slice(0, 28)} · ${fmt(mid)}`.slice(0, 56));
    }
    if (isMoney) {
      money.push(`🛒${MONTH_DESK_MONEY_LABEL} ${label.slice(0, 24)} · ${fmt(mid)}`.slice(0, 56));
    }
    if (ultra.length >= 3 && money.length >= 3) break;
  }
  return { ultra: ultra.slice(0, 3), money: money.slice(0, 3) };
}

export function buildDoksuri1MergedDeskIntel(params: {
  symbol: string;
  timeframe: string;
  price: number;
  candles: Candle[];
  dumpZones?: MtfDumpZoneSpec[] | null;
  whale?: WhaleBeamIntelPack | null;
  analysis?: AnalyzeResponse | null;
  hqEntryZones?: HqEntryZonesPack | null;
  deskHud?: {
    mtfDumpKo?: string | null;
    mtfAlignKo?: string | null;
    hqEntryZonesKo?: string | null;
    hotZoneEntryKo?: string | null;
    aiForceZonesKo?: string | null;
    swingMidEntryKo?: string | null;
    activeTradePlanKo?: string | null;
    coreSrKo?: string | null;
    chochObPathKo?: string | null;
    projectedDownsideKo?: string | null;
    projectedUpsideKo?: string | null;
    rbLiveEntryKo?: string | null;
    rbLiveEntryGradeKo?: string | null;
    candleCardConfluenceKo?: string | null;
    candleEventVerdictKo?: string | null;
  } | null;
  masterGrade?: string | null;
  masterSide?: string | null;
}): Doksuri1MergedDeskIntel {
  const chartTf = normalizeChartTimeframe(params.timeframe);
  const price =
    sanitizeTelegramPrice(params.symbol, params.price, params.price) ?? params.price;
  const candles = params.candles ?? [];
  const lines: string[] = [];
  const moneyAnalysisKo: string[] = [];
  let candleEventLinesKo: string[] = [];
  let candleEventFingerprint = 'none';
  let candleEventWorthy = false;
  const flags = {
    nearDump: false,
    nearMoney: false,
    nearUltra: false,
    nearForce: false,
    nearWhale: false,
    candleMarkOn: false,
  };

  lines.push(`🗺 통합모드 · 차트TF ${chartTf}`);

  /** —— 폭락구간 MTF —— */
  const zones = params.dumpZones ?? [];
  const byTf = new Map<string, MtfDumpZoneSpec[]>();
  for (const z of zones) {
    const tf = normalizeChartTimeframe(z.sourceTf || chartTf);
    const list = byTf.get(tf) ?? [];
    list.push(z);
    byTf.set(tf, list);
  }
  const dumpBits: string[] = [];
  for (const tf of TF_ORDER) {
    const list = byTf.get(tf);
    if (!list?.length) continue;
    for (const z of list.slice(0, 2)) {
      const lo = Math.min(z.top, z.bot);
      const hi = Math.max(z.top, z.bot);
      const mid = z.mid || (lo + hi) / 2;
      const role =
        z.bandRole === 'ceiling' ? '저항·매도감시' : z.bandRole === 'floor' ? '지지·폭락' : '폭락';
      const near = nearBand(price, hi, lo, 0.6);
      if (near) flags.nearDump = true;
      const life = lifeKo(z);
      dumpBits.push(
        `${near ? '📍' : '·'} ${z.sourceTfKo || tf} ${role} ${fmt(lo)}~${fmt(hi)}${life ? ` · ${life}` : ''} · 거리 ${distPct(price, mid).toFixed(2)}%`
      );
    }
  }
  if (dumpBits.length) {
    lines.push(`💥 폭락구간(MTF)`);
    lines.push(...dumpBits.slice(0, 8));
  } else if (params.deskHud?.mtfDumpKo) {
    lines.push(`💥 폭락 ${params.deskHud.mtfDumpKo.slice(0, 80)}`);
  } else {
    lines.push(`💥 폭락구간 · 이번 스냅 미검출`);
  }

  /** —— $$$$ 돈구간 = 장바구니 + 분석 —— */
  try {
    const money = detectMonthDeskMoneyZones(candles, chartTf);
    const moneyLines: string[] = [];
    const nearPools: typeof money.pools = [];
    for (const p of money.pools.slice(0, 6)) {
      const botOk = sanitizeTelegramPrice(params.symbol, price, p.priceBot);
      const topOk = sanitizeTelegramPrice(params.symbol, price, p.priceTop);
      const midOk = sanitizeTelegramPrice(params.symbol, price, p.priceMid);
      if (botOk == null || topOk == null || midOk == null) continue;
      const mid = midOk;
      const near = distPct(price, mid) <= 0.8;
      if (near) {
        flags.nearMoney = true;
        nearPools.push(p);
      }
      moneyLines.push(
        `${near ? '🛒' : '·'} ${MONTH_DESK_MONEY_LABEL}${p.side === 'LONG' ? '롱' : '숏'} ${fmt(botOk)}~${fmt(topOk)} · ${(p.headlineKo || '').slice(0, 28)}`
      );
    }
    if (money.long) {
      const mid = sanitizeTelegramPrice(params.symbol, price, money.long.priceMid);
      if (mid != null && distPct(price, mid) <= 0.8) flags.nearMoney = true;
    }
    if (money.short) {
      const mid = sanitizeTelegramPrice(params.symbol, price, money.short.priceMid);
      if (mid != null && distPct(price, mid) <= 0.8) flags.nearMoney = true;
    }

    moneyAnalysisKo.push(`🛒 $$$$분석 · 참고(확정수익아님)`);
    if (nearPools.length) {
      const top = nearPools
        .slice()
        .sort((a, b) => distPct(price, a.priceMid) - distPct(price, b.priceMid))
        .slice(0, 2);
      for (const p of top) {
        moneyAnalysisKo.push(
          `· 근접 ${MONTH_DESK_MONEY_LABEL}${p.side === 'LONG' ? '롱' : '숏'} ${fmt(p.priceBot)}~${fmt(p.priceTop)} · 거리 ${distPct(price, p.priceMid).toFixed(2)}%${p.swept ? ' · 스윕' : ''}`
        );
      }
      const sides = Array.from(new Set(top.map((p) => p.side)));
      moneyAnalysisKo.push(
        sides.length > 1
          ? `· 판독 · 롱·숏 $$$$ 동시근접 · 충돌가능 · 확정전 관망`
          : `· 판독 · ${sides[0] === 'LONG' ? '롱' : '숏'} $$$$ 승부후보 · 안착·거절 확인 후`
      );
    } else if (moneyLines.length) {
      moneyAnalysisKo.push(`· 근처 $$$$ 약함 · 상·하방 장바구니만 지도에 표시`);
      moneyAnalysisKo.push(`· 판독 · 현재가 머니존 밖 · 추격진입 비권장`);
    } else {
      moneyAnalysisKo.push(`· 이번 스냅 $$$$ 미검출`);
      moneyAnalysisKo.push(`· 판독 · 머니존 대기`);
    }

    if (moneyLines.length) {
      lines.push(`🛒 돈구간·장바구니(${MONTH_DESK_MONEY_LABEL})`);
      lines.push(...moneyLines.slice(0, 4));
      lines.push(...moneyAnalysisKo.slice(0, 4));
    } else {
      lines.push(`🛒 돈구간·장바구니 · 미검출`);
      lines.push(...moneyAnalysisKo.slice(0, 3));
    }
  } catch {
    lines.push(`🛒 돈구간·장바구니 · 산출실패`);
    moneyAnalysisKo.push(`🛒 $$$$분석 · 산출실패`);
  }

  const fromOv = overlayUltraMoney(params.analysis?.overlays, price);
  if (fromOv.money.length) {
    flags.nearMoney = true;
    lines.push(...fromOv.money.map((s) => `· ${s}`));
  }
  if (fromOv.ultra.length) {
    flags.nearUltra = true;
    lines.push(`⚡ 초강·최강분석`);
    lines.push(...fromOv.ultra.map((s) => `· ${s}`));
  } else {
    lines.push(`⚡ 초강·최강분석 · 근처 면 없음`);
  }

  /** —— HQ / Hot / 마스터 —— */
  if (params.hqEntryZones?.all?.length) {
    const nearHq = params.hqEntryZones.all
      .filter((z) => {
        const t = sanitizeTelegramPrice(params.symbol, price, z.top);
        const b = sanitizeTelegramPrice(params.symbol, price, z.bot);
        if (t == null || b == null) return false;
        return nearBand(price, t, b, 0.7);
      })
      .slice(0, 3);
    if (nearHq.length) {
      flags.nearMoney = true;
      lines.push(`🎯 HQ진입자리`);
      for (const z of nearHq) {
        lines.push(
          `· ${z.side} ${z.grade} ${fmt(z.bot)}~${fmt(z.top)} · ${z.status}${z.touchedNow ? ' · 터치' : ''}`
        );
      }
    }
  } else if (params.deskHud?.hqEntryZonesKo) {
    const hq = params.deskHud.hqEntryZonesKo;
    if (hotZoneTextPlausible(params.symbol, price, hq)) {
      lines.push(`🎯 HQ ${hq.slice(0, 72)}`);
    }
  }
  if (params.deskHud?.hotZoneEntryKo) {
    const hot = params.deskHud.hotZoneEntryKo;
    if (hotZoneTextPlausible(params.symbol, price, hot)) {
      lines.push(`🔥 Hot ${hot.slice(0, 72)}`);
    } else {
      lines.push(`🔥 Hot · 가격대 불일치로 생략(참고불가)`);
    }
  }
  if (params.masterSide || params.masterGrade) {
    lines.push(
      `🏷 마스터선물 ${params.masterSide || '—'} · 등급 ${params.masterGrade || '—'} (참고)`
    );
  }
  if (params.deskHud?.swingMidEntryKo) {
    lines.push(`⚔ 스윙중투 ${params.deskHud.swingMidEntryKo.slice(0, 64)}`);
  }
  if (params.deskHud?.activeTradePlanKo) {
    lines.push(`📋 활성플랜 ${params.deskHud.activeTradePlanKo.slice(0, 64)}`);
  }
  if (params.deskHud?.mtfAlignKo) {
    lines.push(`📐 MTF정렬 ${params.deskHud.mtfAlignKo.slice(0, 56)}`);
  }
  if (params.deskHud?.coreSrKo) {
    lines.push(`🧱 핵심S/R ${params.deskHud.coreSrKo.slice(0, 64)}`);
  }
  if (params.deskHud?.chochObPathKo) {
    lines.push(`🔀 CHoCH·OB ${params.deskHud.chochObPathKo.slice(0, 56)}`);
  }
  if (params.deskHud?.projectedDownsideKo) {
    lines.push(`📉 하방투영 ${params.deskHud.projectedDownsideKo.slice(0, 56)}`);
  }
  if (params.deskHud?.projectedUpsideKo) {
    lines.push(`📈 상방투영 ${params.deskHud.projectedUpsideKo.slice(0, 56)}`);
  }
  if (params.deskHud?.rbLiveEntryKo || params.deskHud?.rbLiveEntryGradeKo) {
    lines.push(
      `💙❤️ AI띠 ${[params.deskHud.rbLiveEntryGradeKo, params.deskHud.rbLiveEntryKo]
        .filter(Boolean)
        .join(' · ')
        .slice(0, 64)}`
    );
  }
  if (params.deskHud?.candleCardConfluenceKo) {
    lines.push(`🎴 캔들합류 ${params.deskHud.candleCardConfluenceKo.slice(0, 56)}`);
  }

  /** —— 고래·세력 ZONE —— */
  try {
    const force = detectMergedDeskAiForceZones(candles, chartTf);
    const nearF = force.zones
      .filter((z) => nearBand(price, z.top, z.bot, 0.7))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
    if (nearF.length) {
      flags.nearForce = true;
      lines.push(`🧬 고래·세력ZONE(캔들·거래량)`);
      for (const z of nearF) {
        lines.push(
          `· ${z.labelKo} ${fmt(z.bot)}~${fmt(z.top)} · 점수 ${Math.round(z.score)}`
        );
      }
    } else if (force.summaryKo) {
      lines.push(`🧬 세력ZONE · ${force.summaryKo.slice(0, 56)}`);
    }
  } catch {
    /* optional */
  }
  if (params.deskHud?.aiForceZonesKo) {
    lines.push(`· ${params.deskHud.aiForceZonesKo.slice(0, 64)}`);
  }

  const w = params.whale?.live;
  if (w?.entryPrice || w?.targetPrice) {
    const e = w.entryPrice;
    const t = w.targetPrice;
    if ((e && distPct(price, e) <= 1.2) || (t && distPct(price, t) <= 1.2)) {
      flags.nearWhale = true;
    }
    lines.push(
      `🐋 고래빔 ${w.beamKo} · ${w.verdictKo}${e ? ` · E ${fmt(e)}` : ''}${t ? ` · T ${fmt(t)}` : ''}`
    );
  } else if (params.whale?.oracle?.whaleDnaKo) {
    lines.push(`🐋 ${params.whale.oracle.whaleDnaKo.slice(0, 64)}`);
  }

  /** —— 캔들 이벤트 판정 (스윕·돌파안착·지지반등) —— */
  try {
    if (candles.length >= 24) {
      const keyZones = detectMergedAnalysisKeyZones(candles, chartTf);
      const criticalZones = detectMergedCriticalZones({
        candles,
        timeframe: chartTf,
      });
      const pack = buildMergedDeskCandleEventVerdictPack({
        candles,
        timeframe: chartTf,
        symbol: params.symbol,
        dumpZones: params.dumpZones,
        hqZones: params.hqEntryZones?.all ?? null,
        keyZones,
        criticalZones,
      });
      candleEventLinesKo = pack.linesKo;
      candleEventFingerprint = pack.fingerprint;
      candleEventWorthy = candleEventEmitWorthy(pack);
      if (pack.events.length) {
        flags.candleMarkOn = true;
        lines.push(...pack.linesKo.slice(0, 5));
      } else if (params.deskHud?.candleEventVerdictKo) {
        lines.push(`📌 ${params.deskHud.candleEventVerdictKo.slice(0, 64)}`);
      }
    }
  } catch {
    lines.push(`📌 캔들이벤트 · 산출생략`);
  }

  /** —— 캔들 하단 진입 마커 (B/S/⚡ ≈ 장바구니 신호) —— */
  try {
    if (candles.length >= 30) {
      const keyZones = detectMergedAnalysisKeyZones(candles, chartTf);
      const criticalZones = detectMergedCriticalZones({
        candles,
        timeframe: chartTf,
      });
      const signals = scanMergedLeadingCandleSignals({
        candles,
        timeframe: chartTf,
        keyZones,
        criticalZones,
        analysis: params.analysis,
      });
      const lastFew = signals.slice(-4);
      if (lastFew.length) {
        flags.candleMarkOn = true;
        lines.push(`📌 캔들하단 마커(진입·장바구니형)`);
        for (const s of lastFew) {
          const emoji =
            s.tier === 'confirmed'
              ? s.direction === 'LONG'
                ? '🟢⚡'
                : '🔴⚡'
              : s.tier === 'strong'
                ? s.direction === 'LONG'
                  ? '🟢B'
                  : '🔴S'
                : s.direction === 'LONG'
                  ? '🛒B'
                  : '🛒S';
          lines.push(
            `· ${emoji} ${s.direction} · ${s.tier} · 게이트 ${s.gatesPass}${s.isLastBar ? ' · 지금봉' : ''}`
          );
        }
      } else if (!candleEventLinesKo.length) {
        lines.push(`📌 캔들하단 마커 · 최근 확정/주시 없음`);
      }
    }
  } catch {
    lines.push(`📌 캔들하단 마커 · 산출생략`);
  }

  /** 한 줄 종합 깃발 */
  const flagBits = [
    flags.nearDump ? '폭락근접' : null,
    flags.nearMoney ? '돈구간근접' : null,
    flags.nearUltra ? '초강근접' : null,
    flags.nearForce ? '세력존근접' : null,
    flags.nearWhale ? '고래근접' : null,
    flags.candleMarkOn ? '캔들마커ON' : null,
  ].filter(Boolean);
  lines.push(
    flagBits.length
      ? `✅ 합류깃발 ${flagBits.join(' · ')}`
      : `✅ 합류깃발 없음 · 관망 우선`
  );

  return {
    chartTf,
    linesKo: lines.slice(0, 36),
    moneyAnalysisKo: moneyAnalysisKo.slice(0, 5),
    candleEventLinesKo: candleEventLinesKo.slice(0, 5),
    candleEventFingerprint,
    candleEventEmitWorthy: candleEventWorthy,
    flags,
  };
}
