/**
 * 기능 통계 전 항목 × AVWAP·피보·골든·헌팅 → 롱/숏/WAIT 합류.
 * 확정 승률·수익 보장 문구 금지 · 표본 부족 시 WAIT.
 */
import type { Candle } from '@/types';
import type { AtlasPulsePriceLine } from '@/lib/monthDeskAtlasPulseDesk';
import type { MergedDeskFeatureStatsPack } from '@/lib/mergedDeskFeatureStatsSim';
import type { AvwapFibConfluencePack, AvwapFibLeg } from './avwapFibConfluence';
import { AVWAP_FIB_COLORS } from './avwapFibConfluence';
import { isAvwapFibLevelDeepRef } from './avwapPrecisionEntry';

export type AvwapStatsHubBias = 'long' | 'short' | 'wait';

export type AvwapStatsHubVote = {
  id: string;
  groupKo: string;
  labelKo: string;
  side: AvwapStatsHubBias;
  weight: number;
  noteKo: string;
};

export type AvwapStatsHubTargets = {
  pullbackKo: string | null;
  reboundKo: string | null;
  huntKo: string | null;
  settleKo: string | null;
};

export type AvwapStatsConfluenceHub = {
  bias: AvwapStatsHubBias;
  longScore: number;
  shortScore: number;
  confidence: number;
  entryAllowed: boolean;
  titleKo: string;
  summaryKo: string;
  votes: AvwapStatsHubVote[];
  targets: AvwapStatsHubTargets;
  priceLines: AtlasPulsePriceLine[];
  disclaimerKo: string;
};

const WAIT_GAP = 8;
const MIN_CONF_ENTER = 52;

function pushVote(
  votes: AvwapStatsHubVote[],
  id: string,
  groupKo: string,
  labelKo: string,
  side: AvwapStatsHubBias,
  weight: number,
  noteKo: string
): void {
  if (side === 'wait' || !(weight > 0)) return;
  votes.push({ id, groupKo, labelKo, side, weight, noteKo });
}

function fibTargets(legs: AvwapFibLeg[], price: number, atr: number): AvwapStatsHubTargets {
  const hi = legs.find((l) => l.role === 'high');
  const lo = legs.find((l) => l.role === 'low');
  const fmt = (n: number) => Math.round(n).toLocaleString();
  let pullbackKo: string | null = null;
  let reboundKo: string | null = null;
  let huntKo: string | null = null;
  let settleKo: string | null = null;

  if (hi) {
    const gpMid = (hi.goldenTop + hi.goldenBot) / 2;
    const deep = isAvwapFibLevelDeepRef(price, gpMid, atr);
    pullbackKo = deep
      ? `고점피보 깊은GP ${fmt(gpMid)} (참고·즉시숏아님)`
      : `고점피보 되돌림·GP ${fmt(gpMid)} (${hi.settleKo})`;
    huntKo = `고헌팅 ${fmt(hi.huntAboveBot)}~${fmt(hi.huntAboveTop)}`;
    settleKo = `AVWAP고·${hi.settleKo}`;
  }
  if (lo) {
    const gpMid = (lo.goldenTop + lo.goldenBot) / 2;
    const deep = isAvwapFibLevelDeepRef(price, gpMid, atr);
    reboundKo = deep
      ? `저점피보 깊은GP ${fmt(gpMid)} (참고·즉시롱아님 · 구간큼)`
      : `저점피보 반등·GP ${fmt(gpMid)} (${lo.settleKo})`;
    const huntLo = `저헌팅 ${fmt(lo.huntBelowBot)}~${fmt(lo.huntBelowTop)}`;
    huntKo = huntKo ? `${huntKo} · ${huntLo}` : huntLo;
    if (!settleKo) settleKo = `AVWAP저·${lo.settleKo}`;
    else settleKo = `${settleKo} / 저·${lo.settleKo}`;
  }
  return { pullbackKo, reboundKo, huntKo, settleKo };
}

/**
 * 통계 팩 + AVWAP 피보 레그 → 합류 허브.
 */
export function buildAvwapStatsConfluenceHub(params: {
  candles: Candle[];
  stats: MergedDeskFeatureStatsPack | null;
  fibPack: AvwapFibConfluencePack | null;
}): AvwapStatsConfluenceHub {
  const empty: AvwapStatsConfluenceHub = {
    bias: 'wait',
    longScore: 0,
    shortScore: 0,
    confidence: 0,
    entryAllowed: false,
    titleKo: 'AVWAP·AI · 대기',
    summaryKo: '통계·피보 합류 대기',
    votes: [],
    targets: { pullbackKo: null, reboundKo: null, huntKo: null, settleKo: null },
    priceLines: [],
    disclaimerKo: '조건부 합류 점수입니다. 확정 승률·수익 보장 아님.',
  };

  const candles = params.candles ?? [];
  const stats = params.stats;
  const fib = params.fibPack;
  if (candles.length < 48 || !stats) return empty;

  const votes: AvwapStatsHubVote[] = [];
  const legs = fib?.legs ?? [];
  const end = Math.max(0, candles.length - 2);
  const price = Number(candles[end]?.close) || 0;
  let atrSum = 0;
  let atrN = 0;
  for (let i = Math.max(1, end - 13); i <= end; i++) {
    const a = candles[i]!;
    const b = candles[i - 1]!;
    const tr = Math.max(
      Number(a.high) - Number(a.low),
      Math.abs(Number(a.high) - Number(b.close)),
      Math.abs(Number(a.low) - Number(b.close))
    );
    if (Number.isFinite(tr)) {
      atrSum += tr;
      atrN += 1;
    }
  }
  const atr = atrN > 0 ? atrSum / atrN : price * 0.004;
  const targets = fibTargets(legs, price, atr);

  /** 1) AVWAP 피보 레그 상태 — 깊은 GP는 투표 강등(선물 즉시 진입 금지) */
  for (const leg of legs) {
    const gpMid = (leg.goldenTop + leg.goldenBot) / 2;
    const deep = isAvwapFibLevelDeepRef(price, gpMid, atr);
    if (leg.bias === 'long') {
      if (deep) {
        pushVote(
          votes,
          `fib-deep-${leg.role}`,
          'AVWAP피보',
          '깊은GP·참고만',
          'wait',
          0,
          '0.5/0.618 멀리 있음 · 즉시 롱 아님'
        );
      } else {
        pushVote(
          votes,
          `fib-${leg.role}`,
          'AVWAP피보',
          leg.role === 'low' ? '저점피보' : '고점피보',
          'long',
          leg.settleKo === '골든포켓' || leg.settleKo === '안착확정' ? 18 : 12,
          leg.noteKo
        );
      }
    } else if (leg.bias === 'short') {
      if (deep) {
        pushVote(
          votes,
          `fib-deep-${leg.role}`,
          'AVWAP피보',
          '깊은GP·참고만',
          'wait',
          0,
          '깊은 되돌림 · 즉시 숏 아님'
        );
      } else {
        pushVote(
          votes,
          `fib-${leg.role}`,
          'AVWAP피보',
          leg.role === 'high' ? '고점피보' : '저점피보',
          'short',
          leg.settleKo === '골든포켓' || leg.settleKo === '안착확정' ? 18 : 12,
          leg.noteKo
        );
      }
    } else if (leg.settleKo === '헌팅열림') {
      pushVote(
        votes,
        `fib-hunt-${leg.role}`,
        '헌팅',
        `${leg.role === 'high' ? '고' : '저'}헌팅열림`,
        'wait',
        0,
        '헌팅 구간 — 회수 전 대기'
      );
    }
  }

  /** 1b) 정밀 타점 합류 */
  const prec = fib?.precision?.candidates ?? [];
  for (const c of prec.slice(0, 4)) {
    if (c.side === 'LONG') {
      pushVote(votes, `prec-l-${Math.round(c.mid)}`, '정밀타점', c.labelsKo[0] ?? '근접합류', 'long', 15, c.noteKo);
    } else if (c.side === 'SHORT') {
      pushVote(votes, `prec-s-${Math.round(c.mid)}`, '정밀타점', c.labelsKo[0] ?? '근접합류', 'short', 15, c.noteKo);
    }
  }

  /** 2) 지지·저항 레벨 (AVWAP·존·EMA 등) */
  const avwapLv = stats.levels.find((r) => r.kind === 'avwap');
  if (avwapLv) {
    const hold = avwapLv.supportHoldPct ?? 0;
    const rej = avwapLv.resistRejectPct ?? 0;
    if (hold >= rej + 8 && hold >= 52) {
      pushVote(votes, 'sr-avwap', '지지저항', 'AVWAP 지지유지', 'long', 14, levelNote(avwapLv));
    } else if (rej >= hold + 8 && rej >= 52) {
      pushVote(votes, 'sr-avwap', '지지저항', 'AVWAP 저항거절', 'short', 14, levelNote(avwapLv));
    }
  }
  const bestSup = stats.levels
    .filter((r) => r.supportHoldPct != null && r.touches >= 5)
    .sort((a, b) => (b.supportHoldPct || 0) - (a.supportHoldPct || 0))[0];
  const bestRes = stats.levels
    .filter((r) => r.resistRejectPct != null && r.touches >= 5)
    .sort((a, b) => (b.resistRejectPct || 0) - (a.resistRejectPct || 0))[0];
  if (bestSup && (bestSup.supportHoldPct ?? 0) >= 55) {
    pushVote(
      votes,
      'sr-best-sup',
      '지지저항',
      bestSup.labelKo,
      'long',
      10,
      `지지유지 ${bestSup.supportHoldPct}%`
    );
  }
  if (bestRes && (bestRes.resistRejectPct ?? 0) >= 55) {
    pushVote(
      votes,
      'sr-best-res',
      '지지저항',
      bestRes.labelKo,
      'short',
      10,
      `저항거절 ${bestRes.resistRejectPct}%`
    );
  }

  /** 3) 거래량 */
  const upHi = stats.volume.find((v) => v.id === 'upHiVol');
  const dnHi = stats.volume.find((v) => v.id === 'downHiVol');
  if (upHi && dnHi && upHi.sample + dnHi.sample >= 8) {
    const um = Math.abs(upHi.medianClosePct ?? 0);
    const dm = Math.abs(dnHi.medianClosePct ?? 0);
    if (um > dm + 0.05) {
      pushVote(votes, 'vol-up', '거래량', '고거래 양봉', 'long', 11, `중앙 ${upHi.medianClosePct}%`);
    } else if (dm > um + 0.05) {
      pushVote(votes, 'vol-dn', '거래량', '고거래 음봉', 'short', 11, `중앙 ${dnHi.medianClosePct}%`);
    }
  }

  /** 4) 안착·마감 */
  const sealL = stats.settle.find((s) => s.id === 'sealLong');
  const sealS = stats.settle.find((s) => s.id === 'sealShort');
  if (sealL?.nextDirHitPct != null && sealS?.nextDirHitPct != null) {
    if (sealL.nextDirHitPct >= sealS.nextDirHitPct + 5 && !sealL.sampleLowTrust) {
      pushVote(
        votes,
        'settle-l',
        '안착마감',
        '상승안착 적중',
        'long',
        12,
        `${sealL.nextDirHitPct}% n=${sealL.sample}`
      );
    } else if (sealS.nextDirHitPct >= sealL.nextDirHitPct + 5 && !sealS.sampleLowTrust) {
      pushVote(
        votes,
        'settle-s',
        '안착마감',
        '하락안착 적중',
        'short',
        12,
        `${sealS.nextDirHitPct}% n=${sealS.sample}`
      );
    }
  }

  /** 5) 반등·돌파 */
  for (const b of stats.bounce) {
    if (b.successPct == null || b.sample < 6) continue;
    const isSup = /지지|반등|demand|롱|long/i.test(b.labelKo);
    const isRes = /저항|거절|supply|숏|short/i.test(b.labelKo);
    if (isSup && b.successPct >= 55) {
      pushVote(votes, `bounce-${b.id}`, '반등돌파', b.labelKo, 'long', 10, `성공 ${b.successPct}%`);
    } else if (isRes && b.successPct >= 55) {
      pushVote(votes, `bounce-${b.id}`, '반등돌파', b.labelKo, 'short', 10, `성공 ${b.successPct}%`);
    }
  }

  /** 6) 현물 시뮬 — 첫 신뢰 행 */
  const spotOk = stats.spot.find((s) => !s.sampleLowTrust && s.sample >= 10);
  if (spotOk && spotOk.upPct != null && spotOk.downPct != null) {
    if (spotOk.upPct >= spotOk.downPct + 8) {
      pushVote(votes, 'spot', '현물시뮬', spotOk.labelKo, 'long', 8, `상승 ${spotOk.upPct}%`);
    } else if (spotOk.downPct >= spotOk.upPct + 8) {
      pushVote(votes, 'spot', '현물시뮬', spotOk.labelKo, 'short', 8, `하락 ${spotOk.downPct}%`);
    }
  }

  /** 7) 카드·ActiveTrade */
  for (const c of stats.card) {
    const v = c.valueKo;
    if (/LONG|롱/.test(v) && !/SHORT|숏/.test(v)) {
      pushVote(votes, `card-${c.id}`, '카드합류', c.labelKo, 'long', c.tone === 'good' ? 14 : 8, v);
    } else if (/SHORT|숏/.test(v) && !/LONG|롱/.test(v)) {
      pushVote(votes, `card-${c.id}`, '카드합류', c.labelKo, 'short', c.tone === 'good' ? 14 : 8, v);
    }
  }

  /** 8) Hub 판정 문자열 */
  if (stats.headline.settleBiasKo?.includes('상승')) {
    pushVote(votes, 'hl-settle', '요약', '안착 상승쪽', 'long', 6, stats.headline.settleBiasKo);
  } else if (stats.headline.settleBiasKo?.includes('하락')) {
    pushVote(votes, 'hl-settle', '요약', '안착 하락쪽', 'short', 6, stats.headline.settleBiasKo);
  }

  let longScore = 0;
  let shortScore = 0;
  for (const v of votes) {
    if (v.side === 'long') longScore += v.weight;
    else if (v.side === 'short') shortScore += v.weight;
  }

  const gap = Math.abs(longScore - shortScore);
  const total = longScore + shortScore;
  let bias: AvwapStatsHubBias = 'wait';
  if (total >= 20 && gap >= WAIT_GAP) {
    bias = longScore > shortScore ? 'long' : 'short';
  }

  /** 헌팅만 열려 있고 합류 약하면 WAIT 강화 */
  const huntOpen = legs.some((l) => l.settleKo === '헌팅열림');
  if (huntOpen && gap < WAIT_GAP + 4) {
    bias = 'wait';
  }

  const confidence =
    total <= 0 ? 0 : Math.min(92, Math.round((gap / Math.max(total, 1)) * 55 + Math.min(total, 80) * 0.35));

  const entryAllowed =
    bias !== 'wait' && confidence >= MIN_CONF_ENTER && !huntOpen && gap >= WAIT_GAP + 2;

  const biasKo = bias === 'long' ? '롱' : bias === 'short' ? '숏' : '대기';
  const titleKo = entryAllowed
    ? `AVWAP·AI · ${biasKo}후보`
    : bias === 'wait'
      ? 'AVWAP·AI · 대기'
      : `AVWAP·AI · ${biasKo}관찰`;

  const bits: string[] = [`L${longScore}/S${shortScore}`, `합류${confidence}`];
  if (targets.settleKo) bits.push(targets.settleKo);
  if (targets.pullbackKo && bias === 'short') bits.push('되돌림GP');
  if (targets.reboundKo && bias === 'long') bits.push('반등GP');
  if (huntOpen) bits.push('헌팅열림');

  const summaryKo = `${titleKo} · ${bits.join(' · ')}`.slice(0, 72);

  const priceLines = buildHubPriceLines(legs, bias, titleKo, price, atr, fib?.precision?.candidates ?? []);

  return {
    bias,
    longScore,
    shortScore,
    confidence,
    entryAllowed,
    titleKo,
    summaryKo,
    votes,
    targets,
    priceLines,
    disclaimerKo: empty.disclaimerKo,
  };
}

function levelNote(r: { supportHoldPct: number | null; resistRejectPct: number | null; touches: number }): string {
  const bits: string[] = [`터치${r.touches}`];
  if (r.supportHoldPct != null) bits.push(`지지${r.supportHoldPct}%`);
  if (r.resistRejectPct != null) bits.push(`저항${r.resistRejectPct}%`);
  return bits.join(' · ');
}

function buildHubPriceLines(
  legs: AvwapFibLeg[],
  bias: AvwapStatsHubBias,
  titleKo: string,
  price: number,
  atr: number,
  precision: Array<{ side: string; entry: number }>
): AtlasPulsePriceLine[] {
  /** 정밀 E가 있으면 그걸 허브 선으로 — 깊은 GP 대신 */
  const want = bias === 'long' ? 'LONG' : bias === 'short' ? 'SHORT' : null;
  const precHit = want ? precision.find((c) => c.side === want) : precision[0];
  if (precHit && precHit.entry > 0) {
    const color =
      precHit.side === 'LONG' ? AVWAP_FIB_COLORS.lowExt : AVWAP_FIB_COLORS.highOpen;
    return [
      {
        price: precHit.entry,
        color,
        title: `${titleKo}·정밀E`,
        lineWidth: 2,
        lineStyle: 'solid',
        axisLabel: false,
      },
    ];
  }

  const primary = legs.find((l) => (bias === 'long' ? l.role === 'low' : l.role === 'high')) ?? legs[0];
  if (!primary) return [];
  const color =
    bias === 'long'
      ? AVWAP_FIB_COLORS.lowExt
      : bias === 'short'
        ? AVWAP_FIB_COLORS.highOpen
        : AVWAP_FIB_COLORS.highExt;
  const mid = (primary.goldenTop + primary.goldenBot) / 2;
  if (isAvwapFibLevelDeepRef(price, mid, atr)) {
    return [
      {
        price: mid,
        color,
        title: `${titleKo}·깊은GP(참고)`,
        lineWidth: 1,
        lineStyle: 'dotted',
        axisLabel: false,
      },
    ];
  }
  return [
    {
      price: mid,
      color,
      title: titleKo,
      lineWidth: bias === 'wait' ? 1 : 2,
      lineStyle: bias === 'wait' ? 'dotted' : 'dashed',
      axisLabel: false,
    },
  ];
}

/** 통계 팩에 AVWAP·AI 섹션 붙이기 */
export function attachAvwapAiToFeatureStatsPack(
  pack: MergedDeskFeatureStatsPack,
  hub: AvwapStatsConfluenceHub
): MergedDeskFeatureStatsPack {
  const overviewKo = [
    `AVWAP·AI: ${hub.summaryKo}`,
    ...pack.overviewKo.filter((l) => !l.startsWith('AVWAP·AI:')),
  ];
  if (hub.targets.pullbackKo) overviewKo.push(`되돌림: ${hub.targets.pullbackKo}`);
  if (hub.targets.reboundKo) overviewKo.push(`반등: ${hub.targets.reboundKo}`);
  if (hub.targets.huntKo) overviewKo.push(`헌팅: ${hub.targets.huntKo}`);

  const modeFeatures = [
    {
      id: 'avwap-ai',
      groupKo: 'VWAP',
      labelKo: 'AVWAP·AI 합류',
      liveKo: hub.titleKo,
      statKo: `L${hub.longScore}/S${hub.shortScore} · 합류${hub.confidence}`,
      linked: true,
      tone:
        hub.entryAllowed ? ('good' as const) : hub.bias === 'wait' ? ('warn' as const) : ('neutral' as const),
    },
    {
      id: 'avwap-fib-gp',
      groupKo: 'VWAP',
      labelKo: '피보·골든·헌팅',
      liveKo: hub.targets.settleKo || '대기',
      statKo: [hub.targets.pullbackKo, hub.targets.reboundKo, hub.targets.huntKo]
        .filter(Boolean)
        .join(' · ')
        .slice(0, 80) || null,
      linked: true,
      tone: 'neutral' as const,
    },
    ...pack.modeFeatures.filter((m) => m.id !== 'avwap-ai' && m.id !== 'avwap-fib-gp'),
  ];

  const card = [
    {
      id: 'avwap-ai-bias',
      labelKo: 'AVWAP·AI',
      valueKo: `${hub.titleKo} · L${hub.longScore}/S${hub.shortScore}`,
      tone: hub.entryAllowed ? ('good' as const) : hub.bias === 'wait' ? ('warn' as const) : ('neutral' as const),
    },
    ...pack.card.filter((c) => c.id !== 'avwap-ai-bias'),
  ];

  return {
    ...pack,
    overviewKo,
    modeFeatures,
    card,
    avwapAi: {
      bias: hub.bias,
      longScore: hub.longScore,
      shortScore: hub.shortScore,
      confidence: hub.confidence,
      entryAllowed: hub.entryAllowed,
      titleKo: hub.titleKo,
      summaryKo: hub.summaryKo,
      votes: hub.votes,
      targets: hub.targets,
      disclaimerKo: hub.disclaimerKo,
    },
    headline: {
      ...pack.headline,
      settleBiasKo: hub.targets.settleKo || pack.headline.settleBiasKo,
    },
  };
}
