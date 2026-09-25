/**
 * AI 파랑빨강띠 × 거래량 DNA 펄스.
 * 수급 통로(RbVolumeSync) · 선진 거래량(AdvVol) · RVOL · 매수/매도% ·
 * 레일 위치 흡수/절정을 한 호흡으로 읽어 롱/숏 게이트를 낸다.
 * 카드/HUD 없음. 확정 매매·승률 아님.
 */
import type { Candle } from '@/types';
import type { MergedDeskRbVolumeSyncPack } from '@/lib/mergedDeskRbVolumeSync';
import type { AdvVolBarRead, MergedDeskAdvVolumePack } from '@/lib/mergedDeskAdvVolumeRead';
import type { MergedDeskRbCorridorPaint } from '@/lib/mergedDeskRbCorridorPaint';
import { estimateBarBuySell } from '@/lib/volumeDirectionStats';
import {
  candleBodyRatioOfRange,
  smaTotalVolumeAt,
} from '@/lib/volumeHistogramIntelligence';
import {
  mergedDeskReactionGradeFromScore,
  type MergedDeskRbBounceGrade,
} from '@/lib/mergedDeskRbBounceStrength';

export type RbVolPulseSide = 'LONG' | 'SHORT' | 'WAIT';
export type RbVolGate = 'go' | 'caution' | 'block' | 'watch';

export type MergedDeskRbVolumePulse = {
  side: RbVolPulseSide;
  gate: RbVolGate;
  grade: MergedDeskRbBounceGrade;
  gradeKo: '약' | '중' | '강' | '초강';
  score: number;
  scoreLong: number;
  scoreShort: number;
  rvol: number | null;
  buyPct: number;
  sellPct: number;
  /** 흡수·절정·돌파V·수급동의 등 */
  fingerprintKo: string;
  /** 한 줄 스토리 */
  storyKo: string;
  /** 스트립용 짧은 태그 */
  tagKo: string;
  detailKo: string;
  /** 거래량이 진입을 밀어주는지 */
  entryBoost: boolean;
  /** 거래량이 진입을 막는 신호인지(절정·괴리) */
  entryBlock: boolean;
  reasons: string[];
};

function clamp(n: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

function lastBars(candles: Candle[], n: number): Candle[] {
  if (!candles.length) return [];
  return candles.slice(Math.max(0, candles.length - n));
}

function rvolLast(candles: Candle[], period = 20): number | null {
  const i = candles.length - 1;
  if (i < period - 1) return null;
  const sma = smaTotalVolumeAt(candles, i, period);
  const v = Math.max(0, Number(candles[i]?.volume) || 0);
  if (!(sma > 0)) return null;
  return v / sma;
}

function windowBuySell(candles: Candle[]): { buyPct: number; sellPct: number } {
  let buy = 0;
  let sell = 0;
  for (const c of candles) {
    const sp = estimateBarBuySell(c);
    buy += sp.buyVol;
    sell += sp.sellVol;
  }
  const tot = buy + sell;
  if (!(tot > 0)) return { buyPct: 0.5, sellPct: 0.5 };
  return { buyPct: buy / tot, sellPct: sell / tot };
}

function kindBias(kind: AdvVolBarRead['kind'] | null | undefined): {
  side: RbVolPulseSide;
  pts: number;
  ko: string;
  block?: boolean;
  caution?: boolean;
} {
  switch (kind) {
    case 'confirm-up':
    case 'break-up':
    case 'buy-dom':
      return { side: 'LONG', pts: 14, ko: kind === 'break-up' ? '돌파V↑' : kind === 'confirm-up' ? '수급동의↑' : '매수우세' };
    case 'confirm-dn':
    case 'break-dn':
    case 'sell-dom':
      return { side: 'SHORT', pts: 14, ko: kind === 'break-dn' ? '이탈V↓' : kind === 'confirm-dn' ? '수급동의↓' : '매도우세' };
    case 'absorb':
      return { side: 'WAIT', pts: 10, ko: '흡수(방향대기)', caution: true };
    case 'climax-up':
      return { side: 'SHORT', pts: 12, ko: '매수절정·과열주의', block: true, caution: true };
    case 'climax-dn':
      return { side: 'LONG', pts: 12, ko: '매도절정·반등여지', caution: true };
    case 'diverge':
      return { side: 'WAIT', pts: 8, ko: '수급괴리', block: true };
    case 'no-demand':
      return { side: 'SHORT', pts: 6, ko: '수요없음', caution: true };
    case 'no-supply':
      return { side: 'LONG', pts: 6, ko: '공급없음', caution: true };
    case 'dump1':
      return { side: 'SHORT', pts: 10, ko: '덤프1' };
    case 'bounce2':
      return { side: 'LONG', pts: 10, ko: '반등2' };
    case 'rally1':
      return { side: 'LONG', pts: 9, ko: '랠리1' };
    case 'drop2':
      return { side: 'SHORT', pts: 9, ko: '드롭2' };
    default:
      return { side: 'WAIT', pts: 0, ko: '혼조' };
  }
}

/**
 * 거래량 DNA 펄스 — 채널·레일 맥락과 함께 읽는다.
 */
export function computeMergedDeskRbVolumePulse(params: {
  candles: Candle[];
  volSync?: MergedDeskRbVolumeSyncPack | null;
  advVol?: MergedDeskAdvVolumePack | null;
  paint?: MergedDeskRbCorridorPaint | null;
}): MergedDeskRbVolumePulse {
  const empty: MergedDeskRbVolumePulse = {
    side: 'WAIT',
    gate: 'watch',
    grade: 'weak',
    gradeKo: '약',
    score: 0,
    scoreLong: 0,
    scoreShort: 0,
    rvol: null,
    buyPct: 0.5,
    sellPct: 0.5,
    fingerprintKo: '거래량 대기',
    storyKo: '거래량 합류 부족 · 관망',
    tagKo: 'V대기',
    detailKo: '수급·RVOL·선진거래량 표본이 약함(참고)',
    entryBoost: false,
    entryBlock: false,
    reasons: [],
  };

  const candles = params.candles ?? [];
  if (candles.length < 8) return empty;

  const reasons: string[] = [];
  let longN = 0;
  let shortN = 0;
  let block = false;
  let caution = false;

  const win = lastBars(candles, 12);
  const bs = windowBuySell(win);
  const rvol = params.volSync?.rvol ?? rvolLast(candles);
  const last = params.advVol?.last ?? null;
  const paint = params.paint;

  /** 1) 창 수급 */
  if (bs.buyPct >= 0.58) {
    longN += 10;
    reasons.push(`+10 창매수 ${Math.round(bs.buyPct * 100)}%`);
  } else if (bs.sellPct >= 0.58) {
    shortN += 10;
    reasons.push(`+10 창매도 ${Math.round(bs.sellPct * 100)}%`);
  } else {
    reasons.push(`창혼조 ${Math.round(bs.buyPct * 100)}/${Math.round(bs.sellPct * 100)}`);
  }

  /** 2) RVOL 강도 */
  if (rvol != null) {
    if (rvol >= 2.4) {
      const add = 12;
      if (bs.buyPct >= bs.sellPct) {
        longN += add;
        reasons.push(`+${add} RVOL초강 ${rvol.toFixed(1)}×`);
      } else {
        shortN += add;
        reasons.push(`+${add} RVOL초강 ${rvol.toFixed(1)}×`);
      }
    } else if (rvol >= 1.65) {
      const add = 8;
      if (bs.buyPct >= bs.sellPct) {
        longN += add;
        reasons.push(`+${add} RVOL강 ${rvol.toFixed(1)}×`);
      } else {
        shortN += add;
        reasons.push(`+${add} RVOL강 ${rvol.toFixed(1)}×`);
      }
    } else if (rvol >= 1.15) {
      const add = 4;
      if (bs.buyPct >= bs.sellPct) longN += add;
      else shortN += add;
      reasons.push(`+${add} RVOL중 ${rvol.toFixed(1)}×`);
    } else if (rvol < 0.7) {
      caution = true;
      reasons.push(`RVOL약 ${rvol.toFixed(1)}× · 추진력 부족`);
    }
  }

  /** 3) RbVolumeSync 통로 수급 */
  const vs = params.volSync;
  if (vs) {
    if (vs.confirm === 'confirm' && vs.side === 'up') {
      longN += 14;
      reasons.push('+14 통로수급동의↑');
    } else if (vs.confirm === 'confirm' && vs.side === 'down') {
      shortN += 14;
      reasons.push('+14 통로수급동의↓');
    } else if (vs.confirm === 'diverge') {
      block = true;
      caution = true;
      if (vs.side === 'up') {
        shortN += 8;
        reasons.push('+8 통로수급괴리→숏경계');
      } else if (vs.side === 'down') {
        longN += 8;
        reasons.push('+8 통로수급괴리→롱경계');
      } else {
        reasons.push('통로수급괴리·관망');
      }
    } else if (vs.whaleHint === 'long') {
      longN += 6;
      reasons.push('+6 고래힌트롱');
    } else if (vs.whaleHint === 'short') {
      shortN += 6;
      reasons.push('+6 고래힌트숏');
    }
    if (vs.volTrend === 'grow' && vs.side === 'up') {
      longN += 4;
      reasons.push('+4 거래량성장·상승');
    } else if (vs.volTrend === 'grow' && vs.side === 'down') {
      shortN += 4;
      reasons.push('+4 거래량성장·하락');
    }
  }

  /** 4) 선진 거래량 마지막 봉 */
  const kb = kindBias(last?.kind);
  if (kb.pts > 0) {
    if (kb.side === 'LONG') longN += kb.pts;
    else if (kb.side === 'SHORT') shortN += kb.pts;
    reasons.push(`+${kb.pts} ${kb.ko}`);
  }
  if (kb.block) block = true;
  if (kb.caution) caution = true;

  /** 흡수 + 레일 = 반등/하락 자리 강화 */
  const c = candles[candles.length - 1]!;
  const body = candleBodyRatioOfRange(c);
  const absorbNow =
    last?.kind === 'absorb' ||
    (rvol != null && rvol >= 1.45 && body != null && body <= 0.28);
  if (absorbNow && paint?.atSupport) {
    longN += 16;
    reasons.push('+16 하단레일·흡수');
    caution = false;
  } else if (absorbNow && paint?.atResist) {
    shortN += 16;
    reasons.push('+16 상단레일·흡수거부');
    caution = false;
  } else if (absorbNow) {
    reasons.push('흡수 확인 · 방향은 레일/채널 대기');
    caution = true;
  }

  /** 레일 반응 + 수급 일치 */
  if (paint?.trigger === 'rail-bounce' && bs.buyPct >= 0.54) {
    longN += 10;
    reasons.push('+10 레일반등×매수수급');
  }
  if (paint?.trigger === 'rail-drop' && bs.sellPct >= 0.54) {
    shortN += 10;
    reasons.push('+10 레일하락×매도수급');
  }

  const scoreLong = clamp(longN);
  const scoreShort = clamp(shortN);
  const margin = Math.abs(scoreLong - scoreShort);
  let side: RbVolPulseSide = 'WAIT';
  if (scoreLong >= scoreShort + 10 && scoreLong >= 28) side = 'LONG';
  else if (scoreShort >= scoreLong + 10 && scoreShort >= 28) side = 'SHORT';

  const raw = side === 'LONG' ? scoreLong : side === 'SHORT' ? scoreShort : Math.max(scoreLong, scoreShort);
  const grade = mergedDeskReactionGradeFromScore(raw + (rvol != null && rvol >= 2 ? 6 : 0));
  const gradeKo: MergedDeskRbVolumePulse['gradeKo'] =
    grade === 'ultra' ? '초강' : grade === 'strong' ? '강' : grade === 'mid' ? '중' : '약';

  let gate: RbVolGate = 'watch';
  if (block && side !== 'WAIT') gate = 'block';
  else if (caution && side !== 'WAIT') gate = 'caution';
  else if (side !== 'WAIT' && (grade === 'mid' || grade === 'strong' || grade === 'ultra') && margin >= 8)
    gate = 'go';
  else if (side !== 'WAIT') gate = 'caution';

  const fingerprintKo = [
    last?.tagKo || null,
    vs?.confirm === 'confirm' ? '수급동의' : vs?.confirm === 'diverge' ? '수급괴리' : null,
    rvol != null && rvol >= 1.65 ? `RVOL${rvol.toFixed(1)}×` : null,
    absorbNow ? '흡수' : null,
    paint?.trigger === 'rail-bounce' ? '레일반등V' : paint?.trigger === 'rail-drop' ? '레일하락V' : null,
  ]
    .filter(Boolean)
    .join('·') || '거래량혼조';

  const dirKo = side === 'LONG' ? '롱' : side === 'SHORT' ? '숏' : '관망';
  const gateKo =
    gate === 'go' ? '진입가속' : gate === 'caution' ? '주의' : gate === 'block' ? '진입차단' : '관찰';
  const tagKo = `V${gradeKo}${dirKo}`;
  const storyKo = `거래량DNA · ${fingerprintKo} · ${dirKo}${gateKo}(${gradeKo})`;
  const detailKo = [
    storyKo,
    `창매수 ${Math.round(bs.buyPct * 100)}% / 매도 ${Math.round(bs.sellPct * 100)}%`,
    rvol != null ? `RVOL ${rvol.toFixed(2)}×` : '',
    vs?.summaryKo || '',
    last ? `선진 ${last.tagKo}·${last.actionKo}` : '',
    reasons.slice(0, 6).join(' · '),
    '거래량 합류 = 조건부 참고(승률·확정 아님)',
  ]
    .filter(Boolean)
    .join(' · ');

  return {
    side,
    gate,
    grade,
    gradeKo,
    score: raw,
    scoreLong,
    scoreShort,
    rvol,
    buyPct: bs.buyPct,
    sellPct: bs.sellPct,
    fingerprintKo,
    storyKo,
    tagKo,
    detailKo,
    entryBoost: gate === 'go' && side !== 'WAIT',
    entryBlock: gate === 'block',
    reasons,
  };
}
