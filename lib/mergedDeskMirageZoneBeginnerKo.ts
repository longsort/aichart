/**
 * Mirage zone — 클릭 카드: 진입/관망 판정 + 거래량·지표·시그널 근거.
 * 조건부 참고 — 승률·수익 보장·투자 권유 아님.
 */
import type { OverlayItem } from '@/types';
import type { MirageZoneProactiveIntel, ZoneRole } from '@/lib/mergedDeskMirageZoneExchangeIntel';
import { mirageZoneEnTokenToKo } from '@/lib/mergedDeskMirageZoneCompactLabel';
import type { MasterFuturesDecision } from '@/lib/mergedDeskMasterFuturesDecision';
import type { HqEntryZonesPack } from '@/lib/mergedDeskHqEntryZones';
import type { MergedTradeJudgment } from '@/lib/mergedAnalysisTradeJudgment';
import type { MergedDeskHotZoneEntryPack } from '@/lib/mergedDeskHotZoneEntry';
import type { MergedBounceScenario } from '@/lib/mergedAnalysisBounceTargets';

const ROLE_TITLE: Record<ZoneRole, string> = {
  support: '받침 구간',
  resistance: '막힘 구간',
  ob_bull: '매수 많았던 구간',
  ob_bear: '매도 많았던 구간',
  neutral: '가격 구간',
};

const ROLE_INTRO: Record<ZoneRole, string> = {
  support: '가격이 내려올 때 여기서 다시 오를 수 있는 자리예요.',
  resistance: '가격이 올라올 때 여기서 막히거나 내려올 수 있어요.',
  ob_bull: '예전에 매수 주문이 몰렸던 가격대예요.',
  ob_bear: '예전에 매도 주문이 몰렸던 가격대예요.',
  neutral: '차트에서 눈여겨볼 가격 범위예요.',
};

const TOKEN_EASY: Record<string, string> = {
  받침가능: '과거에 여기서 가격이 다시 올라온 경우가 많았어요.',
  받침관찰: '받침이 될지 지켜보는 중이에요.',
  받침약: '받침이 약해 보여요. 한 번 더 확인이 필요해요.',
  받침유지: '아래쪽 지지가 유지되는 편이에요.',
  받침흔들: '받침이 조금 흔들리는 모습이에요.',
  위막힘: '과거에 여기서 가격이 내려간 경우가 많았어요.',
  위압력관찰: '위에서 막힐지 지켜보는 중이에요.',
  막힘약: '막힘이 약해 보여요.',
  위압력유지: '위쪽 압력이 유지되는 편이에요.',
  막힘흔들: '막힘이 조금 흔들리는 모습이에요.',
  마감확인: '이 가격대에 안착한 것으로 보여요.',
  마감대기: '아직 이 가격대에 완전히 안착했는지 기다리는 중이에요.',
  마감깨짐: '안착에 실패하고 가격이 벗어났어요.',
  '구조전환↑': '하락 흐름이 끝나고 오름 쪽으로 바뀔 수 있어요.',
  '구조전환↓': '오름 흐름이 끝나고 내림 쪽으로 바뀔 수 있어요.',
  '구조바뀜↑': '차트 방향이 오름 쪽으로 바뀌는 신호예요.',
  '구조바뀜↓': '차트 방향이 내림 쪽으로 바뀌는 신호예요.',
  예전거래많음: '예전에 이 가격대에서 거래가 아주 많았어요.',
  거래많았음: '예전에 이 근처에서 거래가 꽤 있었어요.',
  상승장맞음: '큰 흐름이 오름 쪽과 맞아 보여요.',
  하락장맞음: '큰 흐름이 내림 쪽과 맞아 보여요.',
  횡보장: '큰 방향 없이 오르내리는 구간이에요.',
  장세안맞음: '지금 큰 흐름과 이 구간 역할이 잘 안 맞아요.',
  매수유입: '최근 체결에서 매수가 더 많아 보여요.',
  매도유입: '최근 체결에서 매도가 더 많아 보여요.',
  매수압력: '매수 쪽 힘이 조금 더 있어 보여요.',
  매도압력: '매도 쪽 힘이 조금 더 있어 보여요.',
  수급혼조: '매수·매도가 섞여 있어 방향이 애매해요.',
  표본수집: '구간 반응을 모으는 중이에요.',
  수급관찰: '실시간·캔들 수급을 함께 보고 있어요.',
  구간관찰: '이 가격대 반응을 지켜보는 중이에요.',
};

export type ZoneActionVerdict = 'ENTER_LONG' | 'ENTER_SHORT' | 'WAIT' | 'AVOID';

/** 한눈에 보는 3단 자세 — 진입 / 대기 / 관망 */
export type ZoneStanceGlance = 'GO' | 'WAIT' | 'WATCH';

export type ZoneEvidenceRow = {
  id: string;
  kind: 'volume' | 'indicator' | 'signal' | 'structure' | 'risk';
  labelKo: string;
  textKo: string;
  score: number | null;
  tone: 'bull' | 'bear' | 'wait' | 'neutral';
};

export type ZoneMeterRow = {
  id: string;
  labelKo: string;
  value: number;
  tone: 'bull' | 'bear' | 'wait' | 'neutral';
};

export type ZoneChecklistRow = {
  id: string;
  labelKo: string;
  ok: boolean;
  detailKo: string;
};

export type ZoneHoldLive = {
  holdPossible: boolean;
  buySellKo: string;
  zoneBuyPct: number;
  zoneSellPct: number;
  sampleN: number;
};

export type ZoneUpsideTarget = {
  label: string;
  price: number;
  sourceKo: string;
  hit: boolean;
};

export type MirageZoneBeginnerCard = {
  title: string;
  enLabel: string | null;
  lines: string[];
  priceLine: string | null;
  warnLine: string | null;
  /** 진입 / 관망 / 회피 */
  verdict: ZoneActionVerdict;
  /** GO=진입가능 · WAIT=대기 · WATCH=관망 */
  stance: ZoneStanceGlance;
  stanceKo: string;
  stanceSideKo: string | null;
  verdictKo: string;
  verdictHintKo: string;
  actionKo: string;
  /** 신호 합류 0–100 (승률 아님) */
  confluenceScore: number;
  meters: ZoneMeterRow[];
  evidence: ZoneEvidenceRow[];
  checklist: ZoneChecklistRow[];
  distanceKo: string | null;
  touchKo: string | null;
  /** 실시간 지지(저항) 가능 여부 — 거래소 체결 */
  holdLiveKo: string | null;
  exchangeTapeKo: string | null;
  /** 지지 시 상승(또는 저항 시 하락) 목표 */
  upsideKo: string | null;
  upsideTargets: ZoneUpsideTarget[];
};

function easyTokenLine(token: string): string | null {
  const t = token.trim();
  if (!t) return null;
  if (TOKEN_EASY[t]) return TOKEN_EASY[t]!;
  const fromEn = mirageZoneEnTokenToKo(t);
  if (fromEn !== t && TOKEN_EASY[fromEn]) return TOKEN_EASY[fromEn]!;
  return null;
}

function simplifyHist(hist: string): string {
  return hist
    .replace(/거절/g, '위에서 막힘')
    .replace(/반등/g, '아래서 받침')
    .replace(/터치/g, '도달')
    .replace(/표본 부족/g, '최근 반응 관찰 중')
    .replace(/페이즈표본부족/g, '거래량 국면 관찰')
    .replace(/표본부족/g, '수급 관찰')
    .replace(/추가 봉 필요/g, '시간이 조금 더 필요해요');
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function fmt(p: number): string {
  return p >= 1000 ? p.toLocaleString(undefined, { maximumFractionDigits: 0 }) : p.toFixed(2);
}

function expectBull(role: ZoneRole): boolean {
  return role === 'support' || role === 'ob_bull';
}

function expectBear(role: ZoneRole): boolean {
  return role === 'resistance' || role === 'ob_bear';
}

function parseLabelSignalPct(enLabel: string | null): number | null {
  if (!enLabel) return null;
  const m = enLabel.match(/(\d{1,3})\s*%/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? clamp(n, 0, 99) : null;
}

function priceRelation(
  price: number | null | undefined,
  bot: number,
  top: number
): { inside: boolean; distPct: number; side: 'above' | 'inside' | 'below' } {
  if (price == null || !Number.isFinite(price) || price <= 0) {
    return { inside: false, distPct: 99, side: 'above' };
  }
  if (price >= bot && price <= top) return { inside: true, distPct: 0, side: 'inside' };
  const mid = (bot + top) / 2;
  const distPct = (Math.abs(price - mid) / price) * 100;
  return {
    inside: false,
    distPct,
    side: price > top ? 'above' : 'below',
  };
}

function scoreTape(intel: MirageZoneProactiveIntel | null, bullish: boolean): number {
  if (!intel) return 42;
  const raw = intel.tapeScore;
  if (raw != null && Number.isFinite(raw)) {
    const n = clamp(Math.round(raw <= 1 ? raw * 100 : raw), 0, 100);
    return bullish ? n : 100 - n;
  }
  const ko = intel.tapeLabelKo || '';
  if (ko.includes('매수')) return bullish ? 72 : 28;
  if (ko.includes('매도')) return bullish ? 28 : 72;
  return 45;
}

function scoreDepth(intel: MirageZoneProactiveIntel | null, bullish: boolean): number {
  if (!intel) return 40;
  const ko = intel.bidAskBiasKo || intel.depthLabelKo || '';
  if (ko.includes('매수')) return bullish ? 70 : 30;
  if (ko.includes('매도')) return bullish ? 30 : 70;
  return 45;
}

function scoreMtf(intel: MirageZoneProactiveIntel | null, bullish: boolean): number {
  if (!intel) return 40;
  let s = clamp(Math.round(intel.mtfScore || 40), 0, 100);
  if (intel.mtfAligned) s = Math.max(s, 62);
  if (!bullish && s > 50) s = 100 - (s - 50);
  return s;
}

function scorePhase(intel: MirageZoneProactiveIntel | null): number {
  if (!intel) return 38;
  if (intel.phaseProbPct != null) return clamp(Math.round(intel.phaseProbPct), 0, 99);
  return intel.phaseAligned ? 64 : 40;
}

function scoreStructure(intel: MirageZoneProactiveIntel | null, overlay: OverlayItem): number {
  const conf = Number(overlay.confidence);
  let s = Number.isFinite(conf) ? clamp(conf, 20, 95) : 48;
  if (intel?.holdPct != null) s = Math.round((s + clamp(intel.holdPct, 0, 99)) / 2);
  if (intel?.reboundPct != null) s = Math.round((s + clamp(intel.reboundPct, 0, 99)) / 2);
  return clamp(s, 0, 99);
}

export function buildMirageZoneBeginnerCard(params: {
  role: ZoneRole;
  overlay: OverlayItem;
  intel: MirageZoneProactiveIntel | null;
  enLabel?: string | null;
  bot: number;
  top: number;
  patternHint?: string | null;
  assetsRefKo?: string | null;
  currentPrice?: number | null;
  masterFutures?: MasterFuturesDecision | null;
  hqEntryZones?: HqEntryZonesPack | null;
  tradeJudgment?: MergedTradeJudgment | null;
  hotZoneEntry?: MergedDeskHotZoneEntryPack | null;
  zoneHold?: ZoneHoldLive | null;
  bounceScenarios?: MergedBounceScenario[] | null;
  exchangeTapeKo?: string | null;
}): MirageZoneBeginnerCard {
  const { role, overlay, intel, bot, top } = params;
  const enLabel =
    params.enLabel?.trim() ||
    `${overlay.zoneFaceBase ?? ''}${overlay.zoneFaceSignal ? `·${overlay.zoneFaceSignal}` : ''}`.trim() ||
    null;

  const bullish = expectBull(role);
  const bearish = expectBear(role);
  const rel = priceRelation(params.currentPrice, bot, top);
  const labelPct = parseLabelSignalPct(enLabel);
  const oid = String(overlay.id || '');
  const oextra = String(overlay.overlayZoneExtraClass || '');
  const isHotOverlay =
    oid.startsWith('merged-desk-hotzone-') ||
    oextra.includes('merged-desk-hotzone-entry') ||
    oextra.includes('merged-desk-hotzone-zone');

  const volScore = Math.round((scoreTape(intel, bullish || !bearish) + scoreDepth(intel, bullish || !bearish)) / 2);
  const indScore = scoreMtf(intel, bullish || !bearish);
  const phaseScore = scorePhase(intel);
  const structScore = scoreStructure(intel, overlay);
  const sigScore = labelPct ?? clamp(Math.round((structScore + (Number(overlay.confidence) || 50)) / 2), 0, 99);

  let masterBoost = 0;
  const master = params.masterFutures;
  const masterLocked = !!(master && !master.entryAllowed);
  if (master) {
    if (bullish && master.side === 'LONG' && master.entryAllowed) masterBoost = master.grade === 'A' ? 16 : 10;
    else if (bearish && master.side === 'SHORT' && master.entryAllowed) masterBoost = master.grade === 'A' ? 16 : 10;
    else if (master.side === 'WAIT' || master.grade === 'X') masterBoost = -10;
    else if ((bullish && master.side === 'SHORT') || (bearish && master.side === 'LONG')) masterBoost = -14;
    else if (masterLocked) masterBoost = -6;
  }

  let hqBoost = 0;
  let hqHitKo: string | null = null;
  const hq = params.hqEntryZones;
  if (hq?.all?.length) {
    for (const z of hq.all) {
      const overlap = !(z.bot > top || z.top < bot);
      if (!overlap) continue;
      if (bullish && z.side === 'LONG') {
        hqBoost = Math.max(hqBoost, z.grade === 'A' ? 12 : 8);
        hqHitKo = `고확률 롱자리 ${z.grade}와 겹침`;
      }
      if (bearish && z.side === 'SHORT') {
        hqBoost = Math.max(hqBoost, z.grade === 'A' ? 12 : 8);
        hqHitKo = `고확률 숏자리 ${z.grade}와 겹침`;
      }
    }
  }

  /** Hot존 합류 — 클릭한 존이 Hot이거나 가격대 겹침 */
  let hotBoost = 0;
  let hotHitKo: string | null = null;
  let hotStatus: 'WAIT' | 'TOUCH' | 'ENTER' | null = null;
  let hotPrecisionKo: string | null = null;
  const hotPack = params.hotZoneEntry;
  if (hotPack?.all?.length) {
    for (const z of hotPack.all) {
      const overlap = !(z.bot > top + 1e-9 || z.top < bot - 1e-9);
      const same =
        isHotOverlay &&
        ((bullish && z.side === 'LONG') || (bearish && z.side === 'SHORT'));
      if (!overlap && !same) continue;
      if ((bullish && z.side === 'LONG') || (bearish && z.side === 'SHORT') || isHotOverlay) {
        hotBoost = Math.max(hotBoost, z.primary ? 14 : 9);
        hotStatus = z.status;
        hotHitKo = `${z.labelKo} · ${z.statusKo}${z.primary ? ' · ★' : ''}`;
        if (z.primary && hotPack.precision) {
          const p = hotPack.precision;
          hotPrecisionKo = `E ${fmt(p.entry)} · SL ${fmt(p.stopLoss)} · TP1 ${fmt(p.tp1)} (${p.rr.toFixed(1)}R)`;
        }
      }
    }
  }

  let distPenalty = 0;
  if (!rel.inside) {
    if (rel.distPct > 2.5) distPenalty = 18;
    else if (rel.distPct > 1.2) distPenalty = 10;
    else distPenalty = 4;
  }

  const confluenceScore = clamp(
    Math.round(
      sigScore * 0.26 +
        volScore * 0.2 +
        indScore * 0.16 +
        phaseScore * 0.1 +
        structScore * 0.18 +
        masterBoost +
        hqBoost +
        hotBoost -
        distPenalty
    ),
    0,
    99
  );

  const sideAligned =
    !master ||
    master.side === 'WAIT' ||
    (bullish && master.side === 'LONG') ||
    (bearish && master.side === 'SHORT');

  let verdict: ZoneActionVerdict = 'WAIT';

  // Hot존 상태 우선 (같은 존 클릭 시)
  if (hotStatus === 'ENTER' && (bullish || bearish) && !masterLocked && sideAligned) {
    verdict = bullish ? 'ENTER_LONG' : 'ENTER_SHORT';
  } else if (masterLocked || (master && master.grade === 'X') || confluenceScore < 40) {
    verdict = 'AVOID';
  } else if (
    rel.inside &&
    confluenceScore >= 64 &&
    (bullish || bearish) &&
    sideAligned &&
    !masterLocked
  ) {
    verdict = bullish ? 'ENTER_LONG' : 'ENTER_SHORT';
  } else if (
    rel.inside &&
    confluenceScore >= 56 &&
    (bullish || bearish) &&
    (masterBoost > 0 || hqBoost > 0 || hotBoost > 0 || hotStatus === 'TOUCH') &&
    !masterLocked
  ) {
    verdict = bullish ? 'ENTER_LONG' : 'ENTER_SHORT';
  } else if (!rel.inside && confluenceScore >= 55 && (bullish || bearish) && sideAligned) {
    verdict = 'WAIT';
  } else if (confluenceScore < 50 || !sideAligned) {
    verdict = 'AVOID';
  } else {
    verdict = 'WAIT';
  }

  const stance: ZoneStanceGlance =
    verdict === 'ENTER_LONG' || verdict === 'ENTER_SHORT'
      ? 'GO'
      : verdict === 'WAIT'
        ? 'WAIT'
        : 'WATCH';

  const stanceKo = stance === 'GO' ? '진입 가능' : stance === 'WAIT' ? '대기' : '관망';
  const stanceSideKo =
    verdict === 'ENTER_LONG'
      ? '롱'
      : verdict === 'ENTER_SHORT'
        ? '숏'
        : bullish
          ? '롱 후보'
          : bearish
            ? '숏 후보'
            : null;

  const verdictKo =
    stance === 'GO'
      ? `진입 가능 · ${stanceSideKo}`
      : stance === 'WAIT'
        ? '대기 · 존 도달 전'
        : '관망 · 지금은 보류';

  const verdictHintKo =
    stance === 'GO'
      ? '합류·가격·게이트가 맞음 — 손절·무효화 확인 후 조건부 진입'
      : stance === 'WAIT'
        ? '자리 자체는 쓸 만함 — 가격이 존에 닿을 때까지 대기'
        : masterLocked
          ? '마스터 진입 잠금 — 조건 풀릴 때까지 관망'
          : !sideAligned
            ? '존 방향과 마스터 방향이 어긋남 — 관망'
            : '합류·수급이 부족하거나 반대 — 관망';

  const actionKo =
    stance === 'GO' && verdict === 'ENTER_LONG'
      ? hotPrecisionKo
        ? `지금 롱 자리 · ${hotPrecisionKo}`
        : `지금 ${fmt(bot)}~${fmt(top)} 롱 · 종가 ${fmt(bot)} 이탈 시 무효`
      : stance === 'GO' && verdict === 'ENTER_SHORT'
        ? hotPrecisionKo
          ? `지금 숏 자리 · ${hotPrecisionKo}`
          : `지금 ${fmt(bot)}~${fmt(top)} 숏 · 종가 ${fmt(top)} 돌파 시 무효`
        : stance === 'WAIT'
          ? bullish
            ? `가격이 ${fmt(bot)}~${fmt(top)}에 닿으면 롱 재검토`
            : bearish
              ? `가격이 ${fmt(bot)}~${fmt(top)}에 닿으면 숏 재검토`
              : `가격이 ${fmt(bot)}~${fmt(top)}에 닿을 때까지 대기`
          : '진입 보류 — 다른 존·게이트·합류를 확인';

  const checklist: ZoneChecklistRow[] = [
    {
      id: 'price',
      labelKo: '가격 위치',
      ok: rel.inside,
      detailKo: rel.inside
        ? '존 안 · 터치 중'
        : rel.side === 'above'
          ? `위 · ${rel.distPct.toFixed(2)}%`
          : `아래 · ${rel.distPct.toFixed(2)}%`,
    },
    {
      id: 'confluence',
      labelKo: '합류',
      ok: confluenceScore >= 58,
      detailKo: `${confluenceScore}점 (승률 아님)`,
    },
    {
      id: 'gate',
      labelKo: '마스터',
      ok: !master ? confluenceScore >= 60 : !masterLocked && sideAligned,
      detailKo: master
        ? `${master.side} ${master.grade} · ${master.entryAllowed ? '진입가능' : '잠금'}`
        : '마스터 없음 · 합류만 참고',
    },
    {
      id: 'hot',
      labelKo: 'Hot존',
      ok: !!(hotStatus === 'ENTER' || (hotStatus === 'TOUCH' && confluenceScore >= 58)),
      detailKo: hotHitKo || '겹침 없음',
    },
  ];

  const meters: ZoneMeterRow[] = [
    {
      id: 'signal',
      labelKo: '시그널',
      value: sigScore,
      tone: sigScore >= 70 ? (bullish ? 'bull' : bearish ? 'bear' : 'neutral') : sigScore >= 50 ? 'wait' : 'neutral',
    },
    {
      id: 'volume',
      labelKo: '거래량·수급',
      value: volScore,
      tone: volScore >= 62 ? (bullish ? 'bull' : 'bear') : volScore <= 38 ? (bullish ? 'bear' : 'bull') : 'wait',
    },
    {
      id: 'mtf',
      labelKo: '지표·MTF',
      value: indScore,
      tone: indScore >= 60 ? (bullish ? 'bull' : 'bear') : 'wait',
    },
    {
      id: 'phase',
      labelKo: '국면',
      value: phaseScore,
      tone: phaseScore >= 60 ? 'bull' : phaseScore <= 40 ? 'bear' : 'wait',
    },
  ];

  const evidence: ZoneEvidenceRow[] = [];
  const pushEv = (row: ZoneEvidenceRow) => {
    if (evidence.some((e) => e.id === row.id)) return;
    evidence.push(row);
  };

  pushEv({
    id: 'stance',
    kind: 'signal',
    labelKo: '한눈 판단',
    textKo: `${stanceKo}${stanceSideKo ? ` · ${stanceSideKo}` : ''} — ${verdictHintKo}`,
    score: confluenceScore,
    tone: stance === 'GO' ? (bullish ? 'bull' : 'bear') : stance === 'WAIT' ? 'wait' : 'neutral',
  });

  pushEv({
    id: 'role',
    kind: 'structure',
    labelKo: '구간 역할',
    textKo: ROLE_INTRO[role],
    score: structScore,
    tone: bullish ? 'bull' : bearish ? 'bear' : 'neutral',
  });

  if (hotHitKo) {
    pushEv({
      id: 'hot',
      kind: 'signal',
      labelKo: 'Hot존',
      textKo: hotPrecisionKo ? `${hotHitKo} · ${hotPrecisionKo}` : hotHitKo,
      score: confluenceScore,
      tone: bullish ? 'bull' : bearish ? 'bear' : 'wait',
    });
  }

  if (intel?.histSummaryKo) {
    pushEv({
      id: 'hist',
      kind: 'structure',
      labelKo: '과거 반응',
      textKo: simplifyHist(intel.histSummaryKo),
      score: intel.holdPct ?? intel.reboundPct,
      tone: 'neutral',
    });
  }

  if (intel) {
    pushEv({
      id: 'tape',
      kind: 'volume',
      labelKo: '실시간 체결',
      textKo:
        intel.tapeLabelKo === '매수우세'
          ? '체결 매수 우세 — 반등·지지 시나리오에 우호'
          : intel.tapeLabelKo === '매도우세'
            ? '체결 매도 우세 — 거부·하락 시나리오에 우호'
            : `체결 ${intel.tapeLabelKo || '혼조'}`,
      score: volScore,
      tone: intel.tapeLabelKo.includes('매수') ? 'bull' : intel.tapeLabelKo.includes('매도') ? 'bear' : 'wait',
    });
    pushEv({
      id: 'depth',
      kind: 'volume',
      labelKo: '호가·깊이',
      textKo: `${intel.depthLabelKo || '깊이'} · ${intel.bidAskBiasKo || '균형'}`,
      score: scoreDepth(intel, bullish || !bearish),
      tone: intel.bidAskBiasKo.includes('매수') ? 'bull' : intel.bidAskBiasKo.includes('매도') ? 'bear' : 'neutral',
    });
    pushEv({
      id: 'mtf',
      kind: 'indicator',
      labelKo: 'MTF·지표',
      textKo: intel.mtfLabelKo || (intel.mtfAligned ? '여러 시간봉 정렬' : '시간봉 혼재'),
      score: indScore,
      tone: intel.mtfAligned ? (bullish ? 'bull' : 'bear') : 'wait',
    });
    if (intel.phaseLabelKo) {
      pushEv({
        id: 'phase',
        kind: 'signal',
        labelKo: '거래량 국면',
        textKo: `${intel.phaseLabelKo}${intel.phaseProbPct != null ? ` · 유사 ${Math.round(intel.phaseProbPct)}%` : ''}`,
        score: phaseScore,
        tone: intel.phaseAligned ? 'bull' : 'wait',
      });
    }
  }

  if (master) {
    pushEv({
      id: 'master',
      kind: 'signal',
      labelKo: '마스터 선물',
      textKo: `${master.side} ${master.grade} · ${master.entryAllowed ? '진입가능' : '진입잠금'} · ${master.reasonKo.slice(0, 72)}`,
      score: master.strength,
      tone: master.side === 'LONG' ? 'bull' : master.side === 'SHORT' ? 'bear' : 'wait',
    });
  }

  if (hqHitKo) {
    pushEv({
      id: 'hq',
      kind: 'signal',
      labelKo: '고확률 자리',
      textKo: hqHitKo,
      score: confluenceScore,
      tone: bullish ? 'bull' : 'bear',
    });
  }

  if (params.patternHint) {
    pushEv({
      id: 'pattern',
      kind: 'structure',
      labelKo: '패턴',
      textKo: params.patternHint.slice(0, 100),
      score: null,
      tone: 'neutral',
    });
  }

  if (params.assetsRefKo) {
    pushEv({
      id: 'battle',
      kind: 'indicator',
      labelKo: '존 전투·합류',
      textKo: params.assetsRefKo.slice(0, 110),
      score: null,
      tone: 'neutral',
    });
  }

  if (params.tradeJudgment?.summaryKo) {
    pushEv({
      id: 'judge',
      kind: 'signal',
      labelKo: '통합 판단',
      textKo: params.tradeJudgment.summaryKo.slice(0, 100),
      score: null,
      tone:
        params.tradeJudgment.direction === 'LONG'
          ? 'bull'
          : params.tradeJudgment.direction === 'SHORT'
            ? 'bear'
            : 'wait',
    });
  }

  const tagParts = String(intel?.tagKo || overlay.zoneFaceDetailKo || '')
    .split('·')
    .map((s) => s.trim())
    .filter(Boolean);
  for (const p of intel?.deepFaceKo ?? []) tagParts.push(p);
  for (const part of tagParts.slice(0, 4)) {
    const easy = easyTokenLine(part);
    if (easy) {
      pushEv({
        id: `tag-${part}`,
        kind: 'structure',
        labelKo: '면 신호',
        textKo: easy,
        score: null,
        tone: 'neutral',
      });
    }
  }

  const lines: string[] = [];
  const seen = new Set<string>();
  const pushLine = (s: string) => {
    const t = s.trim();
    if (!t || seen.has(t)) return;
    seen.add(t);
    lines.push(t);
  };
  pushLine(`${stanceKo}${stanceSideKo ? ` · ${stanceSideKo}` : ''}`);
  pushLine(ROLE_INTRO[role]);
  for (const e of evidence.slice(0, 5)) pushLine(e.textKo);

  const distanceKo = rel.inside
    ? '가격이 이 존 안에 있어요 (터치 중)'
    : rel.side === 'above'
      ? `현재가 위 · 존까지 약 ${rel.distPct.toFixed(2)}%`
      : `현재가 아래 · 존까지 약 ${rel.distPct.toFixed(2)}%`;

  const touchKo =
    intel && (intel.touches > 0 || intel.bounces > 0)
      ? `과거 터치 ${intel.touches} · 반등/반응 ${intel.bounces}`
      : null;

  let warnLine: string | null = null;
  const inval = intel?.invalidationPrice ?? hotPack?.precision?.invalidationPrice;
  if (inval != null && Number.isFinite(inval)) {
    warnLine = bullish
      ? `무효화: 종가 ${fmt(inval)} 이탈 시 롱 시나리오 폐기`
      : `무효화: 종가 ${fmt(inval)} 돌파 시 숏 시나리오 폐기`;
  } else if (bullish) {
    warnLine = `무효화: 종가 ${fmt(bot)} 이탈 시 받침 실패로 볼 수 있음`;
  } else if (bearish) {
    warnLine = `무효화: 종가 ${fmt(top)} 돌파 시 막힘 실패로 볼 수 있음`;
  }

  const hold = params.zoneHold ?? null;
  let holdLiveKo: string | null = null;
  if (hold) {
    if (bullish) {
      holdLiveKo = hold.holdPossible
        ? `실시간 지지 가능 · ${hold.buySellKo} (표본 ${hold.sampleN})`
        : `지지 불확실 · ${hold.buySellKo} (표본 ${hold.sampleN})`;
    } else if (bearish) {
      holdLiveKo = hold.holdPossible
        ? `실시간 저항 가능 · ${hold.buySellKo} (표본 ${hold.sampleN})`
        : `저항 불확실 · ${hold.buySellKo} (표본 ${hold.sampleN})`;
    } else {
      holdLiveKo = `${hold.buySellKo} · 표본 ${hold.sampleN}`;
    }
  }

  const upsideTargets: ZoneUpsideTarget[] = [];
  const bounceList = params.bounceScenarios ?? [];
  const bounce =
    bounceList.find((s) => s.active && (bullish ? s.direction === 'up' : s.direction === 'down')) ??
    bounceList.find((s) => s.active) ??
    bounceList[0] ??
    null;
  if (bounce?.targets?.length) {
    for (const t of bounce.targets.slice(0, 4)) {
      upsideTargets.push({
        label: t.label,
        price: t.price,
        sourceKo: t.sourceKo,
        hit: !!t.hit,
      });
    }
  } else if (hotPack?.precision && bullish && hotPack.precision.side === 'LONG') {
    upsideTargets.push({
      label: 'TP1',
      price: hotPack.precision.tp1,
      sourceKo: 'Hot존',
      hit: false,
    });
  } else if (hotPack?.precision && bearish && hotPack.precision.side === 'SHORT') {
    upsideTargets.push({
      label: 'TP1',
      price: hotPack.precision.tp1,
      sourceKo: 'Hot존',
      hit: false,
    });
  }

  const upsideKo =
    upsideTargets.length > 0
      ? bullish
        ? `지지 유지 시 상승 참고: ${upsideTargets
            .map((t) => `${t.label} ${fmt(t.price)}${t.hit ? '✓' : ''}`)
            .join(' · ')}`
        : bearish
          ? `저항 유지 시 하락 참고: ${upsideTargets
              .map((t) => `${t.label} ${fmt(t.price)}${t.hit ? '✓' : ''}`)
              .join(' · ')}`
          : upsideTargets.map((t) => `${t.label} ${fmt(t.price)}`).join(' · ')
      : null;

  if (holdLiveKo) {
    pushEv({
      id: 'ex-hold',
      kind: 'volume',
      labelKo: '거래소 체결',
      textKo: holdLiveKo,
      score: hold ? hold.zoneBuyPct : null,
      tone: hold?.holdPossible ? (bullish ? 'bull' : 'bear') : 'wait',
    });
  }
  if (upsideKo) {
    pushEv({
      id: 'upside',
      kind: 'structure',
      labelKo: bullish ? '상승 목표' : bearish ? '하락 목표' : '목표',
      textKo: upsideKo,
      score: null,
      tone: bullish ? 'bull' : bearish ? 'bear' : 'neutral',
    });
  }

  // 실시간 지지/저항 가능이면 자세를 한 단계 강화 (수익 보장 아님)
  let finalStance = stance;
  let finalVerdict = verdict;
  let finalStanceKo = stanceKo;
  let finalVerdictKo = verdictKo;
  let finalHint = verdictHintKo;
  let finalAction = actionKo;
  if (hold?.holdPossible && rel.inside && (bullish || bearish) && !masterLocked && sideAligned) {
    finalStance = 'GO';
    finalVerdict = bullish ? 'ENTER_LONG' : 'ENTER_SHORT';
    finalStanceKo = '진입 가능';
    finalVerdictKo = `진입 가능 · ${bullish ? '롱' : '숏'}`;
    finalHint = '존 안 + 거래소 체결이 지지/저항 쪽에 우세 — 손절·무효화 확인 후 조건부 참고';
    if (upsideTargets[0]) {
      finalAction = `${bullish ? '롱' : '숏'} 자리 · 1차 목표 ${fmt(upsideTargets[0].price)} (${upsideTargets[0].label})`;
    }
  }

  return {
    title: isHotOverlay ? 'Hot존 · 스윙중투' : ROLE_TITLE[role],
    enLabel,
    lines: lines.slice(0, 5),
    priceLine: `가격대 ${fmt(bot)} ~ ${fmt(top)}`,
    warnLine,
    verdict: finalVerdict,
    stance: finalStance,
    stanceKo: finalStanceKo,
    stanceSideKo:
      finalVerdict === 'ENTER_LONG'
        ? '롱'
        : finalVerdict === 'ENTER_SHORT'
          ? '숏'
          : stanceSideKo,
    verdictKo: finalVerdictKo,
    verdictHintKo: finalHint,
    actionKo: finalAction,
    confluenceScore,
    meters,
    evidence: evidence.slice(0, 10),
    checklist,
    distanceKo,
    touchKo,
    holdLiveKo,
    exchangeTapeKo: params.exchangeTapeKo ?? null,
    upsideKo,
    upsideTargets,
  };
}
