/**
 * 벤치마크 데스크 엔진 — 스코어·실시간 검증·원클릭 프리셋·갭 로드맵.
 * 벤치마크 데이터를 “읽기”가 아니라 “적용·검증”으로 연결.
 */

import type { AnalyzeResponse } from '@/types';
import type { UIMode, UserSettings } from '@/lib/settings';
import {
  REFERENCE_DESK_AILONGSHORT_COMPARE,
  REFERENCE_DESK_CHART_LIBRARIES,
  REFERENCE_DESK_OSS_PROJECTS,
  type ReferenceDeskFeatureCompareRow,
} from '@/lib/referenceDeskBenchmarkLibrary';

export type ReferenceDeskPanelTab =
  | 'trade'
  | 'market'
  | 'briefing'
  | 'pattern'
  | 'ref'
  | 'virtual'
  | 'learning'
  | 'candle'
  | 'etc';

export type ReferenceDeskPreset = {
  id: string;
  label: string;
  subtitle: string;
  inspiredBy: string[];
  targetMode: UIMode;
  panelTab?: ReferenceDeskPanelTab;
  settingsPatch?: Partial<UserSettings>;
  whatYouGet: string[];
  recommended?: boolean;
  /** 벤치마크 모드 유지 + LWC 차트 탭으로 포커스 */
  focusChart?: boolean;
};

export type ReferenceDeskLiveAudit = {
  rowId: string;
  area: string;
  staticLevel: ReferenceDeskFeatureCompareRow['ailongshort'];
  liveStatus: 'ok' | 'partial' | 'missing' | 'na';
  liveDetail: string;
  scorePct: number;
};

export type ReferenceDeskScorecard = {
  coveragePct: number;
  staticYes: number;
  staticPartial: number;
  staticUnique: number;
  liveOk: number;
  livePartial: number;
  liveMissing: number;
  total: number;
  headline: string;
  lwcChoice: string;
};

export type ReferenceDeskValidationReport = {
  backtestLine: string;
  patternLine: string;
  mtfLine: string;
  scenarioLine: string;
  dataFresh: boolean;
};

export type ReferenceDeskRoadmapItem = {
  id: string;
  title: string;
  gap: string;
  status: 'done' | 'in_app' | 'next';
  actionLabel: string;
  presetId?: string;
  panelTab?: ReferenceDeskPanelTab;
  targetMode?: UIMode;
};

export type PatternStatsSnapshot = {
  total: number;
  bullishCount: number;
  bearishCount: number;
  topPatternTypes: Array<{ type: string; count: number }>;
} | null;

export type BacktestSnapshot = {
  winRate: number;
  totalPnlPct: number;
  totalTrades: number;
} | null;

export const REFERENCE_DESK_PRESETS: ReferenceDeskPreset[] = [
  {
    id: 'lwc-pure',
    label: 'LWC 순수 차트',
    subtitle: '벤치마크 안에서 끝 — 캔들+볼륨+RSI, 존 0',
    inspiredBy: ['lwc', 'lwc-indicators'],
    targetMode: 'REFERENCE_DESK',
    focusChart: true,
    whatYouGet: [
      'Lightweight Charts 코어',
      'Trade Atlas 롱존·E/SL/TP1~3',
      '구조·존·패턴·MTF LWC 레이어(토글)',
      '볼륨·RVOL·Vol MA',
      'RSI 패널(토글)',
    ],
    recommended: true,
  },
  {
    id: 'lwc-whale-clean',
    label: 'LWC + 고래 레이어',
    subtitle: '경량 차트 + HotZone·핵심 S/R (존 필요할 때)',
    inspiredBy: ['lwc', 'lwc-indicators'],
    targetMode: 'WHALE',
    whatYouGet: ['고래 모드 프리셋', 'HotZone·핵심 S/R·DRS', 'LWC 위 최소 레이어'],
    recommended: true,
  },
  {
    id: 'openbb-ai-research',
    label: 'OpenBB식 리서치',
    subtitle: '데이터+브리핑+시나리오 한 화면',
    inspiredBy: ['openbb'],
    targetMode: 'AI_ZONE',
    panelTab: 'briefing',
    whatYouGet: ['AI 분석 모드', '우측 브리핑 탭', 'MTF·무효·시나리오'],
    recommended: true,
  },
  {
    id: 'freqtrade-validate',
    label: '백테스트·검증',
    subtitle: 'Freqtrade·Backtrader식 — 통계·가상매매',
    inspiredBy: ['freqtrade', 'backtrader', 'jesse'],
    targetMode: 'UNIFIED_DESK',
    panelTab: 'virtual',
    whatYouGet: ['합성 모드', '가상매매 탭', '패턴 통계·백테스트 카드'],
    recommended: true,
  },
  {
    id: 'month-desk-zones',
    label: '존·안착 (강점)',
    subtitle: 'ailongshort만의 다층 존·마감 안착',
    inspiredBy: ['lwc'],
    targetMode: 'MONTH_START_DESK',
    panelTab: 'trade',
    settingsPatch: {
      chartMonthDeskOverlayDensity: 'rich',
      chartMonthDeskClearSummaryEnabled: false,
    },
    whatYouGet: ['마감·안착 보드', 'PHZ·Trade Atlas·연합 E/SL/TP', 'zone rich 유지'],
    recommended: true,
  },
  {
    id: 'ccxt-live-data',
    label: '실시간 데이터',
    subtitle: 'CCXT·Cryptofeed 계열 — 현재 심볼·TF 분석',
    inspiredBy: ['ccxt', 'cryptofeed'],
    targetMode: 'UNIFIED_DESK',
    panelTab: 'market',
    whatYouGet: ['합성 + amx 수집', '시장 탭', '캔들·MTF 갱신'],
  },
  {
    id: 'learning-audit',
    label: '학습·로그 검증',
    subtitle: 'trade-learning·패턴 메모리',
    inspiredBy: ['tulipindicators'],
    targetMode: 'REFERENCE_DESK',
    panelTab: 'learning',
    whatYouGet: ['벤치마크 검증 리포트', '자율학습 탭', '로그 기반 — 고정 승률 없음'],
  },
  {
    id: 'unified-full',
    label: '합성 풀스택',
    subtitle: 'StockSharp·TV급 레이어 — 한 화면 최대',
    inspiredBy: ['stocksharp', 'tv-widget'],
    targetMode: 'UNIFIED_DESK',
    panelTab: 'trade',
    whatYouGet: ['통합 작도', '구조·존·시나리오·패턴', 'TV Widget 대신 자체 오버레이'],
  },
];

export const REFERENCE_DESK_ROADMAP: ReferenceDeskRoadmapItem[] = [
  {
    id: 'zones-ux',
    title: '존 간결 UX',
    gap: '존 과밀 시 간결 모드',
    status: 'done',
    actionLabel: '마감·안착 + 간결+요약',
    presetId: 'month-desk-zones',
  },
  {
    id: 'backtest-report',
    title: '검증 리포트',
    gap: '전략 단위 백테스트 리포트',
    status: 'in_app',
    actionLabel: '검증 탭 보기',
    panelTab: 'virtual',
    targetMode: 'REFERENCE_DESK',
  },
  {
    id: 'learning-dash',
    title: '학습 지표',
    gap: '로그·피드백 대시보드',
    status: 'in_app',
    actionLabel: '학습 탭',
    panelTab: 'learning',
  },
  {
    id: 'stock-data',
    title: '주식 데이터',
    gap: '주식 소스 확장',
    status: 'next',
    actionLabel: '코인 중심 — 심볼 변경 후 재검증',
    targetMode: 'UNIFIED_DESK',
  },
  {
    id: 'lwc-core',
    title: 'LWC 코어',
    gap: '차트 엔진',
    status: 'done',
    actionLabel: '경량 차트 프리셋',
    presetId: 'lwc-pure',
  },
];

function staticScore(level: ReferenceDeskFeatureCompareRow['ailongshort']): number {
  switch (level) {
    case 'yes':
      return 100;
    case 'unique':
      return 95;
    case 'partial':
      return 55;
    case 'no':
      return 0;
    default:
      return 0;
  }
}

function liveScore(status: ReferenceDeskLiveAudit['liveStatus']): number {
  switch (status) {
    case 'ok':
      return 100;
    case 'partial':
      return 55;
    case 'missing':
      return 15;
    case 'na':
      return 50;
    default:
      return 0;
  }
}

export function auditLiveFeature(
  row: ReferenceDeskFeatureCompareRow,
  ctx: {
    analysis: AnalyzeResponse | null;
    symbol: string;
    patternStats: PatternStatsSnapshot;
    backtest: BacktestSnapshot;
    settings: Pick<UserSettings, 'telegramConfirmEnabled' | 'virtualTradeEnabled'>;
  }
): ReferenceDeskLiveAudit {
  const a = ctx.analysis as Record<string, unknown> | null;
  const mtf = a?.multiTF as { htf?: string; ltf?: string; htfLabel?: string; ltfLabel?: string } | undefined;
  const candles = a?.candles as unknown[] | undefined;
  const overlays = a?.overlays as unknown[] | undefined;

  let liveStatus: ReferenceDeskLiveAudit['liveStatus'] = 'na';
  let liveDetail = '데이터 없음 — 심볼·TF 로드 후 재검증';

  switch (row.id) {
    case 'mtf':
      if (mtf?.htf && mtf?.ltf) {
        liveStatus = 'ok';
        liveDetail = `상위 ${mtf.htfLabel ?? 'HTF'}: ${mtf.htf} · 하위 ${mtf.ltfLabel ?? 'LTF'}: ${mtf.ltf}`;
      } else if (mtf?.htf || mtf?.ltf) {
        liveStatus = 'partial';
        liveDetail = 'MTF 일부만 수집됨';
      } else {
        liveStatus = 'missing';
      }
      break;
    case 'structure':
      if (a?.structureBreakoutPath || a?.smartMoneyMvpSignal || (overlays?.length ?? 0) > 0) {
        liveStatus = 'ok';
        liveDetail = '구조·SMC·오버레이 수집됨';
      } else if (ctx.analysis) {
        liveStatus = 'partial';
        liveDetail = '분석은 있으나 구조 레이어 약함 — 합성/고래 모드 권장';
      } else {
        liveStatus = 'missing';
      }
      break;
    case 'zones':
      if ((overlays?.length ?? 0) > 0 || a?.settlementZone) {
        liveStatus = 'ok';
        liveDetail = '존·안착·오버레이 활성';
      } else if (ctx.analysis) {
        liveStatus = 'partial';
        liveDetail = '마감·안착 또는 고래 모드에서 존 확인';
      } else {
        liveStatus = 'missing';
      }
      break;
    case 'scenario':
      if (a?.aiUnifiedLongShort || a?.summary || (a?.scenarios as unknown[] | undefined)?.length) {
        liveStatus = 'ok';
        liveDetail = 'AI·시나리오·요약 있음';
      } else if (ctx.analysis) {
        liveStatus = 'partial';
        liveDetail = '브리핑 탭에서 시나리오 확인';
      } else {
        liveStatus = 'missing';
      }
      break;
    case 'backtest':
      if (ctx.backtest && ctx.backtest.totalTrades > 0) {
        liveStatus = 'ok';
        liveDetail = `백테 ${ctx.backtest.totalTrades}건 · 승률 ${ctx.backtest.winRate.toFixed(1)}% (참고)`;
      } else if (ctx.patternStats && ctx.patternStats.total > 0) {
        liveStatus = 'partial';
        liveDetail = `패턴 로그 ${ctx.patternStats.total}건 — 장기 백테스트는 가상매매 탭`;
      } else {
        liveStatus = 'partial';
        liveDetail = '패턴·백테스트 데이터 적음 — 검증 탭에서 실행';
      }
      break;
    case 'realtime':
      if (Array.isArray(candles) && candles.length >= 10) {
        liveStatus = 'ok';
        liveDetail = `캔들 ${candles.length}봉 · ${ctx.symbol}`;
      } else if (Array.isArray(candles) && candles.length >= 2) {
        liveStatus = 'partial';
        liveDetail = '캔들 수집 중';
      } else {
        liveStatus = 'missing';
      }
      break;
    case 'modes':
      liveStatus = 'ok';
      liveDetail = '레일 6모드+ — 벤치마크 포함';
      break;
    case 'harmonic':
      if (a?.dominantPattern || a?.patternVisionSummary || a?.harmonicPatterns) {
        liveStatus = 'ok';
        liveDetail = '패턴·하모닉·비전 데이터 있음';
      } else if (ctx.analysis) {
        liveStatus = 'partial';
        liveDetail = '합성 모드에서 패턴 레이어 ON';
      } else {
        liveStatus = 'missing';
      }
      break;
    case 'telegram':
      liveStatus = ctx.settings.telegramConfirmEnabled ? 'ok' : 'partial';
      liveDetail = ctx.settings.telegramConfirmEnabled
        ? '텔레그램 확인 API 활성'
        : '설정에서 텔레그램 확인 OFF';
      break;
    case 'learning':
      if (ctx.patternStats && ctx.patternStats.total >= 5) {
        liveStatus = 'ok';
        liveDetail = `패턴 ${ctx.patternStats.total} · 학습 로그 축적 중`;
      } else if (ctx.patternStats?.total) {
        liveStatus = 'partial';
        liveDetail = '학습 데이터 초기 — 피드백 누적 필요';
      } else {
        liveStatus = 'partial';
        liveDetail = 'trade-learning·whale-memory — 로그 기반';
      }
      break;
    case 'stock':
      if (/USDT|BTC|ETH|USD$/i.test(ctx.symbol)) {
        liveStatus = 'partial';
        liveDetail = `${ctx.symbol} — 코인 데이터 OK · 주식 심볼은 소스별`;
      } else {
        liveStatus = 'partial';
        liveDetail = '주식/코인 심볼 — 데이터 소스 확인 필요';
      }
      break;
    case 'oss-chart':
      liveStatus = 'ok';
      liveDetail = REFERENCE_DESK_CHART_LIBRARIES.find((c) => c.id === 'lwc')?.notesKo ?? 'LWC + 오버레이';
      break;
    default:
      liveStatus = 'na';
  }

  const scorePct = Math.round(staticScore(row.ailongshort) * 0.4 + liveScore(liveStatus) * 0.6);
  return {
    rowId: row.id,
    area: row.area,
    staticLevel: row.ailongshort,
    liveStatus,
    liveDetail,
    scorePct,
  };
}

export function computeReferenceDeskAudits(ctx: {
  analysis: AnalyzeResponse | null;
  symbol: string;
  patternStats: PatternStatsSnapshot;
  backtest: BacktestSnapshot;
  settings: Pick<UserSettings, 'telegramConfirmEnabled' | 'virtualTradeEnabled'>;
}): ReferenceDeskLiveAudit[] {
  return REFERENCE_DESK_AILONGSHORT_COMPARE.map((row) => auditLiveFeature(row, ctx));
}

export function computeReferenceDeskScorecard(audits: ReferenceDeskLiveAudit[]): ReferenceDeskScorecard {
  const total = audits.length || 1;
  const coveragePct = Math.round(audits.reduce((s, a) => s + a.scorePct, 0) / total);
  const staticYes = REFERENCE_DESK_AILONGSHORT_COMPARE.filter((r) => r.ailongshort === 'yes').length;
  const staticPartial = REFERENCE_DESK_AILONGSHORT_COMPARE.filter((r) => r.ailongshort === 'partial').length;
  const staticUnique = REFERENCE_DESK_AILONGSHORT_COMPARE.filter((r) => r.ailongshort === 'unique').length;
  const liveOk = audits.filter((a) => a.liveStatus === 'ok').length;
  const livePartial = audits.filter((a) => a.liveStatus === 'partial').length;
  const liveMissing = audits.filter((a) => a.liveStatus === 'missing').length;

  let headline = '업계 대비 기능·실데이터 균형 양호';
  if (coveragePct < 45) headline = '분석 로드 후 재검증 — 현재 데이터 부족';
  else if (coveragePct < 65) headline = '일부 갭 — 아래 프리셋으로 보완';
  else if (coveragePct >= 80) headline = '벤치마크 대비 구현·실데이터 양호';

  const lwc = REFERENCE_DESK_CHART_LIBRARIES.find((c) => c.id === 'lwc');
  return {
    coveragePct,
    staticYes,
    staticPartial,
    staticUnique,
    liveOk,
    livePartial,
    liveMissing,
    total,
    headline,
    lwcChoice: lwc
      ? `${lwc.name} 채택 — ${lwc.footprint}, ailongshort 존·AI는 HTML 오버레이로 보완`
      : 'Lightweight Charts + 커스텀 오버레이',
  };
}

export function buildReferenceDeskValidationReport(ctx: {
  analysis: AnalyzeResponse | null;
  symbol: string;
  timeframe: string;
  patternStats: PatternStatsSnapshot;
  backtest: BacktestSnapshot;
}): ReferenceDeskValidationReport {
  const a = ctx.analysis as Record<string, unknown> | null;
  const mtf = a?.multiTF as { htf?: string; ltf?: string } | undefined;
  const ai = a?.aiUnifiedLongShort as { headline?: string } | undefined;

  const backtestLine =
    ctx.backtest && ctx.backtest.totalTrades > 0
      ? `백테스트 ${ctx.backtest.totalTrades}건 · 승률 ${ctx.backtest.winRate.toFixed(1)}% · PnL ${ctx.backtest.totalPnlPct >= 0 ? '+' : ''}${ctx.backtest.totalPnlPct.toFixed(2)}% (참고, 확정 수익 아님)`
      : '백테스트: 아직 거래 없음 — 가상매매·패턴 탭에서 누적';

  const patternLine =
    ctx.patternStats && ctx.patternStats.total > 0
      ? `패턴 로그 ${ctx.patternStats.total}건 (B${ctx.patternStats.bullishCount}/S${ctx.patternStats.bearishCount}) · 상위 ${ctx.patternStats.topPatternTypes.slice(0, 2).map((p) => p.type).join(', ') || '–'}`
      : '패턴 통계: 로그 적음 — 분석·피드백 후 재집계';

  const mtfLine =
    mtf?.htf && mtf?.ltf
      ? `MTF ${mtf.htf} → ${mtf.ltf} · ${ctx.symbol} ${ctx.timeframe}`
      : `MTF: ${ctx.symbol} ${ctx.timeframe} — 상위 TF 맥락은 분석 로드 후`;

  const scenarioLine = ai?.headline
    ? ai.headline.slice(0, 120)
    : (a?.summary as string)?.slice(0, 120) || '시나리오: AI·브리핑 탭';

  const candles = a?.candles as unknown[] | undefined;
  const dataFresh = Array.isArray(candles) && candles.length >= 8;

  return { backtestLine, patternLine, mtfLine, scenarioLine, dataFresh };
}

export function getPresetById(id: string): ReferenceDeskPreset | undefined {
  return REFERENCE_DESK_PRESETS.find((p) => p.id === id);
}

export function ossNamesForPreset(preset: ReferenceDeskPreset): string {
  return preset.inspiredBy
    .map((id) => REFERENCE_DESK_OSS_PROJECTS.find((o) => o.id === id)?.name ?? id)
    .join(' · ');
}

export function liveStatusLabel(s: ReferenceDeskLiveAudit['liveStatus']): string {
  switch (s) {
    case 'ok':
      return '실측 OK';
    case 'partial':
      return '부분';
    case 'missing':
      return '미수집';
    case 'na':
      return '–';
    default:
      return '–';
  }
}

export function roadmapStatusLabel(s: ReferenceDeskRoadmapItem['status']): string {
  switch (s) {
    case 'done':
      return '반영됨';
    case 'in_app':
      return '앱 내 사용';
    case 'next':
      return '다음';
    default:
      return '–';
  }
}
