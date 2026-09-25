/**
 * 마감·안착 — zone·line **기능별** 마감·안착·실패 라벨.
 *
 * 규칙 요약
 * - **마감존**: SuperTrend 상·하한 + 확정 봉 (`closingEnvelopeVerdictAtBar`)
 * - **플랜 라인**: 확정 마감 봉만 종가 돌파 → 2봉 유지 → 리테스트 (`evaluateSettleBreak(closed)`)
 * - **플랜 존**: 존 상·하단 동일 + 시나리오 편향
 * - **차트 TF**: `tfCloseSettleAssessment` 진행 봉 판정 → 진입 라인에 병기
 */
import type { Candle, OverlayItem } from '@/types';
import type {
  ClosingEnvelopeFuturesScenario,
  ClosingEnvelopeVerdictKo,
  InstitutionalSuperTrendCore,
} from '@/lib/institutionalSuperBand';
import { MONTH_DESK_TRAINER } from '@/lib/monthDeskChartTrainerTheme';
import { monthDeskZoneCaptionShort } from '@/lib/monthDeskZoneShortLabels';
import type { TfCloseSettleRow } from '@/lib/tfCloseSettleAssessment';
import {
  closingEnvelopeVerdictAtBar,
  evaluateSettleBreak,
  priceOfOverlay,
  splitConfirmedClosedCandles,
  zoneBoundsOverlay,
  type SettleBreakSnapshot,
  type SettleLevelProbe,
} from '@/lib/monthDeskSettleProbe';

export type MonthDeskFeatureSettlePhase =
  | 'none'
  | 'breakout'
  | 'settling'
  | 'confirmed'
  | 'failed'
  | 'envelope';

export type MonthDeskFeatureSettleLabel = {
  overlayId: string;
  featureKo: string;
  phase: MonthDeskFeatureSettlePhase;
  statusKo: string;
  dirKo: '' | '상향' | '하향';
  color: string;
  bgColor: string;
  borderColor: string;
  tooltipLines: string[];
};

export type MonthDeskFeatureSettleContext = {
  scenario?: ClosingEnvelopeFuturesScenario | null;
  settleRow?: TfCloseSettleRow | null;
  chartTimeframe?: string;
  stCore?: InstitutionalSuperTrendCore | null;
};

const PHASE_RANK: Record<MonthDeskFeatureSettlePhase, number> = {
  none: 0,
  breakout: 1,
  settling: 2,
  envelope: 2,
  confirmed: 3,
  failed: 4,
};

const LINE_TARGETS: { id: string; labelKo: string; primaryDir?: (b: ClosingEnvelopeFuturesScenario | null) => 'above' | 'below' }[] = [
  { id: 'month-desk-plan-entry', labelKo: '진입', primaryDir: (s) => (s?.bias === 'SHORT' ? 'below' : 'above') },
  { id: 'month-desk-plan-sl', labelKo: '손절', primaryDir: () => 'below' },
  { id: 'month-desk-plan-tp1', labelKo: '목표 TP1', primaryDir: () => 'above' },
  { id: 'month-desk-plan-tp2', labelKo: '목표 TP2', primaryDir: () => 'above' },
  { id: 'month-desk-plan-tp3', labelKo: '목표 TP3', primaryDir: () => 'above' },
  { id: 'month-desk-anchor-invalidation', labelKo: '무효화' },
  { id: 'month-desk-core-long-entry', labelKo: '핵심 E', primaryDir: () => 'above' },
  { id: 'month-desk-core-long-sl', labelKo: '핵심 SL', primaryDir: () => 'below' },
  { id: 'month-desk-core-long-bounce', labelKo: '반등', primaryDir: () => 'above' },
  { id: 'month-desk-strike-long-entry', labelKo: 'Strike 롱 E', primaryDir: () => 'above' },
  { id: 'month-desk-strike-long-sl', labelKo: 'Strike 롱 SL', primaryDir: () => 'below' },
  { id: 'month-desk-strike-long-tp1', labelKo: 'Strike 롱 TP1', primaryDir: () => 'above' },
  { id: 'month-desk-strike-long-tp2', labelKo: 'Strike 롱 TP2', primaryDir: () => 'above' },
  { id: 'month-desk-strike-long-tp3', labelKo: 'Strike 롱 TP3', primaryDir: () => 'above' },
  { id: 'month-desk-strike-short-entry', labelKo: 'Strike 숏 E', primaryDir: () => 'below' },
  { id: 'month-desk-strike-short-sl', labelKo: 'Strike 숏 SL', primaryDir: () => 'above' },
  { id: 'month-desk-strike-short-tp1', labelKo: 'Strike 숏 TP1', primaryDir: () => 'below' },
  { id: 'month-desk-strike-short-tp2', labelKo: 'Strike 숏 TP2', primaryDir: () => 'below' },
  { id: 'month-desk-strike-short-tp3', labelKo: 'Strike 숏 TP3', primaryDir: () => 'below' },
  { id: 'month-desk-core-short-entry', labelKo: '핵심 S·E', primaryDir: () => 'below' },
  { id: 'month-desk-core-short-sl', labelKo: '핵심 S·SL', primaryDir: () => 'above' },
  { id: 'month-desk-core-short-tp1', labelKo: '핵심 S·TP1', primaryDir: () => 'below' },
  { id: 'month-desk-typeom-entry', labelKo: '타점 E', primaryDir: () => 'above' },
  { id: 'month-desk-typeom-sl', labelKo: '타점 SL', primaryDir: () => 'below' },
  { id: 'trade-atlas-entry', labelKo: 'Atlas E', primaryDir: (s) => (s?.bias === 'SHORT' ? 'below' : 'above') },
  { id: 'trade-atlas-sl', labelKo: 'Atlas SL', primaryDir: () => 'below' },
  { id: 'trade-atlas-tp1', labelKo: '목표 TP1', primaryDir: () => 'above' },
  { id: 'trade-atlas-tp2', labelKo: '목표 TP2', primaryDir: () => 'above' },
  { id: 'trade-atlas-tp3', labelKo: '목표 TP3', primaryDir: () => 'above' },
];

const ZONE_TARGETS = [
  'month-desk-plan-reward-zone',
  'month-desk-plan-risk-zone',
  'month-desk-unified-zone',
  'month-desk-typeom-pocket-zone',
  'month-desk-core-long-spot',
  'month-desk-core-money-long',
  'month-desk-core-money-short',
  'month-desk-core-money-entry',
] as const;

function statusKoForPhase(phase: MonthDeskFeatureSettlePhase): string {
  switch (phase) {
    case 'breakout':
      return '마감·돌파';
    case 'settling':
      return '안착중';
    case 'confirmed':
      return '안착';
    case 'failed':
      return '실패';
    default:
      return '마감전';
  }
}

function phaseFromSnap(snap: SettleBreakSnapshot | null): MonthDeskFeatureSettlePhase {
  if (!snap) return 'none';
  if (snap.fakeBreak || snap.retest.violated || !snap.stillAbove) return 'failed';
  const retestOk = !snap.retest.touched || !snap.retest.violated;
  const holdOk = snap.holdN ?? snap.hold2;
  if (holdOk && snap.breakVolOk && retestOk) return 'confirmed';
  if (snap.stillAbove && (holdOk || snap.breakVolOk)) return 'settling';
  return 'breakout';
}

function styleFor(
  phase: MonthDeskFeatureSettlePhase,
  dir: 'above' | 'below' | 'neutral',
  envelopeVerdict?: ClosingEnvelopeVerdictKo
): Pick<MonthDeskFeatureSettleLabel, 'color' | 'bgColor' | 'borderColor'> {
  if (envelopeVerdict) {
    if (envelopeVerdict === '안착') {
      return {
        color: MONTH_DESK_TRAINER.long.labelText,
        bgColor: 'rgba(6,78,59,0.92)',
        borderColor: MONTH_DESK_TRAINER.long.border,
      };
    }
    if (envelopeVerdict === '실패') {
      return {
        color: '#FCA5A5',
        bgColor: 'rgba(69,10,10,0.9)',
        borderColor: 'rgba(248,113,113,0.55)',
      };
    }
    return {
      color: '#FDE68A',
      bgColor: 'rgba(30,41,59,0.9)',
      borderColor: 'rgba(250,204,21,0.5)',
    };
  }
  const long = dir === 'above' || dir === 'neutral';
  const pal = long ? MONTH_DESK_TRAINER.long : MONTH_DESK_TRAINER.short;
  switch (phase) {
    case 'confirmed':
      return {
        color: pal.labelText,
        bgColor: long ? 'rgba(6,78,59,0.92)' : 'rgba(69,10,10,0.92)',
        borderColor: pal.border,
      };
    case 'settling':
      return {
        color: '#FDE68A',
        bgColor: 'rgba(30,41,59,0.9)',
        borderColor: 'rgba(250,204,21,0.55)',
      };
    case 'breakout':
      return {
        color: long ? '#A7F3D0' : '#FCA5A5',
        bgColor: 'rgba(15,23,42,0.88)',
        borderColor: long ? 'rgba(74,222,128,0.5)' : 'rgba(248,113,113,0.5)',
      };
    case 'failed':
      return {
        color: '#94A3B8',
        bgColor: 'rgba(51,65,85,0.88)',
        borderColor: 'rgba(148,163,184,0.55)',
      };
    default:
      return {
        color: 'rgba(148,163,184,0.85)',
        bgColor: 'rgba(15,23,42,0.65)',
        borderColor: 'rgba(100,116,139,0.4)',
      };
  }
}

function makeLabel(input: {
  overlayId: string;
  featureKo: string;
  phase: MonthDeskFeatureSettlePhase;
  statusKo: string;
  dirKo?: '' | '상향' | '하향';
  dir?: 'above' | 'below' | 'neutral';
  envelopeVerdict?: ClosingEnvelopeVerdictKo;
  tooltipLines: string[];
}): MonthDeskFeatureSettleLabel {
  const dir = input.dir ?? 'neutral';
  return {
    overlayId: input.overlayId,
    featureKo: input.featureKo,
    phase: input.phase,
    statusKo: input.statusKo,
    dirKo: input.dirKo ?? '',
    ...styleFor(input.phase, dir, input.envelopeVerdict),
    tooltipLines: input.tooltipLines,
  };
}

function evaluateLineOnClosed(
  closed: Candle[],
  overlayId: string,
  labelKo: string,
  level: number,
  scenario: ClosingEnvelopeFuturesScenario | null,
  primaryDir?: 'above' | 'below'
): MonthDeskFeatureSettleLabel {
  const probeDir = primaryDir ?? 'above';
  const probe: SettleLevelProbe = {
    key: `${overlayId}-${probeDir}`,
    levelKo: labelKo,
    level,
    dir: probeDir,
    weight: 90,
  };
  const snap = evaluateSettleBreak(closed, probe);
  const phase = phaseFromSnap(snap);
  const dirKo: '' | '상향' | '하향' = snap ? (probeDir === 'above' ? '상향' : '하향') : '';
  const tip = snap
    ? [
        `[${labelKo}] 확정 마감 봉 · ${probeDir === 'above' ? '상향' : '하향'} 돌파`,
        snap.hold2 ? '2봉 유지' : '유지 검증 중',
        snap.breakVolOk ? '돌파 마감봉 거래량 OK' : '돌파 마감봉 거래량 약함',
        snap.retest.touched
          ? snap.retest.violated
            ? '리테스트 마감 이탈'
            : '리테스트 유지'
          : '리테스트 없음',
        scenario ? scenario.summaryKo : '',
        '참고용',
      ].filter(Boolean)
    : [`[${labelKo}] 아직 ${probeDir === 'above' ? '상향' : '하향'} 마감 돌파 없음`, '참고용'];

  if (snap) {
    return makeLabel({
      overlayId,
      featureKo: labelKo,
      phase,
      statusKo: statusKoForPhase(phase),
      dirKo,
      dir: probeDir,
      tooltipLines: tip,
    });
  }
  return makeLabel({
    overlayId,
    featureKo: labelKo,
    phase: 'none',
    statusKo: '마감전',
    tooltipLines: [`[${labelKo}] 마감 전`, '참고용'],
  });
}

/** 라인 역할·시나리오·종가 기준 유효 돌파 방향 */
function resolveLinePrimaryDir(
  overlayId: string,
  level: number,
  scenario: ClosingEnvelopeFuturesScenario | null,
  closed: Candle[]
): 'above' | 'below' | undefined {
  const spec = LINE_TARGETS.find((t) => t.id === overlayId);
  const cl = Number(closed[closed.length - 1]?.close);
  const bias = scenario?.bias;

  if (overlayId.includes('plan-sl') || overlayId.includes('core-long-sl') || overlayId.includes('typeom-sl')) {
    if (bias === 'SHORT') return 'above';
    return 'below';
  }
  if (overlayId.includes('tp')) {
    if (bias === 'SHORT') return 'below';
    if (bias === 'LONG') return 'above';
    if (Number.isFinite(cl)) return level >= cl ? 'above' : 'below';
    return 'above';
  }
  if (overlayId.includes('entry') || overlayId.includes('bounce')) {
    if (bias === 'SHORT') return 'below';
    if (bias === 'LONG') return 'above';
    return spec?.primaryDir?.(scenario) ?? undefined;
  }
  return spec?.primaryDir?.(scenario);
}

function evaluateZoneOnClosed(
  closed: Candle[],
  overlayId: string,
  labelKo: string,
  top: number,
  bot: number,
  scenario: ClosingEnvelopeFuturesScenario | null
): MonthDeskFeatureSettleLabel {
  const topProbe: SettleLevelProbe = { key: 'z-top', levelKo: labelKo, level: top, dir: 'above', weight: 80 };
  const botProbe: SettleLevelProbe = { key: 'z-bot', levelKo: labelKo, level: bot, dir: 'below', weight: 78 };
  const snapUp = evaluateSettleBreak(closed, topProbe);
  const snapDn = evaluateSettleBreak(closed, botProbe);
  const phaseUp = phaseFromSnap(snapUp);
  const phaseDn = phaseFromSnap(snapDn);
  const last = closed[closed.length - 1]!;
  const cl = Number(last.close);
  const inside = cl >= bot && cl <= top;

  let phase: MonthDeskFeatureSettlePhase = 'none';
  let statusKo = '마감전';
  let dirKo: '' | '상향' | '하향' = '';
  let dir: 'above' | 'below' | 'neutral' = 'neutral';

  if (PHASE_RANK[phaseUp] >= PHASE_RANK[phaseDn]) {
    phase = phaseUp;
    statusKo = phaseUp === 'none' && inside ? '존내' : statusKoForPhase(phaseUp);
    dirKo = snapUp ? '상향' : '';
    dir = 'above';
  } else {
    phase = phaseDn;
    statusKo = phaseDn === 'none' && inside ? '존내' : statusKoForPhase(phaseDn);
    dirKo = snapDn ? '하향' : '';
    dir = 'below';
  }

  if (inside && phase === 'none') {
    phase = 'settling';
    statusKo = '존내';
  }

  if (scenario) {
    if (overlayId === 'month-desk-plan-reward-zone' && scenario.bias === 'LONG' && scenario.lastVerdict === '안착') {
      phase = 'confirmed';
      statusKo = '안착';
      dir = 'above';
    }
    if (overlayId === 'month-desk-plan-risk-zone' && scenario.lastVerdict === '실패') {
      phase = 'failed';
      statusKo = '실패';
      dir = 'below';
    }
  }

  return makeLabel({
    overlayId,
    featureKo: labelKo,
    phase,
    statusKo,
    dirKo,
    dir,
    tooltipLines: [
      `[${labelKo}] 확정 마감 봉 기준`,
      `상단 ${top.toFixed(4)} / 하단 ${bot.toFixed(4)}`,
      inside ? '마지막 확정 종가가 존 내부' : '마지막 확정 종가가 존 외부',
      scenario ? scenario.summaryKo : '',
      '참고용',
    ].filter(Boolean),
  });
}

function envelopeBandLabel(
  overlayId: string,
  featureKo: string,
  closed: Candle[],
  core: InstitutionalSuperTrendCore,
  band: 'lower' | 'upper'
): MonthDeskFeatureSettleLabel {
  const i = closed.length - 1;
  const trendLong = core.trend[i] === 1;
  const active = (band === 'lower' && trendLong) || (band === 'upper' && !trendLong);
  const v = active ? closingEnvelopeVerdictAtBar(closed, i, core) : null;
  const statusKo = active && v ? v : '참고';
  const phase: MonthDeskFeatureSettlePhase = active && v ? 'envelope' : 'none';
  return makeLabel({
    overlayId,
    featureKo,
    phase,
    statusKo,
    dirKo: trendLong ? '상향' : '하향',
    dir: trendLong ? 'above' : 'below',
    envelopeVerdict: active ? v ?? undefined : undefined,
    tooltipLines: [
      `[${featureKo}] 마감존 — ${active ? '활성 밴드' : '비활성(참고)'}`,
      active && v
        ? `확정 봉 판정: ${v} (SuperTrend ${trendLong ? '롱' : '숏'} 구간)`
        : '추세 반대편 밴드 — 참고만',
      '종가·터치 vs 존상·존하 — 앱 마감·안착 코어',
      '참고용 · 확정 신호 아님',
    ],
  });
}

function attachTfToEntry(
  map: Map<string, MonthDeskFeatureSettleLabel>,
  settleRow: TfCloseSettleRow
) {
  const entryId = map.has('month-desk-plan-entry')
    ? 'month-desk-plan-entry'
    : map.has('month-desk-typeom-entry')
      ? 'month-desk-typeom-entry'
      : map.has('trade-atlas-entry')
        ? 'trade-atlas-entry'
        : null;
  if (!entryId) return;
  const entry = map.get(entryId)!;
  map.set(entryId, {
    ...entry,
    tooltipLines: [
      `차트 TF ${settleRow.tfKo} 진행 봉: ${settleRow.formingVerdict} (마감 전)`,
      `직전 ${settleRow.tfKo} 확정: ${settleRow.confirmedCloseLabel}`,
      ...entry.tooltipLines,
    ],
  });
}

/** 우측 라벨·스트립용 정렬 목록 */
export function listMonthDeskFeatureSettleLabels(
  map: Map<string, MonthDeskFeatureSettleLabel>
): MonthDeskFeatureSettleLabel[] {
  const order = [
    'month-desk-closing-zone-lower',
    'month-desk-closing-zone-upper',
    'month-desk-plan-entry',
    'month-desk-plan-sl',
    'month-desk-plan-tp1',
    'month-desk-plan-tp2',
    'month-desk-plan-tp3',
    'month-desk-anchor-invalidation',
    'month-desk-plan-reward-zone',
    'month-desk-plan-risk-zone',
    'month-desk-unified-zone',
    'month-desk-core-long-entry',
    'month-desk-core-long-sl',
    'month-desk-core-long-bounce',
    'month-desk-typeom-entry',
    'month-desk-typeom-sl',
    'trade-atlas-entry',
    'trade-atlas-sl',
    'trade-atlas-tp1',
    'trade-atlas-tp2',
    'trade-atlas-tp3',
  ];
  const out: MonthDeskFeatureSettleLabel[] = [];
  const seen = new Set<string>();
  for (const id of order) {
    const row = map.get(id);
    if (row) {
      out.push(row);
      seen.add(id);
    }
  }
  for (const [id, row] of map) {
    if (!seen.has(id) && (id.startsWith('month-desk-') || id.startsWith('ob-pre-beam') || id.startsWith('trade-atlas-'))) {
      out.push(row);
      seen.add(id);
    }
  }
  return out;
}

/** 우측 가격띠·스트립 — 짧은 판정 칩 */
export function monthDeskSettleBracketText(l: MonthDeskFeatureSettleLabel): string {
  const { phase, dirKo, statusKo, featureKo } = l;
  if (statusKo === '안착' && phase === 'envelope') return '[마감 성공]';
  if (statusKo === '불안') return '[불안]';
  if (statusKo === '실패' && phase === 'envelope') return '[마감 실패]';
  if (statusKo === '참고' || statusKo === '마감전') return '';
  if (statusKo === '존내') return '[존내]';

  if (phase === 'confirmed') {
    if (featureKo.startsWith('목표')) return dirKo === '하향' ? '[목표 도달]' : '[목표 도달]';
    if (featureKo === '진입') return '[안착]';
    if (featureKo === '손절') return '[손절 터치]';
    return dirKo ? `[${dirKo} 안착]` : '[안착]';
  }
  if (phase === 'failed') {
    if (featureKo === '진입') return '[진입 실패]';
    if (featureKo === '손절') return '[무효]';
    if (featureKo.startsWith('목표')) return '';
    if (dirKo === '하향') return '[하향 이탈]';
    if (dirKo === '상향') return '[상향 실패]';
    return '[마감 실패]';
  }
  if (phase === 'breakout') return dirKo ? `[${dirKo.slice(0, 2)} 돌파]` : '[돌파]';
  if (phase === 'settling') return '[안착중]';
  return '';
}

/** summary 모드 — 진입 행에만 붙일 한 줄 요약 (우측 밴드 상단 칩) */
export function buildSettleBandSummaryChip(
  map: Map<string, MonthDeskFeatureSettleLabel>,
  scenario: ClosingEnvelopeFuturesScenario | null | undefined
): string {
  const bias = scenario?.bias === 'LONG' ? '롱' : scenario?.bias === 'SHORT' ? '숏' : '관망';
  const entry = map.get('month-desk-plan-entry') ?? map.get('month-desk-typeom-entry') ?? map.get('trade-atlas-entry');
  const sl = map.get('month-desk-plan-sl') ?? map.get('month-desk-typeom-sl') ?? map.get('trade-atlas-sl');
  const tps = ['month-desk-plan-tp1', 'month-desk-plan-tp2', 'month-desk-plan-tp3', 'trade-atlas-tp1', 'trade-atlas-tp2', 'trade-atlas-tp3']
    .map((id) => map.get(id))
    .filter(Boolean) as MonthDeskFeatureSettleLabel[];
  const hit = tps.filter((t) => t.phase === 'confirmed').length;
  const next = tps.find((t) => t.phase !== 'confirmed');

  let phaseKo = '대기';
  if (scenario?.lastVerdict === '실패') phaseKo = '마감실패';
  else if (entry?.phase === 'confirmed') phaseKo = '안착';
  else if (entry?.phase === 'failed') phaseKo = '진입실패';
  else if (sl?.phase === 'failed') phaseKo = '손절터치';
  else if (entry?.phase === 'breakout' || entry?.phase === 'settling') phaseKo = '검증중';

  const parts = [bias, phaseKo];
  if (hit > 0) parts.push(`TP${hit}✓`);
  else if (next) {
    const tpLabel = next.featureKo.replace('목표 ', '').replace('TP', 'TP');
    parts.push(`→${tpLabel}`);
  }
  return parts.join(' · ');
}

export type SettleLineSummaryRow = {
  key: string;
  labelKo: string;
  price: number | null;
  phase: MonthDeskFeatureSettlePhase;
  statusKo: string;
  bracket: string;
  color: string;
};

const SUMMARY_LINE_ORDER: { id: string; role: string; labelKo: string; color: string }[] = [
  { id: 'month-desk-plan-entry', role: 'entry', labelKo: '진입 E', color: 'rgba(250,204,21,0.96)' },
  { id: 'month-desk-typeom-entry', role: 'entry', labelKo: '타점 E', color: 'rgba(250,204,21,0.96)' },
  { id: 'trade-atlas-entry', role: 'entry', labelKo: 'Atlas E', color: 'rgba(253,224,71,0.96)' },
  { id: 'month-desk-plan-sl', role: 'sl', labelKo: '손절 SL', color: 'rgba(248,113,113,0.95)' },
  { id: 'month-desk-typeom-sl', role: 'sl', labelKo: '타점 SL', color: 'rgba(248,113,113,0.95)' },
  { id: 'trade-atlas-sl', role: 'sl', labelKo: 'Atlas SL', color: 'rgba(248,113,113,0.95)' },
  { id: 'month-desk-plan-tp1', role: 'tp1', labelKo: 'TP1', color: 'rgba(134,239,172,0.95)' },
  { id: 'trade-atlas-tp1', role: 'tp1', labelKo: 'TP1', color: 'rgba(134,239,172,0.95)' },
  { id: 'month-desk-plan-tp2', role: 'tp2', labelKo: 'TP2', color: 'rgba(125,211,252,0.92)' },
  { id: 'trade-atlas-tp2', role: 'tp2', labelKo: 'TP2', color: 'rgba(125,211,252,0.92)' },
  { id: 'month-desk-plan-tp3', role: 'tp3', labelKo: 'TP3', color: 'rgba(167,139,250,0.9)' },
  { id: 'trade-atlas-tp3', role: 'tp3', labelKo: 'TP3', color: 'rgba(167,139,250,0.9)' },
];

/** 라인요약 모드 — E/SL/TP 구조화 행 (우측 요약 카드) */
export function buildSettleLineSummaryRows(
  map: Map<string, MonthDeskFeatureSettleLabel>,
  pack: OverlayItem[],
  summaryChip: string
): SettleLineSummaryRow[] {
  const seen = new Set<string>();
  const rows: SettleLineSummaryRow[] = [];
  for (const spec of SUMMARY_LINE_ORDER) {
    if (seen.has(spec.role)) continue;
    const settle = map.get(spec.id);
    const o = pack.find((x) => x.id === spec.id);
    const price = typeof o?.price1 === 'number' && Number.isFinite(o.price1) ? o.price1 : null;
    if (!settle && price == null) continue;
    const bracket = settle
      ? resolveSettleBracketForBand(spec.id, settle, 'full', summaryChip)
      : '';
    seen.add(spec.role);
    rows.push({
      key: spec.id,
      labelKo: spec.labelKo,
      price,
      phase: settle?.phase ?? 'none',
      statusKo: settle?.statusKo ?? '—',
      bracket: bracket.replace(/^\[|\]$/g, ''),
      color: settle?.color ?? spec.color,
    });
  }
  return rows.slice(0, 6);
}

export function resolveSettleBracketForBand(
  overlayId: string,
  settle: MonthDeskFeatureSettleLabel,
  mode: 'off' | 'summary' | 'full',
  summaryChip: string
): string {
  if (mode === 'off') return '';
  if (mode === 'summary') {
    /** summary: 우측 요약 카드가 상세 — 라인 옆 칩은 핵심만 */
    if (overlayId === 'month-desk-plan-entry' && summaryChip) return `[${summaryChip}]`;
    if (overlayId === 'month-desk-typeom-entry' && summaryChip) return `[${summaryChip}]`;
    if (overlayId === 'trade-atlas-entry' && summaryChip) return `[${summaryChip}]`;
    if (
      (overlayId === 'month-desk-plan-sl' ||
        overlayId === 'month-desk-typeom-sl' ||
        overlayId === 'trade-atlas-sl') &&
      (settle.phase === 'failed' || settle.phase === 'confirmed')
    ) {
      return monthDeskSettleBracketText(settle);
    }
    if (overlayId.includes('tp') && settle.phase === 'confirmed') {
      return monthDeskSettleBracketText(settle);
    }
    return '';
  }
  return monthDeskSettleBracketText(settle);
}

/** zone·line overlayId → 마감·안착 기능 라벨 */
export function collectMonthDeskFeatureSettleLabels(
  candles: Candle[],
  pack: OverlayItem[],
  ctx?: MonthDeskFeatureSettleContext | null
): Map<string, MonthDeskFeatureSettleLabel> {
  const map = new Map<string, MonthDeskFeatureSettleLabel>();
  if (candles.length < 4) return map;

  const { closed, forming } = splitConfirmedClosedCandles(candles);
  if (closed.length < 3) return map;

  const scenario = ctx?.scenario ?? null;
  const core = ctx?.stCore ?? null;

  if (core) {
    map.set(
      'month-desk-closing-zone-lower',
      envelopeBandLabel('month-desk-closing-zone-lower', '마감존하', closed, core, 'lower')
    );
    map.set(
      'month-desk-closing-zone-upper',
      envelopeBandLabel('month-desk-closing-zone-upper', '마감존상', closed, core, 'upper')
    );
  } else if (scenario) {
    const v = scenario.lastVerdict;
    for (const [id, ko] of [
      ['month-desk-closing-zone-lower', '마감존하'],
      ['month-desk-closing-zone-upper', '마감존상'],
    ] as const) {
      map.set(
        id,
        makeLabel({
          overlayId: id,
          featureKo: ko,
          phase: 'envelope',
          statusKo: v,
          dirKo: scenario.trendLong ? '상향' : '하향',
          envelopeVerdict: v,
          tooltipLines: [scenario.summaryKo, ...scenario.bulletsKo.slice(0, 3), '참고용'],
        })
      );
    }
  }

  for (const t of LINE_TARGETS) {
    const level = priceOfOverlay(pack, t.id);
    if (level == null) continue;
    const pDir = resolveLinePrimaryDir(t.id, level, scenario, closed);
    map.set(t.id, evaluateLineOnClosed(closed, t.id, t.labelKo, level, scenario, pDir));
  }

  for (const zid of ZONE_TARGETS) {
    const zb = zoneBoundsOverlay(pack, zid);
    if (!zb) continue;
    const cap = monthDeskZoneCaptionShort(zid, '');
    map.set(zid, evaluateZoneOnClosed(closed, zid, cap, zb.top, zb.bot, scenario));
  }

  for (const o of pack) {
    const id = String(o.id || '');
    if (!id.startsWith('ob-pre-beam-zone')) continue;
    if (map.has(id)) continue;
    const p1 = Number(o.price1);
    const p2 = Number(o.price2);
    if (!Number.isFinite(p1) || !Number.isFinite(p2)) continue;
    const top = Math.max(p1, p2);
    const bot = Math.min(p1, p2);
    map.set(
      id,
      evaluateZoneOnClosed(closed, id, monthDeskZoneCaptionShort(id, String(o.label ?? ''), o.kind), top, bot, scenario)
    );
  }

  if (ctx?.settleRow) {
    attachTfToEntry(map, ctx.settleRow);
  }

  if (forming) {
    const entryId = map.has('month-desk-plan-entry')
      ? 'month-desk-plan-entry'
      : map.has('month-desk-typeom-entry')
        ? 'month-desk-typeom-entry'
        : map.has('trade-atlas-entry')
          ? 'trade-atlas-entry'
          : null;
    const entry = entryId ? map.get(entryId) : undefined;
    if (entry && entry.phase === 'none') {
      map.set(entryId!, {
        ...entry,
        statusKo: entry.statusKo.includes('마감대기') ? entry.statusKo : `${entry.statusKo} · 진행중`,
        tooltipLines: [...entry.tooltipLines, '진행 봉: 마감 후 돌파·안착 확정'],
      });
    }
  }

  return map;
}
