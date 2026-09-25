/**
 * 독수리1호 AI HUD — 1000060795.png layout. Numbers from analyze engines only.
 */
'use client';

import { useMemo, useRef, useState, createContext, useContext, type ReactNode } from 'react';
import type { AnalyzeResponse } from '@/types';
import type { Eagle1MainPlan } from '@/lib/eagle1/signalEngine';
import { eagle1DecisionKo, formatPriceCompact } from '@/lib/eagle1/chartUx';
import { formatSamplePct } from '@/lib/eagle1/noFakeNumbers';
import { formatReactionTime } from '@/lib/eagle1/historicalStatisticsEngine';
import { formatEagle1SnapshotClock } from '@/lib/eagle1/predictionSnapshot';
import { EAGLE1_ENGINE_VERSION } from '@/lib/eagle1/rawTypes';
import { HUD_TRADE_RAIL, HUD_BREAK_RAIL } from '@/lib/eagle1/hudPack';
import { overlayFromEagle1ZoneId } from '@/lib/eagle1/zoneOverlays';
import { heatBarPaintSafe } from '@/lib/eagle1/heatUnderlayPolicy';
import { eagle1LabelTitleAttr } from '@/lib/eagle1/labelLexicon';
import {
  buildLabelInteractionHandlers,
  labelInteractionPayload,
  LABEL_LONG_PRESS_MS,
} from '@/lib/eagle1/labelInteraction';
import { buildEagle1ChartAlerts, buildEagle1LiveBriefing } from '@/lib/eagle1/chartAlertCallouts';
import {
  buildEagle1HudSynthesis,
  eagle1EventExplainKo,
  formatEagle1EventKo,
  resolveHudFundingLabel,
  resolveHudOrderFlowSummary,
  resolveHudPathProbabilityText,
  resolveHudProfileLevelsSummary,
  resolveHudSqueezeLane,
  resolveHudTotalScore,
  resolveHudVolumeFlow,
} from '@/lib/eagle1/hudSynthesis';
import { TIMEFRAMES, normalizeChartTimeframe } from '@/lib/constants';
import {
  persistHudLangKo,
  readHudLangKo,
  resolveHudLabel,
  resolveHudSqueezeStep,
  resolveHudToken,
  resolveHudTradeRailStep,
  resolveHudViewMode,
} from '@/lib/eagle1/hudLabelsKo';
import {
  resolveHudBigMoveUi,
  resolveHudClockFlowKo,
  resolveHudConfirmBadge,
  resolveHudEntryQualityUi,
  resolveHudExecutionLevelsFallback,
  resolveHudFlowSyncKo,
  resolveHudHtfHistoryRows,
  resolveHudLiquidityDefenseKo,
  resolveHudLiveMarkIndex,
  resolveHudMarketStateKo,
  resolveHudMicroMetric,
  resolveHudPositionSizeText,
  resolveHudReEntryKo,
  resolveHudScoreCalibrationFallback,
  resolveHudStrategyFusionKo,
  resolveHudSummaryText,
  resolveHudTradeOpportunity,
  resolveHudWalkForwardKo,
  resolveHudZoneLevels,
} from '@/lib/eagle1/hudCardFallbacks';
import { buildHudWireBundle } from '@/lib/eagle1/hudWireBundle';
import type { Eagle1AiZonePack } from '@/lib/eagle1/aiZonePack';
import type { Eagle1CanonicalTradeDisplay } from '@/lib/eagle1/canonicalTradeDisplay';
import type { Eagle1CanonicalTradeDisplayFrozen } from '@/lib/mergedDeskFrozenTradePlan';
import { AI_SUPER_BIANSHEN_STATS } from '@/lib/eagle1/aiSuperBianShenStats';
import Eagle1AiZoneSideRail from './Eagle1AiZoneSideRail';
import styles from './Eagle1AiHud.module.css';

type Props = {
  analysis: AnalyzeResponse | null;
  selectedZoneId?: string | null;
  symbol?: string;
  timeframe?: string;
  onTimeframeChange?: (tf: string) => void;
  children: ReactNode;
  evidence?: ReactNode;
  /** AI ZONE v2 — 우측 rail을 squeeze 대신 confluence 패널로 */
  aiZoneOn?: boolean;
  aiZonePack?: Eagle1AiZonePack | null;
  /** 超强统计 단일 타점 — 상단·실전 rail 동일 소스 */
  canonicalTrade?: Eagle1CanonicalTradeDisplay | Eagle1CanonicalTradeDisplayFrozen | null;
};

type ViewMode = 'live' | 'research' | 'all';

const VIEW_KEY = 'eagle1-hud-view-v3';
const LIVE_BRIEFING_HIDDEN_KEY = 'eagle1-live-briefing-hidden';
/** 접속 시 차트 외 HUD 상세 기본 접기 — 기능 삭제 아님 */
const CHROME_OPEN_KEY = 'eagle1-hud-chrome-open-v1';

function readLiveBriefingHidden(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(LIVE_BRIEFING_HIDDEN_KEY) === '1';
  } catch {
    return false;
  }
}

function readChromeOpen(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const v = window.localStorage.getItem(CHROME_OPEN_KEY);
    if (v === '1') return true;
    if (v === '0') return false;
  } catch {
    /* ignore */
  }
  /** 기본: 접힘(차트 우선 · 가속) */
  return false;
}

const AVAIL_CHIPS: Array<{ key: keyof NonNullable<AnalyzeResponse['eagle1Availability']>; label: string }> = [
  { key: 'has_orderbook', label: '호가' },
  { key: 'has_cvd', label: 'CVD' },
  { key: 'has_trades', label: '체결' },
  { key: 'has_oi', label: 'OI' },
  { key: 'has_funding', label: '펀딩' },
  { key: 'has_liquidation', label: '청산시리즈' },
  { key: 'has_mark', label: '마크' },
  { key: 'has_index', label: '지수' },
];

function readView(): ViewMode {
  if (typeof window === 'undefined') return 'live';
  const v = window.localStorage.getItem(VIEW_KEY);
  if (v === 'research') return 'research';
  if (v === 'all') return 'all';
  return 'live';
}

const SQUEEZE_TRIGGER_STEPS = ['WATCH', 'BUILDUP', 'READY', 'ACTIVE', 'CASCADE'] as const;

function squeezeTriggerIndex(state: string | undefined): number {
  const s = String(state || '');
  if (s === 'CASCADE') return 4;
  if (s === 'SQUEEZE_ACTIVE') return 3;
  if (s === 'TRIGGER_READY') return 2;
  if (s === 'BUILDUP') return 1;
  if (s === 'WATCH') return 0;
  return -1;
}

function railIndex(state: string | undefined): number {
  const s = String(state || '');
  if (s === 'ACCEPTED' || s === 'HOLD') return 4;
  if (s === 'RETEST' || s === 'RETEST_PENDING') return 3;
  if (s === 'CLOSE_CONFIRM') return 2;
  if (s === 'BREAK' || s === 'BODY_BREAK' || s === 'WICK_BREAK' || s === 'WICK') return 1;
  if (s === 'APPROACH' || s === 'TOUCH') return 0;
  return -1;
}

const HudLangContext = createContext(false);

function useHudLangKo(): boolean {
  return useContext(HudLangContext);
}

function HudKicker({ label, children }: { label: string; children?: ReactNode }) {
  const langKo = useHudLangKo();
  return (
    <div className={styles.kicker}>
      {resolveHudLabel(label, langKo)}
      {children}
    </div>
  );
}

function ExplainKicker({
  label,
  children,
  onExplain,
}: {
  label: string;
  children?: ReactNode;
  onExplain: (detail: string) => void;
}) {
  const langKo = useHudLangKo();
  const display = resolveHudLabel(label, langKo);
  const tip = buildLabelInteractionHandlers(label, onExplain).onHoverTitle || eagle1LabelTitleAttr(label);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearPress = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };
  const activate = (kind: 'click' | 'dblclick' | 'longpress' | 'contextmenu' | 'keyboard') => {
    onExplain(labelInteractionPayload(label, kind).textKo);
  };
  return (
    <div
      className={styles.kicker}
      title={tip}
      role="button"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        activate('click');
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        activate('dblclick');
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          activate('keyboard');
        }
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        activate('contextmenu');
      }}
      onTouchStart={() => {
        clearPress();
        pressTimer.current = setTimeout(() => activate('longpress'), LABEL_LONG_PRESS_MS);
      }}
      onTouchEnd={clearPress}
      onTouchCancel={clearPress}
    >
      {display}
      {children}
    </div>
  );
}

function SemiGauge({ score, label }: { score: number | null; label: string }) {
  const v = score == null ? 0 : Math.max(0, Math.min(100, score));
  const ang = Math.PI * (1 - v / 100);
  const x = 50 + Math.cos(ang) * 38;
  const y = 52 - Math.sin(ang) * 38;
  return (
    <svg className={styles.semiGauge} viewBox="0 0 100 62" aria-hidden>
      <path d="M12 52 A38 38 0 0 1 88 52" fill="none" stroke="#1e293b" strokeWidth="8" strokeLinecap="round" />
      <path
        d="M12 52 A38 38 0 0 1 88 52"
        fill="none"
        stroke="url(#e1gm)"
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={`${(v / 100) * 119} 119`}
      />
      <defs>
        <linearGradient id="e1gm" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#22c55e" />
          <stop offset="55%" stopColor="#eab308" />
          <stop offset="100%" stopColor="#ef4444" />
        </linearGradient>
      </defs>
      <circle cx={x} cy={y} r="4.2" fill="#f8fafc" />
      <text x="50" y="48" textAnchor="middle" fill="#e2e8f0" fontSize="16" fontWeight="800">
        {score == null ? '—' : `${Math.round(score)}%`}
      </text>
      <text x="50" y="60" textAnchor="middle" fill="#94a3b8" fontSize="7">
        {label}
      </text>
    </svg>
  );
}

function RingGauge({ score, sub }: { score: number | null; sub: string }) {
  const v = score == null ? 0 : Math.max(0, Math.min(100, score));
  const dash = 2 * Math.PI * 16;
  return (
    <div className={styles.ringWrap}>
      <svg viewBox="0 0 44 44" className={styles.ring}>
        <circle cx="22" cy="22" r="16" fill="none" stroke="#1e293b" strokeWidth="5" />
        <circle
          cx="22"
          cy="22"
          r="16"
          fill="none"
          stroke="#22c55e"
          strokeWidth="5"
          strokeDasharray={`${(v / 100) * dash} ${dash}`}
          strokeLinecap="round"
          transform="rotate(-90 22 22)"
        />
        <text x="22" y="25" textAnchor="middle" fill="#e2e8f0" fontSize="9" fontWeight="800">
          {score == null ? '—' : `${Math.round(score)}`}
        </text>
      </svg>
      <span>{sub}</span>
    </div>
  );
}

function MiniOhlc({ candles }: { candles: Array<{ open: number; high: number; low: number; close: number }> }) {
  if (!candles.length) return <div className={styles.muted}>데이터 없음</div>;
  const hi = Math.max(...candles.map((c) => c.high));
  const lo = Math.min(...candles.map((c) => c.low));
  const span = Math.max(hi - lo, 1e-9);
  const w = 132;
  const h = 44;
  const slot = (w - 4) / candles.length;
  const bw = Math.max(1.6, slot - 1.2);
  const y = (p: number) => 2 + ((hi - p) / span) * (h - 4);
  return (
    <svg className={styles.miniOhlc} viewBox={`0 0 ${w} ${h}`} aria-hidden>
      {candles.map((c, i) => {
        const x = 2 + i * slot;
        const up = c.close >= c.open;
        const color = up ? '#22c55e' : '#ef4444';
        const top = Math.min(y(c.open), y(c.close));
        const body = Math.max(1, Math.abs(y(c.close) - y(c.open)));
        return (
          <g key={i} stroke={color} fill={color}>
            <line x1={x + bw / 2} x2={x + bw / 2} y1={y(c.high)} y2={y(c.low)} strokeWidth="1" />
            <rect x={x} y={top} width={bw} height={body} />
          </g>
        );
      })}
    </svg>
  );
}

export default function Eagle1AiHud({
  analysis,
  selectedZoneId = null,
  symbol = 'BTCUSDT',
  timeframe = '15m',
  onTimeframeChange,
  children,
  evidence,
  aiZoneOn = false,
  aiZonePack = null,
  canonicalTrade = null,
}: Props) {
  const [view, setView] = useState<ViewMode>(readView);
  const [langKo, setLangKo] = useState(readHudLangKo);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [explainKo, setExplainKo] = useState<string | null>(null);
  const [dismissedAlerts, setDismissedAlerts] = useState<string[]>([]);
  const [liveBriefingHidden, setLiveBriefingHidden] = useState(readLiveBriefingHidden);
  const [chromeOpen, setChromeOpen] = useState(readChromeOpen);
  const [selectedEvent, setSelectedEvent] = useState<{
    kind: string;
    labelKo: string;
    explain: string;
  } | null>(null);
  const hud = analysis?.eagle1Hud ?? null;
  const acc = analysis?.eagle1Acceptance ?? null;
  const plan = analysis?.eagle1MainPlan ?? null;
  const path = analysis?.eagle1SmartPath ?? plan?.smartPath ?? null;
  const fb = analysis?.eagle1FalseBreak ?? null;
  const hist = analysis?.eagle1HistoricalOutcome ?? null;
  const prem = analysis?.eagle1PremiumDiscount ?? null;
  const zones = analysis?.eagle1UnifiedZones ?? null;
  const sample = plan?.sampleSize ?? hist?.totalSample ?? 0;
  const inspect = useMemo(() => {
    const id = String(selectedZoneId || '');
    if (!id.startsWith('eagle1-') || !analysis?.eagle1Zones) return null;
    return overlayFromEagle1ZoneId({
      id,
      lastTime: Date.now(),
      mode: analysis.eagle1ChartUx?.mode ?? 'practical',
      pack: {
        zones: analysis.eagle1Zones.zones,
        clusters: analysis.eagle1Zones.clusters,
        recommended: analysis.eagle1Zones.recommended,
        displaySupport: analysis.eagle1Zones.displaySupport,
        displayResist: analysis.eagle1Zones.displayResist,
        pocState: analysis.eagle1Zones.profile?.pocState,
        reaction: analysis.eagle1Zones.reaction,
      },
    });
  }, [selectedZoneId, analysis]);

  const setViewPersist = (m: ViewMode) => {
    setView(m);
    try {
      window.localStorage.setItem(VIEW_KEY, m);
    } catch {
      /* ignore */
    }
  };

  const toggleChromeOpen = () => {
    setChromeOpen((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(CHROME_OPEN_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const showLive = view === 'live' || view === 'research' || view === 'all';
  const showResearch = view === 'research' || view === 'all';
  const railAt = railIndex(hud?.breakRail.current);
  const tfs = TIMEFRAMES.filter((tf) => tf !== '1Y');
  const posPct = prem?.position != null ? Math.max(0, Math.min(100, prem.position * 100)) : null;
  const dir =
    canonicalTrade?.direction === 'LONG' || canonicalTrade?.direction === 'SHORT'
      ? canonicalTrade.direction
      : plan?.direction;
  const decisionKo =
    canonicalTrade?.direction === 'LONG' || canonicalTrade?.direction === 'SHORT'
      ? canonicalTrade.directionKo
      : plan
        ? eagle1DecisionKo(plan.status)
        : '대기';
  const decisionTone =
    dir === 'LONG'
      ? 'long'
      : dir === 'SHORT'
        ? 'short'
        : plan?.status === 'CONFIRMED_LONG' || plan?.status === 'LONG_WATCH'
          ? 'long'
          : plan?.status === 'CONFIRMED_SHORT' || plan?.status === 'SHORT_WATCH'
            ? 'short'
            : 'wait';
  const spark = analysis?.eagle1SparkCandles ?? [];
  const px = analysis?.currentPrice ?? spark[spark.length - 1]?.close ?? null;
  const liveBriefing = useMemo(
    () =>
      buildEagle1LiveBriefing({
        analysis,
        hud,
        canonical: canonicalTrade,
        lastClose: px,
      }),
    [analysis, hud, canonicalTrade, px]
  );
  const chartAlerts = useMemo(
    () =>
      buildEagle1ChartAlerts({
        squeeze: hud?.squeezeRadar ?? null,
        falseBreak: analysis?.eagle1FalseBreak ?? null,
        hud: hud
          ? {
              breakRail: hud.breakRail,
              bigLong: hud.bigLong,
              cascadeShort: hud.cascadeShort,
              events: hud.events,
              candleEvidence: hud.candleEvidence,
            }
          : null,
        lastClose: px,
        symbol,
        analysis,
        canonical: canonicalTrade,
      }).filter((a) => a.id !== 'fake-break' && a.id !== 'retest-fail'),
    [hud, analysis, analysis?.eagle1FalseBreak, px, symbol, canonicalTrade]
  );
  const visibleAlerts = useMemo(
    () => chartAlerts.filter((a) => !dismissedAlerts.includes(a.id)),
    [chartAlerts, dismissedAlerts]
  );
  const dismissLiveBriefing = () => {
    setLiveBriefingHidden(true);
    try {
      window.localStorage.setItem(LIVE_BRIEFING_HIDDEN_KEY, '1');
    } catch {
      /* ignore */
    }
  };
  const showLiveBriefing = () => {
    setLiveBriefingHidden(false);
    try {
      window.localStorage.removeItem(LIVE_BRIEFING_HIDDEN_KEY);
    } catch {
      /* ignore */
    }
  };
  const dismissAllAlerts = () => {
    setDismissedAlerts(chartAlerts.map((a) => a.id));
  };
  const synthesis = useMemo(() => buildEagle1HudSynthesis(analysis), [analysis]);
  const orderFlowSummary = useMemo(
    () => resolveHudOrderFlowSummary(analysis, hud),
    [analysis, hud]
  );
  const volumeFlowUi = useMemo(() => resolveHudVolumeFlow(hud, analysis), [hud, analysis]);
  const totalScore = useMemo(() => resolveHudTotalScore(hud), [hud]);
  const squeezeLong = useMemo(() => resolveHudSqueezeLane(hud, analysis, 'long'), [hud, analysis]);
  const squeezeShort = useMemo(() => resolveHudSqueezeLane(hud, analysis, 'short'), [hud, analysis]);
  const pathProbUi = useMemo(
    () =>
      resolveHudPathProbabilityText(hud, analysis, canonicalTrade?.superStats ?? null),
    [hud, analysis, canonicalTrade]
  );
  const profileUi = useMemo(() => resolveHudProfileLevelsSummary(hud, analysis), [hud, analysis]);
  const fundingLabel = useMemo(() => resolveHudFundingLabel(analysis), [analysis]);
  const aiScore =
    hud?.scoreCalibration?.aiScore ??
    (typeof analysis?.longScore === 'number' ? Math.round((analysis.longScore + (analysis.shortScore ?? analysis.longScore)) / 2) : null);
  const calibratedText =
    hud?.scoreCalibration?.calibratedText ??
    formatSamplePct(plan?.sampleSize ?? sample, plan?.calibratedProbability ?? null);
  const longBias = Math.max(
    0,
    Math.min(100, Number(canonicalTrade?.superStats.longPct ?? analysis?.longScore) || 50)
  );
  const shortBias = Math.max(
    0,
    Math.min(100, Number(canonicalTrade?.superStats.shortPct ?? analysis?.shortScore) || 50)
  );
  const heroVerdict =
    canonicalTrade?.direction === 'LONG' || canonicalTrade?.direction === 'SHORT'
      ? canonicalTrade.direction
      : synthesis?.verdict ?? (dir === 'LONG' || dir === 'SHORT' ? dir : 'WAIT');
  const heroVerdictKo =
    canonicalTrade?.directionKo ??
    (heroVerdict === 'LONG' ? '롱' : heroVerdict === 'SHORT' ? '숏' : '대기');
  const decisionToneCanon =
    heroVerdict === 'LONG' ? 'long' : heroVerdict === 'SHORT' ? 'short' : 'wait';
  const canonEntryText =
    canonicalTrade?.entry != null && canonicalTrade.entry > 0
      ? canonicalTrade.entryHigh != null &&
        canonicalTrade.entryHigh > 0 &&
        Math.abs(canonicalTrade.entryHigh - canonicalTrade.entry) > 1
        ? `${formatPriceCompact(canonicalTrade.entry)} – ${formatPriceCompact(canonicalTrade.entryHigh)}`
        : formatPriceCompact(canonicalTrade.entry)
      : null;
  const toggleLangKo = () => {
    setLangKo((v) => {
      const next = !v;
      persistHudLangKo(next);
      return next;
    });
  };
  const confirm = useMemo(
    () => resolveHudConfirmBadge(analysis, plan as Eagle1MainPlan | null),
    [analysis, plan]
  );
  const zoneLevels = useMemo(() => resolveHudZoneLevels(analysis), [analysis]);
  const tradeOpp = useMemo(
    () => resolveHudTradeOpportunity(hud, analysis, plan as Eagle1MainPlan | null),
    [hud, analysis, plan]
  );
  const posSize = useMemo(
    () => resolveHudPositionSizeText(hud, plan as Eagle1MainPlan | null),
    [hud, plan]
  );
  const bigMoveUi = useMemo(() => resolveHudBigMoveUi(hud, analysis), [hud, analysis]);
  const entryQ = useMemo(
    () =>
      resolveHudEntryQualityUi(hud, plan as Eagle1MainPlan | null, canonicalTrade?.superStats ?? null),
    [hud, plan, canonicalTrade]
  );
  const execLv = useMemo(
    () => resolveHudExecutionLevelsFallback(hud, plan as Eagle1MainPlan | null),
    [hud, plan]
  );
  const scoreFb = useMemo(
    () => resolveHudScoreCalibrationFallback(hud, analysis, plan as Eagle1MainPlan | null),
    [hud, analysis, plan]
  );
  const liveQuotes = useMemo(() => resolveHudLiveMarkIndex(analysis, px), [analysis, px]);
  const hudSummary = useMemo(
    () => resolveHudSummaryText(hud, analysis, plan as Eagle1MainPlan | null, confirm),
    [hud, analysis, plan, confirm]
  );
  const wire = useMemo(
    () =>
      buildHudWireBundle({
        analysis,
        hud,
        plan: plan as Eagle1MainPlan | null,
        timeframe: timeframe ?? '4H',
        hist,
        prem,
        px,
        canonicalTrade,
      }),
    [analysis, hud, plan, timeframe, hist, prem, px, canonicalTrade]
  );
  const posPctResolved = wire.premiumDiscountPct ?? posPct;

  return (
    <HudLangContext.Provider value={langKo}>
    <section
      className={styles.hud}
      data-eagle1-desk="structure"
      data-eagle1-hud="1"
      data-ai-zone-on={aiZoneOn ? '1' : '0'}
      data-hud-lang={langKo ? 'ko' : 'en'}
      data-tone={hud?.marketState.tone ?? 'wait'}
      data-chrome-open={chromeOpen ? '1' : '0'}
    >
      <header className={styles.topbar} data-eagle1-region="header">
        <div>
          <h1 className={styles.title}>
            독수리 1호{' '}
            <span className={styles.titleEn}>
              {langKo ? 'AI 선물 시스템' : 'AI FUTURES SYSTEM'}
            </span>
            <span className={styles.liveBadge} data-on="1">
              LIVE
            </span>
          </h1>
          <div className={styles.sub}>
            BITGET {symbol} PERP
            {px != null ? (
              <>
                {' · '}
                <strong className={styles.priceHero}>{formatPriceCompact(px)}</strong>
              </>
            ) : null}
            {' · '}
            {timeframe} · {EAGLE1_ENGINE_VERSION}
          </div>
          <ul className={styles.avail} aria-label="데이터 가용성">
            {AVAIL_CHIPS.map((chip) => {
              const on = Boolean(analysis?.eagle1Availability?.[chip.key]);
              return (
                <li key={chip.key} data-on={on ? '1' : '0'} title={on ? chip.label : `${chip.label} · 데이터 없음`}>
                  {chip.label}
                </li>
              );
            })}
          </ul>
        </div>
        <div className={styles.tfRow} aria-label="타임프레임">
          {tfs.map((tf) => {
            const on = String(timeframe).toLowerCase() === tf.toLowerCase();
            return (
              <button
                key={tf}
                type="button"
                data-on={on ? '1' : '0'}
                disabled={!onTimeframeChange}
                title={`${tf} 캔들 전환 · 봉 개수는 기존 설정 유지`}
                onClick={() => {
                  if (!onTimeframeChange) return;
                  const next = normalizeChartTimeframe(tf) || tf;
                  if (String(timeframe).toLowerCase() === String(next).toLowerCase()) return;
                  onTimeframeChange(next);
                }}
              >
                {tf}
              </button>
            );
          })}
        </div>
        <div className={styles.viewSwitch} aria-label="표시 모드">
          <button
            type="button"
            className={styles.langChip}
            data-on={chromeOpen ? '1' : '0'}
            title={
              chromeOpen
                ? '게이지·통계·플랜 등 상세 접기 (차트만 · 가속)'
                : '게이지·통계·플랜 등 상세 펴기 (삭제 아님)'
            }
            onClick={toggleChromeOpen}
            style={{
              fontWeight: 900,
              borderColor: chromeOpen ? 'rgba(56,189,248,0.65)' : 'rgba(250,204,21,0.55)',
              color: chromeOpen ? '#bae6fd' : '#fde047',
            }}
          >
            {chromeOpen ? '상세접기' : '상세펴기'}
          </button>
          <button
            type="button"
            className={styles.langChip}
            data-on={langKo ? '1' : '0'}
            title={langKo ? '카드 영문 표시' : '카드 전체 한글 표시'}
            onClick={toggleLangKo}
          >
            {langKo ? '한글 ON' : '한글'}
          </button>
          {(
            [
              ['live', 'PRACTICAL'],
              ['research', 'RESEARCH'],
              ['all', 'ALL'],
            ] as const
          ).map(([id, lab]) => (
            <button key={id} type="button" data-on={view === id ? '1' : '0'} onClick={() => setViewPersist(id)}>
              {resolveHudViewMode(lab, langKo)}
            </button>
          ))}
        </div>
      </header>

      <section
        className={styles.signalHero}
        data-eagle1-region="signal-hero"
        data-tone={canonicalTrade ? decisionToneCanon : decisionTone}
        data-verdict={heroVerdict}
      >
        <div className={styles.signalHeroVerdict}>
          <div
            className={styles.signalConfirm}
            data-tone={
              canonicalTrade
                ? heroVerdict === 'LONG'
                  ? 'long'
                  : heroVerdict === 'SHORT'
                    ? 'short'
                    : 'wait'
                : confirm.tone
            }
            data-locked={canonicalTrade ? (canonicalTrade.entryAllowed ? '0' : '1') : confirm.slLocked ? '1' : '0'}
          >
            <strong>
              {canonicalTrade
                ? heroVerdict === 'LONG'
                  ? '롱 우선'
                  : heroVerdict === 'SHORT'
                    ? '숏 우선'
                    : '대기'
                : confirm.badgeKo}
            </strong>
            <span>
              {canonicalTrade
                ? `${canonicalTrade.sourceKo} · ${canonicalTrade.entryAllowed ? '타점가능' : '대기·잠금'}`
                : confirm.subKo}
            </span>
            {canonicalTrade?.stopLoss != null && canonicalTrade.stopLoss > 0 ? (
              <em>
                {resolveHudLabel('STOP', langKo)} {formatPriceCompact(canonicalTrade.stopLoss)}
              </em>
            ) : confirm.slLocked ? (
              <em>
                {resolveHudLabel('STOP', langKo)} {confirm.slText}
              </em>
            ) : null}
          </div>
          <RingGauge
            score={heroVerdict === 'LONG' ? longBias : heroVerdict === 'SHORT' ? shortBias : aiScore}
            sub={langKo ? heroVerdictKo : heroVerdict}
          />
          <strong className={styles.signalHeroDir} data-dir={heroVerdict}>
            {langKo ? heroVerdictKo : heroVerdict}
          </strong>
          <span className={styles.signalHeroStatus}>
            {canonicalTrade ? canonicalTrade.directionKo : decisionKo}
          </span>
          <div className={styles.signalHeroBiasTrack} aria-label="롱·숏 우세">
            <i className={styles.signalHeroBiasLong} style={{ width: `${longBias}%` }} />
            <i className={styles.signalHeroBiasShort} style={{ width: `${shortBias}%` }} />
          </div>
          <div className={styles.signalHeroBiasLegend}>
            <span data-side="long">{langKo ? '롱' : 'LONG'} {Math.round(longBias)}</span>
            <span data-side="short">{langKo ? '숏' : 'SHORT'} {Math.round(shortBias)}</span>
          </div>
        </div>
        <table className={styles.signalHeroTable}>
          <thead>
            <tr>
              <th>{resolveHudLabel('ENTRY', langKo)}</th>
              <th>{resolveHudLabel('STOP', langKo)}</th>
              <th>{resolveHudLabel('TP1', langKo)}</th>
              <th>{resolveHudLabel('TP2', langKo)}</th>
              <th>{resolveHudLabel('TP3', langKo)}</th>
              <th>{resolveHudLabel('RR', langKo)}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td data-kind="entry">{canonEntryText ?? wire.planEntry}</td>
              <td data-kind="stop">
                {formatPriceCompact(canonicalTrade?.stopLoss ?? plan?.sl ?? null)}
              </td>
              <td data-kind="tp">
                {formatPriceCompact(canonicalTrade?.tp1 ?? plan?.tp1 ?? null)}
              </td>
              <td data-kind="tp">
                {formatPriceCompact(canonicalTrade?.tp2 ?? plan?.tp2 ?? null)}
              </td>
              <td data-kind="tp">
                {formatPriceCompact(canonicalTrade?.tp3 ?? plan?.tp3 ?? null)}
              </td>
              <td data-kind="rr">
                {plan?.netRr != null && !canonicalTrade
                  ? `1:${plan.netRr.toFixed(2)}`
                  : canonicalTrade?.entry &&
                      canonicalTrade.stopLoss &&
                      canonicalTrade.tp1
                    ? '—'
                    : plan?.netRr != null
                      ? `1:${plan.netRr.toFixed(2)}`
                      : '—'}
              </td>
            </tr>
          </tbody>
        </table>
        <p className={styles.signalHeroNote}>
          {canonicalTrade
            ? `AI超级变身统计 단일 판정 · ${canonicalTrade.noteKo} · 확정 수익 아님`
            : synthesis?.aiLine ?? (langKo ? '조건부 시그널 · 확정 수익 아님' : 'Conditional signal · not guaranteed')}
        </p>
      </section>

      {canonicalTrade?.superStats ? (
        <div
          className={styles.superStatsHost}
          data-eagle1-region="super-stats"
          data-verdict={canonicalTrade.superStats.verdict}
          title={canonicalTrade.superStats.headlineKo}
        >
          <span className={styles.superStatsTag}>AI超级变身</span>
          <strong style={{ color: canonicalTrade.superStats.color }}>
            {canonicalTrade.superStats.verdictKo}
          </strong>
          <span>
            롱 {canonicalTrade.superStats.longPct}% · 숏 {canonicalTrade.superStats.shortPct}%
          </span>
          <span>
            E {formatPriceCompact(canonicalTrade.superStats.entry)} · SL{' '}
            {formatPriceCompact(canonicalTrade.superStats.stopLoss)} · TP1{' '}
            {formatPriceCompact(canonicalTrade.superStats.tp1)}
          </span>
          <span className={styles.superStatsNote}>상단·우측 실전 = 동일 1세트 · 확정수익 아님</span>
        </div>
      ) : null}

      {synthesis ? (
        <div className={styles.aiSynthCompact} data-tone={synthesis.verdict.toLowerCase()} data-eagle1-region="ai-synth">
          {(['scalp', 'mid', 'swing'] as const).map((k) => (
            <div key={k} title={synthesis.horizons[k].note}>
              <span>{synthesis.horizons[k].label}</span>
              <b>{synthesis.horizons[k].biasKo}</b>
            </div>
          ))}
        </div>
      ) : null}

      <div className={styles.aiStatsRail} data-eagle1-region="ai-stats" data-tone={wire.heroVerdict.toLowerCase()}>
        <div>
          <span>{aiZoneOn ? (langKo ? 'AI Setup' : 'AI Setup') : langKo ? 'AI 점수' : 'AI score'}</span>
          <b>{aiZoneOn ? (aiZonePack?.setupScore ?? '—') : wire.aiScore ?? '—'}</b>
        </div>
        <div>
          <span>{aiZoneOn ? (langKo ? 'hold' : 'hold') : langKo ? '검증·표본' : 'Calibrated'}</span>
          <b>
            {aiZoneOn
              ? aiZonePack?.activeSupport?.holdPct != null
                ? `${aiZonePack.activeSupport.holdPct}%`
                : '—'
              : wire.calibratedText}
          </b>
        </div>
        <div>
          <span>n=</span>
          <b>{aiZoneOn ? (aiZonePack?.sampleN ?? 0) : wire.sampleSize}</b>
        </div>
        <div data-side="long">
          <span>{langKo ? '롱' : 'LONG'}</span>
          <b>
            {canonicalTrade
              ? Math.round(canonicalTrade.superStats.longPct)
              : aiZoneOn
                ? (aiZonePack?.longPct ?? '—')
                : Math.round(wire.longBias)}
          </b>
        </div>
        <div data-side="short">
          <span>{langKo ? '숏' : 'SHORT'}</span>
          <b>
            {canonicalTrade
              ? Math.round(canonicalTrade.superStats.shortPct)
              : aiZoneOn
                ? (aiZonePack?.shortPct ?? '—')
                : Math.round(wire.shortBias)}
          </b>
        </div>
        <div>
          <span>{langKo ? '판정' : 'Verdict'}</span>
          <b>
            {langKo
              ? heroVerdict === 'LONG'
                ? '롱'
                : heroVerdict === 'SHORT'
                  ? '숏'
                  : '대기'
              : heroVerdict}
          </b>
        </div>
      </div>

      {showLive ? (
        <div className={styles.schematicLiveStrip} data-eagle1-region="schematic-live" title={wire.schematic.note}>
          <span className={styles.schematicLiveTag}>도식 비교</span>
          <strong>{wire.schematic.referenceKo}</strong>
          <span>현재 {wire.schematic.currentKo}</span>
          <ul className={styles.schematicLiveFeat}>
            {wire.schematic.features.slice(0, 4).map((f) => (
              <li key={f.id} data-hit={f.hit == null ? 'na' : f.hit ? '1' : '0'}>
                {f.labelKo}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className={styles.stageBlock}>
      {showLive && !aiZoneOn && (
        <div className={styles.gauges} data-eagle1-region="gauges">
          <article className={styles.panel}>
            <ExplainKicker label="BIG MOVE METER" onExplain={setExplainKo} />
            <SemiGauge
              score={bigMoveUi.score}
              label={
                bigMoveUi.labelKo
              }
            />
            <div className={styles.hint}>{hud?.bigMove?.note ?? '큰 움직임·압축 근사'}</div>
          </article>
          <article className={styles.panel}>
            <ExplainKicker label="MTF COMPASS" onExplain={setExplainKo} />
            <div className={styles.compass}>
              {(wire.mtfCompass).map(
                (row) => (
                  <div key={row.tf} data-bias={row.bias} title={row.note}>
                    <b>{row.tf}</b>
                    <strong>{row.arrow}</strong>
                  </div>
                )
              )}
            </div>
            {wire.compassConflict ? <div className={styles.conflict}>{wire.compassConflict}</div> : null}
          </article>
          <article className={`${styles.panel} ${styles.railPanel}`}>
            <ExplainKicker label="BREAK RAIL" onExplain={setExplainKo}>
              <span>{hud?.breakRail.targetEn ?? 'STRUCTURE ACCEPTANCE'}</span>
            </ExplainKicker>
            <ol className={styles.breakRail}>
              {(hud?.breakRail.steps ?? HUD_BREAK_RAIL).map((lab, i) => (
                <li key={lab} data-on={railAt === i ? '1' : railAt > i ? 'done' : '0'}>
                  {lab}
                </li>
              ))}
            </ol>
            {hud?.breakRail.fail ? <div className={styles.fail}>{hud.breakRail.fail}</div> : null}
            {!hud?.breakRail.fail && hud?.breakRail.current ? (
              <div className={styles.hint}>현재 상태: {hud.breakRail.current}</div>
            ) : null}
          </article>
          <article className={styles.panel}>
            <ExplainKicker label="FLOW SYNC" onExplain={setExplainKo} />
            <strong className={styles.stateBig}>{resolveHudFlowSyncKo(hud, analysis)}</strong>
            <div className={styles.hint}>{hud?.flowSync?.note ?? 'Bitget cross-market'}</div>
          </article>
          <article className={styles.panel}>
            <ExplainKicker label="CLOCK FLOW" onExplain={setExplainKo} />
            <strong className={styles.stateBig}>{resolveHudClockFlowKo(hud)}</strong>
            <div className={styles.hint}>
              {hud?.clockFlow?.slot ? `UTC :${hud.clockFlow.slot}` : ''}
              {hud?.clockFlow?.note ? ` · ${hud.clockFlow.note}` : ''}
            </div>
          </article>
        </div>
      )}

      <div className={styles.chartRow} data-eagle1-region="chart">
        <div className={styles.chartCol}>
          <div className={styles.chartStage} data-eagle1-chart-fs-root="stage">
            <button
              type="button"
              className={styles.chartFsChip}
              data-eagle1-fs-chip="stage"
              title="차트 전체화면"
              onClick={() => {
                const strip = document.querySelector(
                  '[data-eagle1-fs-chip="strip"]'
                ) as HTMLButtonElement | null;
                if (strip) {
                  strip.click();
                  return;
                }
                const col =
                  (document.querySelector(
                    '[data-eagle1-chart-fs-root="1"]'
                  ) as HTMLElement | null) ||
                  (document.querySelector(
                    '[data-eagle1-chart-fs-root]'
                  ) as HTMLElement | null);
                if (!col) return;
                const CSS_FS = 'is-css-chart-fullscreen';
                const on = !col.classList.contains(CSS_FS);
                if (document.fullscreenElement) {
                  void document.exitFullscreen().catch(() => undefined);
                }
                col.classList.toggle(CSS_FS, on);
                col.setAttribute('data-eagle1-chart-fs-root', '1');
                document.documentElement.classList.toggle('eagle1-chart-fs-active', on);
                window.dispatchEvent(new Event('resize'));
              }}
            >
              ⛶ 전체화면
            </button>
            {hud?.heat?.length ? (
              <div className={styles.heatBack} aria-hidden title="수급 히트 · 캔들 가림 없음">
                {hud.heat.slice(-96).map((h) => {
                  const p = heatBarPaintSafe(h.score);
                  return <i key={h.time} style={{ background: p.fill, opacity: p.opacity }} />;
                })}
              </div>
            ) : null}
            {children}
            {showLive && visibleAlerts.length > 0 ? (
              <div className={styles.chartAlerts} data-eagle1-region="chart-alerts" aria-label="차트 알림">
                <div className={styles.chartAlertsHead}>
                  <span>구조 알림</span>
                  <button type="button" className={styles.chartAlertClose} onClick={dismissAllAlerts}>
                    전부 닫기
                  </button>
                </div>
                {visibleAlerts.map((a) => (
                  <div key={a.id} className={styles.chartAlert} data-tone={a.tone}>
                    <button
                      type="button"
                      className={styles.chartAlertBody}
                      title={a.briefingKo}
                      onClick={() =>
                        setExplainKo(
                          `AI결론: ${liveBriefing.resultKo}\n${a.en}\n${a.ko}\n${a.briefingKo}\n조건부 · 수익 보장 아님`
                        )
                      }
                    >
                      <div className={styles.chartAlertTitleRow}>
                        <b>{a.en}</b>
                        <span className={styles.chartAlertVerdict} data-side={a.eventVerdict.toLowerCase()}>
                          {a.eventVerdictKo}
                        </span>
                      </div>
                      <span>{a.ko}</span>
                      <em className={styles.chartAlertBrief}>{a.briefingKo}</em>
                    </button>
                    <button
                      type="button"
                      className={styles.chartAlertClose}
                      aria-label="닫기"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDismissedAlerts((prev) => (prev.includes(a.id) ? prev : [...prev, a.id]));
                      }}
                    >
                      닫기
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
          {showLive && (
            <div className={styles.microStrip} data-eagle1-region="micro">
              {(
                [
                  { key: 'cvd' as const, label: 'CVD' },
                  { key: 'ofi' as const, label: 'OFI' },
                  { key: 'lob' as const, label: 'ORDERBOOK' },
                  { key: 'oi' as const, label: 'OI' },
                ] as const
              ).map((row) => {
                const met = resolveHudMicroMetric(row.key, hud, analysis);
                return (
                <article key={row.key} className={styles.microCell} data-on={met.on ? '1' : '0'}>
                  <ExplainKicker label={row.label} onExplain={setExplainKo} />
                  <strong>{met.text}</strong>
                  <div className={styles.microBars} aria-hidden>
                    {(spark.length ? spark.slice(-24) : []).map((c, i) => (
                      <i
                        key={`${row.key}-${c.time ?? i}`}
                        style={{
                          height: `${Math.max(8, Math.min(100, Math.abs(((c.close - c.open) / Math.max(c.high - c.low, 1e-9)) * 100)))}%`,
                          background: c.close >= c.open ? 'var(--e1-green)' : 'var(--e1-red)',
                        }}
                      />
                    ))}
                    {!spark.length ? <span className={styles.muted}>—</span> : null}
                  </div>
                </article>
              );
              })}
            </div>
          )}
        </div>
        {showLive && aiZoneOn ? (
          <Eagle1AiZoneSideRail
            pack={aiZonePack}
            liveBriefing={liveBriefing}
            briefingHidden={liveBriefingHidden}
            onShowBriefing={showLiveBriefing}
            onHideBriefing={dismissLiveBriefing}
            frozen={Boolean((canonicalTrade as Eagle1CanonicalTradeDisplayFrozen | null)?.frozen)}
            frozenOutcomeKo={
              (canonicalTrade as Eagle1CanonicalTradeDisplayFrozen | null)?.frozenOutcomeKo ?? null
            }
            swingSpot={canonicalTrade?.superStats?.swingSpot ?? null}
          />
        ) : showLive ? (
          <aside className={styles.squeezeSide} data-eagle1-region="squeeze-side">
            <ExplainKicker label="SQUEEZE RADAR" onExplain={setExplainKo} />
            <div className={styles.squeezeDual}>
              <div className={styles.squeezeLane} data-side="LONG">
                <SemiGauge score={squeezeLong.score} label={squeezeLong.labelEn} />
                <div className={styles.hint}>{squeezeLong.labelKo}</div>
              </div>
              <div className={styles.squeezeLane} data-side="SHORT">
                <SemiGauge score={squeezeShort.score} label={squeezeShort.labelEn} />
                <div className={styles.hint}>{squeezeShort.labelKo}</div>
              </div>
            </div>
            <HudKicker label="TRIGGER">
              · {resolveHudToken(hud?.squeezeRadar?.activeSide ?? synthesis?.verdict ?? 'WAIT', langKo)}
            </HudKicker>
            <ol className={styles.triggerRail}>
              {SQUEEZE_TRIGGER_STEPS.map((lab, i) => {
                const active =
                  hud?.squeezeRadar?.activeSide === 'LONG'
                    ? hud.squeezeRadar.long
                    : hud?.squeezeRadar?.short ?? squeezeLong;
                const at = squeezeTriggerIndex(active?.state ?? squeezeLong.state);
                return (
                  <li key={lab} data-on={at === i ? '1' : at > i ? 'done' : '0'}>
                    {resolveHudSqueezeStep(lab, langKo)}
                  </li>
                );
              })}
            </ol>
            <HudKicker label="AI SCORE"> · {langKo ? 'AI≠검증확률' : 'AI ≠ 검증확률'}</HudKicker>
            <div className={styles.scoreBars}>
              <div>
                <span>AI SCORE</span>
                <b>{scoreFb.aiScore ?? aiScore ?? '—'}</b>
                <i style={{ width: `${Math.max(0, Math.min(100, scoreFb.aiScore ?? aiScore ?? 0))}%` }} />
              </div>
              <div>
                <span>{hud?.scoreCalibration?.calibratedLabelKo ?? '검증확률'}</span>
                <b>{scoreFb.calibratedText || calibratedText}</b>
              </div>
            </div>
            <div className={styles.totalScore}>
              {resolveHudLabel('TOTAL', langKo)}
              <strong>
                {totalScore ?? '—'}
                <em>/100</em>
              </strong>
            </div>
            <HudKicker label="핵심 정보" />
            <ul className={styles.keyFacts}>
              <li>
                {resolveHudLabel('MARK', langKo)}{' '}
                <b>{liveQuotes.mark}</b>
              </li>
              <li>
                {resolveHudLabel('INDEX', langKo)}{' '}
                <b>{liveQuotes.index}</b>
              </li>
              <li>
                {resolveHudLabel('OI', langKo)}{' '}
                <b>{resolveHudMicroMetric('oi', hud, analysis).text}</b>
              </li>
              <li>
                {resolveHudLabel('FUNDING', langKo)} <b>{fundingLabel}</b>
              </li>
              <li>
                {resolveHudLabel('ORDER FLOW', langKo)} <b>{orderFlowSummary}</b>
              </li>
            </ul>
            <div className={styles.positionFlat} data-flat={!dir || dir === 'WAIT' ? '1' : '0'}>
              <ExplainKicker label="POSITION STATUS" onExplain={setExplainKo} />
              <strong>{!dir ? resolveHudLabel('FLAT', langKo) : resolveHudToken(dir, langKo)}</strong>
              <span>
                {!dir
                  ? '대기 중'
                  : hud?.tradeStatus.current ?? canonicalTrade?.directionKo ?? plan?.status}
              </span>
            </div>
          </aside>
        ) : null}
      </div>
      </div>

      <div className={styles.lowerScroll}>
      {showLive && (
        <>
          <div className={styles.planRow} data-eagle1-region="plan">
            <article className={`${styles.panel} ${styles.tradePlanHero}`} data-dir={dir ?? 'WAIT'}>
              <ExplainKicker
                label={`TRADE PLAN ${dir ?? 'WAIT'}${
                  hud?.tradeOpportunity?.grade ? ` · ${hud.tradeOpportunity.grade}` : ''
                }${!dir && plan?.status === 'WAIT' && plan.entryLow != null ? ' · 감시' : ''}${
                  (canonicalTrade as Eagle1CanonicalTradeDisplayFrozen | null)?.frozen ? ' · 잠금' : ''
                }`}
                onExplain={setExplainKo}
              />
              <div className={styles.planGrade}>
                {canonicalTrade?.directionKo ??
                  hud?.tradeOpportunity?.grade ??
                  (dir === 'LONG' || dir === 'SHORT'
                    ? `${resolveHudToken(dir, langKo)} ${resolveHudToken('ZONE', langKo)}`
                    : resolveHudLabel('WAIT', langKo))}
              </div>
              <div className={styles.planGrid}>
                <div
                  title={eagle1LabelTitleAttr('ENTRY')}
                  onClick={() => setExplainKo(labelInteractionPayload('ENTRY', 'click').textKo)}
                  onDoubleClick={() => setExplainKo(labelInteractionPayload('ENTRY', 'dblclick').textKo)}
                >
                  {resolveHudLabel('ENTRY', langKo)}
                  <b>{wire.planEntry}</b>
                </div>
                <div
                  title={eagle1LabelTitleAttr('STOP')}
                  onClick={() => setExplainKo(labelInteractionPayload('STOP', 'click').textKo)}
                >
                  {resolveHudLabel('STOP', langKo)}
                  <b>{formatPriceCompact(canonicalTrade?.stopLoss ?? plan?.sl ?? null)}</b>
                </div>
                <div
                  title={eagle1LabelTitleAttr('TP1')}
                  onClick={() => setExplainKo(labelInteractionPayload('TP1', 'click').textKo)}
                >
                  {resolveHudLabel('TP1', langKo)}
                  <b>{formatPriceCompact(canonicalTrade?.tp1 ?? plan?.tp1 ?? null)}</b>
                </div>
                <div
                  title={eagle1LabelTitleAttr('TP2')}
                  onClick={() => setExplainKo(labelInteractionPayload('TP2', 'click').textKo)}
                >
                  {resolveHudLabel('TP2', langKo)}
                  <b>{formatPriceCompact(canonicalTrade?.tp2 ?? plan?.tp2 ?? null)}</b>
                </div>
                <div
                  title={eagle1LabelTitleAttr('TP3')}
                  onClick={() => setExplainKo(labelInteractionPayload('TP3', 'click').textKo)}
                >
                  {resolveHudLabel('TP3', langKo)}
                  <b>{formatPriceCompact(canonicalTrade?.tp3 ?? plan?.tp3 ?? null)}</b>
                </div>
              </div>
              <div className={styles.rr}>
                RR {plan?.netRr != null ? `1 : ${plan.netRr.toFixed(2)}` : langKo ? '통계 부족' : 'n/a'}
                {hud?.positionSize?.units != null
                  ? ` · ${resolveHudLabel('SIZE', langKo)} ${hud.positionSize.units.toFixed(4)}u`
                  : ''}
              </div>
              <div className={styles.hint}>
                AI 점수 {wire.aiScoreText}
                {' · '}
                {hud?.scoreCalibration?.calibratedLabelKo ?? '검증확률'}{' '}
                {hud?.scoreCalibration?.calibratedText ??
                  formatSamplePct(sample, plan?.calibratedProbability ?? null)}
                {hud?.scoreCalibration?.oodFlagged ? ' · OOD→WAIT' : ''}
                {' · 확정 수익 아님'}
              </div>
            </article>
            <article className={`${styles.panel} ${styles.statusPanel}`}>
              <ExplainKicker label="TRADE STATUS" onExplain={setExplainKo} />
              <ol className={styles.statusRail}>
                {HUD_TRADE_RAIL.map((step) => (
                  <li key={step} data-on={hud?.tradeStatus.current === step ? '1' : '0'}>
                    {resolveHudTradeRailStep(step, langKo)}
                  </li>
                ))}
              </ol>
              <div className={styles.hint}>{hud?.tradeStatus.note}</div>
              {hud?.positionManagement ? (
                <div className={styles.hint}>
                  PM {hud.positionManagement.summaryKo}
                  {hud.positionManagement.failClosedHoldingTargets ? ' · FAIL TP보유' : ''}
                  {' · '}
                  무조건BE금지
                </div>
              ) : null}
              <div className={styles.hint}>{execLv?.summaryKo ?? hud?.executionLevels?.summaryKo ?? ''}</div>
            </article>
          </div>

          <div className={styles.statSix} data-eagle1-region="stats">
            <article className={styles.panel}>
              <ExplainKicker label="MARKET STATE" onExplain={setExplainKo} />
              <strong className={styles.stateBig}>{resolveHudMarketStateKo(hud, analysis, plan as Eagle1MainPlan | null)}</strong>
            </article>
            <article className={styles.panel}>
              <HudKicker label="COMPRESSION" />
              <RingGauge score={bigMoveUi.compression ?? null} sub={bigMoveUi.labelKo} />
            </article>
            <article className={styles.panel}>
              <HudKicker label="EXPANSION READINESS" />
              <div className={styles.bar}>
                <i style={{ width: `${bigMoveUi.expansionReady ?? 0}%` }} />
              </div>
              <b>{bigMoveUi.expansionReady == null ? '—' : `${bigMoveUi.expansionReady}%`}</b>
            </article>
            <article className={styles.panel}>
              <HudKicker label="FLOW DIRECTION" />
              <div className={styles.arrows}>
                {hud?.flowDirection?.arrows
                  ? Array.from({ length: hud.flowDirection.arrows }).map((_, i) => <span key={i}>↑</span>)
                  : analysis?.verdict === 'LONG'
                    ? '↑↑'
                    : analysis?.verdict === 'SHORT'
                      ? '↓↓'
                      : '→'}
              </div>
              <div>{hud?.flowDirection?.labelKo ?? (analysis?.verdict === 'LONG' ? '상향(근사)' : analysis?.verdict === 'SHORT' ? '하향(근사)' : '중립')}</div>
            </article>
            <article className={styles.panel}>
              <HudKicker label="VOLUME FLOW" />
              <strong>{volumeFlowUi.value}</strong>
              <div>{volumeFlowUi.labelKo}</div>
            </article>
            <article className={styles.panel}>
              <ExplainKicker label="ENTRY QUALITY" onExplain={setExplainKo} />
              <RingGauge score={entryQ.score} sub={entryQ.labelKo} />
              <div className={styles.hint}>
                {canonicalTrade?.superStats
                  ? `${AI_SUPER_BIANSHEN_STATS} · 합의·강도 근사 · 확정 아님`
                  : hud?.entryQuality?.note ?? '추가 확인 필요 · 최종 아님'}
              </div>
            </article>
          </div>

          <div className={styles.eventStrip} data-eagle1-region="events">
            <div className={styles.kicker}>
              AI CANDLE EVENTS
              <span title="BOS=구조돌파 · CHoCH=추세전환 · 클릭=설명·변신통계 증거">BOS·CHoCH · 클릭</span>
            </div>
            <ol>
              {(hud?.candleEvidence?.marks ?? hud?.events ?? []).slice(-18).map((ev) => {
                const labelKo = formatEagle1EventKo(ev);
                const kind = String(ev.kind || '');
                const explain = eagle1EventExplainKo(kind);
                const selected = selectedEvent?.kind === kind && selectedEvent?.labelKo === labelKo;
                return (
                  <li
                    key={`${kind}-${ev.index}-${labelKo}`}
                    data-kind={kind}
                    data-selected={selected ? '1' : '0'}
                    role="button"
                    tabIndex={0}
                    title={`${explain}${'labelKo' in ev && ev.labelKo ? ` · ${ev.labelKo}` : ''}`}
                    onClick={() => {
                      setSelectedEvent({ kind, labelKo, explain });
                      setExplainKo(`${labelKo} · ${explain} · ${AI_SUPER_BIANSHEN_STATS} 증거`);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedEvent({ kind, labelKo, explain });
                        setExplainKo(`${labelKo} · ${explain} · ${AI_SUPER_BIANSHEN_STATS} 증거`);
                      }
                    }}
                  >
                    {labelKo}
                  </li>
                );
              })}
              {!(hud?.candleEvidence?.marks?.length || hud?.events?.length) ? (
                <li className={styles.muted}>구조 이벤트 없음</li>
              ) : null}
            </ol>
            {hud?.candleEvidence ? (
              <div className={styles.hint}>
                {hud.candleEvidence.summaryKo} ·{' '}
                {hud.candleEvidence.iconLegend.map((x) => `${x.chartIcon}${x.labelEn}`).join(' ')}
              </div>
            ) : null}
            {selectedEvent ? (
              <div className={styles.eventDetail} data-eagle1-region="event-detail" role="dialog">
                <header>
                  <div>
                    <b>{selectedEvent.labelKo}</b>
                    <span>{symbol} · {selectedEvent.kind}</span>
                  </div>
                  <button
                    type="button"
                    className={styles.eventDetailClose}
                    onClick={() => setSelectedEvent(null)}
                  >
                    닫기
                  </button>
                </header>
                <p>{selectedEvent.explain}</p>
                <div className={styles.hint}>
                  {AI_SUPER_BIANSHEN_STATS} 증거 투표 · 확정 수익 아님
                </div>
              </div>
            ) : null}
          </div>

          <div className={styles.statSix} data-eagle1-region="live-patches">
            <article className={styles.panel}>
              <ExplainKicker label="TRADE OPPORTUNITY" onExplain={setExplainKo} />
              <strong className={styles.stateBig}>{tradeOpp.grade}</strong>
              <div className={styles.hint}>{tradeOpp.note}</div>
            </article>
            <article className={styles.panel}>
              <ExplainKicker label="POSITION SIZE" onExplain={setExplainKo} />
              <strong>{posSize.units}</strong>
              <div className={styles.hint}>{posSize.note}</div>
            </article>
            <article className={styles.panel}>
              <HudKicker label="OVERLAY BUDGET" />
              <div className={styles.hint}>{hud?.overlayBudget?.summaryKo ?? '실전 모드 · 핵심 존만'}</div>
            </article>
          </div>
        </>
      )}

      {showResearch && (
        <div className={styles.research} data-eagle1-region="research">
          <article className={styles.panel}>
            <HudKicker label="MAIN / ALT / BREAK PATH" />
            <ul className={styles.miniList}>
              {(hud?.smartFuturePath?.cluster ?? []).length &&
              !(hud?.smartFuturePath?.cluster ?? []).every((p) =>
                /PATH_UNAVAILABLE|UNAVAILABLE/i.test(String(p.uiState || p.note || ''))
              )
                ? hud!.smartFuturePath!.cluster.map((p) => (
                    <li key={p.id} data-hit={p.uiState === 'ON_TRACK' ? '1' : p.uiState === 'INVALID' ? '0' : 'na'}>
                      {p.id} · {p.uiState} · {p.note}
                    </li>
                  ))
                : (hud?.paths ?? []).length &&
                    !(hud?.paths ?? []).every((p) => /UNAVAILABLE|통계 부족|데이터 없음/i.test(String(p.text || '')))
                  ? (hud?.paths ?? []).map((p) => (
                      <li key={p.id}>
                        {p.labelEn} {p.text}
                        <em> n={p.sample}</em>
                      </li>
                    ))
                  : wire.hubPaths.map((p) => (
                      <li key={p.id} data-hit={p.uiState === 'ON_TRACK' ? '1' : 'na'}>
                        {p.id} · {p.uiState} · {p.note}
                      </li>
                    ))}
            </ul>
            <div className={styles.pathPct}>{pathProbUi.text}</div>
            <div className={styles.hint}>
              {pathProbUi.note} · 표본 {pathProbUi.sample}
              {wire.hubSourceKo ? ` · ${wire.hubSourceKo}` : ''}
            </div>
          </article>
          <article className={styles.panel}>
            <ExplainKicker label="ORDER FLOW" onExplain={setExplainKo} />
            <div>{orderFlowSummary}</div>
            {hud?.orderFlow?.channels?.length ? (
              <ul className={styles.miniList}>
                {hud.orderFlow.channels.map((c) => (
                  <li key={c.key} data-hit={c.available ? '1' : c.stale ? '0' : 'na'}>
                    {c.labelKo} · {c.valueText}
                    {c.stale ? ' · stale' : ''}
                  </li>
                ))}
              </ul>
            ) : null}
          </article>
          <article className={styles.panel}>
            <ExplainKicker label="PROFILE LEVELS" onExplain={setExplainKo} />
            {profileUi ? (
              <>
                <div>{profileUi.summary}</div>
                <ul className={styles.miniList}>
                  {profileUi.rows.map((r) => (
                    <li key={`${r.kind}-${r.price}`}>
                      {r.labelKo} · {formatPriceCompact(r.price)}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <div className={styles.hint}>프로파일·존 레벨 수집 중…</div>
            )}
          </article>
          <article className={styles.panel}>
            <ExplainKicker label="LIQUIDITY DEFENSE" onExplain={setExplainKo} />
            {(() => {
              const liq = resolveHudLiquidityDefenseKo(hud, analysis);
              return (
                <>
                  <div>{liq.summary}</div>
                  <ul className={styles.miniList}>
                    <li>BID {liq.bid}</li>
                    <li>ASK {liq.ask}</li>
                  </ul>
                </>
              );
            })()}
          </article>
          <article className={styles.panel}>
            <ExplainKicker label="WALK-FORWARD" onExplain={setExplainKo} />
            <div>{resolveHudWalkForwardKo(hud, plan as Eagle1MainPlan | null)}</div>
            <div className={styles.hint}>표본·비용 반영 근사 · shuffle 금지</div>
          </article>
          <article className={styles.panel}>
            <HudKicker label="NEXT KEY LEVEL" />
            <div>저항 {zoneLevels.resistText}</div>
            <div>지지 {zoneLevels.supportText}</div>
          </article>
          <article className={styles.panel}>
            <ExplainKicker label="INVALIDATION" onExplain={setExplainKo} />
            <div>{wire.invalidation}</div>
          </article>
          <article className={styles.panel}>
            <HudKicker label="PREDICTION SNAPSHOT" />
            <div>
              {formatEagle1SnapshotClock(analysis?.eagle1Snapshot?.timestamp)}
            </div>
            <div>{analysis?.eagle1Snapshot?.status ?? '대기'}</div>
          </article>
          <article className={styles.panel}>
            <HudKicker label="UNIFIED ZONE" />
            <ul className={styles.miniList}>
              {wire.unifiedZone.lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </article>
          <article className={styles.panel}>
            <HudKicker label="FALSE BREAK" />
            <div>{fb?.labelKo ?? (analysis?.eagle1Structure ? '구조 이벤트 근사' : '—')}</div>
            <MiniOhlc candles={fb?.excerpt ?? []} />
            <ul className={styles.miniList}>
              {(fb?.breakout.evidence ?? []).slice(0, 4).map((e) => (
                <li key={e.id} data-hit={e.hit == null ? 'na' : e.hit ? '1' : '0'}>
                  {e.labelKo}
                </li>
              ))}
            </ul>
          </article>
          <article className={styles.panel}>
            <HudKicker label="BREAK QUALITY" />
            {acc?.breakQualityScore == null ? (
              <div>{acc?.uiLabel ?? '구조 수용(근사)'}</div>
            ) : (
              <div>
                {Math.round(acc.breakQualityScore)} · {acc.breakQualityNote}
              </div>
            )}
            <ul className={styles.miniList}>
              {wire.breakQualityFactors.map((f) => (
                <li key={f.id} data-hit={f.score == null ? 'na' : '1'}>
                  {f.labelKo} · {f.score == null ? f.note || '근사 대기' : Math.round(f.score)}
                </li>
              ))}
            </ul>
            <div className={styles.hint}>구조 품질 · 확률 아님</div>
          </article>
          <article className={styles.panel}>
            <ExplainKicker label="SQUEEZE RADAR" onExplain={setExplainKo} />
            <div title={eagle1LabelTitleAttr(hud?.squeezeRadar?.chartTag ?? 'SQUEEZE')}>
              {hud?.squeezeRadar?.summaryKo ?? `${squeezeLong.labelKo} / ${squeezeShort.labelKo}`}
            </div>
            <ul className={styles.miniList}>
              <li data-hit={squeezeLong.state !== 'NONE' ? '1' : '0'}>
                LONG · {squeezeLong.labelEn} · {squeezeLong.labelKo}
                {squeezeLong.score != null ? ` · ${Math.round(squeezeLong.score)}` : ''}
              </li>
              <li data-hit={squeezeShort.state !== 'NONE' ? '1' : '0'}>
                SHORT · {squeezeShort.labelEn} · {squeezeShort.labelKo}
                {squeezeShort.score != null ? ` · ${Math.round(squeezeShort.score)}` : ''}
              </li>
              <li>차트태그 {hud?.squeezeRadar?.chartTag ?? synthesis?.verdict ?? 'WAIT'}</li>
            </ul>
            <div className={styles.hint}>{hud?.squeezeRadar?.bigMove?.labelKo ?? hud?.bigMove?.labelKo ?? '압축·확장 근사'} · 확률 아님</div>
          </article>
          <article className={styles.panel}>
            <ExplainKicker label="LIQ ZONE" onExplain={setExplainKo} />
            <div>{wire.liqZones.summary}</div>
            <ul className={styles.miniList}>
              {wire.liqZones.lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </article>
          <article className={styles.panel}>
            <ExplainKicker label="SCORE SPLIT" onExplain={setExplainKo} />
            {hud?.scoreCalibration ? (
              <>
                <div>{hud.scoreCalibration.summaryKo}</div>
                <ul className={styles.miniList}>
                  <li>
                    AI · {hud.scoreCalibration.aiScore ?? '데이터 없음'} · {hud.scoreCalibration.aiScoreNote}
                  </li>
                  <li data-hit={hud.scoreCalibration.calibratedLabelKo === '검증확률' ? '1' : 'na'}>
                    {hud.scoreCalibration.calibratedLabelKo} · {hud.scoreCalibration.calibratedText}
                  </li>
                  <li data-hit={hud.scoreCalibration.oodFlagged ? '0' : '1'}>
                    OOD {hud.scoreCalibration.oodFlagged ? 'YES' : 'NO'} · {hud.scoreCalibration.oodNote}
                  </li>
                </ul>
              </>
            ) : (
              <>
                <div>{scoreFb.summaryKo}</div>
                <ul className={styles.miniList}>
                  <li>AI · {scoreFb.aiScore ?? '—'}</li>
                  <li>{scoreFb.calibratedText}</li>
                </ul>
              </>
            )}
          </article>
          <article className={styles.panel}>
            <ExplainKicker label="POSITION SIZE" onExplain={setExplainKo} />
            {hud?.positionSize ? (
              <>
                <div>
                  {hud.positionSize.units != null
                    ? `${hud.positionSize.units.toFixed(4)} u`
                    : '데이터 없음'}
                </div>
                <ul className={styles.miniList}>
                  <li>
                    위험 {hud.positionSize.riskPct}% · equity {hud.positionSize.equity}
                  </li>
                  <li>레버리지 선결정 금지</li>
                </ul>
                <div className={styles.hint}>{hud.positionSize.note}</div>
              </>
            ) : (
              <>
                <div>{posSize.units}</div>
                <div className={styles.hint}>{posSize.note}</div>
              </>
            )}
          </article>
          <article className={styles.panel}>
            <ExplainKicker label="HTF HISTORY" onExplain={setExplainKo} />
            {hud?.htfHistorical ? (
              <>
                <div>{hud.htfHistorical.summaryKo}</div>
                <ul className={styles.miniList}>
                  {hud.htfHistorical.rows
                    .filter((r) => ['1M', '1W', '1D', '4H'].includes(r.tf))
                    .map((r) => (
                      <li key={r.tf} data-hit={r.status === 'ok' ? '1' : 'na'}>
                        {r.tf} · {r.status} · {r.note}
                      </li>
                    ))}
                </ul>
                {hud.htfHistorical.blockConfirmedHint ? (
                  <div className={styles.hint}>상위 TF 부족 · 확정 제한 힌트</div>
                ) : null}
              </>
            ) : (
              <>
                <div>{resolveHudHtfHistoryRows(hud, analysis)[0]?.note ?? 'HTF 근사'}</div>
                <ul className={styles.miniList}>
                  {resolveHudHtfHistoryRows(hud, analysis).map((r) => (
                    <li key={r.tf} data-hit={r.ok ? '1' : 'na'}>
                      {r.tf} · {r.note}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </article>
          <article className={styles.panel}>
            <ExplainKicker label="EXECUTION LEVELS" onExplain={setExplainKo} />
            {execLv ? (
              <>
                <div>{execLv.summaryKo}</div>
                <ul className={styles.miniList}>
                  <li data-hit={execLv.allowEntry ? '1' : '0'}>
                    {resolveHudLabel('ENTRY', langKo)} · {execLv.entry}
                  </li>
                  <li>
                    {resolveHudLabel('STOP', langKo)} · {execLv.stop}
                  </li>
                  {execLv.targets.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </>
            ) : (
              <div className={styles.muted}>플랜 계산 중</div>
            )}
          </article>
          <article className={styles.panel}>
            <ExplainKicker label="COMBINATION MINING" onExplain={setExplainKo} />
            <div>{wire.combinationMining.summary}</div>
            <ul className={styles.miniList}>
              {wire.combinationMining.rows.map((row) => (
                <li key={row}>{row}</li>
              ))}
            </ul>
          </article>
          <article className={styles.panel}>
            <ExplainKicker label="TRADE OPPORTUNITY" onExplain={setExplainKo} />
            {hud?.tradeOpportunity ? (
              <>
                <div title={eagle1LabelTitleAttr(hud.tradeOpportunity.labelEn)}>
                  {hud.tradeOpportunity.labelEn} · {hud.tradeOpportunity.labelKo}
                </div>
                <ul className={styles.miniList}>
                  <li data-hit={hud.tradeOpportunity.allowEntry ? '1' : '0'}>
                    진입 {hud.tradeOpportunity.allowEntry ? '허용' : '불가'} ·{' '}
                    {hud.tradeOpportunity.direction ?? 'WAIT'}
                  </li>
                </ul>
                <div className={styles.hint}>{hud.tradeOpportunity.note}</div>
              </>
            ) : (
              <>
                <div>{tradeOpp.grade}</div>
                <div className={styles.hint}>{tradeOpp.note}</div>
              </>
            )}
          </article>
          <article className={styles.panel}>
            <ExplainKicker label="STRATEGY FUSION" onExplain={setExplainKo} />
            {hud?.legendaryFusion ? (
              <>
                <div title={eagle1LabelTitleAttr(hud.legendaryFusion.labelEn)}>
                  {hud.legendaryFusion.chartTag ?? 'NONE'} · {hud.legendaryFusion.labelKo}
                </div>
                <ul className={styles.miniList}>
                  <li data-hit={hud.legendaryFusion.aPlusEligible ? '1' : 'na'}>
                    A+ {hud.legendaryFusion.aPlusEligible ? '승격' : '미달'}
                    {hud.legendaryFusion.fusionScore != null
                      ? ` · 합의 ${hud.legendaryFusion.fusionScore}`
                      : ''}
                  </li>
                </ul>
                <div className={styles.hint}>{hud.legendaryFusion.note}</div>
              </>
            ) : (
              <div>{resolveHudStrategyFusionKo(hud, analysis)}</div>
            )}
          </article>
          <article className={styles.panel}>
            <ExplainKicker label="RE-ENTRY" onExplain={setExplainKo} />
            {hud?.reEntry ? (
              <>
                <div title={eagle1LabelTitleAttr(hud.reEntry.labelEn)}>
                  {hud.reEntry.labelEn} · {hud.reEntry.labelKo}
                </div>
                <ul className={styles.miniList}>
                  <li data-hit={hud.reEntry.allowNewSetup ? '1' : '0'}>
                    새셋업 {hud.reEntry.allowNewSetup ? '허용' : '차단'} · 새 tradeId 필수
                  </li>
                  <li>
                    이전 {hud.reEntry.previousState ?? '데이터 없음'}
                    {hud.reEntry.previousTradeId ? ` · ${hud.reEntry.previousTradeId.slice(0, 14)}` : ''}
                  </li>
                </ul>
                <div className={styles.hint}>{hud.reEntry.note}</div>
              </>
            ) : (
              <div>{resolveHudReEntryKo(hud, plan as Eagle1MainPlan | null)}</div>
            )}
          </article>
          <article className={styles.panel}>
            <ExplainKicker label="MTF SMART ZONE" onExplain={setExplainKo} />
            <div>{wire.mtfSmartZone.summary}</div>
            <ul className={styles.miniList}>
              {wire.mtfSmartZone.longLine ? (
                <li data-hit="1">{wire.mtfSmartZone.longLine}</li>
              ) : (
                <li data-hit="na">A+ LONG · MTF 근사 대기</li>
              )}
              {wire.mtfSmartZone.shortLine ? (
                <li data-hit="1">{wire.mtfSmartZone.shortLine}</li>
              ) : (
                <li data-hit="na">A+ SHORT · MTF 근사 대기</li>
              )}
            </ul>
          </article>
          <article className={styles.panel}>
            <HudKicker label="COMBINATION ENGINE" />
            <div>{wire.combinationEngine.summary}</div>
            <ul className={styles.miniList}>
              {wire.combinationEngine.hits.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
          </article>
          <article className={styles.panel}>
            <HudKicker label="FLOW SYNC" />
            <div>{wire.flowSync}</div>
            <div className={styles.hint}>{hud?.flowSync?.note ?? '흐름·구조 동기 근사'}</div>
          </article>
          <article className={styles.panel}>
            <HudKicker label="15M CLOCK FLOW" />
            <div>{wire.clockFlow.label}</div>
            <ul className={styles.miniList}>
              <li>15m 이후 {wire.clockFlow.after15m}</li>
              <li>1H 이후 {wire.clockFlow.after1h}</li>
              <li>4H 이후 {wire.clockFlow.after4h}</li>
              <li>10초/30초 {wire.clockFlow.subMinute}</li>
            </ul>
            <div className={styles.hint}>{wire.clockFlow.note}</div>
          </article>
          <article className={styles.panel}>
            <HudKicker label="LOB RESILIENCY" />
            <div>{wire.lobResiliency}</div>
          </article>
          <article className={styles.panel}>
            <HudKicker label="BITGET COVERAGE" />
            <ul className={styles.miniList}>
              {wire.bitgetCoverage.map((c) => (
                <li key={c.tf}>
                  {c.tf} · {c.text}
                </li>
              ))}
            </ul>
          </article>
          <article className={styles.panel}>
            <div className={styles.kicker}>도식 비교</div>
            <div>참고 {wire.schematic.referenceKo}</div>
            <div>현재 {wire.schematic.currentKo}</div>
            <ul className={styles.miniList}>
              {wire.schematic.features.map((f) => (
                <li key={f.id} data-hit={f.hit == null ? 'na' : f.hit ? '1' : '0'}>
                  {f.labelKo}
                </li>
              ))}
            </ul>
            <div className={styles.hint}>{wire.schematic.note}</div>
          </article>
          <article className={styles.panel}>
            <HudKicker label="HISTORICAL OUTCOME" />
            <ul className={styles.miniList}>
              {wire.historicalReach.rows.map((row) => (
                <li key={row}>{row}</li>
              ))}
            </ul>
            <div className={styles.hint}>반응 {wire.historicalReach.reaction}</div>
          </article>
          <article className={styles.panel}>
            <HudKicker label="PREMIUM / DISCOUNT" />
            {posPctResolved == null ? (
              <div className={styles.hint}>프리미엄·디스카운트 근사 대기</div>
            ) : (
              <div className={styles.pd}>
                <i style={{ top: `${100 - posPctResolved}%` }} />
                <span>Premium</span>
                <span>Discount</span>
              </div>
            )}
          </article>
          <article className={styles.panel} data-on={wire.bigLong.active ? '1' : '0'}>
            <div className={styles.kicker}>BIG LONG 후보</div>
            <ul className={styles.miniList}>
              {wire.bigLong.checks.map((c) => (
                <li key={c.id} data-hit={c.hit == null ? 'na' : c.hit ? '1' : '0'}>
                  {c.labelKo}
                </li>
              ))}
            </ul>
          </article>
          <article className={styles.panel} data-on={wire.cascadeShort.active ? '1' : '0'}>
            <div className={styles.kicker}>CASCADE SHORT 후보</div>
            <ul className={styles.miniList}>
              {wire.cascadeShort.checks.map((c) => (
                <li key={c.id} data-hit={c.hit == null ? 'na' : c.hit ? '1' : '0'}>
                  {c.labelKo}
                </li>
              ))}
            </ul>
          </article>
          <article className={`${styles.panel} ${styles.summary}`}>
            <div className={styles.kicker}>실시간 신호 요약</div>
            <p>{hudSummary}</p>
            {inspect ? <div className={styles.hint}>{inspect.label}</div> : null}
          </article>
        </div>
      )}

      <details className={styles.evidence} open={evidenceOpen} onToggle={(e) => setEvidenceOpen((e.target as HTMLDetailsElement).open)}>
        <summary>
          {AI_SUPER_BIANSHEN_STATS} · Evidence
          {wire.hubEvidence.length ? ` · ${wire.hubEvidence.length}` : ''}
        </summary>
        <div className={styles.evidenceBody}>
          {wire.hubEvidence.length ? (
            <ul className={styles.miniList}>
              {wire.hubEvidence.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : null}
          {evidence}
        </div>
      </details>
      </div>
      {explainKo ? (
        <div
          className={styles.explainToast}
          role="status"
          onClick={() => setExplainKo(null)}
          onKeyDown={(e) => {
            if (e.key === 'Escape' || e.key === 'Enter') setExplainKo(null);
          }}
        >
          <b>쉬운 설명</b>
          <p>{explainKo}</p>
          <span>탭하면 닫힘 · 확정 수익 아님</span>
        </div>
      ) : null}
    </section>
    </HudLangContext.Provider>
  );
}
