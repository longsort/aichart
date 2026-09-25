/**
 * 자동매매 포지션 진입 → 텔레그램 단톡 알림.
 * 진입 신호·근거 증거를 포함. 확정 수익·투자 권유 아님.
 */
import {
  escapeTelegramHtml,
  tgHighlight,
  tgPrice,
  tgSide,
} from '@/lib/telegramFormatHtml';
import { sendTelegramHtmlCaptionToEnvChat } from '@/lib/telegramBotSendHtml';
import {
  FOUR_STRATEGY_IDS,
  FOUR_STRATEGY_KO,
  type FourStrategyId,
} from '@/lib/doksuri1/fourStrategyTypes';

export type LiveEntryTelegramParams = {
  symbol: string;
  direction: 'LONG' | 'SHORT';
  price: number;
  sl?: number | null;
  tp?: number | null;
  size?: string | null;
  marginUsdt?: number | null;
  equityPct?: number | null;
  leverage?: number | null;
  orderId?: string | null;
  source?: string | null;
  signalId?: string | null;
  /** live | virtual */
  mode?: 'live' | 'virtual';
  timeframe?: string | null;
  noteKo?: string | null;
  /** 진입 신호 한글 요약 (예: 4전략·스윕반전 롱) */
  signalKo?: string | null;
  /** 근거·증거 한 줄 또는 · 구분 여러 근거 */
  evidenceKo?: string | null;
  /** 4전략 ID */
  fourStrategyId?: string | null;
  /** 합류 태그 */
  analysisTags?: string[] | null;
  /** 진입 점수 */
  entryScore?: number | null;
};

function fmtPx(n: number): string {
  if (!(n > 0)) return '—';
  if (n >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (n >= 1) return n.toFixed(4);
  return n.toFixed(6);
}

function resolveSourceKo(p: LiveEntryTelegramParams): string {
  const sid = String(p.signalId || '');
  const hasSweepConsec =
    Array.isArray(p.analysisTags) &&
    p.analysisTags.some((t) =>
      /skill:sweep-consec|3봉내연속스윕|SWEEP_CONSEC/i.test(String(t))
    );
  if (/^wick15-/i.test(sid) || p.source === 'wick-15m') return '15m꼬리추정';
  if (/^dwwick-/i.test(sid) || p.source === 'dump-watch-wick') return '폭락감시윗꼬리숏';
  if (/^htfdump-/i.test(sid) || p.source === 'htf-dump-touch') return 'HTF폭락존터치';
  if (/^bpr15-/i.test(sid) || p.source === 'bpr-retest') return 'BPR재터치';
  if (/^btc-rkcart-/i.test(sid) || p.source === 'btc-rocket-cart') return '신호B·로켓장바';
  if (/^s-grade-/i.test(sid) || p.source === 'structure-s') return '신호C·S급구조';
  if (
    Array.isArray(p.analysisTags) &&
    p.analysisTags.some((t) => /wick-15m|wick15/i.test(String(t)))
  ) {
    return '15m꼬리추정';
  }
  if (
    Array.isArray(p.analysisTags) &&
    p.analysisTags.some((t) => /bpr-retest|bpr15/i.test(String(t)))
  ) {
    return 'BPR재터치';
  }
  const base = sourceKo(p.source);
  if (
    hasSweepConsec &&
    (base === '타점엔진' || /tap|타점/i.test(String(p.source || '')))
  ) {
    return '타점·3봉내연속스윕진입';
  }
  return base;
}

function sourceKo(src: string | null | undefined): string {
  const s = String(src || '');
  if (s === 'scalp' || s === 'scalp-fire' || s === 'four-strategy') return '초단·4전략';
  if (s === 'doksuri1') return '독수리1호';
  if (s === 'dump-zone') return '폭락존';
  if (s === 'candle-ls') return '캔들롱숏';
  if (s === 'cart-signal') return '장바구니';
  if (s === 'btc-rocket-cart') return '신호B·로켓장바';
  if (s === 'structure-s') return '신호C·S급구조';
  if (s === 'inst-band-lh') return '기관밴드LH';
  if (s === 'sfp-signal') return 'SFP';
  if (s === 'structure-rocket') return '구조로켓';
  if (s === 'wick-15m') return '15m꼬리추정';
  if (s === 'dump-watch-wick') return '폭락감시윗꼬리숏';
  if (s === 'htf-dump-touch') return 'HTF폭락존터치';
  if (s === 'dump-confirm') return '폭락확정';
  if (s === 'bpr-retest') return 'BPR재터치';
  if (s === 'health-check') return '연동점검';
  if (s === 'tg-test' || s === 'telegram-test') return 'TG코인테스트';
  if (s === 'eagle1-tap-engine' || s === 'eagle1-tap' || /tap-engine|타점/i.test(s))
    return '타점엔진';
  if (s === 'swing-mid') return '스윙';
  if (s === 'plan-touch') return '플랜터치';
  if (s === 'hot-zone') return '핫존';
  if (s === 'manual') return '수동';
  if (s === 'ai-zone') return 'AIZONE주도';
  if (s === 'rb-scalp') return '초단Fast·띠SFP';
  return s || '자동매매';
}

function fourStrategyKoFromId(id: string | null | undefined): string | null {
  const u = String(id || '').toUpperCase();
  if (!u) return null;
  if ((FOUR_STRATEGY_IDS as readonly string[]).includes(u)) {
    return FOUR_STRATEGY_KO[u as FourStrategyId];
  }
  return null;
}

/** signalId에서 4전략·TF 힌트 추출 (예: xrp-4s-1m-SWEEP_REVERSAL-LONG-…) */

export function parseEvidenceHintsFromSignalId(
  signalId: string | null | undefined
): { strategyKo: string | null; strategyId: string | null; tf: string | null } {
  const id = String(signalId || '');
  let strategyId: string | null = null;
  let strategyKo: string | null = null;
  for (const sid of FOUR_STRATEGY_IDS) {
    if (id.includes(sid)) {
      strategyId = sid;
      strategyKo = FOUR_STRATEGY_KO[sid];
      break;
    }
  }
  const tfM = id.match(/(?:^|-)(\d+m|\d+h|1d|1w|1M)(?:-|$)/i);
  return { strategyKo, strategyId, tf: tfM ? tfM[1] : null };
}

function splitEvidenceParts(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return String(raw)
    .split(/\s*[·|]\s*|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !/^Bitget\s*실주문/i.test(s));
}

/** 텔레그램용 진입신호·근거 블록 */

export function buildEntryEvidenceLines(p: LiveEntryTelegramParams): string[] {
  const lines: string[] = [];
  const hints = parseEvidenceHintsFromSignalId(p.signalId);
  const stratKo =
    fourStrategyKoFromId(p.fourStrategyId) || hints.strategyKo || null;
  const stratId = p.fourStrategyId || hints.strategyId || null;
  const tf = p.timeframe || hints.tf || null;
  const signalLabel =
    (p.signalKo && String(p.signalKo).trim()) ||
    (stratKo
      ? `4전략 · ${stratKo}${tf ? ` · ${tf}` : ''} · ${
          p.direction === 'LONG' ? '롱' : '숏'
        }`
      : null);
  if (signalLabel) {
    lines.push(`<b>진입신호</b> ${escapeTelegramHtml(signalLabel.slice(0, 160))}`);
  }
  if (stratKo && (!p.signalKo || !String(p.signalKo).includes(stratKo))) {
    lines.push(
      `<b>전략</b> ${escapeTelegramHtml(stratKo)}${
        stratId ? ` <code>${escapeTelegramHtml(String(stratId))}</code>` : ''
      }`
    );
  }
  if (p.entryScore != null && Number(p.entryScore) > 0) {
    lines.push(
      `<b>점수</b> <code>${escapeTelegramHtml(String(Math.round(Number(p.entryScore))))}</code>`
    );
  }
  const tagParts = Array.isArray(p.analysisTags)
    ? p.analysisTags.map((t) => String(t || '').trim()).filter(Boolean)
    : [];
  const evidParts = [
    ...splitEvidenceParts(p.evidenceKo),
    ...splitEvidenceParts(p.noteKo),
    ...tagParts,
  ];
  const seen = new Set<string>();
  const uniq: string[] = [];
  for (const part of evidParts) {
    const key = part.toLowerCase();
    if (seen.has(key)) continue;
    if (signalLabel && part === signalLabel) continue;
    seen.add(key);
    uniq.push(part);
  }
  if (uniq.length) {
    lines.push('<b>근거·증거</b>');
    for (const u of uniq.slice(0, 6)) {
      lines.push(`· ${escapeTelegramHtml(u.slice(0, 100))}`);
    }
  } else if (!signalLabel) {
    lines.push('<b>근거·증거</b> · 상세신호 미전달 · 소스·신호ID 참고');
  }
  return lines;
}

export function formatMergedDeskEntryTelegramHtml(p: LiveEntryTelegramParams): string {
  const mode = p.mode === 'virtual' ? 'virtual' : 'live';
  const modeKo = mode === 'live' ? '실전 진입' : '가상 진입';
  const chip = String(p.symbol || '').replace(/USDT$/i, '') || p.symbol;
  const lines: string[] = [];
  lines.push(tgHighlight(`★ ${modeKo} · ${chip}`));
  lines.push(
    `${tgSide(p.direction)} · <b>${escapeTelegramHtml(String(p.symbol).toUpperCase())}</b>${
      p.timeframe ? ` · ${escapeTelegramHtml(p.timeframe)}` : ''
    }`
  );
  lines.push('');
  const evid = buildEntryEvidenceLines(p);
  if (evid.length) {
    lines.push(...evid);
    lines.push('');
  }
  lines.push(`<b>진입가</b> ${tgPrice(fmtPx(p.price))}`);
  if (p.sl != null && p.sl > 0) lines.push(`<b>손절</b> ${tgPrice(fmtPx(p.sl))}`);
  if (p.tp != null && p.tp > 0) lines.push(`<b>익절1</b> ${tgPrice(fmtPx(p.tp))}`);
  if (p.size) lines.push(`<b>수량</b> <code>${escapeTelegramHtml(p.size)}</code>`);
  if (p.marginUsdt != null && p.marginUsdt > 0) {
    const pct =
      p.equityPct != null && p.equityPct > 0
        ? ` · 자산 ${escapeTelegramHtml(String(p.equityPct))}%`
        : '';
    lines.push(
      `<b>증거금</b> ${tgPrice(p.marginUsdt.toLocaleString('en-US', { maximumFractionDigits: 2 }))}U${pct}`
    );
  }
  if (p.leverage != null && p.leverage > 0) {
    lines.push(`<b>레버</b> <code>${escapeTelegramHtml(String(p.leverage))}x</code>`);
  }
  lines.push(`<b>소스</b> ${escapeTelegramHtml(resolveSourceKo(p))}`);
  if (p.orderId) {
    lines.push(`<b>주문</b> <code>${escapeTelegramHtml(String(p.orderId).slice(0, 28))}</code>`);
  }
  if (p.signalId) {
    lines.push(
      `<b>신호ID</b> <code>${escapeTelegramHtml(String(p.signalId).slice(0, 48))}</code>`
    );
  }
  lines.push('');
  lines.push(`<i>자동매매 알림 · 확정 수익 아님 · ${new Date().toLocaleString('ko-KR')}</i>`);
  return lines.join('\n');
}

/** 서버에서 즉시 전송 (실패해도 주문 결과는 유지) · HTML 실패 시 평문 1회 재시도 */

export async function notifyMergedDeskPositionEntry(
  params: LiveEntryTelegramParams
): Promise<{ ok: boolean; error?: string }> {
  try {
    const html = formatMergedDeskEntryTelegramHtml(params);
    const r = await sendTelegramHtmlCaptionToEnvChat(html);
    if (r.ok !== false) return { ok: true };
    /** HTML parse 실패 등 → 평문 재시도 */
    const plain = html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/?[^>]+>/g, '')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .slice(0, 3500);
    const { sendTelegramHtmlToEnvChat } = await import('@/lib/telegramBotSendHtml');
    const r2 = await sendTelegramHtmlToEnvChat(plain);
    if (r2.ok === false) {
      return { ok: false, error: `${r.error || 'html fail'} · plain: ${r2.error}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'telegram fail' };
  }
}
