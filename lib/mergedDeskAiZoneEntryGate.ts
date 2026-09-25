/**
 * AIZONE 롱·숏 진입 게이트 — 면·추정%·다음저항/지지·거래량·구간 SL.
 * + EvidenceGate: 일봉면(상승/하락) · 기관밴드 · 로켓 · 폭락구간 합류.
 * 롱 SL = 롱구간추정 하단 아래 · 숏 SL = 숏구간추정 상단 위.
 * 매도면 부근 추격롱 금지 · 차트에 매도면 있어도 하단 반등롱 허용 (숏 대칭).
 *
 * 추정% 임계:
 * - 일반: ≥70
 * - 거래량 터짐 + 지지/저항 구간 근처: ≥67
 * - 거래량만 터지고 구간 밖(허공): 여전히 ≥70
 * 확정 수익·승률 아님 · 고정 70~80% 승률 보장 아님.
 */
import {
  readAiZoneEntrySnapshot,
  type AiZoneEntrySnapshot,
  type AiZoneFaceBand,
} from '@/lib/mergedDeskAiZoneSnapshot';
import { aiZoneDualEstimateWait } from '@/lib/mergedDeskAiZoneDualWait';
import { aiZoneEvidenceGate } from '@/lib/mergedDeskAiZoneEvidenceGate';
import { aiZoneFeeRrGate } from '@/lib/mergedDeskAiZoneFeeGate';
/** 일반 롱/숏 진입 최소 추정% */
export const AIZONE_PCT_MIN_NORMAL = 70;
/** 거래량 급증 + 구간 근처 시 진입 최소 추정% */
export const AIZONE_PCT_MIN_VOLUME = 67;
/**
 * @deprecated 일반 임계 — 호환용. 실제 게이트는 resolveAiZonePctMinSmart 사용.
 */
export const AIZONE_LONG_PCT_MIN = AIZONE_PCT_MIN_NORMAL;
/** @deprecated 일반 임계 — 호환용 */
export const AIZONE_SHORT_PCT_MIN = AIZONE_PCT_MIN_NORMAL;
/** 목표 ROE% 참고 (가격% = ROE/레버) */
export const AIZONE_TARGET_ROE_PCT = 5.5;
/** 구간 바깥 손절 버퍼 (가격비) */
export const AIZONE_ZONE_SL_BUF = 0.00045;
function nearBand(price: number, band: AiZoneFaceBand, bufPct: number): boolean {
  const mid = band.mid > 0 ? band.mid : (band.lo + band.hi) / 2;
  const buf = Math.max(mid * (bufPct / 100), (band.hi - band.lo) * 0.35);
  return price >= band.lo - buf && price <= band.hi + buf;
}
/** 단순: 거래량 터짐이면 67, 아니면 70 */
export function resolveAiZonePctMin(volumeHeavy: boolean | null | undefined): number {
  return volumeHeavy ? AIZONE_PCT_MIN_VOLUME : AIZONE_PCT_MIN_NORMAL;
}
/**
 * 권장: 거래량 터짐 + 지지/저항 구간 근처일 때만 67.
 * 허공 스파이크는 일반 70 유지.
 */
export function resolveAiZonePctMinSmart(params: {
  volumeHeavy?: boolean | null;
  direction: 'LONG' | 'SHORT';
  price: number;
  snap: AiZoneEntrySnapshot;
}): number {
  if (!params.volumeHeavy) return AIZONE_PCT_MIN_NORMAL;
  const bufPct = 0.45;
  if (params.direction === 'LONG') {
    const zone = params.snap.longZone ?? params.snap.buyFace;
    if (zone && nearBand(params.price, zone, bufPct)) return AIZONE_PCT_MIN_VOLUME;
  } else {
    const zone = params.snap.shortZone ?? params.snap.sellFace;
    if (zone && nearBand(params.price, zone, bufPct)) return AIZONE_PCT_MIN_VOLUME;
  }
  return AIZONE_PCT_MIN_NORMAL;
}
/** 롱구간 하단 아래 SL */
export function resolveAiZoneLongSl(
  longZone: AiZoneFaceBand | null | undefined,
  entry: number
): number | null {
  if (!longZone || !(longZone.lo > 0) || !(entry > 0)) return null;
  const sl = longZone.lo * (1 - AIZONE_ZONE_SL_BUF);
  return sl < entry ? sl : null;
}
/** 숏구간 상단 위 SL */
export function resolveAiZoneShortSl(
  shortZone: AiZoneFaceBand | null | undefined,
  entry: number
): number | null {
  if (!shortZone || !(shortZone.hi > 0) || !(entry > 0)) return null;
  const sl = shortZone.hi * (1 + AIZONE_ZONE_SL_BUF);
  return sl > entry ? sl : null;
}
export type AiZoneGateResult = {
  allow: boolean;
  reasonKo: string;
  suggestTp: number | null;
  /** 롱=롱구간 밑 · 숏=숏구간 위 */
  suggestSl: number | null;
  snap: AiZoneEntrySnapshot | null;
  /** 이번 판정에 쓴 최소 추정% */
  pctMinUsed?: number;
  /** EvidenceGate 요약 */
  evidenceOk?: boolean;
  evidenceKo?: string;
  evidenceAlignedN?: number;
};
/**
 * 스냅샷 없거나 오래됨이면 통과(데이터 없을 때 매매 자체 차단하지 않음).
 */
export function aiZoneEntryGate(params: {
  symbol: string;
  direction: 'LONG' | 'SHORT';
  price: number;
  leverage?: number;
  snap?: AiZoneEntrySnapshot | null;
  maxAgeMs?: number;
}): AiZoneGateResult {
  const price = Number(params.price);
  if (!(price > 0)) {
    return {
      allow: false,
      reasonKo: 'AIZONE · 가격없음',
      suggestTp: null,
      suggestSl: null,
      snap: null,
    };
  }
  const snap = params.snap ?? readAiZoneEntrySnapshot(params.symbol);
  const maxAge = params.maxAgeMs ?? 180_000;
  if (!snap || Date.now() - (snap.updatedAt || 0) > maxAge) {
    return {
      allow: true,
      reasonKo: 'AIZONE스냅없음·게이트통과',
      suggestTp: null,
      suggestSl: null,
      snap: snap ?? null,
    };
  }
  const dual = aiZoneDualEstimateWait({
    longPct: snap.longPct,
    shortPct: snap.shortPct,
    price,
    leverage: params.leverage,
    direction: params.direction,
    snap,
  });
  if (dual.wait) {
    return {
      allow: false,
      reasonKo: dual.reasonKo,
      suggestTp: null,
      suggestSl: null,
      snap,
    };
  }

  /** 일봉면·기관·로켓·폭락 합류 — 점수와 분리된 근거층 */
  const evidence = aiZoneEvidenceGate({
    direction: params.direction,
    price,
    snap,
  });
  if (!evidence.ok) {
    return {
      allow: false,
      reasonKo: evidence.reasonKo,
      suggestTp: null,
      suggestSl: null,
      snap,
      evidenceOk: false,
      evidenceKo: evidence.summaryKo,
      evidenceAlignedN: evidence.alignedN,
    };
  }

  const bufPct = 0.2;
  const lev = Math.max(1, params.leverage || 30);
  const targetPricePct = AIZONE_TARGET_ROE_PCT / lev;
  const pctMin = resolveAiZonePctMinSmart({
    volumeHeavy: snap.volumeHeavy,
    direction: params.direction,
    price,
    snap,
  });
  const volTag =
    pctMin === AIZONE_PCT_MIN_VOLUME
      ? '거래량터짐·구간'
      : snap.volumeHeavy
        ? '일반(거래량만·구간외)'
        : '일반';
  if (params.direction === 'LONG') {
    const longPct = snap.longPct;
    if (longPct != null && longPct < pctMin) {
      return {
        allow: false,
        reasonKo: `AIZONE 롱추정 ${longPct.toFixed(0)}%<${pctMin}%(${volTag}) · 롱스킵`,
        suggestTp: null,
        suggestSl: null,
        snap,
        pctMinUsed: pctMin,
        evidenceOk: true,
        evidenceKo: evidence.summaryKo,
        evidenceAlignedN: evidence.alignedN,
      };
    }
    /** 매도면 부근 = 추격롱 금지 · 아래 반등롱은 허용 */
    if (snap.sellFace && nearBand(price, snap.sellFace, bufPct)) {
      return {
        allow: false,
        reasonKo: `매도면 부근 추격롱 금지 · @${snap.sellFace.mid.toFixed(snap.sellFace.mid >= 100 ? 1 : 4)}`,
        suggestTp: null,
        suggestSl: null,
        snap,
        pctMinUsed: pctMin,
        evidenceOk: true,
        evidenceKo: evidence.summaryKo,
        evidenceAlignedN: evidence.alignedN,
      };
    }
    if (snap.volumeHeavy && snap.sellFace && nearBand(price, snap.sellFace, bufPct * 1.5)) {
      return {
        allow: false,
        reasonKo: '거래과다+매도면근접 · 롱스킵',
        suggestTp: null,
        suggestSl: null,
        snap,
        pctMinUsed: pctMin,
        evidenceOk: true,
        evidenceKo: evidence.summaryKo,
        evidenceAlignedN: evidence.alignedN,
      };
    }
    const suggestSl = resolveAiZoneLongSl(snap.longZone ?? snap.buyFace, price);
    let tp: number | null = null;
    if (snap.nextResist != null && snap.nextResist > price) tp = snap.nextResist;
    if (snap.sellFace && snap.sellFace.lo > price) {
      const faceTp = snap.sellFace.lo * (1 - 0.0004);
      tp = tp != null ? Math.min(tp, faceTp) : faceTp;
    }
    if (tp != null && tp > price) {
      const movePct = ((tp - price) / price) * 100;
      if (movePct < targetPricePct * 0.4) {
        return {
          allow: false,
          reasonKo: `다음저항까지 ${movePct.toFixed(3)}% · ROE≈${AIZONE_TARGET_ROE_PCT}%대 미달 · 롱스킵`,
          suggestTp: tp,
          suggestSl,
          snap,
          pctMinUsed: pctMin,
          evidenceOk: true,
          evidenceKo: evidence.summaryKo,
          evidenceAlignedN: evidence.alignedN,
        };
      }
    }
    const slKo =
      suggestSl != null
        ? ` · SL롱구간밑 ${suggestSl.toFixed(suggestSl >= 100 ? 1 : 4)}`
        : '';
    if (!(suggestSl != null && tp != null)) {
      return {
        allow: false,
        reasonKo: 'AIZONE 롱 · SL/TP(다음저항) 없음 · WAIT',
        suggestTp: tp,
        suggestSl,
        snap,
        pctMinUsed: pctMin,
        evidenceOk: true,
        evidenceKo: evidence.summaryKo,
        evidenceAlignedN: evidence.alignedN,
      };
    }
    const fee = aiZoneFeeRrGate({
      entry: price,
      sl: suggestSl,
      tp,
      direction: 'LONG',
      leverage: lev,
    });
    if (!fee.ok) {
      return {
        allow: false,
        reasonKo: fee.reasonKo,
        suggestTp: tp,
        suggestSl,
        snap,
        pctMinUsed: pctMin,
        evidenceOk: true,
        evidenceKo: evidence.summaryKo,
        evidenceAlignedN: evidence.alignedN,
      };
    }
    return {
      allow: true,
      reasonKo:
        longPct != null
          ? `AIZONE 롱 ${longPct.toFixed(0)}%≥${pctMin}(${volTag}) · ${evidence.summaryKo}${slKo} · ${fee.reasonKo} · 확정아님`
          : `AIZONE 롱통과 · ${evidence.summaryKo}${slKo} · ${fee.reasonKo} · 확정아님`,
      suggestTp: tp,
      suggestSl,
      snap,
      pctMinUsed: pctMin,
      evidenceOk: true,
      evidenceKo: evidence.summaryKo,
      evidenceAlignedN: evidence.alignedN,
    };
  }
  const shortPct = snap.shortPct;
  if (shortPct != null && shortPct < pctMin) {
    return {
      allow: false,
      reasonKo: `AIZONE 숏추정 ${shortPct.toFixed(0)}%<${pctMin}%(${volTag}) · 숏스킵`,
      suggestTp: null,
      suggestSl: null,
      snap,
      pctMinUsed: pctMin,
      evidenceOk: true,
      evidenceKo: evidence.summaryKo,
      evidenceAlignedN: evidence.alignedN,
    };
  }
  if (snap.buyFace && nearBand(price, snap.buyFace, bufPct)) {
    return {
      allow: false,
      reasonKo: `매수면 부근 추격숏 금지 · @${snap.buyFace.mid.toFixed(snap.buyFace.mid >= 100 ? 1 : 4)}`,
      suggestTp: null,
      suggestSl: null,
      snap,
      pctMinUsed: pctMin,
      evidenceOk: true,
      evidenceKo: evidence.summaryKo,
      evidenceAlignedN: evidence.alignedN,
    };
  }
  if (snap.volumeHeavy && snap.buyFace && nearBand(price, snap.buyFace, bufPct * 1.5)) {
    return {
      allow: false,
      reasonKo: '거래과다+매수면근접 · 숏스킵',
      suggestTp: null,
      suggestSl: null,
      snap,
      pctMinUsed: pctMin,
      evidenceOk: true,
      evidenceKo: evidence.summaryKo,
      evidenceAlignedN: evidence.alignedN,
    };
  }
  const suggestSlS = resolveAiZoneShortSl(snap.shortZone ?? snap.sellFace, price);
  let tpS: number | null = null;
  if (snap.nextSupport != null && snap.nextSupport < price) tpS = snap.nextSupport;
  if (snap.buyFace && snap.buyFace.hi < price) {
    const faceTp = snap.buyFace.hi * (1 + 0.0004);
    tpS = tpS != null ? Math.max(tpS, faceTp) : faceTp;
  }
  if (tpS != null && tpS < price) {
    const movePct = ((price - tpS) / price) * 100;
    if (movePct < targetPricePct * 0.4) {
      return {
        allow: false,
        reasonKo: `다음지지까지 ${movePct.toFixed(3)}% · ROE≈${AIZONE_TARGET_ROE_PCT}%대 미달 · 숏스킵`,
        suggestTp: tpS,
        suggestSl: suggestSlS,
        snap,
        pctMinUsed: pctMin,
        evidenceOk: true,
        evidenceKo: evidence.summaryKo,
        evidenceAlignedN: evidence.alignedN,
      };
    }
  }
  const slKoS =
    suggestSlS != null
      ? ` · SL숏구간위 ${suggestSlS.toFixed(suggestSlS >= 100 ? 1 : 4)}`
      : '';
  if (!(suggestSlS != null && tpS != null)) {
    return {
      allow: false,
      reasonKo: 'AIZONE 숏 · SL/TP(다음지지) 없음 · WAIT',
      suggestTp: tpS,
      suggestSl: suggestSlS,
      snap,
      pctMinUsed: pctMin,
      evidenceOk: true,
      evidenceKo: evidence.summaryKo,
      evidenceAlignedN: evidence.alignedN,
    };
  }
  const feeS = aiZoneFeeRrGate({
    entry: price,
    sl: suggestSlS,
    tp: tpS,
    direction: 'SHORT',
    leverage: lev,
  });
  if (!feeS.ok) {
    return {
      allow: false,
      reasonKo: feeS.reasonKo,
      suggestTp: tpS,
      suggestSl: suggestSlS,
      snap,
      pctMinUsed: pctMin,
      evidenceOk: true,
      evidenceKo: evidence.summaryKo,
      evidenceAlignedN: evidence.alignedN,
    };
  }
  return {
    allow: true,
    reasonKo:
      shortPct != null
        ? `AIZONE 숏 ${shortPct.toFixed(0)}%≥${pctMin}(${volTag}) · ${evidence.summaryKo}${slKoS} · ${feeS.reasonKo} · 확정아님`
        : `AIZONE 숏통과 · ${evidence.summaryKo}${slKoS} · ${feeS.reasonKo} · 확정아님`,
    suggestTp: tpS,
    suggestSl: suggestSlS,
    snap,
    pctMinUsed: pctMin,
    evidenceOk: true,
    evidenceKo: evidence.summaryKo,
    evidenceAlignedN: evidence.alignedN,
  };
}
