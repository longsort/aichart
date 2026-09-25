/**
 * 파랑빨강띠 전면 합류 — 글자·작도·데이터 기능을 채널에 모은다.
 * 점수 = 조건부 합류(0~100). 승률·확정 수익 아님. 90% 같은 숫자 금지.
 */
import type { AnalyzeResponse, Candle, OverlayItem } from '@/types';
import type { MergedDeskChannelGeom } from '@/lib/mergedDeskBlueRedChannels';
import type { MergedDeskChannelMoneyPlan } from '@/lib/mergedDeskChannelMoneyEdge';
import type { MergedDeskRbVolumeSyncPack } from '@/lib/mergedDeskRbVolumeSync';
import type { MergedDeskCycleProgressPack } from '@/lib/mergedDeskCycleProgress';
import type { MergedDeskActionablePatternBrief } from '@/lib/mergedDeskActionablePattern';
import type { MergedDeskHotZoneEntry } from '@/lib/mergedDeskHotZoneEntry';
import type { MonthDeskMoneyZoneHud } from '@/lib/monthDeskMoneyZone';
import type { AtlasPulsePriceLine } from '@/lib/monthDeskAtlasPulseDesk';
import {
  computeInstitutionalSuperTrendMeta,
  getLastInstitutionalBandEdges,
} from '@/lib/institutionalSuperBand';

export type RbConfluenceSide = 'LONG' | 'SHORT' | 'WAIT';
export type RbConfluenceGrade = 'A' | 'B' | 'C' | 'WAIT';

export type MergedDeskRbFullConfluencePack = {
  side: RbConfluenceSide;
  grade: RbConfluenceGrade;
  score: number;
  alignedCount: number;
  conflictCount: number;
  entryAllowed: boolean;
  invalidationKo: string;
  summaryKo: string;
  shortKo: string;
  reasons: Array<{ ko: string; ok: boolean; pts: number }>;
};

function add(
  reasons: MergedDeskRbFullConfluencePack['reasons'],
  ko: string,
  pts: number,
  ok: boolean
) {
  reasons.push({ ko, pts, ok });
  return pts;
}

function overlaps(aTop: number, aBot: number, bTop: number, bBot: number): boolean {
  const aHi = Math.max(aTop, aBot);
  const aLo = Math.min(aTop, aBot);
  const bHi = Math.max(bTop, bBot);
  const bLo = Math.min(bTop, bBot);
  return aHi >= bLo && aLo <= bHi;
}

export function computeMergedDeskRbFullConfluence(params: {
  candles: Candle[];
  geoms?: MergedDeskChannelGeom[] | null;
  volSync?: MergedDeskRbVolumeSyncPack | null;
  analysis?: AnalyzeResponse | null;
  cycle?: MergedDeskCycleProgressPack | null;
  pattern?: MergedDeskActionablePatternBrief | null;
  hotZones?: MergedDeskHotZoneEntry[] | null;
  moneyHud?: MonthDeskMoneyZoneHud | null;
  rocketDir?: 'LONG' | 'SHORT' | null;
  moneyPlan?: MergedDeskChannelMoneyPlan | null;
  aiFaceSummaryKo?: string | null;
  masterSide?: RbConfluenceSide | null;
}): MergedDeskRbFullConfluencePack {
  const reasons: MergedDeskRbFullConfluencePack['reasons'] = [];
  let score = 0;
  let aligned = 0;
  let conflict = 0;

  const primary =
    params.geoms?.find((g) => g.primary) ??
    params.geoms?.find((g) => g.horizon === 'short') ??
    params.geoms?.[0] ??
    null;
  const longG = params.geoms?.find((g) => g.horizon === 'long') ?? null;

  let side: RbConfluenceSide = 'WAIT';
  if (params.masterSide === 'LONG' || params.masterSide === 'SHORT' || params.masterSide === 'WAIT') {
    side = params.masterSide;
  } else if (primary) {
    if (Math.abs(primary.slopePct) < 0.0035) side = 'WAIT';
    else side = primary.descending ? 'SHORT' : 'LONG';
  }

  if (primary) {
    const q = Math.max(0, Math.min(96, primary.quality));
    const pts = Math.round((q / 96) * 16);
    score += add(reasons, `${primary.horizonKo}채널 품질 ${primary.quality}`, pts, q >= 55);
    if (q >= 55) aligned += 1;
    if (longG && primary.descending === longG.descending) {
      score += add(reasons, '단기·장기 채널 동방', 8, true);
      aligned += 1;
    } else if (longG) {
      score += add(reasons, '단기·장기 채널 역행', -12, false);
      conflict += 1;
    }
  } else {
    score += add(reasons, '채널 기하 없음', 0, false);
  }

  const meta = computeInstitutionalSuperTrendMeta(params.candles);
  const stDir = meta?.lastDir === 'long' ? 'LONG' : meta?.lastDir === 'short' ? 'SHORT' : null;
  const stEdges = getLastInstitutionalBandEdges(params.candles);
  if (stDir && side !== 'WAIT') {
    if (stDir === side) {
      score += add(reasons, `기관밴드 ${stDir === 'LONG' ? '롱' : '숏'} 정렬`, 12, true);
      aligned += 1;
      if (primary && stEdges) {
        const rail = side === 'LONG' ? primary.tipLower : primary.tipUpper;
        const near =
          Math.abs(stEdges.lower - rail) / Math.max(1, Math.abs(rail)) < 0.012 ||
          Math.abs(stEdges.upper - rail) / Math.max(1, Math.abs(rail)) < 0.012;
        if (near) {
          score += add(reasons, '기관밴드 레일↔채널 레일 근접', 5, true);
          aligned += 1;
        }
      }
    } else {
      score += add(reasons, '기관밴드 역행', -10, false);
      conflict += 1;
    }
  } else {
    score += add(reasons, '기관밴드 판정 없음', 0, false);
  }

  const vs = params.volSync;
  if (vs && side !== 'WAIT') {
    const volSide = vs.side === 'up' ? 'LONG' : vs.side === 'down' ? 'SHORT' : null;
    if (volSide === side && vs.confirm === 'confirm') {
      score += add(reasons, `거래량 수급동의 · 매수 ${(vs.buyPct * 100).toFixed(0)}%`, 12, true);
      aligned += 1;
    } else if (volSide && volSide !== side) {
      score += add(reasons, '거래량 추세 괴리', -10, false);
      conflict += 1;
    } else if (vs.confirm === 'diverge') {
      score += add(reasons, '거래량 수급괴리', -8, false);
      conflict += 1;
    } else {
      score += add(reasons, `거래량 약함 · ${vs.summaryKo.slice(0, 28)}`, 2, false);
    }
  }

  const ai = String(params.aiFaceSummaryKo || '');
  if (ai) {
    const faceOk = /안착|지지|매수강|롱우세|Hot|기관지지/.test(ai);
    const faceBad = /실패|역방향|매도강|숏우세|기관저항/.test(ai);
    if (side === 'LONG' && faceOk) {
      score += add(reasons, `AI면 ${ai.slice(0, 24)}`, 8, true);
      aligned += 1;
    } else if (side === 'SHORT' && faceBad) {
      score += add(reasons, `AI면 ${ai.slice(0, 24)}`, 8, true);
      aligned += 1;
    } else if (/상위역방향/.test(ai)) {
      score += add(reasons, 'AI면 상위역방향', -14, false);
      conflict += 2;
    } else {
      score += add(reasons, `AI면 ${ai.slice(0, 24)}`, 2, false);
    }
  }

  const hz = params.hotZones ?? [];
  if (primary && hz.length) {
    const hit = hz.find((z) => overlaps(primary.tipUpper, primary.tipLower, z.top, z.bot));
    if (hit) {
      if (side !== 'WAIT' && hit.side === side) {
        score += add(reasons, `HotZone ${hit.labelKo} 정렬`, 10, true);
        aligned += 1;
      } else {
        score += add(reasons, `HotZone ${hit.labelKo} 불일치`, -6, false);
        conflict += 1;
      }
    } else {
      score += add(reasons, 'HotZone 채널 밖', 0, false);
    }
  }

  const money = params.moneyHud;
  if (money && primary) {
    const pools = [
      ...(money.pools ?? []),
      ...(money.long ? [money.long] : []),
      ...(money.short ? [money.short] : []),
    ];
    const hit = pools.find((z) =>
      overlaps(primary.tipUpper, primary.tipLower, Number(z.priceTop), Number(z.priceBot))
    );
    if (hit) {
      if (hit.side === side) {
        score += add(reasons, '$$$$ 머니존 채널 겹침', 8, true);
        aligned += 1;
      } else {
        score += add(reasons, '$$$$ 머니존 반대', -6, false);
        conflict += 1;
      }
    }
  }

  if (params.rocketDir && side !== 'WAIT') {
    if (params.rocketDir === side) {
      score += add(reasons, '구조로켓 동방', 6, true);
      aligned += 1;
    } else {
      score += add(reasons, '구조로켓 역행', -6, false);
      conflict += 1;
    }
  }

  const v = params.analysis?.verdict;
  if (v === 'LONG' || v === 'SHORT') {
    if (side !== 'WAIT' && v === side) {
      score += add(reasons, `분석 verdict ${v} 정렬`, 10, true);
      aligned += 1;
    } else if (side !== 'WAIT') {
      score += add(reasons, `분석 verdict ${v} 불일치`, -10, false);
      conflict += 1;
    }
  }

  const mtf = params.analysis?.mtf;
  if (mtf && typeof mtf.alignmentScore === 'number') {
    const a = Number(mtf.alignmentScore);
    if (a >= 70) {
      score += add(reasons, `MTF정렬 ${a}`, 8, true);
      aligned += 1;
    } else if (a < 40) {
      score += add(reasons, `MTF정렬 낮음 ${a}`, -8, false);
      conflict += 1;
    } else {
      score += add(reasons, `MTF정렬 ${a}`, 3, a >= 55);
    }
  }

  const cs = params.analysis?.confirmedSignal;
  if (cs?.confirmed && cs.direction && side !== 'WAIT') {
    if (cs.direction === side) {
      score += add(reasons, `확정게이트 ${cs.gatesPassCount ?? '?'}/5`, 8, true);
      aligned += 1;
    } else {
      score += add(reasons, '확정게이트 반대', -12, false);
      conflict += 2;
    }
  }

  const fund = params.analysis?.fundingState;
  if (fund && side !== 'WAIT') {
    if (side === 'LONG' && fund === 'negative') {
      score += add(reasons, '펀딩 음수·롱 스퀴즈 여지', 4, true);
    } else if (side === 'SHORT' && fund === 'positive') {
      score += add(reasons, '펀딩 양수·숏 스퀴즈 여지', 4, true);
    } else if (side === 'LONG' && fund === 'positive') {
      score += add(reasons, '펀딩 양수·롱 혼잡', -3, false);
    } else if (side === 'SHORT' && fund === 'negative') {
      score += add(reasons, '펀딩 음수·숏 혼잡', -3, false);
    }
  }

  const oi = params.analysis?.oiState;
  if (oi && side !== 'WAIT') {
    if (oi === 'increasing') {
      score += add(reasons, 'OI 증가 · 추세 지속 후보', 4, true);
    } else if (oi === 'decreasing') {
      score += add(reasons, 'OI 감소 · 숏커버/청산 혼재', -2, false);
    }
  }

  const cycleSeats = [
    ...(params.cycle?.primary ? [params.cycle.primary] : []),
    ...(params.cycle?.others ?? []),
  ].filter((c) => c.kind !== 'seat' && !/도식 대기/.test(c.headlineKo));
  if (cycleSeats.length && side !== 'WAIT') {
    let chipOk = 0;
    let chipBad = 0;
    for (const cyc of cycleSeats) {
      const tone = String(cyc.tone || '');
      const blob = `${cyc.headlineKo}${cyc.tagKo}`;
      const bull = tone === 'bull' || tone === 'bullish' || /매집|마크업|상승|스프링|구름위/i.test(blob);
      const bear = tone === 'bear' || tone === 'bearish' || /분산|마크다운|하락|업스러스트|구름아래/i.test(blob);
      if ((side === 'LONG' && bull) || (side === 'SHORT' && bear)) chipOk += 1;
      else if ((side === 'LONG' && bear) || (side === 'SHORT' && bull)) chipBad += 1;
    }
    if (chipOk > chipBad) {
      score += add(reasons, `학파칩 ${chipOk}동방`, Math.min(10, 4 + chipOk), true);
      aligned += 1;
    } else if (chipBad > chipOk) {
      score += add(reasons, `학파칩 ${chipBad}역행`, -Math.min(10, 4 + chipBad), false);
      conflict += 1;
    } else {
      score += add(reasons, '학파칩 혼조', 1, false);
    }
  }

  const pat = params.pattern;
  if (pat && pat.confidence >= 72 && side !== 'WAIT') {
    const pSide = pat.bias === 'bullish' ? 'LONG' : pat.bias === 'bearish' ? 'SHORT' : null;
    if (pSide === side) {
      score += add(reasons, `패턴 ${pat.labelShort} 정렬`, 6, true);
      aligned += 1;
    } else if (pSide) {
      score += add(reasons, `패턴 ${pat.labelShort} 반대`, -6, false);
      conflict += 1;
    }
  }

  const plan = params.moneyPlan;
  if (plan && side !== 'WAIT') {
    if (plan.direction === side && plan.rr >= 1.5) {
      score += add(reasons, `게이트 ${plan.statusKo} · ${plan.rr.toFixed(1)}R`, 6, true);
      aligned += 1;
    } else if (plan.direction !== side) {
      score += add(reasons, '게이트 방향 불일치', -8, false);
      conflict += 1;
    } else if (plan.rr < 1.5) {
      score += add(reasons, `R:R ${plan.rr.toFixed(1)} < 1.5 · 경고`, -4, false);
    }
    if (plan.status === 'INVALID') {
      score += add(reasons, '게이트 무효', -16, false);
      conflict += 2;
    }
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  const hardWait =
    side === 'WAIT' ||
    conflict >= 3 ||
    (plan?.status === 'INVALID') ||
    reasons.some((r) => /상위역방향|게이트 무효/.test(r.ko));

  let grade: RbConfluenceGrade = 'WAIT';
  let entryAllowed = false;
  if (!hardWait && side !== 'WAIT') {
    if (score >= 78 && aligned >= 6 && conflict === 0) {
      grade = 'A';
      entryAllowed = plan?.entryAllowed !== false && plan?.status !== 'WAIT';
    } else if (score >= 62 && aligned >= 4 && conflict <= 1) {
      grade = 'B';
      entryAllowed = false;
    } else if (score >= 42) {
      grade = 'C';
      entryAllowed = false;
    }
  }

  if (grade !== 'WAIT' && plan?.status === 'WAIT') {
    entryAllowed = false;
    grade = grade === 'A' ? 'B' : grade;
  }

  const inv =
    primary && side === 'LONG'
      ? `무효: 하단레일 ${primary.tipLower.toFixed(0)} 이탈·유지`
      : primary && side === 'SHORT'
        ? `무효: 상단레일 ${primary.tipUpper.toFixed(0)} 이탈·유지`
        : '무효: 채널 구조 붕괴';

  const dirKo = side === 'LONG' ? '롱' : side === 'SHORT' ? '숏' : '대기';
  const shortKo = grade === 'WAIT' ? `합류대기·${dirKo}` : `합류${grade}·${dirKo}`;
  const summaryKo = `${shortKo} ${score}점 · 동의${aligned} 충돌${conflict} · ${inv} · 합류점수(승률 아님)`;

  return {
    side,
    grade,
    score,
    alignedCount: aligned,
    conflictCount: conflict,
    entryAllowed,
    invalidationKo: inv,
    summaryKo,
    shortKo,
    reasons,
  };
}

export function stampRbOverlaysWithFullConfluence(
  overlays: OverlayItem[],
  pack: MergedDeskRbFullConfluencePack | null
): OverlayItem[] {
  if (!pack || !overlays.length) return overlays;
  return overlays.map((o) => {
    const id = String(o.id || '');
    const cls = String(o.overlayZoneExtraClass || '');
    const isRb =
      id.startsWith('merged-desk-rb-') ||
      cls.includes('merged-desk-rb-channel') ||
      cls.includes('merged-desk-blue-red-channel');
    if (!isRb) return o;
    const prev = String(o.labelTooltip || '').trim();
    const extra = `${pack.summaryKo}\n${pack.reasons
      .slice(0, 8)
      .map((r) => `${r.ok ? '✓' : '·'} ${r.ko} (${r.pts > 0 ? '+' : ''}${r.pts})`)
      .join('\n')}`;
    const isPriBand = cls.includes('merged-desk-rb-primary') && o.kind === 'channelBand';
    const label = isPriBand
      ? `${String(o.label || '').replace(/\s*합류[ABC대기]+·\S+/g, '')} ${pack.shortKo}`.trim()
      : o.label;
    return {
      ...o,
      label,
      labelTooltip: prev.includes(pack.shortKo) ? prev : prev ? `${prev}\n${extra}` : extra,
      overlayZoneExtraClass: `${cls} merged-desk-rb-full-conf merged-desk-rb-full-conf--${pack.grade.toLowerCase()}`.trim(),
    };
  });
}

export function stampRbPriceLinesWithFullConfluence(
  lines: AtlasPulsePriceLine[],
  pack: MergedDeskRbFullConfluencePack | null
): AtlasPulsePriceLine[] {
  if (!pack || !lines.length) return lines;
  const tag = pack.shortKo;
  return lines.map((l) => {
    if (l.axisLabel !== true) return l;
    const t = String(l.title || '');
    if (!t || t.includes('합류')) return l;
    return { ...l, title: `${t}·${tag}`.slice(0, 18) };
  });
}

export function applyRbFullConfluenceToMoneyPlan(
  plan: MergedDeskChannelMoneyPlan | null,
  pack: MergedDeskRbFullConfluencePack | null
): MergedDeskChannelMoneyPlan | null {
  if (!plan || !pack) return plan;
  if (pack.grade === 'WAIT' || pack.side === 'WAIT' || pack.side !== plan.direction) {
    return {
      ...plan,
      status: 'WAIT',
      statusKo: '합류대기',
      entryAllowed: false,
      reasonsKo: [...plan.reasonsKo, pack.summaryKo].slice(0, 8),
    };
  }
  return {
    ...plan,
    reasonsKo: [...plan.reasonsKo, pack.shortKo].slice(0, 8),
    entryAllowed: plan.entryAllowed && pack.entryAllowed,
  };
}
