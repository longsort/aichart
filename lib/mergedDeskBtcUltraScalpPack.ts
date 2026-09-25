/**
 * BTC 통합모드 초단 팩 — 여러 기능을 합류로 묶어 선별 진입.
 * 실행: 레버≈40 · TP ROE 8% 전량컷 · 구조 SL.
 * 목표 승률 쪽으로 기울이는 설계일 뿐, 확정 80%·확정 수익 아님.
 */
import type { Candle } from '@/types';
import {
  readAiZoneEntrySnapshot,
  type AiZoneEntrySnapshot,
} from '@/lib/mergedDeskAiZoneSnapshot';
import { extremeEntryGate } from '@/lib/mergedDeskExtremeEntryGate';
import { FAST_TP1_ROE_PCT } from '@/lib/mergedDeskAutoTradeConfig';
import { scanWick15mOnClosedBar } from '@/lib/mergedDeskWick15mTrade';
import { aiZoneDualEstimateWait } from '@/lib/mergedDeskAiZoneDualWait';

export const BTC_ULTRA_SYMBOL = 'BTCUSDT';
/** 통합초단 권장 레버 */
export const BTC_ULTRA_LEVERAGE = 40;
/** 빠른익절 ROE% */
export const BTC_ULTRA_TP_ROE_PCT = FAST_TP1_ROE_PCT;
/** AIZONE / 추정 최소 */
export const BTC_ULTRA_AI_PCT_MIN = 70;
/** 합류 최소 득표 — 필수(트리거+추정70)=2면 진입, 가산은 비중만 */
export const BTC_ULTRA_MIN_VOTES = 2;
/** 구조 SL ROE 상한 — 주문 SL은 FAST_SL_ROE_PCT(20) 고정 */
export const BTC_ULTRA_MAX_SL_ROE = 20;
/** SL 타이트 가산 기준 ROE% */
export const BTC_ULTRA_SL_TIGHT_ROE = 6;
/** 합류 점수는 진입 게이트용 · 증거금은 설정%(예: 5%) 풀사이즈 유지 */
export function btcUltraSizeMultFromScore(_score: number): number {
  return 1;
}

export type BtcUltraVoteId =
  | 'trigger'
  | 'ai-pct'
  | 'dual-wait'
  | 'extreme'
  | 'dump-near'
  | 'volume'
  | 'wick-agree'
  | 'sl-tight';

export type BtcUltraVote = {
  id: BtcUltraVoteId;
  ok: boolean;
  required?: boolean;
  labelKo: string;
  detailKo: string;
};

export type BtcUltraConfluenceResult = {
  allow: boolean;
  score: number;
  minVotes: number;
  votes: BtcUltraVote[];
  reasonKo: string;
  leverage: number;
  tp1RoePct: number;
  /** 0.7~1 · 합류 점수 비례 비중 — 현재는 항상 1(설정% 풀) */
  sizeMult: number;
  tierKo: string;
};

function nearZone(
  price: number,
  bot: number,
  top: number,
  atr: number
): boolean {
  if (!(price > 0) || !(top > bot)) return false;
  const pad = Math.max(atr * 0.35, price * 0.0008, (top - bot) * 0.25);
  return price >= bot - pad && price <= top + pad;
}

function atrApprox(candles: Candle[] | null | undefined): number {
  if (!Array.isArray(candles) || candles.length < 5) return 0;
  const n = candles.length;
  let s = 0;
  let c = 0;
  for (let i = Math.max(1, n - 14); i < n; i++) {
    const a = candles[i]!;
    const b = candles[i - 1]!;
    s += Math.max(
      Number(a.high) - Number(a.low),
      Math.abs(Number(a.high) - Number(b.close)),
      Math.abs(Number(a.low) - Number(b.close))
    );
    c += 1;
  }
  const last = Number(candles[n - 1]?.close) || 1;
  return c > 0 ? s / c : last * 0.004;
}

export function resolveBtcUltraLeverage(cfgLev?: number | null): number {
  const n = Number(cfgLev);
  /** 비중창 레버 그대로 (1~125) · 미설정만 기본 40 */
  if (Number.isFinite(n) && n >= 1 && n <= 125) return Math.round(n);
  return BTC_ULTRA_LEVERAGE;
}

/**
 * BTC 통합초단 합류 평가.
 * - 꼬리(wick-15m): 필수 = 트리거 + AI추정≥70
 * - 로켓(structure-rocket): 필수 = 트리거만 (로켓 방향 롱/숏) · AI는 가산·비중
 * 가산(극단·존·거래량·꼬리동의·SL타이트) → 비중만 키움
 * 확정 승률·수익 아님.
 */
export function evaluateBtcUltraScalpConfluence(params: {
  direction: 'LONG' | 'SHORT';
  entry: number;
  sl: number;
  /** rocket | wick-15m */
  trigger: 'structure-rocket' | 'wick-15m';
  longPct?: number | null;
  shortPct?: number | null;
  volumeHeavy?: boolean | null;
  snap?: AiZoneEntrySnapshot | null;
  candles?: Candle[] | null;
  /** 폭락존 밴드들 (bot/top) */
  dumpZones?: Array<{ bot: number; top: number; demand?: boolean }> | null;
  leverage?: number;
  minVotes?: number;
  aiPctMin?: number;
}): BtcUltraConfluenceResult {
  const lev = resolveBtcUltraLeverage(params.leverage);
  /** 로켓=트리거1표만 필수 · 꼬리=트리거+AI(기본 minVotes 2) */
  const defaultMin =
    params.trigger === 'structure-rocket' ? 1 : BTC_ULTRA_MIN_VOTES;
  const minVotes = Math.max(
    1,
    Math.min(6, params.minVotes ?? defaultMin)
  );
  const aiMin = Math.max(55, Math.min(90, params.aiPctMin ?? BTC_ULTRA_AI_PCT_MIN));
  const entry = Number(params.entry);
  const sl = Number(params.sl);
  const dir = params.direction;
  const snap = params.snap ?? readAiZoneEntrySnapshot(BTC_ULTRA_SYMBOL);
  const atr = atrApprox(params.candles);

  const votes: BtcUltraVote[] = [];

  /** 1) 트리거 — 호출부가 이미 신호 만든 경우 통과 */
  votes.push({
    id: 'trigger',
    ok: params.trigger === 'structure-rocket' || params.trigger === 'wick-15m',
    required: true,
    labelKo: params.trigger === 'wick-15m' ? '15m꼬리' : '3·5m로켓',
    detailKo: '트리거 신호',
  });

  /** 2) AI 추정% — 꼬리는 필수≥70 · 로켓은 가산(방향 진입은 로켓 신호) */
  const longPct =
    params.longPct != null && Number.isFinite(params.longPct)
      ? Number(params.longPct)
      : snap?.longPct != null
        ? Number(snap.longPct)
        : null;
  const shortPct =
    params.shortPct != null && Number.isFinite(params.shortPct)
      ? Number(params.shortPct)
      : snap?.shortPct != null
        ? Number(snap.shortPct)
        : null;
  const aiPct = dir === 'LONG' ? longPct : shortPct;
  const aiOk = aiPct != null && aiPct >= aiMin;
  const aiRequired = params.trigger === 'wick-15m';
  votes.push({
    id: 'ai-pct',
    ok: aiOk,
    required: aiRequired,
    labelKo: dir === 'LONG' ? '롱진입추정' : '숏진입추정',
    detailKo:
      aiPct != null
        ? `${aiPct.toFixed(0)}%${aiOk ? `≥${aiMin}` : `<${aiMin}`}${aiRequired ? '' : ' ·로켓가산'}`
        : aiRequired
          ? `추정없음 · ≥${aiMin} 필요`
          : `추정없음 · 로켓방향진입`,
  });

  /** 2b) 양쪽≥70 + 갭작음/방짧음 → WAIT (억지 방향 금지) */
  const dual = aiZoneDualEstimateWait({
    longPct,
    shortPct,
    price: entry,
    leverage: lev,
    direction: dir,
    snap,
  });
  votes.push({
    id: 'dual-wait',
    ok: !dual.wait,
    required: true,
    labelKo: '양추정충돌',
    detailKo: dual.wait ? dual.reasonKo : '양추정OK',
  });

  /** 3) 극단 자리 */
  const extreme = extremeEntryGate({
    symbol: BTC_ULTRA_SYMBOL,
    direction: dir,
    price: entry,
    snap,
    candles: params.candles ?? null,
  });
  votes.push({
    id: 'extreme',
    ok: extreme.allow,
    labelKo: '극단자리',
    detailKo: extreme.reasonKo,
  });

  /** 4) 폭락존 근접 (같은 방향 편향) */
  let dumpOk = false;
  const dumps = params.dumpZones || [];
  if (entry > 0 && dumps.length) {
    for (const z of dumps) {
      if (!nearZone(entry, z.bot, z.top, atr || entry * 0.002)) continue;
      const demand = z.demand !== false;
      if (dir === 'LONG' && demand) dumpOk = true;
      if (dir === 'SHORT' && !demand) dumpOk = true;
    }
  }
  votes.push({
    id: 'dump-near',
    ok: dumpOk,
    labelKo: '폭락존근접',
    detailKo: dumpOk ? '존터치·근접' : '존미근접',
  });

  /** 5) 거래량 */
  const volOk = Boolean(params.volumeHeavy ?? snap?.volumeHeavy);
  votes.push({
    id: 'volume',
    ok: volOk,
    labelKo: '거래량터짐',
    detailKo: volOk ? '급증' : '보통',
  });

  /** 6) 꼬리 동의 — 로켓일 때 15m 꼬리 같은 방향이면 가산 */
  let wickOk = false;
  if (params.trigger === 'wick-15m') {
    wickOk = true;
  } else if (params.candles && params.candles.length >= 8) {
    const w = scanWick15mOnClosedBar({
      symbol: BTC_ULTRA_SYMBOL,
      candles: params.candles,
      longPct: longPct ?? 0,
      shortPct: shortPct ?? 0,
      leverage: lev,
      pctMin: aiMin,
      tp1RoePct: BTC_ULTRA_TP_ROE_PCT,
    });
    wickOk = Boolean(w && w.direction === dir);
  }
  votes.push({
    id: 'wick-agree',
    ok: wickOk,
    labelKo: '15m꼬리동의',
    detailKo: wickOk ? '동의' : '미동의',
  });

  /** 7) SL 타이트 (ROE) */
  let slTight = false;
  let slRoe = 0;
  if (entry > 0 && sl > 0) {
    const slDistPct = (Math.abs(entry - sl) / entry) * 100;
    slRoe = slDistPct * lev;
    slTight = slRoe > 0 && slRoe <= BTC_ULTRA_SL_TIGHT_ROE;
  }
  votes.push({
    id: 'sl-tight',
    ok: slTight,
    labelKo: 'SL타이트',
    detailKo: slRoe > 0 ? `SL ROE ${slRoe.toFixed(1)}%` : 'SL무효',
  });

  const score = votes.filter((v) => v.ok).length;

  /** SL이 20%ROE보다 멀면 진입 자체 WAIT */
  if (slRoe > BTC_ULTRA_MAX_SL_ROE + 0.05) {
    return {
      allow: false,
      score,
      minVotes,
      votes,
      leverage: lev,
      tp1RoePct: BTC_ULTRA_TP_ROE_PCT,
      sizeMult: 0,
      tierKo: '대기',
      reasonKo: `BTC합류 WAIT · SL ROE ${slRoe.toFixed(1)}%>${BTC_ULTRA_MAX_SL_ROE}% · 더가까운구조SL`,
    };
  }

  const requiredFail = votes.filter((v) => v.required && !v.ok);
  const allow = requiredFail.length === 0 && score >= minVotes;
  const sizeMult = allow ? btcUltraSizeMultFromScore(score) : 0;
  const tierKo =
    score >= 4 ? '풀합류' : score >= 3 ? '표준합류' : allow ? '라이트합류' : '대기';

  const passKo = votes
    .filter((v) => v.ok)
    .map((v) => v.labelKo)
    .join('+');
  const failKo = requiredFail.map((v) => v.detailKo).join(' · ');

  return {
    allow,
    score,
    minVotes,
    votes,
    leverage: lev,
    tp1RoePct: BTC_ULTRA_TP_ROE_PCT,
    sizeMult,
    tierKo,
    reasonKo: allow
      ? `BTC${tierKo}${score} · ${passKo} · ${lev}x·TP${BTC_ULTRA_TP_ROE_PCT}%·설정비중풀 · 확정아님`
      : requiredFail.length
        ? `BTC합류 WAIT · 필수미달 · ${failKo}`
        : `BTC합류 WAIT · 득표${score}<${minVotes} · ${passKo || '표없음'}`,
  };
}

/** 실행 프로파일 한 줄 */
export function btcUltraExecHintKo(lev?: number): string {
  const L = resolveBtcUltraLeverage(lev);
  return `BTC통합초단 · ${L}x · TP ${BTC_ULTRA_TP_ROE_PCT}%컷 · SL≤${BTC_ULTRA_MAX_SL_ROE}%ROE · 필수2(트리거+추정70) · 확정아님`;
}
