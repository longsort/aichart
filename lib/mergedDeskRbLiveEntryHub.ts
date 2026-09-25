/**
 * AI 파랑빨강띠 라이브 진입 허브.
 * 기관밴드 · VRVP POC · 채널 · Hot헌팅 · $$$$ · 수급 · 레일반응을
 * 한 표결로 묶어 롱/숏/관망 + 약·중·강·초 등급을 낸다.
 * 확정 매매·승률·수익 보장 아님. 조건부 참고.
 */
import type { Candle, OverlayItem } from '@/types';
import type { MergedDeskChannelGeom } from '@/lib/mergedDeskBlueRedChannels';
import type { MergedDeskRbCorridorPaint } from '@/lib/mergedDeskRbCorridorPaint';
import type { MergedDeskRbVolumeSyncPack } from '@/lib/mergedDeskRbVolumeSync';
import type { MergedDeskRbFullConfluencePack } from '@/lib/mergedDeskRbFullConfluence';
import type { MergedDeskRbMasterStance } from '@/lib/mergedDeskRbMasterStance';
import type { MergedDeskHotZoneEntry } from '@/lib/mergedDeskHotZoneEntry';
import type { MonthDeskMoneyZoneHud } from '@/lib/monthDeskMoneyZone';
import type { MergedDeskRbRailBounceEntry } from '@/lib/mergedDeskRbRailBounceEntry';
import type { MergedDeskChannelPullbackEntry } from '@/lib/mergedDeskChannelPullbackEntry';
import type { MergedDeskRbVolumePulse } from '@/lib/mergedDeskRbVolumePulse';
import {
  computeInstitutionalSuperTrendMeta,
  getLastInstitutionalBandEdges,
} from '@/lib/institutionalSuperBand';
import {
  evaluateMergedDeskRbPocRelation,
  mergedDeskRbStyleWeights,
  type MergedDeskRbTradeStyle,
} from '@/lib/mergedDeskRbAiStyleBrain';
import {
  gradeMergedDeskRbBounceStrength,
  mergedDeskReactionGradeFromScore,
  mergedDeskReactionLabelKo,
  type MergedDeskRbBounceGrade,
} from '@/lib/mergedDeskRbBounceStrength';
import { MONTH_DESK_MONEY_LABEL } from '@/lib/monthDeskMoneyZone';
import { computeMergedDeskRbPatternLean } from '@/lib/mergedDeskRbPatternLean';

export type RbLiveEntrySide = 'LONG' | 'SHORT' | 'WAIT';

export type MergedDeskRbLivePulse = {
  id: string;
  ko: string;
  ok: boolean;
  pts: number;
  tone: 'up' | 'down' | 'wait';
};

export type MergedDeskRbLiveEntryHub = {
  side: RbLiveEntrySide;
  /** 롱진입가능 | 숏진입가능 | 관망 */
  actionKo: string;
  /** ★약반등|★강하락 등 */
  reactionLabelKo: string;
  grade: MergedDeskRbBounceGrade;
  gradeKo: '약' | '중' | '강' | '초강';
  score: number;
  scoreLong: number;
  scoreShort: number;
  entryAllowed: boolean;
  confidenceKo: string;
  headlineKo: string;
  stripKo: string;
  detailKo: string;
  invalidationKo: string;
  pulses: MergedDeskRbLivePulse[];
  moneyLongGrade: MergedDeskRbBounceGrade | null;
  moneyShortGrade: MergedDeskRbBounceGrade | null;
  moneyLongLabelKo: string | null;
  moneyShortLabelKo: string | null;
  /** 거래량 DNA 펄스 요약 */
  volumeTagKo: string | null;
  volumeStoryKo: string | null;
  volumeGateKo: string | null;
};

function atr14(candles: Candle[]): number {
  const n = candles.length;
  if (n < 5) return Math.abs(Number(candles[n - 1]?.close) || 1) * 0.008;
  let s = 0;
  let c = 0;
  for (let i = Math.max(1, n - 14); i < n; i++) {
    const cur = candles[i]!;
    const prev = candles[i - 1]!;
    s += Math.max(
      cur.high - cur.low,
      Math.abs(cur.high - prev.close),
      Math.abs(cur.low - prev.close)
    );
    c += 1;
  }
  return c > 0 ? s / c : Math.abs(Number(candles[n - 1]?.close) || 1) * 0.008;
}

function addPulse(
  pulses: MergedDeskRbLivePulse[],
  long: { n: number },
  short: { n: number },
  side: RbLiveEntrySide | null,
  pts: number,
  id: string,
  ko: string
) {
  if (!side || side === 'WAIT' || !(pts > 0)) {
    pulses.push({ id, ko, ok: false, pts: 0, tone: 'wait' });
    return;
  }
  if (side === 'LONG') long.n += pts;
  else short.n += pts;
  pulses.push({
    id,
    ko: `+${pts} ${ko}`,
    ok: true,
    pts,
    tone: side === 'LONG' ? 'up' : 'down',
  });
}

/**
 * 기관밴드·POC·채널·헌팅·$$$$·수급을 실시간 합류해 진입 판정.
 */
export function computeMergedDeskRbLiveEntryHub(params: {
  candles: Candle[];
  geoms?: MergedDeskChannelGeom[] | null;
  paint?: MergedDeskRbCorridorPaint | null;
  volSync?: MergedDeskRbVolumeSyncPack | null;
  fullConf?: MergedDeskRbFullConfluencePack | null;
  master?: MergedDeskRbMasterStance | null;
  hotZones?: MergedDeskHotZoneEntry[] | null;
  moneyHud?: MonthDeskMoneyZoneHud | null;
  railBounce?: MergedDeskRbRailBounceEntry | null;
  pullback?: MergedDeskChannelPullbackEntry | null;
  volumePulse?: MergedDeskRbVolumePulse | null;
  vrvpPoc?: number | null;
  vrvpVaLow?: number | null;
  vrvpVaHigh?: number | null;
  tradeStyle?: MergedDeskRbTradeStyle | null;
  close?: number | null;
}): MergedDeskRbLiveEntryHub {
  const empty: MergedDeskRbLiveEntryHub = {
    side: 'WAIT',
    actionKo: '관망',
    reactionLabelKo: '★대기',
    grade: 'weak',
    gradeKo: '약',
    score: 0,
    scoreLong: 0,
    scoreShort: 0,
    entryAllowed: false,
    confidenceKo: '근거 부족',
    headlineKo: '파랑빨강띠 · 합류 대기',
    stripKo: 'AI채널 · 관망 · 기관·POC·헌팅 재확인',
    detailKo: '채널·기관밴드·POC·Hot헌팅·$$$$가 아직 한쪽으로 모이지 않음(참고)',
    invalidationKo: '합류 깨지면 관망 유지',
    pulses: [],
    moneyLongGrade: null,
    moneyShortGrade: null,
    moneyLongLabelKo: null,
    moneyShortLabelKo: null,
    volumeTagKo: null,
    volumeStoryKo: null,
    volumeGateKo: null,
  };

  const candles = params.candles ?? [];
  if (candles.length < 8) return empty;

  const styleW = mergedDeskRbStyleWeights(params.tradeStyle ?? params.paint?.tradeStyle);
  const close =
    Number(params.close) > 0
      ? Number(params.close)
      : Number(candles[candles.length - 1]?.close) || 0;
  const atr = atr14(candles);
  const long = { n: 0 };
  const short = { n: 0 };
  const pulses: MergedDeskRbLivePulse[] = [];

  const g =
    params.geoms?.find((x) => x.primary) ??
    params.geoms?.find((x) => x.horizon === styleW.preferredHorizon) ??
    params.geoms?.find((x) => x.horizon === 'short') ??
    params.geoms?.[0] ??
    null;
  const longG = params.geoms?.find((x) => x.horizon === 'long') ?? null;

  if (g) {
    const side: RbLiveEntrySide =
      Math.abs(g.slopePct) < 0.0032 ? 'WAIT' : g.descending ? 'SHORT' : 'LONG';
    addPulse(
      pulses,
      long,
      short,
      side,
      Math.round(18 * (side === 'LONG' ? styleW.longMult : styleW.shortMult)),
      'corridor',
      `${g.horizonKo}채널 ${side === 'WAIT' ? '평탄' : side === 'LONG' ? '상승' : '하락'}`
    );
    if (longG && side !== 'WAIT' && longG.descending === g.descending) {
      addPulse(pulses, long, short, side, 8, 'mtf-ch', '단기·장기 채널 동방');
    } else if (longG && side !== 'WAIT' && longG.descending !== g.descending) {
      addPulse(pulses, long, short, side === 'LONG' ? 'SHORT' : 'LONG', 6, 'mtf-ch-x', '채널 TF 역행');
    }
  }

  const stMeta = computeInstitutionalSuperTrendMeta(candles);
  const stDir: RbLiveEntrySide =
    stMeta?.lastDir === 'long' ? 'LONG' : stMeta?.lastDir === 'short' ? 'SHORT' : 'WAIT';
  addPulse(pulses, long, short, stDir === 'WAIT' ? null : stDir, 14, 'band', `기관밴드 ${stDir === 'LONG' ? '지지' : '저항'}`);
  const edges = getLastInstitutionalBandEdges(candles);
  if (edges && close > 0 && stDir !== 'WAIT') {
    const mid = (Number(edges.upper) + Number(edges.lower)) / 2;
    const above = close >= mid;
    const align =
      (stDir === 'LONG' && above) || (stDir === 'SHORT' && !above) ? stDir : stDir === 'LONG' ? 'SHORT' : 'LONG';
    addPulse(
      pulses,
      long,
      short,
      align,
      align === stDir ? 6 : 4,
      'band-pos',
      align === stDir ? '가격·기관레일 정렬' : '가격·기관레일 어긋남'
    );
  }

  const pocRel = evaluateMergedDeskRbPocRelation({
    close,
    poc: params.vrvpPoc,
    vaLow: params.vrvpVaLow,
    vaHigh: params.vrvpVaHigh,
    atr,
  });
  if (pocRel.side === 'LONG' || pocRel.side === 'SHORT') {
    addPulse(
      pulses,
      long,
      short,
      pocRel.side,
      Math.round(pocRel.pts * styleW.pocMult),
      'poc',
      `POC ${pocRel.ko}`
    );
  }

  const vs = params.volSync;
  if (vs) {
    const volSide: RbLiveEntrySide =
      vs.side === 'up' ? 'LONG' : vs.side === 'down' ? 'SHORT' : 'WAIT';
    if (volSide !== 'WAIT' && vs.confirm === 'confirm') {
      addPulse(pulses, long, short, volSide, Math.round(12 * styleW.reactionMult), 'vol', `수급동의 ${Math.round(vs.buyPct * 100)}%매수`);
    } else if (volSide !== 'WAIT' && vs.confirm === 'diverge') {
      addPulse(
        pulses,
        long,
        short,
        volSide === 'LONG' ? 'SHORT' : 'LONG',
        Math.round(8 * styleW.reactionMult),
        'vol-x',
        '수급괴리'
      );
    } else if (volSide !== 'WAIT') {
      addPulse(pulses, long, short, volSide, Math.round(4 * styleW.reactionMult), 'vol-w', '수급약함');
    }
  }

  /** 거래량 DNA 펄스 — 허브 가중 핵심 */
  const vp = params.volumePulse;
  if (vp) {
    const mult = styleW.reactionMult;
    if (vp.side === 'LONG' || vp.side === 'SHORT') {
      const boost =
        vp.gate === 'go' ? 22 : vp.gate === 'caution' ? 12 : vp.gate === 'block' ? 6 : 8;
      addPulse(
        pulses,
        long,
        short,
        vp.side,
        Math.round(boost * mult),
        'vol-dna',
        `거래량DNA ${vp.fingerprintKo}`
      );
    }
    if (vp.entryBlock) {
      /** 절정·괴리 시 우세 쪽 감점 */
      if (vp.side === 'LONG') {
        long.n = Math.max(0, long.n - 14);
        pulses.push({ id: 'vol-block', ko: '거래량차단·롱감점', ok: false, pts: -14, tone: 'wait' });
      } else if (vp.side === 'SHORT') {
        short.n = Math.max(0, short.n - 14);
        pulses.push({ id: 'vol-block', ko: '거래량차단·숏감점', ok: false, pts: -14, tone: 'wait' });
      } else {
        long.n = Math.max(0, long.n - 8);
        short.n = Math.max(0, short.n - 8);
        pulses.push({ id: 'vol-block', ko: '거래량차단·양측감점', ok: false, pts: -8, tone: 'wait' });
      }
    } else if (vp.entryBoost && (vp.side === 'LONG' || vp.side === 'SHORT')) {
      addPulse(pulses, long, short, vp.side, Math.round(10 * mult), 'vol-boost', `거래량가속 ${vp.gradeKo}`);
    }
  }

  const paint = params.paint;
  if (paint?.trigger === 'rail-bounce') {
    addPulse(pulses, long, short, 'LONG', Math.round(12 * styleW.reactionMult), 'rail', '레일 반등 반응');
  } else if (paint?.trigger === 'rail-drop') {
    addPulse(pulses, long, short, 'SHORT', Math.round(12 * styleW.reactionMult), 'rail', '레일 하락 반응');
  } else if (paint?.atSupport) {
    addPulse(pulses, long, short, 'LONG', 6, 'rail-near', '하단레일 근접');
  } else if (paint?.atResist) {
    addPulse(pulses, long, short, 'SHORT', 6, 'rail-near', '상단레일 근접');
  }

  const rb = params.railBounce;
  if (rb && (rb.status === 'READY' || rb.status === 'NEAR' || rb.status === 'HOLD')) {
    addPulse(
      pulses,
      long,
      short,
      rb.side,
      Math.round((rb.status === 'READY' ? 14 : 8) * styleW.reactionMult),
      'bounce',
      `${rb.labelKo}·${rb.status}`
    );
  }

  const pb = params.pullback;
  if (pb && (pb.status === 'READY' || pb.status === 'NEAR')) {
    addPulse(
      pulses,
      long,
      short,
      pb.side,
      Math.round((pb.primary ? 10 : 5) * styleW.reactionMult),
      'pullback',
      pb.labelKo
    );
  }

  for (const z of params.hotZones ?? []) {
    const near =
      close > 0 &&
      ((z.status === 'TOUCH' || z.status === 'ENTER') ||
        (Number.isFinite(z.mid) && Math.abs(close - z.mid) / close < 0.012));
    addPulse(
      pulses,
      long,
      short,
      z.side,
      Math.round((z.primary ? (near ? 10 : 6) : near ? 6 : 3) * styleW.reactionMult),
      `hot-${z.side}`,
      `헌팅 ${z.side === 'LONG' ? '지지' : '저항'}${near ? '·접촉' : ''}`
    );
  }

  const money = params.moneyHud;
  if (money?.long) {
    const mid = Number(money.long.priceMid) || 0;
    const dist = close > 0 && mid > 0 ? Math.abs(close - mid) / close : 1;
    addPulse(pulses, long, short, 'LONG', dist < 0.01 ? 10 : 5, '$$$$-L', `${MONTH_DESK_MONEY_LABEL}롱`);
  }
  if (money?.short) {
    const mid = Number(money.short.priceMid) || 0;
    const dist = close > 0 && mid > 0 ? Math.abs(close - mid) / close : 1;
    addPulse(pulses, long, short, 'SHORT', dist < 0.01 ? 10 : 5, '$$$$-S', `${MONTH_DESK_MONEY_LABEL}숏`);
  }

  const master = params.master;
  if (master && (master.side === 'LONG' || master.side === 'SHORT')) {
    addPulse(
      pulses,
      long,
      short,
      master.side,
      master.conviction === 'strong' ? 12 : master.conviction === 'ok' ? 8 : 4,
      'master',
      `마스터 ${master.actionKo}`
    );
  }

  const conf = params.fullConf;
  if (conf && (conf.side === 'LONG' || conf.side === 'SHORT')) {
    addPulse(
      pulses,
      long,
      short,
      conf.side,
      Math.round(Math.max(4, conf.score / 12)),
      'full',
      `전면합류 ${conf.grade}·${conf.score}`
    );
  }

  /** 패턴기억 경량 투표 — 유사창 이후 롱/숏 */
  const patLean = computeMergedDeskRbPatternLean(candles);
  if (patLean.lean === 'LONG' || patLean.lean === 'SHORT') {
    const pts = Math.min(18, 8 + Math.round(Math.abs(patLean.score) / 12));
    addPulse(pulses, long, short, patLean.lean, pts, 'pattern', patLean.tagKo);
  } else if (patLean.sample >= 6) {
    pulses.push({
      id: 'pattern',
      ko: patLean.tagKo,
      ok: false,
      pts: 0,
      tone: 'wait',
    });
  }

  const scoreLong = Math.round(long.n);
  const scoreShort = Math.round(short.n);
  const margin = Math.abs(scoreLong - scoreShort);
  let side: RbLiveEntrySide = 'WAIT';
  if (scoreLong >= scoreShort + 14 && scoreLong >= 36) side = 'LONG';
  else if (scoreShort >= scoreLong + 14 && scoreShort >= 36) side = 'SHORT';
  else if (scoreLong >= scoreShort + 8 && scoreLong >= 48) side = 'LONG';
  else if (scoreShort >= scoreLong + 8 && scoreShort >= 48) side = 'SHORT';
  /** 패턴이 강하고 다른 근거와 같으면 마진 완화 */
  if (
    side === 'WAIT' &&
    (patLean.lean === 'LONG' || patLean.lean === 'SHORT') &&
    Math.abs(patLean.score) >= 24 &&
    patLean.sample >= 12
  ) {
    const prefer = patLean.lean;
    const preferScore = prefer === 'LONG' ? scoreLong : scoreShort;
    const other = prefer === 'LONG' ? scoreShort : scoreLong;
    if (preferScore >= other + 6 && preferScore >= 32) side = prefer;
  }

  const rawScore = side === 'LONG' ? scoreLong : side === 'SHORT' ? scoreShort : Math.max(scoreLong, scoreShort);
  const volAligned =
    !!vp && side !== 'WAIT' && vp.side === side && (vp.gate === 'go' || vp.gate === 'caution');
  const strength = gradeMergedDeskRbBounceStrength({
    side: side === 'WAIT' ? 'LONG' : side,
    baseScore: rawScore + (volAligned && vp?.entryBoost ? 8 : 0) + (patLean.lean === side ? 6 : 0),
    status: side === 'WAIT' ? 'WAIT' : paint?.trigger ? 'READY' : 'NEAR',
    paintTrigger: paint?.trigger ?? null,
    atRail: paint?.atSupport || paint?.atResist,
    pocAligned: pocRel.side === side,
    bullOrBearBar: volAligned,
    reboundBody: vp?.fingerprintKo.includes('흡수') === true,
    distAtr:
      g && atr > 0
        ? Math.min(
            Math.abs(close - g.tipLower) / atr,
            Math.abs(close - g.tipUpper) / atr
          )
        : null,
  });

  let grade: MergedDeskRbBounceGrade = side === 'WAIT' ? 'weak' : strength.grade;
  if (volAligned && vp?.grade === 'ultra' && grade === 'strong') grade = 'ultra';
  else if (volAligned && vp?.grade === 'ultra' && grade === 'mid') grade = 'strong';
  else if (volAligned && vp?.grade === 'strong' && grade === 'mid') grade = 'strong';
  const gradeKo: MergedDeskRbLiveEntryHub['gradeKo'] =
    grade === 'ultra' ? '초강' : grade === 'strong' ? '강' : grade === 'mid' ? '중' : '약';
  const reactionLabelKo =
    side === 'WAIT' ? '★대기' : mergedDeskReactionLabelKo(side, grade);
  const volBlocks = !!vp?.entryBlock && (vp.side === side || vp.side === 'WAIT');
  const entryAllowed =
    side !== 'WAIT' &&
    !volBlocks &&
    (grade === 'mid' || grade === 'strong' || grade === 'ultra') &&
    margin >= 10 &&
    (conf?.entryAllowed !== false || rawScore >= 55) &&
    (vp == null || vp.gate !== 'block');

  const actionKo =
    side === 'WAIT'
      ? patLean.lean === 'LONG'
        ? '관망·패턴롱기울기'
        : patLean.lean === 'SHORT'
          ? '관망·패턴숏기울기'
          : '관망'
      : volBlocks
        ? side === 'LONG'
          ? '롱·거래량차단'
          : '숏·거래량차단'
        : entryAllowed
          ? side === 'LONG'
            ? '롱진입가능'
            : '숏진입가능'
          : side === 'LONG'
            ? '롱준비·대기'
            : '숏준비·대기';

  const confidenceKo =
    grade === 'ultra' ? '초강 합류' : grade === 'strong' ? '강합류' : grade === 'mid' ? '중합류' : '약합류·대기';

  const liveBits = pulses
    .filter((p) => p.ok)
    .slice(0, 6)
    .map((p) => p.ko.replace(/^\+\d+\s*/, ''));

  const volGateKo =
    vp == null
      ? null
      : vp.gate === 'go'
        ? 'V가속'
        : vp.gate === 'caution'
          ? 'V주의'
          : vp.gate === 'block'
            ? 'V차단'
            : 'V관찰';

  const headlineKo = `파랑빨강띠 · ${actionKo} · ${reactionLabelKo}${patLean.tagKo ? ` · ${patLean.tagKo}` : ''}${vp?.tagKo ? ` · ${vp.tagKo}` : ''}`;
  const stripKo = [
    actionKo,
    reactionLabelKo,
    confidenceKo,
    patLean.sample >= 6 ? patLean.tagKo : null,
    vp?.tagKo || null,
    volGateKo,
    stDir !== 'WAIT' ? `기관${stDir === 'LONG' ? '지지' : '저항'}` : null,
    pocRel.ko || null,
    paint?.trigger === 'rail-bounce'
      ? '레일반등'
      : paint?.trigger === 'rail-drop'
        ? '레일하락'
        : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const detailKo = [
    `${styleW.styleKo} 스타일 · 롱${scoreLong}/숏${scoreShort} (마진 ${margin})`,
    patLean.detailKo,
    vp?.storyKo || '',
    liveBits.length ? `실시간: ${liveBits.join(' · ')}` : '',
    conf?.summaryKo || '',
    master?.summaryKo || '',
    '조건부 참고 · 확정 매매·승률 아님',
  ]
    .filter(Boolean)
    .join(' · ');

  const invalidationKo =
    side === 'LONG'
      ? '하단레일·기관지지·$$$$롱 이탈 또는 거래량괴리/절정 시 롱 무효·관망'
      : side === 'SHORT'
        ? '상단레일·기관저항·$$$$숏 돌파 또는 거래량괴리/절정 시 숏 무효·관망'
        : '합류·거래량 DNA 정렬될 때까지 관망';

  const moneyLongGrade = money?.long
    ? mergedDeskReactionGradeFromScore(
        Math.min(99, 48 + Number(money.long.strength || 0) * 0.45 + (side === 'LONG' ? 12 : 0))
      )
    : null;
  const moneyShortGrade = money?.short
    ? mergedDeskReactionGradeFromScore(
        Math.min(99, 48 + Number(money.short.strength || 0) * 0.45 + (side === 'SHORT' ? 12 : 0))
      )
    : null;

  return {
    side,
    actionKo,
    reactionLabelKo,
    grade,
    gradeKo,
    score: Math.round(rawScore),
    scoreLong,
    scoreShort,
    entryAllowed,
    confidenceKo,
    headlineKo,
    stripKo,
    detailKo,
    invalidationKo,
    pulses,
    moneyLongGrade,
    moneyShortGrade,
    moneyLongLabelKo: moneyLongGrade
      ? `${MONTH_DESK_MONEY_LABEL}롱·${moneyLongGrade === 'ultra' ? '초강' : moneyLongGrade === 'strong' ? '강' : moneyLongGrade === 'mid' ? '중' : '약'}`
      : null,
    moneyShortLabelKo: moneyShortGrade
      ? `${MONTH_DESK_MONEY_LABEL}숏·${moneyShortGrade === 'ultra' ? '초강' : moneyShortGrade === 'strong' ? '강' : moneyShortGrade === 'mid' ? '중' : '약'}`
      : null,
    volumeTagKo: vp?.tagKo ?? null,
    volumeStoryKo: vp?.storyKo ?? null,
    volumeGateKo: volGateKo,
  };
}

/** $$$$ 면 라벨에 약/중/강/초 부착 (면 라벨 1개) */
export function stampMergedDeskMoneyZonesWithLiveHub(
  overlays: OverlayItem[],
  hub: MergedDeskRbLiveEntryHub | null
): OverlayItem[] {
  if (!hub || !overlays.length) return overlays;
  return overlays.map((raw) => {
    const extra = String(raw.overlayZoneExtraClass || '');
    const text = `${raw.label || ''}${raw.zoneFaceBase || ''}`;
    if (!extra.includes('merged-desk-money-zone-keep') && !/\$\$\$\$/.test(text)) return raw;
    /** 반등·눌림 면은 반응등급 유지 — $$$$ 전용만 등급 스탬프 */
    if (
      extra.includes('merged-desk-rb-rail-bounce') ||
      extra.includes('merged-desk-rb-pullback') ||
      String(raw.id || '').includes('rb-rail-bounce') ||
      String(raw.id || '').includes('rb-pullback')
    ) {
      return raw;
    }

    const isLong =
      /롱|long|support|demand|bull/i.test(`${extra} ${text} ${raw.structureBias || ''}`) ||
      String(raw.structureBias || '') === 'bullish';
    const isShort =
      /숏|short|resist|supply|bear/i.test(`${extra} ${text} ${raw.structureBias || ''}`) ||
      String(raw.structureBias || '') === 'bearish';
    const side: 'LONG' | 'SHORT' | null = isLong && !isShort ? 'LONG' : isShort && !isLong ? 'SHORT' : null;
    if (!side) return raw;

    const grade =
      side === 'LONG'
        ? hub.moneyLongGrade ?? (hub.side === 'LONG' ? hub.grade : mergedDeskReactionGradeFromScore(Number(raw.confidence) || 55))
        : hub.moneyShortGrade ?? (hub.side === 'SHORT' ? hub.grade : mergedDeskReactionGradeFromScore(Number(raw.confidence) || 55));
    const gradeKo = grade === 'ultra' ? '초강' : grade === 'strong' ? '강' : grade === 'mid' ? '중' : '약';
    const face = `${MONTH_DESK_MONEY_LABEL}${side === 'LONG' ? '롱' : '숏'}·${gradeKo}`;
    return {
      ...raw,
      label: face,
      zoneFaceBase: face,
      zoneFaceSignal: undefined,
      labelTooltip: [
        face,
        hub.stripKo,
        hub.invalidationKo,
        String(raw.labelTooltip || ''),
        '$$$$·약중강초 = 합류강도 참고(승률 아님)',
      ]
        .filter(Boolean)
        .join(' · '),
      overlayZoneExtraClass: `${extra
        .replace(/\bmerged-desk-rb-bounce-grade--\w+\b/g, '')
        .trim()} merged-desk-zone-label-on merged-desk-money-zone-graded merged-desk-rb-bounce-grade--${grade}`.trim(),
    };
  });
}

/** 채널·반등·헌팅 면에 허브 헤드라인/등급 스탬프 */
export function stampMergedDeskOverlaysWithLiveHub(
  overlays: OverlayItem[],
  hub: MergedDeskRbLiveEntryHub | null
): OverlayItem[] {
  if (!hub || !overlays.length) return overlays;
  return overlays.map((o) => {
    const id = String(o.id || '');
    const extra = String(o.overlayZoneExtraClass || '');
    const isPriBand =
      o.kind === 'channelBand' &&
      (extra.includes('merged-desk-rb-primary') || id.includes('-short-band') || id.includes('-fb-band'));
    if (isPriBand) {
      return {
        ...o,
        label: hub.headlineKo,
        zoneFaceBase: hub.reactionLabelKo,
        zoneFaceSignal: undefined,
        labelTooltip: `${hub.detailKo} · ${hub.invalidationKo}`,
        overlayZoneExtraClass: `${extra} merged-desk-rb-live-hub merged-desk-rb-bounce-grade--${hub.grade} merged-desk-zone-label-on`.trim(),
      };
    }
    if (
      extra.includes('merged-desk-rb-rail-bounce') ||
      extra.includes('merged-desk-rb-pullback') ||
      extra.includes('merged-desk-hotzone')
    ) {
      const wantLong =
        hub.side === 'LONG' &&
        (extra.includes('long') || extra.includes('hotzone-signal--long') || o.structureBias === 'bullish');
      const wantShort =
        hub.side === 'SHORT' &&
        (extra.includes('short') || extra.includes('hotzone-signal--short') || o.structureBias === 'bearish');
      if (!wantLong && !wantShort && !extra.includes('merged-desk-rb-rail-bounce')) return o;
      const face =
        String(o.zoneFaceBase || '').trim().startsWith('★')
          ? String(o.zoneFaceBase || '').trim()
          : hub.reactionLabelKo;
      return {
        ...o,
        label: face,
        zoneFaceBase: face,
        zoneFaceSignal: undefined,
        labelTooltip: `${hub.stripKo} · ${String(o.labelTooltip || '')}`,
        overlayZoneExtraClass: `${extra
          .replace(/\bmerged-desk-rb-bounce-grade--\w+\b/g, '')
          .trim()} merged-desk-rb-live-hub merged-desk-rb-bounce-grade--${hub.grade} merged-desk-zone-label-on`.trim(),
      };
    }
    return o;
  });
}
