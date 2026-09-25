/**
 * Doksuri-1 — 리스크·포지션·레버리지·스탑헌팅 참고 계산.
 * 손절 과소(노이즈폭)면 사이징·레버 숫자 비표시 · 진입 비권장.
 * 확정 매매·수익 보장 아님.
 */
import type { Doksuri1MapLevel, Doksuri1TradePlan, Doksuri1ZoneScore } from '@/lib/doksuri1/types';
import { escapeTelegramHtml, tgPrice, tgSection, tgWarn } from '@/lib/telegramFormatHtml';

export const DOKSURI1_DEFAULT_ACCOUNT_USDT = 1000;
export const DOKSURI1_DEFAULT_RISK_PCT = 5;
/** 이하면 스프레드·노이즈에 손절 털림 — 사이징 비권장 */
export const DOKSURI1_MIN_STOP_PCT_FOR_SIZING = 0.35;
/** 텔레에 찍는 레버 참고 상한(선물 실무) */
export const DOKSURI1_MAX_DISPLAY_LEVERAGE = 20;
/** RR이 이보다 크면 손절 과밀로 부풀린 값으로 간주 */
export const DOKSURI1_MAX_SANE_RR = 8;

export type Doksuri1RiskPrefs = {
  accountUsdt: number;
  riskPct: number;
};

export type Doksuri1PlanRiskPack = {
  direction: 'LONG' | 'SHORT';
  entry: number;
  stopLoss: number;
  tp1: number | null;
  tp2: number | null;
  tp3: number | null;
  rr: number | null;
  accountUsdt: number;
  riskPct: number;
  riskUsdt: number;
  stopDistPct: number;
  maxNotionalUsdt: number;
  leverageIfMarginEqRisk: number;
  leverageIfMarginEqCapital: number;
  suggestLeverageCap: number;
  qtyApprox: number;
  huntLevels: Array<{ price: number; labelKo: string }>;
  /** 손절 과소·RR 과대 · 사이징/진입 비권장 */
  sizingUnsafe: boolean;
  entryNotRecommended: boolean;
  warningsKo: string[];
  planStatus: string;
};

function fmtPx(n: number): string {
  if (!(n > 0) || !Number.isFinite(n)) return '—';
  return n >= 1000 ? n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : n.toFixed(2);
}

function fmtPct(p: number): string {
  const sign = p > 0 ? '+' : '';
  return `${sign}${p.toFixed(2)}%`;
}

function pctMove(from: number, to: number): number | null {
  if (!(from > 0) || !(to > 0) || !Number.isFinite(from) || !Number.isFinite(to)) return null;
  return ((to - from) / from) * 100;
}

export function resolveDoksuri1RiskPrefs(raw?: {
  accountUsdt?: number | null;
  riskPct?: number | null;
} | null): Doksuri1RiskPrefs {
  const accountUsdt = Math.max(
    50,
    Math.min(1_000_000, Number(raw?.accountUsdt) || DOKSURI1_DEFAULT_ACCOUNT_USDT)
  );
  const riskPct = Math.max(
    0.5,
    Math.min(10, Number(raw?.riskPct) || DOKSURI1_DEFAULT_RISK_PCT)
  );
  return { accountUsdt, riskPct };
}

export function pickStopHuntLevels(params: {
  direction: 'LONG' | 'SHORT';
  entry: number;
  stopLoss: number;
  mapLevels?: Doksuri1MapLevel[] | null;
  zoneScores?: Doksuri1ZoneScore[] | null;
}): Array<{ price: number; labelKo: string }> {
  const { direction, entry, stopLoss } = params;
  if (!(entry > 0) || !(stopLoss > 0)) return [];
  const out: Array<{ price: number; labelKo: string }> = [];
  const push = (price: number | null | undefined, labelKo: string) => {
    if (price == null || !(price > 0) || !Number.isFinite(price)) return;
    if (direction === 'LONG') {
      if (!(price < stopLoss)) return;
    } else if (!(price > stopLoss)) return;
    const near = out.find((x) => Math.abs(x.price - price) / Math.max(price, 1) < 0.001);
    if (near) return;
    out.push({ price, labelKo: labelKo.slice(0, 36) });
  };

  for (const m of params.mapLevels ?? []) {
    if (m.kind === 'now') continue;
    const tag =
      m.kind === 'liq'
        ? '유동성·스톱'
        : m.kind === 'support'
          ? '지지너머'
          : m.kind === 'resist'
            ? '저항너머'
            : m.labelKo || '맵';
    push(m.price, `🪤 ${tag}`);
    if (m.priceHi != null) push(m.priceHi, `🪤 ${tag}`);
  }
  for (const z of params.zoneScores ?? []) {
    const lo = Math.min(z.top, z.bot);
    const hi = Math.max(z.top, z.bot);
    if (direction === 'LONG') push(lo, `🪤 ${z.labelKo} 하단`);
    else push(hi, `🪤 ${z.labelKo} 상단`);
  }

  const buf = direction === 'LONG' ? stopLoss * 0.997 : stopLoss * 1.003;
  push(buf, '🪤 SL너머 버퍼(참고)');

  out.sort((a, b) =>
    direction === 'LONG' ? b.price - a.price : a.price - b.price
  );
  return out.slice(0, 4);
}

export function buildDoksuri1PlanRisk(params: {
  plan: Doksuri1TradePlan;
  prefs: Doksuri1RiskPrefs;
  mapLevels?: Doksuri1MapLevel[] | null;
  zoneScores?: Doksuri1ZoneScore[] | null;
}): Doksuri1PlanRiskPack | null {
  const { plan, prefs } = params;
  const entry = plan.entry;
  const sl = plan.stopLoss;
  if (entry == null || sl == null || !(entry > 0) || !(sl > 0)) return null;
  if (plan.direction === 'LONG' && !(sl < entry)) return null;
  if (plan.direction === 'SHORT' && !(sl > entry)) return null;

  const stopDist = Math.abs(entry - sl);
  const stopDistPct = (stopDist / entry) * 100;
  if (!(stopDistPct > 0.02) || !(stopDistPct < 25)) return null;

  const riskUsdt = prefs.accountUsdt * (prefs.riskPct / 100);
  const maxNotionalUsdt = riskUsdt / (stopDistPct / 100);
  const qtyApprox = stopDist > 0 ? riskUsdt / stopDist : 0;
  const leverageIfMarginEqRisk = riskUsdt > 0 ? maxNotionalUsdt / riskUsdt : 0;
  const leverageIfMarginEqCapital =
    prefs.accountUsdt > 0 ? maxNotionalUsdt / prefs.accountUsdt : 0;

  const warningsKo: string[] = [];
  const stopTooTight = stopDistPct < DOKSURI1_MIN_STOP_PCT_FOR_SIZING;
  const rrInflated = plan.rr != null && plan.rr > DOKSURI1_MAX_SANE_RR;
  const tooLate =
    plan.status === 'TOO_LATE' || plan.status === 'INVALID' || plan.chaseForbidden;

  if (stopTooTight) {
    warningsKo.push(
      `손절폭 ${stopDistPct.toFixed(2)}% < ${DOKSURI1_MIN_STOP_PCT_FOR_SIZING}% · 노이즈·스프레드에 털림 위험 · 사이징/레버 숫자 비권장`
    );
  }
  if (rrInflated) {
    warningsKo.push(`RR ${plan.rr} 과대 · 손절 과밀로 부풀린 값 가능 · 구조 SL 재검토`);
  }
  if (tooLate) {
    warningsKo.push(`${plan.status} · 추격·즉시진입 비권장`);
  }

  const sizingUnsafe = stopTooTight || rrInflated;
  const entryNotRecommended = sizingUnsafe || tooLate || plan.status === 'WAIT_CONFIRMATION';

  const rawLevCap = Math.max(
    1,
    Math.min(DOKSURI1_MAX_DISPLAY_LEVERAGE, Math.ceil(leverageIfMarginEqCapital * 10) / 10)
  );
  const suggestLeverageCap = sizingUnsafe
    ? Math.min(5, rawLevCap)
    : rawLevCap;

  return {
    direction: plan.direction,
    entry,
    stopLoss: sl,
    tp1: plan.tp1,
    tp2:
      plan.tp2 != null &&
      plan.tp1 != null &&
      Math.abs(plan.tp2 - plan.tp1) / Math.max(plan.tp1, 1) < 0.0005
        ? null
        : plan.tp2,
    tp3: plan.tp3,
    rr: plan.rr,
    accountUsdt: prefs.accountUsdt,
    riskPct: prefs.riskPct,
    riskUsdt,
    stopDistPct,
    maxNotionalUsdt,
    leverageIfMarginEqRisk,
    leverageIfMarginEqCapital,
    suggestLeverageCap,
    qtyApprox,
    huntLevels: pickStopHuntLevels({
      direction: plan.direction,
      entry,
      stopLoss: sl,
      mapLevels: params.mapLevels,
      zoneScores: params.zoneScores,
    }),
    sizingUnsafe,
    entryNotRecommended,
    warningsKo,
    planStatus: plan.status,
  };
}

export function formatDoksuri1PlanRiskHtml(pack: Doksuri1PlanRiskPack): string[] {
  const dirEmoji = pack.direction === 'LONG' ? '🟢' : '🔴';
  const lines: string[] = [];
  lines.push(
    `${dirEmoji} <b>${pack.direction} 리스크·사이징</b> · ⚔️E ${tgPrice(fmtPx(pack.entry))} · 🛑SL ${tgPrice(fmtPx(pack.stopLoss))} · <code>${escapeTelegramHtml(pack.planStatus)}</code>`
  );

  for (const w of pack.warningsKo) {
    lines.push(tgWarn(w));
  }

  const e = pack.entry;
  const moveRows: string[] = [];
  if (pack.tp1 != null) {
    const p = pctMove(e, pack.tp1);
    if (p != null) {
      moveRows.push(
        p >= 0
          ? `🟢 🎯TP1 ${fmtPx(pack.tp1)} → ${fmtPct(p)}`
          : `🔴 🎯TP1 ${fmtPx(pack.tp1)} → ${fmtPct(p)}`
      );
    }
  }
  if (pack.tp2 != null) {
    const p = pctMove(e, pack.tp2);
    if (p != null) {
      moveRows.push(
        p >= 0
          ? `🟢 🎯TP2 ${fmtPx(pack.tp2)} → ${fmtPct(p)}`
          : `🔴 🎯TP2 ${fmtPx(pack.tp2)} → ${fmtPct(p)}`
      );
    }
  }
  if (pack.tp3 != null) {
    const p = pctMove(e, pack.tp3);
    if (p != null) {
      moveRows.push(
        p >= 0
          ? `🟢 🎯TP3 ${fmtPx(pack.tp3)} → ${fmtPct(p)}`
          : `🔴 🎯TP3 ${fmtPx(pack.tp3)} → ${fmtPct(p)}`
      );
    }
  }
  {
    const p = pctMove(e, pack.stopLoss);
    if (p != null) moveRows.push(`🔴 🛑SL ${fmtPx(pack.stopLoss)} → ${fmtPct(p)} (손절폭)`);
  }
  if (pack.rr != null) {
    moveRows.push(
      pack.sizingUnsafe
        ? `📐 RR ${pack.rr} (참고만 · 과대 가능)`
        : `📐 RR ${pack.rr} (TP1 기준 · 참고)`
    );
  }
  for (const r of moveRows) lines.push(`· <b>${escapeTelegramHtml(r)}</b>`);

  lines.push(
    `💰 예시자본 ${fmtPx(pack.accountUsdt)}USDT · 리스크 <b>${pack.riskPct}%</b>(${fmtPx(pack.riskUsdt)}USDT)`
  );

  if (pack.sizingUnsafe) {
    lines.push(
      `🚫 <b>사이징 보류</b> · 손절폭 ${pack.stopDistPct.toFixed(2)}% · 레버 ${pack.leverageIfMarginEqRisk.toFixed(0)}x급 숫자는 <b>무시</b>`
    );
    lines.push(
      `· 최소 손절폭 참고 ≥${DOKSURI1_MIN_STOP_PCT_FOR_SIZING}% (ATR·존 바깥) 후 재계산`
    );
    lines.push(`⛔ <b>이 플랜으로 즉시 진입 비권장</b>`);
  } else {
    lines.push(
      `🧮 손절폭 <b>${pack.stopDistPct.toFixed(2)}%</b> → 최대포지션 <b>${fmtPx(pack.maxNotionalUsdt)}USDT</b>`
    );
    lines.push(
      `· 식: ${fmtPx(pack.riskUsdt)} ÷ ${pack.stopDistPct.toFixed(2)}% ≈ ${fmtPx(pack.maxNotionalUsdt)}USDT`
    );
    lines.push(
      `📊 수량참고 ≈ <code>${pack.qtyApprox >= 1 ? pack.qtyApprox.toFixed(4) : pack.qtyApprox.toFixed(6)}</code>`
    );
    lines.push(
      `⚡ 레버참고 · 마진=자본시 ≈<b>${Math.min(pack.leverageIfMarginEqCapital, DOKSURI1_MAX_DISPLAY_LEVERAGE).toFixed(2)}x</b>` +
        (pack.leverageIfMarginEqCapital > DOKSURI1_MAX_DISPLAY_LEVERAGE
          ? ` (계산 ${pack.leverageIfMarginEqCapital.toFixed(1)}x → 표시상한 ${DOKSURI1_MAX_DISPLAY_LEVERAGE}x)`
          : '')
    );
    lines.push(
      `✅ 권장: 레버 ≤ <b>${pack.suggestLeverageCap}x</b> · <b>노셔널 ≤ ${fmtPx(pack.maxNotionalUsdt)}USDT</b> · 청산가가 SL 침범 금지`
    );
  }

  lines.push(
    tgWarn(
      '선물: 펀딩·청산·갭·슬리피지 · 계산값≠실체결 · 청산이 SL보다 가깝지 않게'
    )
  );

  if (pack.huntLevels.length && !pack.sizingUnsafe) {
    lines.push(`🪤 <b>스탑헌팅 자리(SL 너머 · 실측후보)</b>`);
    for (const h of pack.huntLevels) {
      lines.push(`· ${tgPrice(fmtPx(h.price))}  ${escapeTelegramHtml(h.labelKo)}`);
    }
    lines.push(`<i>헌팅 터치만으로 진입 금지 · 회수·거절 확인 후</i>`);
  }

  return lines;
}

export function formatDoksuri1PlanEmojiLine(plan: Doksuri1TradePlan): string {
  const dirEmoji = plan.direction === 'LONG' ? '🟢' : '🔴';
  if (!plan.entry && !plan.stopLoss) {
    return `${dirEmoji} ${plan.direction} · ${plan.status} · 레벨 미산출`;
  }
  const bits = [`${dirEmoji} ${plan.direction} · ${plan.status}`];
  if (plan.entry != null) bits.push(`⚔️E ${fmtPx(plan.entry)}`);
  if (plan.stopLoss != null) bits.push(`🛑 ${fmtPx(plan.stopLoss)}`);
  if (plan.tp1 != null) bits.push(`🎯 ${fmtPx(plan.tp1)}`);
  if (
    plan.tp2 != null &&
    !(plan.tp1 != null && Math.abs(plan.tp2 - plan.tp1) / Math.max(plan.tp1, 1) < 0.0005)
  ) {
    bits.push(`🎯 ${fmtPx(plan.tp2)}`);
  }
  if (plan.tp3 != null) bits.push(`🎯 ${fmtPx(plan.tp3)}`);
  if (plan.rr != null) bits.push(`RR ${plan.rr}`);
  if (plan.chaseForbidden) bits.push('⛔추격금지');
  return bits.join(' · ');
}

export function mapLevelEmoji(kind: Doksuri1MapLevel['kind']): string {
  switch (kind) {
    case 'resist':
      return '🔴';
    case 'support':
      return '🟢';
    case 'pivot':
      return '🟠';
    case 'now':
      return '💰';
    case 'whale':
      return '🧬';
    case 'liq':
      return '🪤';
    default:
      return '📍';
  }
}

export function formatDoksuri1RiskSectionTitle(): string {
  return tgSection('리스크·포지션·레버');
}
