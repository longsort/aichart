/**
 * 같은 코인 반대방향 헷지 진입.
 * · 기본 금지 (AIZONE 주도 · 롱숏 동시 오픈 금지)
 * · allowHedgeEntry=true 일 때만 강한 신호 헷지 허용
 * 확정 수익·승률 아님.
 */

/** 헷지 전역 OFF — 설정으로만 재허용 */
export const HEDGE_ENTRY_GLOBALLY_DISABLED = true;

/** 헷지 증거금 배수 (본진입 대비) */
export const HEDGE_SIZE_MULT = 0.5;

/** 강한 신호로 볼 entryScore 하한 (있을 때) */
export const HEDGE_MIN_ENTRY_SCORE = 70;

const STRONG_SRC_RE =
  /wick-15m|dump-watch-wick|htf-dump-touch|dump-confirm|dump-zone|structure-rocket|candle-ls|xrp-4strat|bnb-sfp|eth-chart|꼬리|폭락감시|HTF폭락|폭락존|로켓|SFP|4패턴|차트신호/i;

export function isStrongHedgeSignal(params: {
  source?: string | null;
  signalId?: string | null;
  signalKo?: string | null;
  analysisSource?: string | null;
  analysisTags?: string[] | null;
  entryScore?: number | null;
  noteKo?: string | null;
  /** 설정 allowHedgeEntry */
  allowHedgeEntry?: boolean | null;
}): { ok: boolean; reasonKo: string } {
  if (HEDGE_ENTRY_GLOBALLY_DISABLED || params.allowHedgeEntry !== true) {
    return { ok: false, reasonKo: '헷지오픈금지 · 같은코인 롱숏 동시진입 불가' };
  }
  const hint = [
    params.source,
    params.analysisSource,
    params.signalId,
    params.signalKo,
    params.noteKo,
    ...(params.analysisTags || []),
  ]
    .filter(Boolean)
    .join(' ');

  if (/bpr-retest|bpr15-|BPR재터치/i.test(hint)) {
    return { ok: false, reasonKo: 'BPR · 헷지스킵' };
  }
  if (/btc-rocket-cart|btc-rkcart|BTC신호B|로켓→장바/i.test(hint)) {
    return { ok: false, reasonKo: 'BTC신호B · 헷지스킵' };
  }

  const score = Number(params.entryScore);
  if (Number.isFinite(score) && score > 0 && score < HEDGE_MIN_ENTRY_SCORE) {
    return {
      ok: false,
      reasonKo: `헷지점수 ${score}<${HEDGE_MIN_ENTRY_SCORE} · 스킵`,
    };
  }

  if (STRONG_SRC_RE.test(hint)) {
    return { ok: true, reasonKo: '강한반대신호 · 헷지허용' };
  }

  if (Number.isFinite(score) && score >= HEDGE_MIN_ENTRY_SCORE) {
    return { ok: true, reasonKo: `점수${score} · 헷지허용` };
  }

  return { ok: false, reasonKo: '약한신호 · 헷지스킵' };
}

export function hedgeNoteKo(base: string | null | undefined, holdDir: 'LONG' | 'SHORT'): string {
  const holdKo = holdDir === 'LONG' ? '롱' : '숏';
  const hedgeKo = holdDir === 'LONG' ? '숏' : '롱';
  const b = String(base || '').trim();
  return b
    ? `${b} · 헷지${hedgeKo}(보유${holdKo})`
    : `헷지${hedgeKo} · 보유${holdKo} 반대`;
}
