/**
 * 파랑빨강띠 전용 텔레그램 브리핑.
 * 롱/숏 자리 · 상승/하락 어디까지(통로·투영) — 엔진 실측만.
 * 확정 매매·수익 보장 아님.
 */
import { escapeTelegramHtml, tgHighlight, tgPrice } from '@/lib/telegramFormatHtml';
import type { MergedDeskChannelMoneyPlan } from '@/lib/mergedDeskChannelMoneyEdge';
import type { MergedDeskChannelGeom } from '@/lib/mergedDeskBlueRedChannels';
import type { MergedDeskActiveTradePlan } from '@/lib/mergedDeskActiveTradePlan';
import type { MergedDeskRbLiveEntryHub } from '@/lib/mergedDeskRbLiveEntryHub';
import {
  sanitizeTelegramPrice,
  sanitizeTelegramTradeLevels,
} from '@/lib/telegramSymbolPriceGuard';

export type TelegramRbChannelBriefInput = {
  symbol: string;
  timeframe: string;
  price: number;
  plan?: MergedDeskChannelMoneyPlan | null;
  activeTrade?: MergedDeskActiveTradePlan | null;
  geoms?: MergedDeskChannelGeom[] | null;
  liveHub?: MergedDeskRbLiveEntryHub | null;
  projectedUpsideKo?: string | null;
  projectedDownsideKo?: string | null;
  summaryKo?: string | null;
  serverAuto?: boolean;
  /** 독수리 본문에 붙일 때 레일 2줄만 */
  stub?: boolean;
};

function fmtPx(n: number): string {
  if (!(n > 0) || !Number.isFinite(n)) return '—';
  return n >= 1000 ? n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : n.toFixed(2);
}

function pickGeom(geoms: MergedDeskChannelGeom[] | null | undefined): MergedDeskChannelGeom | null {
  if (!geoms?.length) return null;
  return (
    geoms.find((g) => g.primary) ||
    geoms.find((g) => g.horizon === 'short') ||
    geoms[0] ||
    null
  );
}

function levelsLine(
  symbol: string,
  anchor: number,
  side: 'LONG' | 'SHORT',
  entry: number | null | undefined,
  sl: number | null | undefined,
  tp1: number | null | undefined,
  tp2: number | null | undefined,
  tp3: number | null | undefined
): string | null {
  const scrub = sanitizeTelegramTradeLevels(symbol, anchor, {
    entry: entry ?? null,
    sl: sl ?? null,
    tp1: tp1 ?? null,
    tp2: tp2 ?? null,
    tp3: tp3 ?? null,
  });
  if (!scrub.entry || !scrub.sl) return null;
  const bits = [
    `진입 ${fmtPx(scrub.entry)}`,
    `손절 ${fmtPx(scrub.sl)}`,
  ];
  if (scrub.tp1) bits.push(`목표 ${fmtPx(scrub.tp1)}`);
  if (scrub.tp2) bits.push(fmtPx(scrub.tp2));
  if (scrub.tp3) bits.push(fmtPx(scrub.tp3));
  return `${side === 'LONG' ? '🟢' : '🔴'} ${bits.join(' / ')}`;
}

function rbFocusSide(p: TelegramRbChannelBriefInput): 'LONG' | 'SHORT' | 'WAIT' {
  const hub = p.liveHub;
  if (hub?.side === 'LONG' || hub?.side === 'SHORT') return hub.side;
  if (p.plan?.direction === 'LONG' || p.plan?.direction === 'SHORT') return p.plan.direction;
  if (p.activeTrade?.direction === 'LONG' || p.activeTrade?.direction === 'SHORT') {
    return p.activeTrade.direction;
  }
  const g = pickGeom(p.geoms);
  if (g?.descending) return 'SHORT';
  if (g && !g.descending) return 'LONG';
  return 'WAIT';
}

/** 독수리 본문 뒤에 붙는 레일 2줄 */
export function formatTelegramRbChannelRailStubHtml(p: TelegramRbChannelBriefInput): string {
  const anchor = sanitizeTelegramPrice(p.symbol, p.price, p.price) ?? p.price;
  if (!(anchor > 0)) return '';
  const g = pickGeom(p.geoms);
  const focus = rbFocusSide(p);
  const dirKo = g
    ? g.descending
      ? '하락통로'
      : '상승통로'
    : focus === 'SHORT'
      ? '하락통로'
      : focus === 'LONG'
        ? '상승통로'
        : '통로대기';
  const emoji = focus === 'SHORT' || g?.descending ? '🔴' : focus === 'LONG' ? '🟢' : '⚪';
  const lines: string[] = [`${emoji} <b>띠</b> ${escapeTelegramHtml(dirKo)}`];
  if (g) {
    lines.push(
      `상단 ${tgPrice(fmtPx(g.tipUpper))} 숏감시 · 하단 ${tgPrice(fmtPx(g.tipLower))} 롱감시`
    );
  }
  return lines.join('\n');
}

/**
 * 파랑빨강띠 HTML — 방향 하나 · 레일·타점만.
 */
export function formatTelegramRbChannelBriefHtml(p: TelegramRbChannelBriefInput): string {
  if (p.stub) return formatTelegramRbChannelRailStubHtml(p);

  const anchor = sanitizeTelegramPrice(p.symbol, p.price, p.price) ?? p.price;
  if (!(anchor > 0)) {
    return `<i>파랑빨강띠 · 가격 검증 실패 · 생략</i>`;
  }

  const g = pickGeom(p.geoms);
  const hub = p.liveHub;
  const plan = p.plan;
  const at = p.activeTrade;
  const focus = rbFocusSide(p);
  const dirKo = g
    ? g.descending
      ? '하락통로'
      : '상승통로'
    : focus === 'SHORT'
      ? '하락통로'
      : focus === 'LONG'
        ? '상승통로'
        : '통로대기';
  const modeKo =
    hub?.entryAllowed === true && (hub.side === 'LONG' || hub.side === 'SHORT')
      ? '타점확인'
      : '자리대기';
  const emoji = focus === 'SHORT' ? '🔴' : focus === 'LONG' ? '🟢' : '⚪';
  const title =
    focus === 'SHORT' ? '숏관찰' : focus === 'LONG' ? '롱관찰' : '대기';

  const lines: string[] = [];
  lines.push(
    tgHighlight(
      `🔵🔴 띠 · ${escapeTelegramHtml(p.symbol)} · ${escapeTelegramHtml(p.timeframe)}`
    )
  );
  lines.push('━━━━━━━━━━━━━━━━');
  lines.push(
    `${emoji} <b>${escapeTelegramHtml(title)}</b> · ${escapeTelegramHtml(dirKo)} · ${escapeTelegramHtml(modeKo)}`
  );
  lines.push(`지금 ${tgPrice(fmtPx(anchor))}`);
  lines.push('지금 시장가 금지');
  if (g) {
    lines.push(
      `상단 ${tgPrice(fmtPx(g.tipUpper))} · 하단 ${tgPrice(fmtPx(g.tipLower))}`
    );
  }
  lines.push('━━━━━━━━━━━━━━━━');

  const longLv =
    plan?.direction === 'LONG'
      ? levelsLine(p.symbol, anchor, 'LONG', plan.entry, plan.stopLoss, plan.tp1, plan.tp2, plan.tp3)
      : at?.direction === 'LONG'
        ? levelsLine(p.symbol, anchor, 'LONG', at.entry, at.stopLoss, at.tp1, at.tp2, at.tp3)
        : null;
  const shortLv =
    plan?.direction === 'SHORT'
      ? levelsLine(p.symbol, anchor, 'SHORT', plan.entry, plan.stopLoss, plan.tp1, plan.tp2, plan.tp3)
      : at?.direction === 'SHORT'
        ? levelsLine(p.symbol, anchor, 'SHORT', at.entry, at.stopLoss, at.tp1, at.tp2, at.tp3)
        : null;

  if (focus === 'WAIT') {
    lines.push('', '<b>주플랜 없음 · 대기</b>');
    if (g) {
      lines.push(
        escapeTelegramHtml(
          `상단 ${fmtPx(g.tipUpper)} 거부 / 하단 ${fmtPx(g.tipLower)} 반응 · 추격 금지`
        )
      );
    }
  } else {
    const sideKo = focus === 'LONG' ? '롱' : '숏';
    lines.push('', `<b>주플랜 ${sideKo}</b>`);
    const lv = focus === 'LONG' ? longLv : shortLv;
    if (lv) {
      lines.push(escapeTelegramHtml(lv));
      const allowed =
        (plan?.direction === focus && plan.entryAllowed) ||
        (at?.direction === focus && at.entryAllowed);
      if (!allowed) lines.push('조건 미완성 → 진입금지');
    } else if (g) {
      lines.push(
        escapeTelegramHtml(
          focus === 'LONG'
            ? `하단레일 ${fmtPx(g.tipLower)} 반응 확인 후 · 추격롱 금지`
            : `상단레일 ${fmtPx(g.tipUpper)} 거부 확인 후 · 추격숏 금지`
        )
      );
    }
  }

  const inv = hub?.invalidationKo || plan?.invalidationKo;
  if (inv) lines.push(`무효 · ${escapeTelegramHtml(inv.slice(0, 72))}`);

  lines.push('', '<i>띠 조건부 참고 · 확정 매매·수익 보장 아님</i>');
  return lines.join('\n');
}

export function formatTelegramRbChannelPlainCaption(p: TelegramRbChannelBriefInput): string {
  return formatTelegramRbChannelBriefHtml(p)
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .slice(0, 900);
}

/** 통합 전황 HTML + 파랑빨강띠 (독수리 있으면 레일 2줄만) */
export function mergeTelegramHtmlWithRbChannelBrief(
  baseHtml: string,
  rbHtml: string | null | undefined
): string {
  if (!rbHtml?.trim()) return baseHtml;
  const merged = `${baseHtml}\n\n${rbHtml}`;
  if (merged.length <= 2200) return merged;
  return `${baseHtml}\n\n${rbHtml}`.slice(0, 2100);
}

export function buildTelegramRbChannelBriefFromMergedPack(params: {
  symbol: string;
  timeframe: string;
  price: number;
  pack: {
    channelMoneyPlan?: MergedDeskChannelMoneyPlan | null;
    channelGeoms?: MergedDeskChannelGeom[] | null;
    rbLiveEntryHub?: MergedDeskRbLiveEntryHub | null;
    activeTradePlan?: MergedDeskActiveTradePlan | null;
    deskHud?: {
      projectedUpsideKo?: string | null;
      projectedDownsideKo?: string | null;
      rbLiveEntryKo?: string | null;
    } | null;
  } | null | undefined;
  serverAuto?: boolean;
  stub?: boolean;
}): string | null {
  const pack = params.pack;
  if (!pack) return null;
  if (!pack.channelGeoms?.length && !pack.channelMoneyPlan && !pack.rbLiveEntryHub) {
    return null;
  }
  return formatTelegramRbChannelBriefHtml({
    symbol: params.symbol,
    timeframe: params.timeframe,
    price: params.price,
    plan: pack.channelMoneyPlan ?? null,
    activeTrade: pack.activeTradePlan ?? null,
    geoms: pack.channelGeoms ?? null,
    liveHub: pack.rbLiveEntryHub ?? null,
    projectedUpsideKo: pack.deskHud?.projectedUpsideKo ?? null,
    projectedDownsideKo: pack.deskHud?.projectedDownsideKo ?? null,
    summaryKo: pack.channelMoneyPlan?.sourceKo ?? pack.deskHud?.rbLiveEntryKo ?? null,
    serverAuto: params.serverAuto,
    stub: params.stub,
  });
}
