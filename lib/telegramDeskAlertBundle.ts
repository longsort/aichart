/**
 * 데스크 터치·확정/무효 — 심볼×TF 사이클당 1통으로 묶기.
 * 기능 삭제 없음 · 탐지기는 유지하고 발송만 합침.
 * 조건부 참고 — 승률·수익 보장 아님.
 */
import type { Candle } from '@/types';
import type { UserSettings } from '@/lib/settings';
import { telegramEventDedupServerTry } from '@/lib/telegramEventDedupServer';
import { sendTelegramHtmlCaptionToEnvChat } from '@/lib/telegramBotSendHtml';
import { sendTelegramDeskAlertPhoto } from '@/lib/telegramMergedDeskPhotoSend';
import { buildTelegramZoneTouchChartSvg } from '@/lib/telegramAlertChartImage';
import {
  buildTelegramCoreConclusionKo,
  buildTelegramDeskBriefingHtml,
  buildTelegramPhotoCaptionHtml,
  resolveTelegramGuideLevels,
  type TelegramDeskBriefingInput,
} from '@/lib/telegramAlertBriefing';
import { escapeTelegramHtml, tgHighlight, tgPrice, tgSection } from '@/lib/telegramFormatHtml';
import {
  filterTelegramPricesToSymbolScale,
  sanitizeTelegramTradeLevels,
  telegramAssetPricePlausible,
} from '@/lib/telegramSymbolPriceGuard';
import {
  instBandExtraLines,
  type TelegramAlertChartContext,
} from '@/lib/telegramMtfAlertContext';

export type DeskBundleSection = {
  /** 표시용 태그 (정밀E / 폭락경로 / HotZone …) */
  tagKo: string;
  brief: TelegramDeskBriefingInput;
  dedupeKey: string;
  cooldownMs: number;
  mid: number;
  /** 통계 카운트용 */
  statKey: 'precision' | 'zone' | 'money' | 'hq' | 'confirm' | 'tp';
};

function fmtPx(n: number): string {
  return n >= 1000 ? n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : n.toFixed(2);
}

function sanitizeBrief(brief: TelegramDeskBriefingInput): TelegramDeskBriefingInput {
  const anchor = brief.price > 0 ? brief.price : (brief.top + brief.bot) / 2;
  const lv = sanitizeTelegramTradeLevels(brief.symbol, anchor, brief.levels);
  const hasAny = lv.entry || lv.sl || lv.tp1 || lv.tp2 || lv.tp3;
  return {
    ...brief,
    levels: hasAny
      ? {
          entry: lv.entry,
          sl: lv.sl,
          tp1: lv.tp1,
          tp2: lv.tp2,
          tp3: lv.tp3,
        }
      : undefined,
  };
}

function sectionLevelsOneLine(brief: TelegramDeskBriefingInput): string {
  const g = resolveTelegramGuideLevels(brief);
  if (!g) return '';
  const eTag = brief.side === 'SHORT' ? '🔴진입' : '🟢진입';
  return `${eTag} ${fmtPx(g.entry)} · 🛑${fmtPx(g.sl)} · 🎯${fmtPx(g.tp1)}/${fmtPx(g.tp2)}/${fmtPx(g.tp3)}`;
}

/** 섹션별 dedupe 통과한 것만 남김 */
export async function claimDeskBundleSections(
  sections: DeskBundleSection[]
): Promise<{ claimed: DeskBundleSection[]; dedup: number }> {
  const claimed: DeskBundleSection[] = [];
  let dedup = 0;
  for (const s of sections) {
    const ok = await telegramEventDedupServerTry(s.dedupeKey, s.cooldownMs);
    if (!ok) {
      dedup += 1;
      continue;
    }
    claimed.push({ ...s, brief: sanitizeBrief(s.brief) });
  }
  return { claimed, dedup };
}

export function buildBundledDeskAlertHtml(
  symbol: string,
  timeframe: string,
  price: number,
  sections: DeskBundleSection[]
): string {
  if (!sections.length) return '';
  if (sections.length === 1 && sections[0]!.statKey !== 'confirm' && sections[0]!.statKey !== 'tp') {
    return buildTelegramDeskBriefingHtml(sections[0]!.brief);
  }

  const tags = sections.map((s) => s.tagKo).join(' · ');
  const lines: string[] = [
    tgHighlight(`🔔 데스크 통합 · ${escapeTelegramHtml(symbol)} ${escapeTelegramHtml(timeframe)}`),
    `<b>💰 지금</b> ${tgPrice(fmtPx(price))}`,
    `<i>📦 ${escapeTelegramHtml(tags)}</i>`,
    `<i>한 사이클 묶음 · 확정 매매·수익 보장 아님</i>`,
  ];

  const primary = sections[0]!;
  lines.push('', tgSection(primary.tagKo));
  lines.push(`<b>💡 핵심</b> ${escapeTelegramHtml(buildTelegramCoreConclusionKo(primary.brief, { withMark: false }))}`);
  const lv0 = sectionLevelsOneLine(primary.brief);
  if (lv0) lines.push(escapeTelegramHtml(lv0));
  if (primary.brief.invalidKo) {
    lines.push(`⚠ <i>${escapeTelegramHtml(String(primary.brief.invalidKo).slice(0, 72))}</i>`);
  }

  for (const s of sections.slice(1)) {
    lines.push('', `━━ <b>${escapeTelegramHtml(s.tagKo)}</b> ━━`);
    lines.push(escapeTelegramHtml(buildTelegramCoreConclusionKo(s.brief, { withMark: true }).slice(0, 140)));
    const lv = sectionLevelsOneLine(s.brief);
    if (lv) lines.push(`<i>${escapeTelegramHtml(lv)}</i>`);
    if (s.brief.invalidKo) {
      lines.push(`⚠ <i>${escapeTelegramHtml(String(s.brief.invalidKo).slice(0, 64))}</i>`);
    }
  }

  lines.push('', '<i>참고·교육용 — 승률·수익 보장 아님</i>');
  return lines.join('\n');
}

export function buildBundledDeskPhotoCaptionHtml(
  symbol: string,
  timeframe: string,
  sections: DeskBundleSection[]
): string {
  if (!sections.length) return '';
  if (sections.length === 1) {
    return buildTelegramPhotoCaptionHtml(sections[0]!.brief);
  }
  const tags = sections.map((s) => s.tagKo).slice(0, 5).join('/');
  const core = buildTelegramCoreConclusionKo(sections[0]!.brief, { withMark: true }).slice(0, 100);
  return `<b>${escapeTelegramHtml(core)}</b>\n<i>📦 ${escapeTelegramHtml(tags)} · ▼ 상세</i>`;
}

export async function sendBundledDeskAlert(params: {
  sections: DeskBundleSection[];
  symbol: string;
  timeframe: string;
  price: number;
  candles: Candle[];
  chartImageOn: boolean;
  chartContext?: TelegramAlertChartContext | null;
  settings: UserSettings;
  apiBase: string;
  /** 독수리전황 ON 시 전문 HTML (없으면 기존 간단 브리핑) */
  doksuriHtml?: string | null;
  doksuriPhotoCaptionHtml?: string | null;
  /** 독수리 전문은 사진 뒤 무조건 이어 전송 */
  forceFullFollowUp?: boolean;
}): Promise<{ ok: boolean; photo: boolean }> {
  const { sections, symbol, timeframe, price } = params;
  if (!sections.length) return { ok: false, photo: false };
  if (!telegramAssetPricePlausible(symbol, price)) return { ok: false, photo: false };

  const html =
    params.doksuriHtml && params.doksuriHtml.trim().length > 40
      ? params.doksuriHtml
      : buildBundledDeskAlertHtml(symbol, timeframe, price, sections);
  const photoHtml =
    params.doksuriPhotoCaptionHtml && params.doksuriPhotoCaptionHtml.trim().length > 10
      ? params.doksuriPhotoCaptionHtml
      : buildBundledDeskPhotoCaptionHtml(symbol, timeframe, sections);
  const primary = sections[0]!;
  const ctx = params.chartContext;
  const extraLines = filterTelegramPricesToSymbolScale(
    symbol,
    price,
    ctx ? instBandExtraLines(ctx) : [],
    (l) => l.price
  );
  const mtfZones = filterTelegramPricesToSymbolScale(
    symbol,
    price,
    ctx?.mtfZones ?? [],
    (z) => (z.top + z.bot) / 2
  );

  if (params.chartImageOn && params.candles.length >= 4) {
    const sendR = await sendTelegramDeskAlertPhoto({
      captionHtml: html,
      photoCaptionHtml: photoHtml,
      forceFullFollowUp: params.forceFullFollowUp === true || Boolean(params.doksuriHtml),
      symbol,
      timeframe,
      candles: params.candles,
      settings: params.settings,
      apiBase: params.apiBase,
      buildSvg: () => {
        const g = resolveTelegramGuideLevels(primary.brief);
        return buildTelegramZoneTouchChartSvg({
          symbol,
          timeframe,
          candles: params.candles,
          titleKo: `${primary.tagKo} · ${primary.brief.titleKo}`.slice(0, 48),
          zone: {
            top: primary.brief.top,
            bot: primary.brief.bot,
            labelKo: primary.tagKo,
            side: primary.brief.side,
          },
          currentPrice: price,
          mtfZones,
          extraLines,
          levels: g
            ? {
                entry: g.entry,
                sl: g.sl,
                tp1: g.tp1,
                tp2: g.tp2,
                tp3: g.tp3,
              }
            : undefined,
        });
      },
    });
    if (sendR.ok) return { ok: true, photo: sendR.photo };
  }

  const sent = await sendTelegramHtmlCaptionToEnvChat(html);
  return { ok: sent.ok, photo: false };
}

/** 통계 반영용 — 번들에 포함된 종류 카운트 */
export function tallyDeskBundleStats(sections: DeskBundleSection[]): {
  precision: number;
  zone: number;
  money: number;
  hq: number;
  confirm: number;
  tp: number;
} {
  const t = { precision: 0, zone: 0, money: 0, hq: 0, confirm: 0, tp: 0 };
  for (const s of sections) {
    t[s.statKey] += 1;
  }
  return t;
}
