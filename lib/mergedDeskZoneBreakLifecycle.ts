/**
 * Zone 돌파 수명주기 — 숏존을 위로 종가 돌파하면 활성 숏 라벨 유지 금지.
 * zone-engine: CONFIRMED → BROKEN/INVALID (가격 경계 고정, 상태만 변경).
 * 확정 수익·승률 아님. 조건부 참고.
 */
import type { Candle, OverlayItem } from '@/types';

export type ZoneBreakSide = 'bull_break' | 'bear_break' | null;

export type ZoneBreakVerdict = {
  side: ZoneBreakSide;
  /** 면 라벨 (숏존 대신) */
  faceKo: string;
  /** 툴팁 */
  tipKo: string;
  /** CSS */
  extraClass: string;
};

function zoneBounds(item: OverlayItem): { top: number; bot: number } | null {
  const p1 = Number(item.price1);
  const p2 = Number(item.price2);
  if (!Number.isFinite(p1) || !Number.isFinite(p2)) return null;
  return { top: Math.max(p1, p2), bot: Math.min(p1, p2) };
}

/** 숏/공급/저항 계열인지 (라벨·bias·kind) */
export function isShortBiasZoneOverlay(item: OverlayItem): boolean {
  const bias = String(item.structureBias || '');
  const kind = String(item.kind || '');
  const id = String(item.id || '');
  const extra = String(item.overlayZoneExtraClass || '');
  const label = String(item.label || item.zoneFaceBase || '');
  if (bias === 'bearish') return true;
  if (kind === 'supplyZone') return true;
  if (/resist|supply|ob-bear|short|숏|매도|폭락감시|폭등감시/.test(`${id} ${extra} ${label}`)) {
    if (/support|demand|ob-bull|long|롱|매수|반등지지/.test(`${id} ${extra}`) && bias === 'bullish') {
      return false;
    }
    if (/숏존|공급|저항|숏\s|폭락감시|폭등감시|supply|resist|ob-bear/i.test(`${label} ${extra} ${id}`)) {
      return true;
    }
  }
  return false;
}

export function isLongBiasZoneOverlay(item: OverlayItem): boolean {
  if (isShortBiasZoneOverlay(item)) return false;
  const bias = String(item.structureBias || '');
  const kind = String(item.kind || '');
  const id = String(item.id || '');
  const extra = String(item.overlayZoneExtraClass || '');
  const label = String(item.label || item.zoneFaceBase || '');
  if (bias === 'bullish') return true;
  if (kind === 'demandZone') return true;
  return /support|demand|ob-bull|long|롱|매수|반등지지/.test(`${id} ${extra} ${label}`);
}

/**
 * 최근 확정봉 기준 돌파 판정.
 * 숏존: 종가 > zoneTop → bull_break
 * 롱존: 종가 < zoneBot → bear_break
 * wick만 뚫고 종가 미확정이면 null (리페인트 완화)
 */
export function evaluateZoneBreakByClose(
  item: OverlayItem,
  candles: Candle[],
  opts?: { bufferPct?: number }
): ZoneBreakVerdict | null {
  const bounds = zoneBounds(item);
  if (!bounds || candles.length < 2) return null;
  const { top, bot } = bounds;
  if (!(top > bot)) return null;

  const buf = Math.max(0, Number(opts?.bufferPct) || 0.00015);
  /** 형성 직후 미완성 봉만 있으면 직전 확정봉 우선 */
  const last = candles[candles.length - 1]!;
  const prev = candles[candles.length - 2]!;
  const close = Number(last.close);
  const confirmClose = Number.isFinite(close) ? close : Number(prev.close);
  if (!(confirmClose > 0)) return null;

  const shortZ = isShortBiasZoneOverlay(item);
  const longZ = isLongBiasZoneOverlay(item);

  if (shortZ && confirmClose > top * (1 + buf)) {
    return {
      side: 'bull_break',
      faceKo: '숏돌파',
      tipKo: `종가 ${Math.round(confirmClose)} > 숏존 상단 ${Math.round(top)} — 숏존 무효·돌파 완료(조건부). 활성 숏 시나리오 아님.`,
      extraClass: 'merged-desk-zone-broken merged-desk-zone-broken--bull',
    };
  }
  if (longZ && confirmClose < bot * (1 - buf)) {
    return {
      side: 'bear_break',
      faceKo: '롱이탈',
      tipKo: `종가 ${Math.round(confirmClose)} < 롱존 하단 ${Math.round(bot)} — 롱존 무효·이탈(조건부). 활성 롱 시나리오 아님.`,
      extraClass: 'merged-desk-zone-broken merged-desk-zone-broken--bear',
    };
  }
  return null;
}

function stripActiveShortLongTokens(label: string): string {
  return String(label || '')
    .replace(/숏존/g, '')
    .replace(/롱존/g, '')
    .replace(/^\s*숏\s+/g, '')
    .replace(/^\s*롱\s+/g, '')
    .replace(/·+/g, '·')
    .replace(/^·|·$/g, '')
    .trim();
}

/** 단일 오버레이에 돌파 상태 스탬프 */
export function stampZoneBreakOnOverlay(item: OverlayItem, verdict: ZoneBreakVerdict): OverlayItem {
  const extra = String(item.overlayZoneExtraClass || '')
    .split(/\s+/)
    .filter((c) => c && !c.startsWith('merged-desk-zone-broken'));
  extra.push(...verdict.extraClass.split(/\s+/).filter(Boolean));

  const priorTip = String(item.labelTooltip || '').trim();
  const rest = stripActiveShortLongTokens(String(item.label || item.zoneFaceBase || ''));
  const face = rest && !/돌파|이탈|무효/.test(rest) ? `${verdict.faceKo}·${rest}` : verdict.faceKo;

  return {
    ...item,
    label: face,
    zoneFaceBase: verdict.faceKo,
    zoneFaceSignal: verdict.side === 'bull_break' ? '상향돌파' : '하향이탈',
    structureBias: verdict.side === 'bull_break' ? 'bullish' : 'bearish',
    confidence: Math.min(Number(item.confidence) || 50, 42),
    color:
      verdict.side === 'bull_break'
        ? 'rgba(52,211,153,0.10)'
        : 'rgba(248,113,113,0.10)',
    labelBackgroundColor:
      verdict.side === 'bull_break' ? 'rgba(6,78,59,0.75)' : 'rgba(127,29,29,0.75)',
    labelTextColor: '#e2e8f0',
    labelTooltip: priorTip ? `${priorTip} · ${verdict.tipKo}` : verdict.tipKo,
    overlayZoneExtraClass: extra.join(' '),
  };
}

const ZONE_KINDS = new Set([
  'zone',
  'demandZone',
  'supplyZone',
  'ob',
  'fvg',
  'reactionZone',
  'box',
]);

/**
 * 차트 오버레이 전체에 돌파 수명주기 적용.
 * 이미 broken 스탬프된 항목도 재평가(가격 갱신).
 */
export function applyMergedDeskZoneBreakLifecycle(
  overlays: OverlayItem[],
  candles: Candle[]
): OverlayItem[] {
  if (!overlays.length || candles.length < 2) return overlays;
  return overlays.map((raw) => {
    const kind = String(raw.kind || '');
    if (!ZONE_KINDS.has(kind)) return raw;
    const id = String(raw.id || '');
    /** 진입/손절/TP 레일·가격선은 존 돌파 규칙 제외 */
    if (
      id.includes('trade-rail') ||
      id.includes('-e-') ||
      id.includes('-sl-') ||
      id.includes('-tp') ||
      id.includes('invalid')
    ) {
      return raw;
    }
    const verdict = evaluateZoneBreakByClose(raw, candles);
    if (!verdict) return raw;
    return stampZoneBreakOnOverlay(raw, verdict);
  });
}
