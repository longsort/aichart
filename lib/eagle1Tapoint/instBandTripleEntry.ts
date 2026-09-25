/**
 * 자동주문 본체 = 호칭 「15분밴드자동」(BAND15_AUTO).
 * 구 QS/SNIPER/오토/세판정/캔들합류는 주문 금지(카드·차트 유지).
 * LIVE 아님 · Paper. 확정 수익 아님.
 */
import type { TapointDecisionReport } from '@/lib/eagle1Tapoint/types';
import type { CoinExclusiveSkillMap } from '@/lib/mergedDeskCoinExclusiveSkills';
import {
  isExclusiveSkillOn,
  resolveExclusiveCoin,
} from '@/lib/mergedDeskCoinExclusiveSkills';
import {
  BAND15_AUTO_CALLSIGN,
  BAND15_AUTO_ENGINE_ID,
  BAND15_AUTO_HOCHUNG,
  BAND15_AUTO_SKILL_ID,
  BAND15_AUTO_TF,
} from '@/lib/eagle1Tapoint/band15AutoSkill';
import { normalizeTapointTf } from '@/lib/eagle1Tapoint/symbolEntryTf';

export const INST_BAND_ALIGN_SL_ROE_MAX = 12;
export const INST_BAND_ALIGN_TP_ROE_MIN = 6;

export type InstBandTripleResult = {
  ok: boolean;
  direction: 'LONG' | 'SHORT' | null;
  entry: number | null;
  sl: number | null;
  tp: number | null;
  slRoePct: number | null;
  tpRoePct: number | null;
  leverage: number | null;
  reasonKo: string;
  lane?: string;
  eventId?: string | null;
  paperOnly?: boolean;
  allowLive?: boolean;
};

export function tapointAutoBarSlot(timeframe: string | null | undefined): number {
  const t = String(timeframe || '15m').toLowerCase();
  let min = 15;
  if (t.endsWith('h')) min = Math.max(1, parseInt(t, 10) || 1) * 60;
  else if (t.endsWith('d')) min = 1440;
  else min = Math.max(1, parseInt(t, 10) || 15);
  const spanMs = min * 4 * 60 * 1000;
  return Math.floor(Date.now() / spanMs);
}

function dirWord(dir: 'LONG' | 'SHORT' | null | undefined): string {
  if (dir === 'LONG') return '롱';
  if (dir === 'SHORT') return '숏';
  return '대기';
}

/** 비트코인만 밴드1·2. 신호감지·팩터는 다른 코인 주문에 남긴다. */
export function isBtcBandPairSymbol(symbol: string | null | undefined): boolean {
  const u = String(symbol || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return u.startsWith('BTC');
}

function trendDir(t: 'long' | 'short' | null | undefined): 'LONG' | 'SHORT' | null {
  if (t === 'long') return 'LONG';
  if (t === 'short') return 'SHORT';
  return null;
}

/**
 * 손절 = 스탑헌팅 바깥.
 * 밴드 폭의 1.272 연장(0.272×폭)과, 최근 꼬리가 밴드를 찌른 끝에서 ATR×0.25 중 더 먼 가격.
 * 익절 = 반대편 밴드.
 */
export function instBandStructureSlTp(input: {
  direction?: 'LONG' | 'SHORT' | null;
  entry?: number | null;
  upper?: number | null;
  lower?: number | null;
  atr?: number | null;
  huntExtreme?: number | null;
}): { entry: number; sl: number; tp: number } | null {
  const dir = input.direction;
  const entry = Number(input.entry);
  const upper = Number(input.upper);
  const lower = Number(input.lower);
  if (dir !== 'LONG' && dir !== 'SHORT') return null;
  if (!(entry > 0) || !(upper > lower) || !(lower > 0)) return null;
  const width = upper - lower;
  const atr = Number(input.atr) > 0 ? Number(input.atr) : width * 0.25;
  const pad = Math.max(atr * 0.25, entry * 0.0004);
  const fibPast = width * 0.272;
  const extreme = Number(input.huntExtreme);
  const sl =
    dir === 'LONG'
      ? Math.min(
          lower - fibPast,
          (extreme > 0 && extreme < lower ? extreme : lower) - pad
        )
      : Math.max(
          upper + fibPast,
          (extreme > upper ? extreme : upper) + pad
        );
  const tp = dir === 'LONG' ? upper : lower;
  if (dir === 'LONG' && !(sl < entry && tp > entry)) return null;
  if (dir === 'SHORT' && !(sl > entry && tp < entry)) return null;
  return { entry, sl, tp };
}

export function resolveInstBandTripleEntry(
  report: TapointDecisionReport | null | undefined,
  opts?: { leverage?: number; exclusiveMap?: CoinExclusiveSkillMap | null }
): InstBandTripleResult {
  const fail = (reasonKo: string): InstBandTripleResult => ({
    ok: false,
    direction: null,
    entry: null,
    sl: null,
    tp: null,
    slRoePct: null,
    tpRoePct: null,
    leverage: null,
    reasonKo,
    lane: undefined,
    paperOnly: true,
    allowLive: false,
  });
  if (!report) return fail('판정 없음');

  if (report.qualityOk === false) return fail(report.qualityNoteKo || '데이터품질불량');

  const coin = resolveExclusiveCoin(String(report.symbol || ''));
  const band15On = isExclusiveSkillOn(coin, BAND15_AUTO_SKILL_ID, opts?.exclusiveMap);
  if (!band15On) {
    return fail(`${BAND15_AUTO_HOCHUNG} OFF · 구스킬 자동주문 금지 · 카드·차트 유지`);
  }
  if (normalizeTapointTf(report.timeframe) !== BAND15_AUTO_TF) {
    return fail(
      `${BAND15_AUTO_HOCHUNG} · ${BAND15_AUTO_TF}만 · 지금 ${report.timeframe || '?'} · 구스킬 자동주문 금지`
    );
  }

  const ib = report.instBandPlan;
  const b1 = trendDir(ib?.band1Dir);
  const b2 = trendDir(ib?.band2Dir ?? ib?.bandDir);
  if (!(b1 && b2 && b1 === b2)) {
    return fail(
      `${BAND15_AUTO_HOCHUNG} · 밴드1 ${dirWord(b1)} · 밴드2 ${dirWord(b2)} · 정렬대기`
    );
  }
  if (!ib?.actionable || ib.direction !== b1) {
    return fail(`${BAND15_AUTO_HOCHUNG} · READY 아님 · ${ib?.status || 'WAIT'}`);
  }
  const entry = Number(ib.entry);
  const sl = Number(ib.sl);
  const tp = Number(ib.tp1);
  if (!(entry > 0) || !(sl > 0) || !(tp > 0)) {
    return fail(`${BAND15_AUTO_HOCHUNG} · E/SL/TP 없음`);
  }
  if (b1 === 'LONG' && !(sl < entry && tp > entry)) {
    return fail(`${BAND15_AUTO_HOCHUNG} · 롱 손익자리 불일치`);
  }
  if (b1 === 'SHORT' && !(sl > entry && tp < entry)) {
    return fail(`${BAND15_AUTO_HOCHUNG} · 숏 손익자리 불일치`);
  }
  const maxLev = Math.max(1, Math.min(125, Math.round(Number(opts?.leverage) || 20)));
  const slFrac = Math.abs(entry - sl) / entry;
  const tpFrac = Math.abs(tp - entry) / entry;
  const lev =
    slFrac > 0
      ? Math.min(maxLev, Math.max(2, Math.floor(INST_BAND_ALIGN_SL_ROE_MAX / 100 / slFrac)))
      : maxLev;
  return {
    ok: true,
    direction: b1,
    entry,
    sl,
    tp,
    slRoePct: slFrac * 100 * lev,
    tpRoePct: tpFrac * 100 * lev,
    leverage: lev,
    reasonKo: `${BAND15_AUTO_HOCHUNG}(${BAND15_AUTO_CALLSIGN}) ${dirWord(b1)} · Paper · LIVE아님`.slice(
      0,
      160
    ),
    lane: BAND15_AUTO_ENGINE_ID,
    eventId: `band15-${b1}`,
    paperOnly: true,
    allowLive: false,
  };
}
