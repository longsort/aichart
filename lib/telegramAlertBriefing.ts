/**
 * 텔레그램 알림 — 핵심 먼저 (결과 롱/숏 · 진입/손절/목표 색 강조).
 * 텔레그램은 글자색 미지원 → 🟢롱 / 🔴숏 이모지로 구분.
 * 조건부 참고 — 승률·수익 보장·투자 권유 아님.
 */
import {
  escapeTelegramHtml,
  tgHighlight,
  tgPrice,
  tgSection,
  tgWarn,
} from '@/lib/telegramFormatHtml';
import type { TelegramPlaybookPhase } from '@/lib/telegramSignalPlaybook';
import { sanitizeTelegramPrice } from '@/lib/telegramSymbolPriceGuard';

function fmtPx(n: number): string {
  return n >= 1000 ? n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : n.toFixed(2);
}

function pctDist(price: number, mid: number): string {
  if (!(price > 0) || !(mid > 0)) return '—';
  const p = ((price - mid) / mid) * 100;
  const sign = p > 0 ? '+' : '';
  return `${sign}${p.toFixed(2)}%`;
}

function pctMove(from: number, to: number): string {
  if (!(from > 0) || !(to > 0)) return '';
  const p = ((to - from) / from) * 100;
  const sign = p > 0 ? '+' : '';
  return `${sign}${p.toFixed(2)}%`;
}

/** 폭락존 — 거래량·반등/하락 한눈 */
export type TelegramDumpGlanceBrief = {
  oneLookKo: string;
  volumeLineKo: string;
  bounceLineKo: string;
  dumpLineKo: string;
  structureLineKo: string;
  /** zone 터치 횟수 · 반등/거부 조건부 */
  touchProbLineKo?: string;
};

export type TelegramDeskBriefingInput = {
  emoji: string;
  kindKo: string;
  symbol: string;
  timeframe: string;
  titleKo: string;
  side?: 'LONG' | 'SHORT' | 'WAIT';
  top: number;
  bot: number;
  price: number;
  detailKo: string;
  briefingKo?: string;
  mtfSummaryKo?: string;
  invalidKo?: string;
  levels?: {
    entry?: number | null;
    sl?: number | null;
    tp1?: number | null;
    tp2?: number | null;
    tp3?: number | null;
  };
  mtfZoneLines?: string[];
  phase?: TelegramPlaybookPhase;
  dumpGlance?: TelegramDumpGlanceBrief;
  /** 지지 → 반등가능 → 저항 */
  pathKo?: string;
  scenarioKo?: string;
};

/** MTF 문구 중복·반복 제거 (같은 반등가능 문구 여러 번 붙는 문제) */
export function compactTelegramMtfSummary(raw: string | null | undefined, maxParts = 3): string {
  const s = String(raw || '')
    .trim()
    .replace(/반등확률/g, '도달조건부');
  if (!s) return '';
  const parts = s
    .split(/\s*·\s*/)
    .map((x) => x.trim())
    .filter(Boolean);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const p of parts) {
    const key = p.replace(/\s+/g, '').replace(/반등가능/g, '반등').slice(0, 28);
    if (seen.has(key)) continue;
    let dup = false;
    for (const k of seen) {
      if (key.includes(k) || k.includes(key)) {
        dup = true;
        break;
      }
    }
    if (dup) continue;
    seen.add(key);
    out.push(p);
    if (out.length >= maxParts) break;
  }
  return out.join(' · ');
}

function sideResultKo(side?: 'LONG' | 'SHORT' | 'WAIT'): string {
  if (side === 'LONG') return '롱';
  if (side === 'SHORT') return '숏';
  return '관찰';
}

function sideVerbKo(side?: 'LONG' | 'SHORT' | 'WAIT'): string {
  if (side === 'LONG') return '반등·매수 쪽 관찰';
  if (side === 'SHORT') return '하락·매도 쪽 관찰';
  return '방향 미확정 · 추격 금지';
}

function actionOneLine(p: TelegramDeskBriefingInput): string {
  const phase = p.phase ?? 'touch';
  if (p.side === 'LONG') {
    return phase === 'approach'
      ? '⏳ 접근중 → 🚫 추격매수 금지 · ✅ 안착·아랫꼬리 확인'
      : '📍 지지 터치 → ✅ 안착 후 분할 · 🛑 종가 이탈 시 축소';
  }
  if (p.side === 'SHORT') {
    return phase === 'approach'
      ? '⏳ 접근중 → 🚫 추격매도 금지 · ✅ 거부·윗꼬리 확인'
      : '📍 저항 터치 → ✅ 거부 후 분할 · 🛑 종가 돌파 시 축소';
  }
  return '👀 관망 · 터치·이탈만 주시';
}

/** levels 없으면 구간으로 선물 참고가 생성 (확정 아님). BTC/ETH 혼입 가격은 버림. */
export function resolveTelegramGuideLevels(p: TelegramDeskBriefingInput): {
  entry: number;
  sl: number;
  tp1: number;
  tp2: number;
  tp3: number;
  guided: boolean;
} | null {
  const anchor = p.price > 0 ? p.price : (Number(p.top) + Number(p.bot)) / 2;
  const pick = (n: number | null | undefined, fallback: number): number => {
    const ok = sanitizeTelegramPrice(p.symbol, anchor, n);
    if (ok != null) return ok;
    const fb = sanitizeTelegramPrice(p.symbol, anchor, fallback);
    return fb != null ? fb : fallback;
  };

  const lv = p.levels;
  if (lv && (lv.entry || lv.sl || lv.tp1)) {
    const midZ = (p.top + p.bot) / 2;
    const entryRaw = Number(lv.entry) > 0 ? Number(lv.entry) : midZ;
    const entry = pick(entryRaw, midZ);
    const width = Math.max(Math.abs(p.top - p.bot), entry * 0.004);
    const slFb =
      p.side === 'SHORT' ? Math.max(p.top, p.bot) + width * 0.35 : Math.min(p.top, p.bot) - width * 0.35;
    const tp1Fb = p.side === 'SHORT' ? entry - width : entry + width;
    const tp2Fb = p.side === 'SHORT' ? entry - width * 2 : entry + width * 2;
    const tp3Fb = p.side === 'SHORT' ? entry - width * 3 : entry + width * 3;
    const entryOk = sanitizeTelegramPrice(p.symbol, anchor, entryRaw);
    const guided = entryOk == null && !(sanitizeTelegramPrice(p.symbol, anchor, lv.sl) || sanitizeTelegramPrice(p.symbol, anchor, lv.tp1));
    return {
      entry,
      sl: pick(Number(lv.sl) > 0 ? Number(lv.sl) : null, slFb),
      tp1: pick(Number(lv.tp1) > 0 ? Number(lv.tp1) : null, tp1Fb),
      tp2: pick(Number(lv.tp2) > 0 ? Number(lv.tp2) : null, tp2Fb),
      tp3: pick(Number(lv.tp3) > 0 ? Number(lv.tp3) : null, tp3Fb),
      guided: Boolean(guided),
    };
  }
  if (!(p.top > 0) || !(p.bot > 0) || p.side === 'WAIT' || !p.side) return null;
  if (anchor > 0 && !sanitizeTelegramPrice(p.symbol, anchor, (p.top + p.bot) / 2)) return null;
  const hi = Math.max(p.top, p.bot);
  const lo = Math.min(p.top, p.bot);
  const mid = (hi + lo) / 2;
  const width = Math.max(hi - lo, mid * 0.004);
  if (p.side === 'LONG') {
    return {
      entry: mid,
      sl: lo - width * 0.35,
      tp1: mid + width,
      tp2: mid + width * 2,
      tp3: mid + width * 3,
      guided: true,
    };
  }
  return {
    entry: mid,
    sl: hi + width * 0.35,
    tp1: mid - width,
    tp2: mid - width * 2,
    tp3: mid - width * 3,
    guided: true,
  };
}

function levelsPlainBits(p: TelegramDeskBriefingInput): string {
  const g = resolveTelegramGuideLevels(p);
  if (!g) return '';
  const base = g.entry;
  const eTag = p.side === 'SHORT' ? '🔴진입' : '🟢진입';
  const bits = [
    `${eTag} ${fmtPx(g.entry)}`,
    `🛑손절 ${fmtPx(g.sl)}${pctMove(base, g.sl) ? `(${pctMove(base, g.sl)})` : ''}`,
    `🎯TP1 ${fmtPx(g.tp1)}${pctMove(base, g.tp1) ? `(${pctMove(base, g.tp1)})` : ''}`,
    `🎯TP2 ${fmtPx(g.tp2)}`,
    `🎯TP3 ${fmtPx(g.tp3)}`,
  ];
  return bits.join(' · ');
}

/** 사진 캡션·본문 공통 — BTC/ETH 한눈에 보는 결론 (이모지 필수) */
export function buildTelegramCoreConclusionKo(
  p: TelegramDeskBriefingInput,
  opts?: { withMark?: boolean }
): string {
  const sideKo = sideResultKo(p.side);
  const withMark = opts?.withMark !== false;
  const mark = p.side === 'LONG' ? '🟢' : p.side === 'SHORT' ? '🔴' : '🟡';
  const titleShort = String(p.titleKo || '')
    .replace(/\s+/g, ' ')
    .replace(/반등확률/g, '도달조건부')
    .slice(0, 36);
  const glance = p.dumpGlance?.oneLookKo
    ? String(p.dumpGlance.oneLookKo)
        .replace(/반등확률/g, '도달조건부')
        .replace(/\s+/g, ' ')
        .replace(/^[🟢🔴🟡]\s*/, '')
        .slice(0, 40)
    : '';
  const pathBit = p.scenarioKo || (p.pathKo ? p.pathKo.split('·')[0]?.trim() : '');
  const supportBit =
    p.side === 'LONG'
      ? `🛡지지 ${fmtPx(Math.min(p.top, p.bot))}~${fmtPx(Math.max(p.top, p.bot))}`
      : p.side === 'SHORT'
        ? `🧱저항 ${fmtPx(Math.min(p.top, p.bot))}~${fmtPx(Math.max(p.top, p.bot))}`
        : '';
  const core =
    glance ||
    [titleShort, pathBit, supportBit]
      .filter(Boolean)
      .join(' · ')
      .slice(0, 78);
  const body = `📌 ${p.symbol} ${p.timeframe} · ${sideKo} · ${p.kindKo} — ${core}`.slice(0, 140);
  return withMark ? `${mark} ${body}` : body;
}

function compactMtfZoneLines(lines: string[] | undefined, max = 2): string[] {
  if (!lines?.length) return [];
  return lines.slice(0, max).map((x) =>
    String(x)
      .replace(/반등확률/g, '도달조건부')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 56)
  );
}

function coloredLevelsHtml(p: TelegramDeskBriefingInput): string[] {
  const g = resolveTelegramGuideLevels(p);
  if (!g) return [];
  const base = g.entry;
  const eTag = p.side === 'SHORT' ? '🔴' : '🟢';
  const lines: string[] = [
    '',
    tgSection('선물 가격'),
    `${eTag} <b>진입</b> ${tgPrice(fmtPx(g.entry))}`,
    `🛑 <b>손절</b> ${tgPrice(fmtPx(g.sl))}${pctMove(base, g.sl) ? ` <i>(${escapeTelegramHtml(pctMove(base, g.sl))})</i>` : ''}`,
    `🎯 <b>TP1</b> ${tgPrice(fmtPx(g.tp1))}${pctMove(base, g.tp1) ? ` <i>(${escapeTelegramHtml(pctMove(base, g.tp1))})</i>` : ''}`,
    `🎯 <b>TP2</b> ${tgPrice(fmtPx(g.tp2))}${pctMove(base, g.tp2) ? ` <i>(${escapeTelegramHtml(pctMove(base, g.tp2))})</i>` : ''}`,
    `🎯 <b>TP3</b> ${tgPrice(fmtPx(g.tp3))}${pctMove(base, g.tp3) ? ` <i>(${escapeTelegramHtml(pctMove(base, g.tp3))})</i>` : ''}`,
    g.guided
      ? `<i>⚙️ 구간 기반 참고가 · 확정 E/SL/TP 아님</i>`
      : `<i>⚙️ 통합분석 E/SL/TP · 즉시 추격 아님 · 조건부 참고</i>`,
  ];
  return lines;
}

export function buildTelegramDeskBriefingHtml(p: TelegramDeskBriefingInput): string {
  const mid = (p.top + p.bot) / 2;
  const sideKo = sideResultKo(p.side);
  const result =
    p.side === 'LONG'
      ? '🟢🟢 결과: 롱'
      : p.side === 'SHORT'
        ? '🔴🔴 결과: 숏'
        : '🟡🟡 결과: 관찰';

  const core = buildTelegramCoreConclusionKo(p, { withMark: false });
  const supportLine =
    p.side === 'LONG'
      ? `🛡 <b>지지반등</b> ${tgPrice(fmtPx(Math.min(p.top, p.bot)))}~${tgPrice(fmtPx(Math.max(p.top, p.bot)))}`
      : p.side === 'SHORT'
        ? `🧱 <b>저항하락</b> ${tgPrice(fmtPx(Math.min(p.top, p.bot)))}~${tgPrice(fmtPx(Math.max(p.top, p.bot)))}`
        : `👀 <b>구간</b> ${tgPrice(fmtPx(Math.min(p.top, p.bot)))}~${tgPrice(fmtPx(Math.max(p.top, p.bot)))}`;

  const lines: string[] = [
    tgHighlight(result),
    `<b>📌 ${escapeTelegramHtml(`${p.symbol} ${p.timeframe} · ${sideKo}`)}</b>`,
    `<b>💡 핵심</b> ${escapeTelegramHtml(core)}`,
    `<i>📖 ${escapeTelegramHtml(sideVerbKo(p.side))} · 확정 아님</i>`,
    '',
    supportLine,
    `💰 지금 ${tgPrice(fmtPx(p.price))} <i>(구간대비 ${escapeTelegramHtml(pctDist(p.price, mid))})</i>`,
  ];

  /** 결론 바로 아래 — 진입/손절/TP 필수 노출 */
  lines.push(...coloredLevelsHtml(p));

  lines.push('', `<b>✅ 할 일</b> ${escapeTelegramHtml(actionOneLine(p))}`);

  if (p.invalidKo) {
    lines.push(tgWarn(`🛑 ${String(p.invalidKo).slice(0, 80)}`));
  }

  if (p.dumpGlance) {
    const pathBit = p.pathKo
      ? `${p.pathKo}${p.scenarioKo ? ` · ${p.scenarioKo}` : ''}`
      : p.scenarioKo || '';
    const dumpBits = [
      pathBit ? `🧭 ${pathBit}` : '',
      p.dumpGlance.volumeLineKo ? `📊 ${p.dumpGlance.volumeLineKo}` : '',
      p.dumpGlance.bounceLineKo
        ? `⬆️ ${p.dumpGlance.bounceLineKo.replace(/반등확률/g, '도달조건부')}`
        : '',
      p.dumpGlance.touchProbLineKo
        ? `🔁 ${p.dumpGlance.touchProbLineKo.replace(/반등확률/g, '도달조건부')}`
        : '',
    ]
      .filter(Boolean)
      .map((x) => String(x).replace(/\s+/g, ' ').slice(0, 78));
    const uniq: string[] = [];
    for (const b of dumpBits) {
      if (uniq.some((u) => u.slice(2, 20) === b.slice(2, 20))) continue;
      uniq.push(b);
      if (uniq.length >= 3) break;
    }
    if (uniq.length) {
      lines.push('', tgSection('폭락경로'), ...uniq.map((x) => escapeTelegramHtml(x)));
    }
  } else if (p.pathKo) {
    lines.push('', `🧭 경로 ${escapeTelegramHtml(p.pathKo.slice(0, 80))}`);
  }

  const mtf = compactTelegramMtfSummary(p.mtfSummaryKo, 2);
  if (mtf) {
    lines.push('', `📡 <i>MTF ${escapeTelegramHtml(mtf)}</i>`);
  }

  const zoneLines = compactMtfZoneLines(p.mtfZoneLines, 2);
  if (zoneLines.length) {
    lines.push(...zoneLines.map((x) => `🏷 ${escapeTelegramHtml(x)}`));
  }

  if (!p.dumpGlance && p.detailKo) {
    const shortDetail = p.detailKo
      .replace(/반등확률/g, '도달조건부')
      .replace(/\s+/g, ' ')
      .trim();
    const cut = shortDetail.length > 90 ? `${shortDetail.slice(0, 87)}…` : shortDetail;
    if (cut) lines.push(`📝 <i>${escapeTelegramHtml(cut)}</i>`);
  }

  lines.push('', `<i>※ 참고용 — 확정 매매·수익 보장 아님</i>`);
  return lines.join('\n');
}

export function buildTelegramDeskBriefingPlain(p: TelegramDeskBriefingInput): string {
  const mid = (p.top + p.bot) / 2;
  const lines: string[] = [
    buildTelegramCoreConclusionKo(p),
    `💰 지금 ${fmtPx(p.price)} · 🛡구간 ${fmtPx(p.bot)}~${fmtPx(p.top)} (${pctDist(p.price, mid)})`,
    levelsPlainBits(p),
    `✅ ${actionOneLine(p)}`,
  ];
  if (p.invalidKo) lines.push(`🛑 무효: ${p.invalidKo}`);
  const mtf = compactTelegramMtfSummary(p.mtfSummaryKo, 2);
  if (mtf) lines.push(`📡 MTF: ${mtf}`);
  lines.push('※ 참고용');
  const text = lines.filter(Boolean).join('\n');
  return text.length > 800 ? `${text.slice(0, 797)}…` : text;
}

/** 사진 캡션 — 핵심 + E/SL/TP */
export function buildTelegramPhotoCaptionHtml(p: TelegramDeskBriefingInput): string {
  const core = escapeTelegramHtml(buildTelegramCoreConclusionKo(p));
  const lv = levelsPlainBits(p);
  const price = `💰 지금 ${fmtPx(p.price)}`;
  return `<b>${core}</b>\n${lv ? `${escapeTelegramHtml(lv)}\n` : ''}<i>${escapeTelegramHtml(price)}</i>\n<i>▼ 상세</i>`;
}
