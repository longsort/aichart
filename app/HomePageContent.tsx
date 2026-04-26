'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { SYMBOLS, analysisMatchesSymbolAndTf } from '../lib/constants';
import ChartView, { type ChartSnapshotRef } from './components/ChartView';
import { type UIMode } from './components/UIModeSwitcher';
import AppSiteLogin from './components/AppSiteLogin';
import AIChatPanel from './components/AIChatPanel';
import AnalysisBoardHero from './components/AnalysisBoardHero';
import UnifiedDeskDashboardGuide from './components/UnifiedDeskDashboardGuide';
import AiAnalysisLineHints from './components/AiAnalysisLineHints';
import FocusOverlay from './components/FocusOverlay';
import ExecutionBriefingCard from './components/ExecutionBriefingCard';
import AutonomousLearningCard from './components/AutonomousLearningCard';
import CandleCompareCard from './components/CandleCompareCard';
import SignalBox from './components/SignalBox';
import VirtualTradeCard from './components/VirtualTradeCard';
import { TelegramMultiTfWatcher } from './components/TelegramMultiTfWatcher';
import TelegramMultiTfCard from './components/TelegramMultiTfCard';
import TradeUnifiedGraph from './components/TradeUnifiedGraph';
import { useVirtualTradeBackground } from '@/lib/useVirtualTradeBackground';
import { hydrateFromServer } from '@/lib/virtualTradeStore';
import ReferenceManager from './components/ReferenceManager';
import type { AnalyzeResponse, Candle } from '@/types';
import {
  loadSettings,
  saveSettings,
  syncSettingsFromServer,
  mergePageLayout,
  defaultPageLayout,
  defaultSettings,
  getEffectiveFeatureToggles,
  effectiveChartPrimeChannelWidthScale,
  type PageLayoutSettings,
  type PageLayoutPoint,
} from '@/lib/settings';
import { DEFAULT_PARKF_TRENDLINE_COLORS, normalizeHex6 } from '@/lib/chartHexColor';
import { DEFAULT_PARKF_TRENDLINE_OPTS, type ParkfTrendlineOpts } from '@/lib/parkfLinregTrendlineEngine';
import { parkfEngineOptsToQueryDiff, parkfEngineOptsCacheSegment, PARKF_EXTENSION_OPTIONS } from '@/lib/parkfAnalyzeQuery';
import { SETTINGS_CHANGED_EVENT } from '@/lib/useSettingsChangeTick';
import PageLayoutFab from './components/PageLayoutFab';
import AppDisclaimerBanner from './components/AppDisclaimerBanner';
import { createPortal } from 'react-dom';
import { fetchWithRetry } from '@/lib/fetchWithRetry';
import { getReferenceById } from '@/lib/referenceLibraryStore';
import { generateAutoBriefing } from '@/lib/autoBriefing';
import { simulateTrade } from '@/lib/risk/riskCalculator';
import { generateStrategies } from '@/lib/strategy/strategyGenerator';
import type { ChartExplainRequest } from '@/types/chartExplain';
import { getStoredOpenAIKey, getStoredBriefingUser, getStoredBriefingPassword, addEstimatedCostUsd } from '@/lib/clientAiCredentials';
import { useVisitorCount } from '@/lib/useVisitorCount';
import { getMarketSentiment } from '@/lib/market/sentimentEngine';
import { detectWhaleTransactions } from '@/lib/market/whaleTracker';
import { calculateExchangeNetflow } from '@/lib/market/exchangeFlow';
import { pushStructureAlertsFromAnalysis } from '@/lib/alerts/alertEngine';
import { updateLearningFromAnalysis, syncLearningFromServer } from '@/lib/unifiedTrade';

/** TF 전환 시 /api/analyze: 재시도 1회·짧은 지연(기본 450ms×2는 체감 지연 과다) */
const ANALYZE_FETCH_RETRIES = 1;
const ANALYZE_FETCH_RETRY_DELAY_MS = 220;

type HistoryItem = {
  symbol: string;
  timeframe: string;
  verdict: string;
  confidence: number;
  at: string;
  summary?: string;
};

const PERSISTED_SIGNAL_KEY = 'ai-signal-persisted';
const MIN_CONFIDENCE_PERSIST = 70;

type PersistedSignal = { symbol: string; timeframe: string; verdict: 'LONG' | 'SHORT'; confidence: number; at: string };

type MultiResult = { symbol: string; verdict: string; confidence: number };
type MTFSignal = {
  tf: string;
  verdict: string;
  confidence: number;
  signalTime?: number | null;
  depthDeltaRegime?: 'buy' | 'sell' | 'neutral';
  depthDeltaSmoothedPct?: number;
};

function parkfColorsCacheKey(
  base: string,
  large: string,
  medium: string,
  small: string,
  pri: string,
  sec: string
) {
  return [base, large, medium, small, pri, sec]
    .map((h) => h.replace(/^#/, '').toUpperCase().slice(0, 6))
    .join('');
}

function parkfColorsQuery(
  base: string,
  large: string,
  medium: string,
  small: string,
  pri: string,
  sec: string
) {
  const enc = (h: string) => encodeURIComponent(h.replace(/^#/, '').slice(0, 6));
  return `&pfB=${enc(base)}&pfLg=${enc(large)}&pfMd=${enc(medium)}&pfSm=${enc(small)}&pfTp=${enc(pri)}&pfTs=${enc(sec)}`;
}

/** 상단 레일(고래/합성/AI분석) — `localStorage`에 저장. 최초(키 없음)는 AI 분석 모드. */
const RAIL_UI_MODE_STORAGE_KEY = 'ailongshort-rail-ui-mode-v1';
function readStoredRailUiMode(): UIMode {
  if (typeof window === 'undefined') return 'AI_ZONE';
  try {
    const v = window.localStorage.getItem(RAIL_UI_MODE_STORAGE_KEY);
    if (v === 'WHALE' || v === 'UNIFIED_DESK' || v === 'AI_ZONE') return v;
  } catch {
    /* ignore */
  }
  return 'AI_ZONE';
}

export default function HomePageContent() {
  const BRIEFING_SIMILARITY_THRESHOLD_KEY = 'briefing-similarity-threshold';
  const BRIEFING_SIMILAR_REPLAY_KEY = 'briefing-similar-replay-enabled';
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [timeframe, setTimeframe] = useState('4h');
  const [analysis, setAnalysis] = useState<AnalyzeResponse | null>(null);
  /** /api/analyze가 내려주는 visible 캔들 — 통합 롱/숏 `omni_chart_fusion`에 사용 */
  const fusionCandles = useMemo((): Candle[] | null => {
    const c = analysis?.candles;
    return Array.isArray(c) && c.length >= 2 ? c : null;
  }, [analysis]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [multiResults, setMultiResults] = useState<MultiResult[]>([]);
  const [mtfSignals, setMtfSignals] = useState<MTFSignal[]>([]);
  const [backtest, setBacktest] = useState<{ winRate: number; totalPnlPct: number; totalTrades: number } | null>(null);
  const [backtestLoading, setBacktestLoading] = useState(false);
  const [webhookSent, setWebhookSent] = useState(false);
  const [webhookEnabled, setWebhookEnabled] = useState(false);
  const [signalAlertEnabled, setSignalAlertEnabled] = useState(true);
  const [signalSoundEnabled, setSignalSoundEnabled] = useState(true);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [webhookMinConfidence, setWebhookMinConfidence] = useState(70);
  const [zoneSignalSensitivity, setZoneSignalSensitivity] = useState(1.0);
  const [pre3SimilarityThreshold, setPre3SimilarityThreshold] = useState(1);
  const [pre3ConfirmOnCloseOnly, setPre3ConfirmOnCloseOnly] = useState(true);
  const [majorZoneWidth, setMajorZoneWidth] = useState(1.0);
  const [majorZoneOpacity, setMajorZoneOpacity] = useState(0.24);
  const [majorZoneTouches, setMajorZoneTouches] = useState(2);
  const [trendlineLookback, setTrendlineLookback] = useState(3);
  const [parkfLinRegBaseHex, setParkfLinRegBaseHex] = useState(DEFAULT_PARKF_TRENDLINE_COLORS.linRegBaseHex);
  const [parkfLinRegLargeHex, setParkfLinRegLargeHex] = useState(DEFAULT_PARKF_TRENDLINE_COLORS.linRegLargeHex);
  const [parkfLinRegMediumHex, setParkfLinRegMediumHex] = useState(DEFAULT_PARKF_TRENDLINE_COLORS.linRegMediumHex);
  const [parkfLinRegSmallHex, setParkfLinRegSmallHex] = useState(DEFAULT_PARKF_TRENDLINE_COLORS.linRegSmallHex);
  const [parkfTrendPrimaryHex, setParkfTrendPrimaryHex] = useState(DEFAULT_PARKF_TRENDLINE_COLORS.trendPrimaryHex);
  const [parkfTrendSecondaryHex, setParkfTrendSecondaryHex] = useState(DEFAULT_PARKF_TRENDLINE_COLORS.trendSecondaryHex);
  const [parkfEngineOpts, setParkfEngineOpts] = useState<Partial<ParkfTrendlineOpts>>({});
  const parkfEngineOptsRef = useRef<Partial<ParkfTrendlineOpts>>({});
  const [structureBreakoutRocketWithoutRetest, setStructureBreakoutRocketWithoutRetest] = useState(false);
  const [structurePriceLinesMax, setStructurePriceLinesMax] = useState(8);
  const [favoriteSymbols, setFavoriteSymbols] = useState<string[]>([]);
  const [pageLayout, setPageLayout] = useState<PageLayoutSettings>(() => ({ ...defaultPageLayout }));
  const [swingSeedUsdt, setSwingSeedUsdt] = useState(3000);
  const [virtualTradeSeedUsdt, setVirtualTradeSeedUsdt] = useState(1000);
  const [virtualTradeEnabled, setVirtualTradeEnabled] = useState(true);
  const [virtualTradeSymbols, setVirtualTradeSymbols] = useState<string[]>(['BTCUSDT']);
  const [virtualTradeTimeframes, setVirtualTradeTimeframes] = useState<string[]>(['1m', '5m', '15m', '1h', '4h', '1d', '1w', '1M']);
  const [virtualTradeTargetProfitPct, setVirtualTradeTargetProfitPct] = useState(5);
  const [virtualTradeTpSlMode, setVirtualTradeTpSlMode] = useState<'auto' | 'manual'>('auto');
  const [virtualTradeManualStopPct, setVirtualTradeManualStopPct] = useState(0.88);
  const [virtualTradeManualTp1Pct, setVirtualTradeManualTp1Pct] = useState(1.2);
  const [virtualTradeManualTp2Pct, setVirtualTradeManualTp2Pct] = useState(2.4);
  const [virtualTradeManualTp3Pct, setVirtualTradeManualTp3Pct] = useState(3.6);
  const [virtualTradeRefresh, setVirtualTradeRefresh] = useState(0);
  const [briefingSimilarityThreshold, setBriefingSimilarityThreshold] = useState<number>(() => {
    if (typeof window === 'undefined') return 74;
    try {
      const v = parseInt(window.localStorage.getItem(BRIEFING_SIMILARITY_THRESHOLD_KEY) || '', 10);
      return Number.isFinite(v) ? Math.max(60, Math.min(95, v)) : 74;
    } catch {
      return 74;
    }
  });
  const [briefingSimilarReplayEnabled, setBriefingSimilarReplayEnabled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    try {
      return window.localStorage.getItem(BRIEFING_SIMILAR_REPLAY_KEY) !== '0';
    } catch {
      return true;
    }
  });
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const zoneWidth = parseFloat(window.localStorage.getItem('chart-major-zone-width') || '');
      const zoneOpacity = parseFloat(window.localStorage.getItem('chart-major-zone-opacity') || '');
      const zoneTouches = parseInt(window.localStorage.getItem('chart-major-zone-touches') || '', 10);
      if (!isNaN(zoneWidth)) setMajorZoneWidth(Math.max(0.6, Math.min(2.0, zoneWidth)));
      if (!isNaN(zoneOpacity)) setMajorZoneOpacity(Math.max(0.08, Math.min(0.55, zoneOpacity)));
      if (Number.isFinite(zoneTouches)) setMajorZoneTouches(Math.max(2, Math.min(6, zoneTouches)));
    } catch {}
  }, []);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem('chart-major-zone-width', majorZoneWidth.toFixed(2));
      window.localStorage.setItem('chart-major-zone-opacity', majorZoneOpacity.toFixed(2));
      window.localStorage.setItem('chart-major-zone-touches', String(majorZoneTouches));
      window.localStorage.setItem(BRIEFING_SIMILARITY_THRESHOLD_KEY, String(briefingSimilarityThreshold));
      window.localStorage.setItem(BRIEFING_SIMILAR_REPLAY_KEY, briefingSimilarReplayEnabled ? '1' : '0');
    } catch {}
  }, [majorZoneWidth, majorZoneOpacity, majorZoneTouches, briefingSimilarityThreshold, briefingSimilarReplayEnabled]);
  useEffect(() => {
    const applySettings = (s: ReturnType<typeof loadSettings>) => {
      setWebhookEnabled(s.webhookEnabled);
      setSignalAlertEnabled(s.signalAlertEnabled ?? true);
      setSignalSoundEnabled(s.signalSoundEnabled ?? true);
      setTheme(s.theme);
      setWebhookMinConfidence(s.webhookMinConfidence ?? 70);
      setZoneSignalSensitivity(s.zoneSignalSensitivity ?? 1.0);
      setPre3SimilarityThreshold(
        typeof s.pre3SimilarityThreshold === 'number' && Number.isFinite(s.pre3SimilarityThreshold)
          ? Math.max(0.55, Math.min(1, s.pre3SimilarityThreshold))
          : 1
      );
      setPre3ConfirmOnCloseOnly(s.pre3ConfirmOnCloseOnly !== false);
      setTrendlineLookback(Math.max(2, Math.min(15, Math.round(s.trendlineLookback ?? 3))));
      const d = DEFAULT_PARKF_TRENDLINE_COLORS;
      setParkfLinRegBaseHex(normalizeHex6(s.parkfLinRegBaseHex, d.linRegBaseHex));
      setParkfLinRegLargeHex(normalizeHex6(s.parkfLinRegLargeHex, d.linRegLargeHex));
      setParkfLinRegMediumHex(normalizeHex6(s.parkfLinRegMediumHex, d.linRegMediumHex));
      setParkfLinRegSmallHex(normalizeHex6(s.parkfLinRegSmallHex, d.linRegSmallHex));
      setParkfTrendPrimaryHex(normalizeHex6(s.parkfTrendPrimaryHex, d.trendPrimaryHex));
      setParkfTrendSecondaryHex(normalizeHex6(s.parkfTrendSecondaryHex, d.trendSecondaryHex));
      const po =
        s.parkfEngineOpts && typeof s.parkfEngineOpts === 'object'
          ? ({ ...s.parkfEngineOpts } as Partial<ParkfTrendlineOpts>)
          : {};
      setParkfEngineOpts(po);
      parkfEngineOptsRef.current = po;
      setStructureBreakoutRocketWithoutRetest(s.structureBreakoutRocketWithoutRetest ?? false);
      setStructurePriceLinesMax(Math.max(4, Math.min(12, Math.round(s.structurePriceLinesMax ?? 8))));
      setFavoriteSymbols(s.favoriteSymbols ?? []);
      setSwingSeedUsdt(s.swingSeedUsdt ?? 3000);
      setVirtualTradeSeedUsdt(s.virtualTradeSeedUsdt ?? 1000);
      setVirtualTradeEnabled(s.virtualTradeEnabled ?? true);
      setVirtualTradeSymbols(s.virtualTradeSymbols ?? ['BTCUSDT']);
      setVirtualTradeTimeframes(s.virtualTradeTimeframes ?? ['1m', '5m', '15m', '1h', '4h', '1d', '1w', '1M']);
      setVirtualTradeTargetProfitPct(Math.max(5, Math.min(1000, s.virtualTradeTargetProfitPct ?? 5)));
      setVirtualTradeTpSlMode(s.virtualTradeTpSlMode === 'manual' ? 'manual' : 'auto');
      setVirtualTradeManualStopPct(Math.max(0.1, s.virtualTradeManualStopPct ?? 0.88));
      setVirtualTradeManualTp1Pct(Math.max(0.1, s.virtualTradeManualTp1Pct ?? 1.2));
      setVirtualTradeManualTp2Pct(Math.max(0.1, s.virtualTradeManualTp2Pct ?? 2.4));
      setVirtualTradeManualTp3Pct(Math.max(0.1, s.virtualTradeManualTp3Pct ?? 3.6));
      setPageLayout(mergePageLayout(s.pageLayout));
    };
    applySettings(loadSettings());
    void syncSettingsFromServer().then(applySettings).catch(() => {});
  }, []);
  useEffect(() => {
    hydrateFromServer().then(didHydrate => {
      if (didHydrate) setVirtualTradeRefresh(t => t + 1);
    });
  }, []);
  useVirtualTradeBackground({
    enabled: virtualTradeEnabled,
    symbols: virtualTradeSymbols,
    timeframes: virtualTradeTimeframes,
    seedUsdt: virtualTradeSeedUsdt,
    targetProfitPct: virtualTradeTargetProfitPct,
    tpSlMode: virtualTradeTpSlMode,
    manualStopPct: virtualTradeManualStopPct,
    manualTp1Pct: virtualTradeManualTp1Pct,
    manualTp2Pct: virtualTradeManualTp2Pct,
    manualTp3Pct: virtualTradeManualTp3Pct,
    onRefresh: () => setVirtualTradeRefresh(t => t + 1),
  });
  const virtualTradeCardNode = (
    <VirtualTradeCard
      seedUsdt={virtualTradeSeedUsdt}
      onSeedChange={(v) => { setVirtualTradeSeedUsdt(v); saveSettings({ virtualTradeSeedUsdt: v }); }}
      onSeedBlur={() => saveSettings({ virtualTradeSeedUsdt: virtualTradeSeedUsdt })}
      enabled={virtualTradeEnabled}
      onEnabledChange={(v) => { setVirtualTradeEnabled(v); saveSettings({ virtualTradeEnabled: v }); }}
      symbols={virtualTradeSymbols}
      onSymbolsChange={(v) => { setVirtualTradeSymbols(v); saveSettings({ virtualTradeSymbols: v }); }}
      timeframes={virtualTradeTimeframes}
      onTimeframesChange={(v) => { setVirtualTradeTimeframes(v); saveSettings({ virtualTradeTimeframes: v }); }}
      targetProfitPct={virtualTradeTargetProfitPct}
      onTargetProfitPctChange={(v) => { setVirtualTradeTargetProfitPct(v); saveSettings({ virtualTradeTargetProfitPct: v }); }}
      tpSlMode={virtualTradeTpSlMode}
      onTpSlModeChange={(v) => { setVirtualTradeTpSlMode(v); saveSettings({ virtualTradeTpSlMode: v }); }}
      manualStopPct={virtualTradeManualStopPct}
      onManualStopPctChange={(v) => { setVirtualTradeManualStopPct(v); saveSettings({ virtualTradeManualStopPct: v }); }}
      manualTp1Pct={virtualTradeManualTp1Pct}
      onManualTp1PctChange={(v) => { setVirtualTradeManualTp1Pct(v); saveSettings({ virtualTradeManualTp1Pct: v }); }}
      manualTp2Pct={virtualTradeManualTp2Pct}
      onManualTp2PctChange={(v) => { setVirtualTradeManualTp2Pct(v); saveSettings({ virtualTradeManualTp2Pct: v }); }}
      manualTp3Pct={virtualTradeManualTp3Pct}
      onManualTp3PctChange={(v) => { setVirtualTradeManualTp3Pct(v); saveSettings({ virtualTradeManualTp3Pct: v }); }}
      refreshTrigger={virtualTradeRefresh}
    />
  );
  const toggleFavorite = (s: string) => {
    setFavoriteSymbols(prev => {
      const next = prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s];
      saveSettings({ favoriteSymbols: next });
      return next;
    });
  };
  const symbolList = useMemo(
    () => [...new Set([symbol, ...favoriteSymbols, ...SYMBOLS])],
    [symbol, favoriteSymbols]
  );
  const [symbolSearchQuery, setSymbolSearchQuery] = useState('');
  const [symbolSearchHits, setSymbolSearchHits] = useState<Array<{ symbol: string; base: string }>>([]);
  const [symbolSearchOpen, setSymbolSearchOpen] = useState(false);
  const symbolSearchWrapRef = useRef<HTMLDivElement>(null);
  const symbolSearchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!symbolSearchOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (symbolSearchWrapRef.current && !symbolSearchWrapRef.current.contains(e.target as Node)) {
        setSymbolSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [symbolSearchOpen]);

  useEffect(() => {
    if (symbolSearchDebounceRef.current) clearTimeout(symbolSearchDebounceRef.current);
    const q = symbolSearchQuery.trim();
    if (q.length < 1) {
      setSymbolSearchHits([]);
      return;
    }
    symbolSearchDebounceRef.current = setTimeout(() => {
      symbolSearchDebounceRef.current = null;
      void (async () => {
        try {
          const res = await fetch(
            `/api/symbols/search?q=${encodeURIComponent(q)}&limit=24`,
            { credentials: 'same-origin', cache: 'no-store' }
          );
          const j = (await res.json()) as { ok?: boolean; symbols?: Array<{ symbol: string; base: string }> };
          if (j.ok && Array.isArray(j.symbols)) setSymbolSearchHits(j.symbols);
          else setSymbolSearchHits([]);
        } catch {
          setSymbolSearchHits([]);
        }
      })();
    }, 280);
    return () => {
      if (symbolSearchDebounceRef.current) clearTimeout(symbolSearchDebounceRef.current);
    };
  }, [symbolSearchQuery]);

  const pickSymbolFromSearch = useCallback((next: string) => {
    const u = String(next || '').toUpperCase().trim();
    if (!u) return;
    setSymbol(u);
    setSymbolSearchQuery('');
    setSymbolSearchHits([]);
    setSymbolSearchOpen(false);
  }, []);

  const chartSnapshotRef = useRef<ChartSnapshotRef>(null);
  const [refDetailId, setRefDetailId] = useState<string | null>(null);
  const [patternExpandId, setPatternExpandId] = useState<string | null>(null);
  const [patternStats, setPatternStats] = useState<{ total: number; bullishCount: number; bearishCount: number; topPatternTypes: Array<{ type: string; count: number }> } | null>(null);
  const [triggerChatMessage, setTriggerChatMessage] = useState('');
  const [chartExplainLoading, setChartExplainLoading] = useState(false);
  const [chartExplainText, setChartExplainText] = useState<string | null>(null);
  const [chartExplainCandleTime, setChartExplainCandleTime] = useState<string | null>(null);
  const lastExplainKeyRef = useRef<string | null>(null);
  const explainDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chartExplainTextRef = useRef<string | null>(null);
  const aiFusionNarrateKeyRef = useRef<string>('');
  const [lastExplainRequest, setLastExplainRequest] = useState<ChartExplainRequest | null>(null);
  const [balance, setBalance] = useState(10000);
  const [riskPercent, setRiskPercent] = useState(1);
  const [structureAlerts, setStructureAlerts] = useState<Array<{ id: string; message: string; at: number }>>([]);
  const strategies = generateStrategies();
  type RightPanelTab = 'trade' | 'market' | 'briefing' | 'pattern' | 'ref' | 'etc' | 'learning' | 'virtual' | 'candle';
  const [rightPanelTab, setRightPanelTab] = useState<RightPanelTab>('trade');
  const [uiMode, setUiMode] = useState<UIMode>('AI_ZONE');
  /** 마운트 시 마지막으로 쓴 상단 모드(고래/합성/AI) 복원 — 서버 HTML은 AI로 맞춰 하이드레이션·첫 요청이 일치 */
  useEffect(() => {
    setUiMode(readStoredRailUiMode());
  }, []);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(RAIL_UI_MODE_STORAGE_KEY, uiMode);
    } catch {
      /* ignore */
    }
  }, [uiMode]);
  /** 고래 모드「세트반등」칩·패널이 설정 저장 후 즉시 반영되도록 */
  const [whaleStructureBounceUiTick, setWhaleStructureBounceUiTick] = useState(0);
  /** 최강분석: 우측 AI·트레이드 패널을 잠시 접어 TV처럼 차트만 넓게 */
  const [maxAnalysisWideChart, setMaxAnalysisWideChart] = useState(false);
  const [panelFeatures, setPanelFeatures] = useState({
    unifiedGraph: true,
    signalBox: true,
    executionBriefing: true,
    focusOverlay: true,
    learningCard: true,
    virtualCard: true,
    candleCompareCard: true,
  });
  /** 사이트 로그인(쿠키) — API 미들웨어와 동기 */
  const [siteAuth, setSiteAuth] = useState<'loading' | 'anon' | 'authed'>('loading');
  const visitor = useVisitorCount();
  const [siteUser, setSiteUser] = useState<string>('');
  const timeframeRef = useRef(timeframe);
  const analyzeAbortRef = useRef<AbortController | null>(null);
  const analyzeSeqRef = useRef(0);
  const loadDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const analyzeInFlightRef = useRef(false);
  const analysisCacheRef = useRef<Map<string, AnalyzeResponse>>(new Map());
  const decorateAnalysisWithSimilarReplay = useCallback((raw: AnalyzeResponse): AnalyzeResponse => {
    const similar = (raw as any).similarBriefing as AnalyzeResponse['similarBriefing'];
    if (!similar || !briefingSimilarReplayEnabled) return raw;
    if ((similar.similarity ?? 0) < briefingSimilarityThreshold || !similar.wavePath) return raw;
    const wp = similar.wavePath;
    const c = wp.useShort ? 'rgba(239,68,68,0.95)' : 'rgba(34,197,94,0.95)';
    const y = (p: number) => {
      const min = Math.min(wp.preAnchor, wp.w1, wp.w2, wp.w3);
      const max = Math.max(wp.preAnchor, wp.w1, wp.w2, wp.w3);
      const range = Math.max(1e-9, max - min);
      return (max - p) / range;
    };
    const xa = [0.90, 0.945, 0.982, 0.996];
    const replayOverlays: any[] = [
      { id: 'sim-replay-1', kind: 'scenario', label: `유사 재작도 ${similar.similarity}%`, x1: xa[0], y1: y(wp.preAnchor), x2: xa[1], y2: y(wp.w1), price1: wp.preAnchor, price2: wp.w1, confidence: wp.confidence, color: c, category: 'scenario' },
      { id: 'sim-replay-2', kind: 'scenario', label: '', x1: xa[1], y1: y(wp.w1), x2: xa[2], y2: y(wp.w2), price1: wp.w1, price2: wp.w2, confidence: wp.confidence, color: c, category: 'scenario' },
      { id: 'sim-replay-3', kind: 'scenario', label: '', x1: xa[2], y1: y(wp.w2), x2: xa[3], y2: y(wp.w3), price1: wp.w2, price2: wp.w3, confidence: wp.confidence, color: c, category: 'scenario' },
      { id: 'sim-replay-target', kind: 'keyLevel', label: `유사 도착가 ${Math.round(wp.w3).toLocaleString()}`, x1: xa[2], y1: y(wp.w3), x2: 0.998, y2: y(wp.w3), price1: wp.w3, price2: wp.w3, confidence: wp.confidence, color: c, category: 'keyLevel' },
    ];
    const filtered = (raw.overlays || []).filter((o: any) => !String(o.id || '').startsWith('sim-replay-'));
    return { ...raw, overlays: [...filtered, ...replayOverlays] };
  }, [briefingSimilarityThreshold, briefingSimilarReplayEnabled]);
  useEffect(() => { timeframeRef.current = timeframe; }, [timeframe]);
  /** 핫존 1D+1W 듀얼: 차트별 TF는 고정, 부모 timeframe 상태와 분리 */
  const noopSetTimeframeHotZoneDual = useCallback((_tf: string) => {}, []);
  const isExecutionLikeMode =
    uiMode === 'WHALE' ||
    uiMode === 'EXECUTION' ||
    uiMode === 'SMART' ||
    uiMode === 'MAX_ANALYSIS' ||
    uiMode === 'SMC_DESK' ||
    uiMode === 'SMC_DESK_COMPOSITE' ||
    uiMode === 'SMC_DELTA_DESK' ||
    uiMode === 'SMART_MONEY_MVP' ||
    uiMode === 'UNIFIED_DESK' ||
    uiMode === 'AI_ZONE' ||
    uiMode === 'TAPPOINT' ||
    uiMode === 'HOT_ZONE';
  const isTapMode = uiMode === 'TAPPOINT';
  useEffect(() => {
    if (isExecutionLikeMode) setRightPanelTab('trade');
  }, [isExecutionLikeMode]);
  useEffect(() => {
    if (uiMode === 'UNIFIED_DESK' || uiMode === 'AI_ZONE') setMaxAnalysisWideChart(false);
    else if (
      uiMode !== 'MAX_ANALYSIS' &&
      uiMode !== 'SMC_DESK' &&
      uiMode !== 'SMC_DESK_COMPOSITE' &&
      uiMode !== 'SMC_DELTA_DESK' &&
      uiMode !== 'SMART_MONEY_MVP'
    )
      setMaxAnalysisWideChart(false);
  }, [uiMode]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    saveSettings({ theme });
  }, [theme]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem('ailongshort-panel-features-v1');
      if (!raw) return;
      const parsed = JSON.parse(raw);
      setPanelFeatures((prev) => ({ ...prev, ...(parsed || {}) }));
    } catch {}
  }, []);
  const updatePanelFeature = useCallback((key: keyof typeof panelFeatures, value: boolean) => {
    setPanelFeatures((prev) => {
      const next = { ...prev, [key]: value };
      try {
        window.localStorage.setItem('ailongshort-panel-features-v1', JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);
  const setAllPanelFeatures = useCallback((value: boolean) => {
    const next = {
      unifiedGraph: value,
      signalBox: value,
      executionBriefing: value,
      focusOverlay: value,
      learningCard: value,
      virtualCard: value,
      candleCompareCard: value,
    };
    setPanelFeatures(next);
    try {
      window.localStorage.setItem('ailongshort-panel-features-v1', JSON.stringify(next));
    } catch {}
  }, []);

  const [persistedSignal, setPersistedSignal] = useState<PersistedSignal | null>(null);
  const lastConfirmedNotifyKeyRef = useRef<string | null>(null);
  const lastConfirmedSoundKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const raw = window.localStorage.getItem('ai-step12-history');
    if (raw) { try { setHistory(JSON.parse(raw)); } catch {} }
  }, []);

  useEffect(() => {
    const raw = window.localStorage.getItem(PERSISTED_SIGNAL_KEY);
    if (raw) { try { setPersistedSignal(JSON.parse(raw)); } catch {} }
  }, []);

  useEffect(() => {
    fetch('/api/auth/session', { cache: 'no-store', credentials: 'same-origin' })
      .then(r => r.json())
      .then((d: { authenticated?: boolean; user?: string }) => {
        setSiteAuth(d.authenticated ? 'authed' : 'anon');
        setSiteUser(d.user || '');
      })
      .catch(() => setSiteAuth('anon'));
  }, []);

  useEffect(() => {
    if (siteAuth !== 'authed') return;
    fetch('/api/pattern-stats', { cache: 'no-store', credentials: 'same-origin' }).then(r => r.ok ? r.json() : null).then(setPatternStats).catch(() => setPatternStats(null));
  }, [analysis?.learnedPatternsTop5, siteAuth]);

  const load = useCallback(async (overrideTf?: string, fastMode = false) => {
    const requestedTf = overrideTf ?? timeframe;
    const pfK = parkfColorsCacheKey(
      parkfLinRegBaseHex,
      parkfLinRegLargeHex,
      parkfLinRegMediumHex,
      parkfLinRegSmallHex,
      parkfTrendPrimaryHex,
      parkfTrendSecondaryHex,
    );
    const pfQ = parkfColorsQuery(
      parkfLinRegBaseHex,
      parkfLinRegLargeHex,
      parkfLinRegMediumHex,
      parkfLinRegSmallHex,
      parkfTrendPrimaryHex,
      parkfTrendSecondaryHex,
    );
    const pfe = parkfEngineOptsRef.current;
    const pfEngineSeg = parkfEngineOptsCacheSegment(pfe);
    const pfEngineQ = parkfEngineOptsToQueryDiff(pfe);
    const sAi = loadSettings();
    const aiAvg = sAi.aiCompressionAvgRangeAtr ?? defaultSettings.aiCompressionAvgRangeAtr;
    const aiMax = sAi.aiCompressionMaxRangeAtr ?? defaultSettings.aiCompressionMaxRangeAtr;
    const aiImpR = sAi.aiImpulseRangeAtr ?? defaultSettings.aiImpulseRangeAtr;
    const aiImpB = sAi.aiImpulseBodyAtr ?? defaultSettings.aiImpulseBodyAtr;
    const aiVol = sAi.aiCompressionVolumeFilter === true ? 1 : 0;
    const aiSeg = `ai${aiAvg.toFixed(2)}${aiMax.toFixed(2)}${aiImpR.toFixed(2)}${aiImpB.toFixed(2)}v${aiVol}`;
    const amx =
      uiMode === 'WHALE' ||
      uiMode === 'MAX_ANALYSIS' ||
      uiMode === 'SMC_DESK' ||
      uiMode === 'SMC_DESK_COMPOSITE' ||
      uiMode === 'SMC_DELTA_DESK' ||
      uiMode === 'SMART_MONEY_MVP' ||
      uiMode === 'UNIFIED_DESK' ||
      uiMode === 'AI_ZONE' ||
      uiMode === 'BIBLE_MODE' ||
      uiMode === 'HOT_ZONE'
        ? 1
        : 0;
    const effCp = getEffectiveFeatureToggles(sAi, uiMode);
    const cpVolBg = effCp.chartPrimeTrendChannelsVolumeBg === true ? 1 : 0;
    const cpLen = Math.max(2, Math.min(30, Math.round(Number(sAi.chartPrimeTrendChannelsLength) || 8)));
    const cpAuto = sAi.chartPrimeTrendChannelsAutoLength !== false ? 1 : 0;
    const cpWait = sAi.chartPrimeTrendChannelsWait !== false ? 1 : 0;
    const cpExt = sAi.chartPrimeTrendChannelsExtend === true ? 1 : 0;
    const cpShowLast = sAi.chartPrimeTrendChannelsShowLastOnly !== false ? 1 : 0;
    const cpFill = sAi.chartPrimeTrendChannelsShowFills !== false ? 1 : 0;
    const cpTop = normalizeHex6(sAi.chartPrimeTrendChannelsTopHex, defaultSettings.chartPrimeTrendChannelsTopHex).replace(/^#/, '');
    const cpCtr = normalizeHex6(sAi.chartPrimeTrendChannelsCenterHex, defaultSettings.chartPrimeTrendChannelsCenterHex).replace(/^#/, '');
    const cpBot = normalizeHex6(sAi.chartPrimeTrendChannelsBottomHex, defaultSettings.chartPrimeTrendChannelsBottomHex).replace(/^#/, '');
    const cpW = effectiveChartPrimeChannelWidthScale(sAi);
    const ddF = sAi.chartDepthDeltaRegimeFilter === false ? 0 : 1;
    const ddW = sAi.chartDepthDeltaAlignmentWeight === false ? 0 : 1;
    const ddT = sAi.chartDepthDeltaTpAdaptive === false ? 0 : 1;
    const cpSeg = `${cpLen}a${cpAuto}w${cpWait}e${cpExt}s${cpShowLast}v${cpVolBg}f${cpFill}c${cpTop}${cpCtr}${cpBot}W${cpW.toFixed(4)}d${ddF}${ddW}${ddT}`;
    const cacheKey = `${symbol}|${requestedTf}|${zoneSignalSensitivity.toFixed(2)}|${majorZoneWidth.toFixed(2)}|${majorZoneOpacity.toFixed(2)}|${majorZoneTouches}|sb${structureBreakoutRocketWithoutRetest ? 1 : 0}|tl${trendlineLookback}|p3${pre3SimilarityThreshold.toFixed(3)}|p3c${pre3ConfirmOnCloseOnly ? 1 : 0}|pf${pfK}|pfe${pfEngineSeg}|${aiSeg}|amx${amx}|cp${cpSeg}`;
    const seq = ++analyzeSeqRef.current;
    analyzeInFlightRef.current = true;
    analyzeAbortRef.current?.abort();
    const controller = new AbortController();
    analyzeAbortRef.current = controller;
    setLoading(true);
    setError(null);

    const analyzeUrl = (collect: number) =>
      `/api/analyze?symbol=${symbol}&timeframe=${encodeURIComponent(requestedTf)}&collect=${collect}&zoneSensitivity=${encodeURIComponent(zoneSignalSensitivity.toFixed(2))}&majorZoneWidth=${encodeURIComponent(majorZoneWidth.toFixed(2))}&majorZoneOpacity=${encodeURIComponent(majorZoneOpacity.toFixed(2))}&majorZoneTouches=${encodeURIComponent(String(majorZoneTouches))}&structureBreakout=${structureBreakoutRocketWithoutRetest ? 1 : 0}&trendlineLookback=${encodeURIComponent(String(trendlineLookback))}&pre3Sim=${encodeURIComponent(pre3SimilarityThreshold.toFixed(3))}&pre3Close=${pre3ConfirmOnCloseOnly ? 1 : 0}&aiAvg=${encodeURIComponent(aiAvg.toFixed(2))}&aiMax=${encodeURIComponent(aiMax.toFixed(2))}&aiImpR=${encodeURIComponent(aiImpR.toFixed(2))}&aiImpB=${encodeURIComponent(aiImpB.toFixed(2))}&aiVol=${aiVol}${amx ? '&amx=1' : ''}&cpLen=${cpLen}&cpAuto=${cpAuto}&cpWait=${cpWait}&cpExt=${cpExt}&cpShowLast=${cpShowLast}&cpFill=${cpFill}&cpTop=${cpTop}&cpCtr=${cpCtr}&cpBot=${cpBot}&cpW=${encodeURIComponent(cpW.toFixed(4))}&ddF=${ddF}&ddW=${ddW}&ddT=${ddT}${cpVolBg ? '&cpVolBg=1' : ''}${pfQ}${pfEngineQ}`;

    const parseAnalyzeJson = async (res: Response) => {
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        return await res.json();
      }
      await res.text();
      throw new Error(res.ok ? '서버가 JSON이 아닌 응답을 반환했습니다.' : `서버 오류 (${res.status}). API 경로를 확인하세요.`);
    };

    const applyAnalyzeResult = (data: any, skipHistory: boolean, seqForGuard: number) => {
      if (analyzeSeqRef.current !== seqForGuard) return;
      if (timeframeRef.current !== requestedTf) return;
      if (data?.engine) {
        queueMicrotask(() => {
          void (async () => {
            try {
              const { matchTopReferences } = await import('@/lib/referenceMatcherAdvanced');
              const topReferences = matchTopReferences(data.engine, 3);
              if (analyzeSeqRef.current !== seqForGuard) return;
              setAnalysis((prev) => (prev && prev.symbol === data.symbol && prev.timeframe === (data.timeframe ?? requestedTf) ? { ...prev, topReferences } : prev));
            } catch {}
          })();
        });
      }
      data.timeframe = data.timeframe ?? requestedTf;
      analysisCacheRef.current.set(cacheKey, data);
      setAnalysis(decorateAnalysisWithSimilarReplay(data));
      if ((data.verdict === 'LONG' || data.verdict === 'SHORT') && (data.confidence ?? 0) >= MIN_CONFIDENCE_PERSIST) {
        const ps: PersistedSignal = { symbol: data.symbol ?? symbol, timeframe: data.timeframe ?? requestedTf, verdict: data.verdict, confidence: data.confidence ?? 0, at: new Date().toISOString() };
        setPersistedSignal(ps);
        try { window.localStorage.setItem(PERSISTED_SIGNAL_KEY, JSON.stringify(ps)); } catch {}
      }
      const queue = pushStructureAlertsFromAnalysis(data.dominantPattern ?? null);
      setStructureAlerts(queue);
      if (!skipHistory) {
        setHistory((prev) => {
          const next = [{ symbol, timeframe, verdict: data.verdict, confidence: data.confidence, at: new Date().toLocaleTimeString('ko-KR', { hour12: false }), summary: data.summary }, ...prev].slice(0, 20);
          window.localStorage.setItem('ai-step12-history', JSON.stringify(next));
          return next;
        });
        setWebhookSent(false);
      }
    };

    try {
      if (fastMode) {
        const res = await fetchWithRetry(analyzeUrl(0), { cache: 'no-store', credentials: 'same-origin', signal: controller.signal }, ANALYZE_FETCH_RETRIES, ANALYZE_FETCH_RETRY_DELAY_MS);
        const data = await parseAnalyzeJson(res);
        if (!res.ok) throw new Error(data.error || data.summary || '분석 실패');
        if (controller.signal.aborted || seq !== analyzeSeqRef.current) return;
        if (timeframeRef.current !== requestedTf) return;
        applyAnalyzeResult(data, false, seq);
        return;
      }

      /** 전체 분석: 먼저 collect=0으로 오버레이·엔진을 빠르게 표시한 뒤 collect=1로 호가·체결 등 보강 */
      let fastRes: Response | null = null;
      try {
        fastRes = await fetchWithRetry(analyzeUrl(0), { cache: 'no-store', credentials: 'same-origin', signal: controller.signal }, ANALYZE_FETCH_RETRIES, ANALYZE_FETCH_RETRY_DELAY_MS);
      } catch {
        fastRes = null;
      }
      if (fastRes?.ok) {
        const dataFast = await parseAnalyzeJson(fastRes);
        if (!dataFast?.error && !controller.signal.aborted && seq === analyzeSeqRef.current && timeframeRef.current === requestedTf) {
          applyAnalyzeResult(dataFast, false, seq);
          const bgSeq = seq;
          void (async () => {
            try {
              const resFull = await fetchWithRetry(analyzeUrl(1), { cache: 'no-store', credentials: 'same-origin' }, ANALYZE_FETCH_RETRIES, 280);
              if (!resFull.ok) return;
              const dataFull = await parseAnalyzeJson(resFull);
              if (dataFull?.error) return;
              applyAnalyzeResult(dataFull, true, bgSeq);
            } catch {
              /* 보강 실패 시에도 빠른 분석 결과는 유지 */
            }
          })();
          return;
        }
      }

      const res = await fetchWithRetry(analyzeUrl(1), { cache: 'no-store', credentials: 'same-origin', signal: controller.signal }, ANALYZE_FETCH_RETRIES, ANALYZE_FETCH_RETRY_DELAY_MS);
      const data = await parseAnalyzeJson(res);
      if (!res.ok) throw new Error(data.error || data.summary || '분석 실패');
      if (controller.signal.aborted || seq !== analyzeSeqRef.current) return;
      if (timeframeRef.current !== requestedTf) return;
      applyAnalyzeResult(data, false, seq);
    } catch (e: any) {
      if (controller.signal.aborted || e?.name === 'AbortError') return;
      const msg = e?.message || '';
      if (msg.includes('Unexpected token') || msg.includes('<!DOCTYPE') || msg.includes('is not valid JSON')) {
        setError('서버가 HTML을 반환했습니다. 개발 서버가 실행 중인지, /api/analyze 경로가 정상인지 확인하세요.');
      } else {
        setError(msg || '연결 오류');
      }
    } finally {
      analyzeInFlightRef.current = false;
      if (seq === analyzeSeqRef.current) setLoading(false);
    }
  }, [
    symbol,
    timeframe,
    zoneSignalSensitivity,
    pre3SimilarityThreshold,
    pre3ConfirmOnCloseOnly,
    majorZoneWidth,
    majorZoneOpacity,
    majorZoneTouches,
    structureBreakoutRocketWithoutRetest,
    trendlineLookback,
    parkfLinRegBaseHex,
    parkfLinRegLargeHex,
    parkfLinRegMediumHex,
    parkfLinRegSmallHex,
    parkfTrendPrimaryHex,
    parkfTrendSecondaryHex,
    decorateAnalysisWithSimilarReplay,
    uiMode,
  ]);

  /** 차트가 먼저 /api/market 응답하도록 서버·캐시 워밍 (ChartView 요청과 중복되어도 in-flight 병합) */
  const prefetchMarketCandles = useCallback((tf: string) => {
    if (typeof window === 'undefined') return;
    void fetch(`/api/market?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(tf)}`, {
      credentials: 'same-origin',
      cache: 'no-store',
    }).catch(() => {});
  }, [symbol]);

  const requestLoad = useCallback((overrideTf?: string) => {
    // background poll should not interrupt a running analyze request
    if (overrideTf == null && analyzeInFlightRef.current) return;
    const requestedTf = overrideTf ?? timeframe;
    const pfK = parkfColorsCacheKey(
      parkfLinRegBaseHex,
      parkfLinRegLargeHex,
      parkfLinRegMediumHex,
      parkfLinRegSmallHex,
      parkfTrendPrimaryHex,
      parkfTrendSecondaryHex,
    );
    const pfeRl = parkfEngineOptsRef.current;
    const pfEngineSegRl = parkfEngineOptsCacheSegment(pfeRl);
    const sAiRl = loadSettings();
    const aiAvgRl = sAiRl.aiCompressionAvgRangeAtr ?? defaultSettings.aiCompressionAvgRangeAtr;
    const aiMaxRl = sAiRl.aiCompressionMaxRangeAtr ?? defaultSettings.aiCompressionMaxRangeAtr;
    const aiImpRRl = sAiRl.aiImpulseRangeAtr ?? defaultSettings.aiImpulseRangeAtr;
    const aiImpBRl = sAiRl.aiImpulseBodyAtr ?? defaultSettings.aiImpulseBodyAtr;
    const aiVolRl = sAiRl.aiCompressionVolumeFilter === true ? 1 : 0;
    const aiSegRl = `ai${aiAvgRl.toFixed(2)}${aiMaxRl.toFixed(2)}${aiImpRRl.toFixed(2)}${aiImpBRl.toFixed(2)}v${aiVolRl}`;
    const amxRl =
      uiMode === 'WHALE' ||
      uiMode === 'MAX_ANALYSIS' ||
      uiMode === 'SMC_DESK' ||
      uiMode === 'SMC_DESK_COMPOSITE' ||
      uiMode === 'SMC_DELTA_DESK' ||
      uiMode === 'SMART_MONEY_MVP' ||
      uiMode === 'UNIFIED_DESK' ||
      uiMode === 'AI_ZONE' ||
      uiMode === 'BIBLE_MODE' ||
      uiMode === 'HOT_ZONE'
        ? 1
        : 0;
    const effCpRl = getEffectiveFeatureToggles(sAiRl, uiMode);
    const cpVolBgRl = effCpRl.chartPrimeTrendChannelsVolumeBg === true ? 1 : 0;
    const cpLenRl = Math.max(2, Math.min(30, Math.round(Number(sAiRl.chartPrimeTrendChannelsLength) || 8)));
    const cpAutoRl = sAiRl.chartPrimeTrendChannelsAutoLength !== false ? 1 : 0;
    const cpWaitRl = sAiRl.chartPrimeTrendChannelsWait !== false ? 1 : 0;
    const cpExtRl = sAiRl.chartPrimeTrendChannelsExtend === true ? 1 : 0;
    const cpShowLastRl = sAiRl.chartPrimeTrendChannelsShowLastOnly !== false ? 1 : 0;
    const cpFillRl = sAiRl.chartPrimeTrendChannelsShowFills !== false ? 1 : 0;
    const cpTopRl = normalizeHex6(sAiRl.chartPrimeTrendChannelsTopHex, defaultSettings.chartPrimeTrendChannelsTopHex).replace(/^#/, '');
    const cpCtrRl = normalizeHex6(sAiRl.chartPrimeTrendChannelsCenterHex, defaultSettings.chartPrimeTrendChannelsCenterHex).replace(/^#/, '');
    const cpBotRl = normalizeHex6(sAiRl.chartPrimeTrendChannelsBottomHex, defaultSettings.chartPrimeTrendChannelsBottomHex).replace(/^#/, '');
    const cpWRl = effectiveChartPrimeChannelWidthScale(sAiRl);
    const ddFRl = sAiRl.chartDepthDeltaRegimeFilter === false ? 0 : 1;
    const ddWRl = sAiRl.chartDepthDeltaAlignmentWeight === false ? 0 : 1;
    const ddTRl = sAiRl.chartDepthDeltaTpAdaptive === false ? 0 : 1;
    const cpSegRl = `${cpLenRl}a${cpAutoRl}w${cpWaitRl}e${cpExtRl}s${cpShowLastRl}v${cpVolBgRl}f${cpFillRl}c${cpTopRl}${cpCtrRl}${cpBotRl}W${cpWRl.toFixed(4)}d${ddFRl}${ddWRl}${ddTRl}`;
    const cacheKey = `${symbol}|${requestedTf}|${zoneSignalSensitivity.toFixed(2)}|${majorZoneWidth.toFixed(2)}|${majorZoneOpacity.toFixed(2)}|${majorZoneTouches}|sb${structureBreakoutRocketWithoutRetest ? 1 : 0}|tl${trendlineLookback}|p3${pre3SimilarityThreshold.toFixed(3)}|p3c${pre3ConfirmOnCloseOnly ? 1 : 0}|pf${pfK}|pfe${pfEngineSegRl}|${aiSegRl}|amx${amxRl}|cp${cpSegRl}`;
    const cached = analysisCacheRef.current.get(cacheKey);
    if (overrideTf && cached) {
      setAnalysis(decorateAnalysisWithSimilarReplay(cached));
      setLoading(false);
      setError(null);
    }
    if (loadDebounceRef.current) clearTimeout(loadDebounceRef.current);
    /** 분·시·일·주·달 클릭 시 캔들+분석이 바로 나가도록 지연 없음 (자동 폴링만 80ms) */
    const debounceMs = overrideTf != null ? 0 : 80;
    loadDebounceRef.current = setTimeout(() => {
      loadDebounceRef.current = null;
      void load(overrideTf ?? timeframe, false);
    }, debounceMs);
  }, [
    load,
    symbol,
    timeframe,
    zoneSignalSensitivity,
    pre3SimilarityThreshold,
    pre3ConfirmOnCloseOnly,
    majorZoneWidth,
    majorZoneOpacity,
    majorZoneTouches,
    structureBreakoutRocketWithoutRetest,
    trendlineLookback,
    parkfLinRegBaseHex,
    parkfLinRegLargeHex,
    parkfLinRegMediumHex,
    parkfLinRegSmallHex,
    parkfTrendPrimaryHex,
    parkfTrendSecondaryHex,
    uiMode,
  ]);

  const handleUiModeChange = useCallback(
    (m: UIMode | string) => {
      const raw = String(m ?? '').trim();
      const upper = raw.toUpperCase();
      const normalized =
        raw === 'AI존' ||
        raw === 'AI분석' ||
        upper === 'AI_ZONE' ||
        upper === 'AI ZONE' ||
        upper === 'AI_ANALYSIS' ||
        raw === 'AI 분석'
          ? 'AI_ZONE'
          : raw;
      const nextMode: UIMode = normalized === 'WHALE' ? 'WHALE' : normalized === 'AI_ZONE' ? 'AI_ZONE' : 'UNIFIED_DESK';
      setUiMode(nextMode);
      requestLoad();
    },
    [requestLoad]
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onSettings = () => requestLoad();
    window.addEventListener(SETTINGS_CHANGED_EVENT, onSettings);
    return () => window.removeEventListener(SETTINGS_CHANGED_EVENT, onSettings);
  }, [requestLoad]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const bump = () => setWhaleStructureBounceUiTick((t) => t + 1);
    window.addEventListener(SETTINGS_CHANGED_EVENT, bump);
    return () => window.removeEventListener(SETTINGS_CHANGED_EVENT, bump);
  }, []);

  const toggleWhaleStructureBounce = useCallback(() => {
    if (uiMode !== 'WHALE' && uiMode !== 'AI_ZONE') return;
    const s = loadSettings();
    const eff = getEffectiveFeatureToggles(s, uiMode) as { whaleStructureBounceEnabled?: boolean };
    const next = !(eff.whaleStructureBounceEnabled === true);
    saveSettings({
      ...s,
      modeFeatureOverrides: {
        ...s.modeFeatureOverrides,
        [uiMode]: { ...(s.modeFeatureOverrides?.[uiMode] || {}), whaleStructureBounceEnabled: next },
      },
    });
  }, [uiMode]);

  const whaleStructureBounceUi = useMemo(() => {
    void whaleStructureBounceUiTick;
    if (uiMode !== 'WHALE' && uiMode !== 'AI_ZONE') {
      return { enabled: false as const, path: null as AnalyzeResponse['structureBouncePath'] };
    }
    const eff = getEffectiveFeatureToggles(loadSettings(), uiMode) as { whaleStructureBounceEnabled?: boolean };
    return { enabled: eff.whaleStructureBounceEnabled === true, path: analysis?.structureBouncePath ?? null };
  }, [uiMode, analysis, whaleStructureBounceUiTick]);

  const commitParkfEnginePatch = useCallback(
    (patch: Partial<ParkfTrendlineOpts>) => {
      const next: Partial<ParkfTrendlineOpts> = { ...parkfEngineOptsRef.current, ...patch };
      const d = DEFAULT_PARKF_TRENDLINE_OPTS;
      for (const k of Object.keys(next) as (keyof ParkfTrendlineOpts)[]) {
        if (k === 'colors') {
          delete next.colors;
          continue;
        }
        if (next[k] === d[k]) {
          delete next[k];
        }
      }
      parkfEngineOptsRef.current = next;
      setParkfEngineOpts(next);
      saveSettings({ parkfEngineOpts: Object.keys(next).length ? next : undefined });
      requestLoad();
    },
    [requestLoad]
  );

  const parkfEngineDisplay = useMemo(() => {
    const tlLb = trendlineLookback;
    const computedPri = Math.max(15, Math.min(32, 9 + tlLb * 3));
    const computedSec = Math.max(6, Math.min(14, 3 + tlLb * 2));
    const base = { ...DEFAULT_PARKF_TRENDLINE_OPTS, ...parkfEngineOpts };
    return {
      ...base,
      primaryPivotLen: parkfEngineOpts.primaryPivotLen ?? computedPri,
      secondaryPivotLen: parkfEngineOpts.secondaryPivotLen ?? computedSec,
    };
  }, [parkfEngineOpts, trendlineLookback]);

  const analysisReadyForCurrentTf = analysisMatchesSymbolAndTf(analysis, symbol, timeframe);

  useEffect(() => {
    if (!analysis) {
      setMultiResults([]);
      setMtfSignals([]);
      return;
    }
    // 멀티 심볼 칩: 고정 메이저 N종 스캔 대신, 현재 선택·검색 중인 심볼의 메인 분석 결과만 반영 (중복 analyze 방지)
    if (analysis.symbol !== symbol) {
      setMultiResults([]);
      return;
    }
    setMultiResults([
      { symbol: analysis.symbol, verdict: analysis.verdict || 'WATCH', confidence: analysis.confidence ?? 50 },
    ]);
  }, [analysis, symbol]);

  const runBacktest = useCallback(async () => {
    setBacktestLoading(true);
    try {
      const res = await fetchWithRetry(`/api/backtest?symbol=${symbol}&timeframe=${timeframe}`, { cache: 'no-store', credentials: 'same-origin' });
      const data = await res.json();
      if (data.ok) setBacktest({ winRate: data.winRate, totalPnlPct: data.totalPnlPct, totalTrades: data.totalTrades });
    } finally {
      setBacktestLoading(false);
    }
  }, [symbol, timeframe]);

  const sendWebhook = useCallback(async () => {
    if (!analysis) return;
    try {
      const res = await fetch('/api/webhook', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verdict: analysis.verdict, symbol: analysis.symbol, timeframe: analysis.timeframe, confidence: analysis.confidence, entry: analysis.entry, stopLoss: analysis.stopLoss, targets: analysis.targets }),
      });
      const data = await res.json();
      if (data.ok) setWebhookSent(true);
    } catch {}
  }, [analysis]);

  const saveCurrentPattern = useCallback(async () => {
    if (!analysis) return;
    try {
      const res = await fetch('/api/pattern-save', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analysis }),
      });
      const data = await res.json();
      if (data.ok) { load(); fetch('/api/pattern-stats', { cache: 'no-store', credentials: 'same-origin' }).then(r => r.ok ? r.json() : null).then(setPatternStats); }
    } catch {}
  }, [analysis, load]);

  const requestChartExplain = useCallback(async (data: ChartExplainRequest) => {
    const key = `${data.symbol}|${data.timeframe}|${data.candleData.candleIndex}|${data.patternId ?? ''}`;
    if (lastExplainKeyRef.current === key && chartExplainTextRef.current != null) return;
    setLastExplainRequest(data);
    lastExplainKeyRef.current = key;
    setChartExplainLoading(true);
    setChartExplainText(null);
    chartExplainTextRef.current = null;
    setChartExplainCandleTime(data.patternId ? '패턴 설명' : new Date(data.candleData.timestamp * 1000).toLocaleString('ko-KR'));
    try {
      const payload = {
        ...data,
        ...(analysis ? { detectedVisionPatterns: analysis.detectedVisionPatterns, dominantPattern: analysis.dominantPattern, patternVisionSummary: analysis.patternVisionSummary } : {}),
      };
      const res = await fetch('/api/chart-explain', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...payload,
          openaiApiKey: getStoredOpenAIKey() || undefined,
          briefingLogin: {
            user: getStoredBriefingUser().trim(),
            password: getStoredBriefingPassword(),
          },
        }),
      });
      const json = await res.json();
      const usage = json.usage as { estimatedCost?: number } | undefined;
      if (usage?.estimatedCost && usage.estimatedCost > 0) addEstimatedCostUsd(usage.estimatedCost);
      const text = res.ok && json.explanation ? json.explanation.slice(0, 500) : (json.error || '설명을 불러오지 못했습니다.');
      chartExplainTextRef.current = text;
      setChartExplainText(text);
    } catch {
      chartExplainTextRef.current = '요청 실패';
      setChartExplainText('요청 실패');
    } finally {
      setChartExplainLoading(false);
    }
  }, [analysis]);

  const handleChartPointClick = useCallback((data: ChartExplainRequest) => {
    if (explainDebounceRef.current) clearTimeout(explainDebounceRef.current);
    explainDebounceRef.current = setTimeout(() => {
      explainDebounceRef.current = null;
      requestChartExplain(data);
    }, 500);
  }, [requestChartExplain]);

  const requestChartExplainAgain = useCallback(() => {
    if (lastExplainRequest) requestChartExplain(lastExplainRequest);
  }, [lastExplainRequest, requestChartExplain]);

  useEffect(() => {
    if (siteAuth !== 'authed') return;
    requestLoad();
    const timer = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      requestLoad();
    }, 45_000);
    return () => window.clearInterval(timer);
  }, [requestLoad, siteAuth]);

  /** AI 종합 신호: 규칙 기반 narrative를 Gemini로 자연스러운 한글 1~2문장으로 보강 */
  useEffect(() => {
    if (siteAuth !== 'authed') return;
    const a = analysis;
    if (!a?.aiFusionSignal || !a.symbol || !a.timeframe) return;
    const f = a.aiFusionSignal;
    if (f.narrativeLlm) return;
    const dedupeKey = `${a.symbol}|${a.timeframe}|${f.verdict}|${f.tier}|${f.confidence}|${f.reasonCodes.join(',')}`;
    if (aiFusionNarrateKeyRef.current === dedupeKey) return;
    aiFusionNarrateKeyRef.current = dedupeKey;
    let cancelled = false;
    const sym = a.symbol;
    const tf = a.timeframe;
    void (async () => {
      try {
        const res = await fetch('/api/ai-fusion-narrate', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            symbol: sym,
            timeframe: tf,
            fusion: f,
            briefingLogin: {
              user: getStoredBriefingUser().trim(),
              password: getStoredBriefingPassword(),
            },
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || cancelled) return;
        const text = typeof data.narrative === 'string' ? data.narrative.replace(/\s+/g, ' ').trim().slice(0, 400) : '';
        if (!text) return;
        const usage = data.usage as { estimatedCost?: number } | undefined;
        if (usage?.estimatedCost && usage.estimatedCost > 0) addEstimatedCostUsd(usage.estimatedCost);
        setAnalysis((prev) => {
          if (!prev || prev.symbol !== sym || prev.timeframe !== tf || !prev.aiFusionSignal) return prev;
          if (prev.aiFusionSignal.narrativeLlm) return prev;
          return { ...prev, aiFusionSignal: { ...prev.aiFusionSignal, narrativeLlm: text } };
        });
      } catch {
        /* 키 없음·네트워크 실패 시 규칙 narrative만 사용 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [siteAuth, analysis]);

  useEffect(() => {
    return () => {
      analyzeAbortRef.current?.abort();
      if (loadDebounceRef.current) clearTimeout(loadDebounceRef.current);
    };
  }, []);

  useEffect(() => {
    const TIMEFRAMES = ['1m', '3m', '5m', '15m', '1h', '4h', '1d', '1w', '1M', '1Y'];
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'r' || e.key === 'R') { if (!e.ctrlKey && !e.metaKey) return; e.preventDefault(); requestLoad(); }
      const idx = TIMEFRAMES.indexOf(timeframe);
      if (e.key === 'ArrowLeft' && idx > 0) { e.preventDefault(); setTimeframe(TIMEFRAMES[idx - 1]); }
      if (e.key === 'ArrowRight' && idx >= 0 && idx < TIMEFRAMES.length - 1) { e.preventDefault(); setTimeframe(TIMEFRAMES[idx + 1]); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [requestLoad, timeframe]);

  useEffect(() => {
    if (!webhookEnabled || !analysis || webhookSent) return;
    if (analysis.verdict !== 'LONG' && analysis.verdict !== 'SHORT') return;
    if ((analysis.confidence ?? 0) < webhookMinConfidence) return;
    // 타점 모드에서는 4요소 확정일 때만 알림 전송
    if (isTapMode && !(analysis as any)?.confirmedSignal?.confirmed) return;
    sendWebhook();
  }, [analysis?.verdict, analysis?.confidence, (analysis as any)?.confirmedSignal?.confirmed, webhookEnabled, webhookSent, webhookMinConfidence, isTapMode]);

  useEffect(() => {
    if (!analysis || !signalAlertEnabled) return;
    const hasSignal = analysis.verdict === 'LONG' || analysis.verdict === 'SHORT';
    if (!hasSignal) return;
    const confirmed = (analysis as any)?.confirmedSignal?.confirmed === true;
    if (!confirmed) return;
    const base = [
      analysis.symbol,
      analysis.timeframe,
      analysis.verdict,
      analysis.entry,
      analysis.stopLoss,
      ...(analysis.targets || []),
    ].join('|');
    const key = `confirmed|${base}`;
    if (lastConfirmedNotifyKeyRef.current === key) return;
    lastConfirmedNotifyKeyRef.current = key;

    try {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate(confirmed ? [220, 90, 220, 90, 260] : [90]);
      }
    } catch {}
    try {
      if (typeof window !== 'undefined' && 'Notification' in window) {
        const title = `확정 ${analysis.verdict} 신호`;
        const body = `${analysis.symbol} ${analysis.timeframe} · E ${analysis.entry} / SL ${analysis.stopLoss}`;
        if (Notification.permission === 'granted') {
          new Notification(title, { body });
        } else if (Notification.permission === 'default') {
          Notification.requestPermission().then((perm) => {
            if (perm === 'granted') new Notification(title, { body });
          }).catch(() => {});
        }
      }
    } catch {}
  }, [analysis, signalAlertEnabled]);

  useEffect(() => {
    if (!analysis || !signalSoundEnabled) return;
    const hasSignal = analysis.verdict === 'LONG' || analysis.verdict === 'SHORT';
    if (!hasSignal) return;
    const confirmed = (analysis as any)?.confirmedSignal?.confirmed === true;
    if (!confirmed) return;
    const base = [
      analysis.symbol,
      analysis.timeframe,
      analysis.verdict,
      analysis.entry,
      analysis.stopLoss,
      ...(analysis.targets || []),
    ].join('|');
    const key = `confirmed|${base}`;
    if (lastConfirmedSoundKeyRef.current === key) return;
    lastConfirmedSoundKeyRef.current = key;

    try {
      const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const beep = (startSec: number, durationSec: number, freq: number, gainVal: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.value = gainVal;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + startSec);
        osc.stop(ctx.currentTime + startSec + durationSec);
      };
      beep(0, 0.13, 980, 0.06);
      beep(0.18, 0.14, 1240, 0.07);
      setTimeout(() => { try { ctx.close(); } catch {} }, 600);
    } catch {}
  }, [analysis, signalSoundEnabled]);

  useEffect(() => {
    if (!analysis) return;
    updateLearningFromAnalysis(analysis);
  }, [analysis]);

  useEffect(() => {
    if (siteAuth !== 'authed') return;
    void syncLearningFromServer().catch(() => {});
  }, [siteAuth]);

  const MTF_TFS = ['1m', '5m', '15m', '1h', '4h', '1d', '1w', '1M', '1Y'];
  useEffect(() => {
    if (siteAuth !== 'authed') return;
    if (!analysisReadyForCurrentTf) return;
    const pfQ = parkfColorsQuery(
      parkfLinRegBaseHex,
      parkfLinRegLargeHex,
      parkfLinRegMediumHex,
      parkfLinRegSmallHex,
      parkfTrendPrimaryHex,
      parkfTrendSecondaryHex,
    );
    const pfEngineQ = parkfEngineOptsToQueryDiff(parkfEngineOptsRef.current);
    const controller = new AbortController();
    let cancelled = false;
    const fetchOneTf = async (tf: string) => {
      const sM = loadSettings();
      const a0 = sM.aiCompressionAvgRangeAtr ?? defaultSettings.aiCompressionAvgRangeAtr;
      const a1 = sM.aiCompressionMaxRangeAtr ?? defaultSettings.aiCompressionMaxRangeAtr;
      const a2 = sM.aiImpulseRangeAtr ?? defaultSettings.aiImpulseRangeAtr;
      const a3 = sM.aiImpulseBodyAtr ?? defaultSettings.aiImpulseBodyAtr;
      const aV = sM.aiCompressionVolumeFilter === true ? 1 : 0;
      const amxMtf =
        uiMode === 'WHALE' ||
        uiMode === 'MAX_ANALYSIS' ||
        uiMode === 'SMC_DESK' ||
        uiMode === 'SMC_DESK_COMPOSITE' ||
        uiMode === 'SMC_DELTA_DESK' ||
        uiMode === 'SMART_MONEY_MVP' ||
        uiMode === 'UNIFIED_DESK' ||
        uiMode === 'AI_ZONE' ||
        uiMode === 'BIBLE_MODE' ||
        uiMode === 'HOT_ZONE'
          ? '&amx=1'
          : '';
      const effM = getEffectiveFeatureToggles(sM, uiMode);
      const cpVolMtf = effM.chartPrimeTrendChannelsVolumeBg === true ? '&cpVolBg=1' : '';
      const cpLenM = Math.max(2, Math.min(30, Math.round(Number(sM.chartPrimeTrendChannelsLength) || 8)));
      const cpAutoM = sM.chartPrimeTrendChannelsAutoLength !== false ? 1 : 0;
      const cpWaitM = sM.chartPrimeTrendChannelsWait !== false ? 1 : 0;
      const cpExtM = sM.chartPrimeTrendChannelsExtend === true ? 1 : 0;
      const cpShowM = sM.chartPrimeTrendChannelsShowLastOnly !== false ? 1 : 0;
      const cpFillM = sM.chartPrimeTrendChannelsShowFills !== false ? 1 : 0;
      const cpTopM = normalizeHex6(sM.chartPrimeTrendChannelsTopHex, defaultSettings.chartPrimeTrendChannelsTopHex).replace(/^#/, '');
      const cpCtrM = normalizeHex6(sM.chartPrimeTrendChannelsCenterHex, defaultSettings.chartPrimeTrendChannelsCenterHex).replace(/^#/, '');
      const cpBotM = normalizeHex6(sM.chartPrimeTrendChannelsBottomHex, defaultSettings.chartPrimeTrendChannelsBottomHex).replace(/^#/, '');
      const cpWM = effectiveChartPrimeChannelWidthScale(sM);
      const ddFM = sM.chartDepthDeltaRegimeFilter === false ? 0 : 1;
      const ddWM = sM.chartDepthDeltaAlignmentWeight === false ? 0 : 1;
      const ddTM = sM.chartDepthDeltaTpAdaptive === false ? 0 : 1;
      const cpQ = `&cpLen=${cpLenM}&cpAuto=${cpAutoM}&cpWait=${cpWaitM}&cpExt=${cpExtM}&cpShowLast=${cpShowM}&cpFill=${cpFillM}&cpTop=${cpTopM}&cpCtr=${cpCtrM}&cpBot=${cpBotM}&cpW=${encodeURIComponent(cpWM.toFixed(4))}&ddF=${ddFM}&ddW=${ddWM}&ddT=${ddTM}`;
      const res = await fetchWithRetry(
        `/api/analyze?symbol=${symbol}&timeframe=${encodeURIComponent(tf)}&zoneSensitivity=${encodeURIComponent(zoneSignalSensitivity.toFixed(2))}&majorZoneWidth=${encodeURIComponent(majorZoneWidth.toFixed(2))}&majorZoneOpacity=${encodeURIComponent(majorZoneOpacity.toFixed(2))}&majorZoneTouches=${encodeURIComponent(String(majorZoneTouches))}&structureBreakout=${structureBreakoutRocketWithoutRetest ? 1 : 0}&trendlineLookback=${encodeURIComponent(String(trendlineLookback))}&pre3Sim=${encodeURIComponent(pre3SimilarityThreshold.toFixed(3))}&pre3Close=${pre3ConfirmOnCloseOnly ? 1 : 0}&aiAvg=${encodeURIComponent(a0.toFixed(2))}&aiMax=${encodeURIComponent(a1.toFixed(2))}&aiImpR=${encodeURIComponent(a2.toFixed(2))}&aiImpB=${encodeURIComponent(a3.toFixed(2))}&aiVol=${aV}${amxMtf}${cpQ}${cpVolMtf}${pfQ}${pfEngineQ}`,
        { cache: 'no-store', credentials: 'same-origin', signal: controller.signal },
        1,
        400
      );
      const d = await res.json().catch(() => ({}));
      return {
        tf,
        verdict: d.verdict || 'WATCH',
        confidence: d.confidence || 50,
        signalTime: (d?.lsSignalPlan?.signalTime ?? d?.rsiDivergenceSignal?.signalBarTime ?? null) as number | null,
        depthDeltaRegime: (d?.depthDeltaContext?.regime ?? 'neutral') as 'buy' | 'sell' | 'neutral',
        depthDeltaSmoothedPct: Number(d?.depthDeltaContext?.smoothedPct ?? 0),
      };
    };
    /** 메인 차트 응답 후 백그라운드에서 순차 배치 — 9동시 analyze로 서버·거래소 과부하 방지 */
    const fetchMtfStaggered = async () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      const out: Array<{
        tf: string;
        verdict: string;
        confidence: number;
        signalTime: number | null;
        depthDeltaRegime: 'buy' | 'sell' | 'neutral';
        depthDeltaSmoothedPct: number;
      }> = [];
      const chunk = 3;
      for (let i = 0; i < MTF_TFS.length; i += chunk) {
        if (cancelled || controller.signal.aborted) return;
        const part = MTF_TFS.slice(i, i + chunk);
        const rows = await Promise.all(part.map((tf) => fetchOneTf(tf)));
        out.push(...rows);
        if (i + chunk < MTF_TFS.length) await new Promise((r) => setTimeout(r, 350));
      }
      if (!cancelled && !controller.signal.aborted) setMtfSignals(out);
    };
    const tFirst = window.setTimeout(() => {
      void fetchMtfStaggered().catch(() => {});
    }, 4000);
    const t = setInterval(() => {
      void fetchMtfStaggered().catch(() => {});
    }, 120_000);
    return () => {
      cancelled = true;
      clearTimeout(tFirst);
      clearInterval(t);
      controller.abort();
    };
  }, [
    symbol,
    timeframe,
    siteAuth,
    uiMode,
    zoneSignalSensitivity,
    pre3SimilarityThreshold,
    pre3ConfirmOnCloseOnly,
    majorZoneWidth,
    majorZoneOpacity,
    majorZoneTouches,
    structureBreakoutRocketWithoutRetest,
    trendlineLookback,
    analysisReadyForCurrentTf,
    parkfLinRegBaseHex,
    parkfLinRegLargeHex,
    parkfLinRegMediumHex,
    parkfLinRegSmallHex,
    parkfTrendPrimaryHex,
    parkfTrendSecondaryHex,
    parkfEngineOpts,
  ]);

  const updatePageLayout = useCallback((patch: Partial<PageLayoutSettings>) => {
    const curr = loadSettings();
    const next = mergePageLayout({ ...curr.pageLayout, ...patch });
    saveSettings({ pageLayout: next });
    setPageLayout(next);
  }, []);

  const mainToolbarFloatRef = useRef<HTMLDivElement>(null);
  const mtfStripFloatRef = useRef<HTMLDivElement>(null);
  const updatePageLayoutRef = useRef(updatePageLayout);
  updatePageLayoutRef.current = updatePageLayout;
  const toolbarDragCommitRef = useRef<PageLayoutPoint | null>(null);
  const mtfStripDragCommitRef = useRef<PageLayoutPoint | null>(null);

  const DEFAULT_TOOLBAR_FLOAT: PageLayoutPoint = { left: 12, top: 88 };
  const DEFAULT_MTF_FLOAT: PageLayoutPoint = { left: 12, top: 168 };

  const [toolbarDrag, setToolbarDrag] = useState<null | { sx: number; sy: number; bl: number; bt: number }>(null);
  const [toolbarFloatLive, setToolbarFloatLive] = useState<PageLayoutPoint | null>(null);
  const [mtfStripDrag, setMtfStripDrag] = useState<null | { sx: number; sy: number; bl: number; bt: number }>(null);
  const [mtfStripFloatLive, setMtfStripFloatLive] = useState<PageLayoutPoint | null>(null);
  const [layoutPortalsReady, setLayoutPortalsReady] = useState(false);
  useEffect(() => {
    setLayoutPortalsReady(true);
  }, []);

  useEffect(() => {
    if (!toolbarDrag) return;
    const clamp = (left: number, top: number) => {
      const el = mainToolbarFloatRef.current;
      const w = el?.offsetWidth ?? 400;
      const h = el?.offsetHeight ?? 64;
      const m = 8;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      return {
        left: Math.max(m, Math.min(vw - w - m, left)),
        top: Math.max(m, Math.min(vh - h - m, top)),
      };
    };
    const onMove = (e: PointerEvent) => {
      const left = toolbarDrag.bl + (e.clientX - toolbarDrag.sx);
      const top = toolbarDrag.bt + (e.clientY - toolbarDrag.sy);
      const c = clamp(left, top);
      toolbarDragCommitRef.current = c;
      setToolbarFloatLive(c);
    };
    const onUp = () => {
      const p = toolbarDragCommitRef.current;
      toolbarDragCommitRef.current = null;
      setToolbarDrag(null);
      setToolbarFloatLive(null);
      if (p) updatePageLayoutRef.current({ mainToolbarPos: p });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [toolbarDrag]);

  useEffect(() => {
    if (!mtfStripDrag) return;
    const clamp = (left: number, top: number) => {
      const el = mtfStripFloatRef.current;
      const w = el?.offsetWidth ?? 520;
      const h = el?.offsetHeight ?? 80;
      const m = 8;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      return {
        left: Math.max(m, Math.min(vw - w - m, left)),
        top: Math.max(m, Math.min(vh - h - m, top)),
      };
    };
    const onMove = (e: PointerEvent) => {
      const left = mtfStripDrag.bl + (e.clientX - mtfStripDrag.sx);
      const top = mtfStripDrag.bt + (e.clientY - mtfStripDrag.sy);
      const c = clamp(left, top);
      mtfStripDragCommitRef.current = c;
      setMtfStripFloatLive(c);
    };
    const onUp = () => {
      const p = mtfStripDragCommitRef.current;
      mtfStripDragCommitRef.current = null;
      setMtfStripDrag(null);
      setMtfStripFloatLive(null);
      if (p) updatePageLayoutRef.current({ mtfStripPos: p });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [mtfStripDrag]);

  const displayVerdict = analysis?.verdict ?? (persistedSignal?.symbol === symbol && persistedSignal?.timeframe === timeframe ? persistedSignal.verdict : null) ?? persistedSignal?.verdict;
  const displayConfidence = analysis != null ? (analysis.confidence ?? 50) : (persistedSignal?.symbol === symbol && persistedSignal?.timeframe === timeframe ? persistedSignal.confidence : persistedSignal?.confidence ?? 50);
  const badgeClass = displayVerdict === 'LONG'
    ? 'status-pill status-long'
    : displayVerdict === 'SHORT'
      ? 'status-pill status-short'
      : 'status-pill status-watch';

  const handleSiteLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    } catch { /* ignore */ }
    setSiteAuth('anon');
    window.location.reload();
  };

  const pl = pageLayout;
  /** 통합작도: 전체·카드·AI 패널을 한 화면에 묶음 — 우측 스택은 항상 표시(최강분석만 '차트만 넓게'로 숨김) */
  const showRightStack =
    pl.showRightPanel &&
    !(
      (uiMode === 'MAX_ANALYSIS' ||
        uiMode === 'SMC_DESK' ||
        uiMode === 'SMC_DESK_COMPOSITE' ||
        uiMode === 'SMC_DELTA_DESK' ||
        uiMode === 'SMART_MONEY_MVP') &&
      maxAnalysisWideChart
    );
  const anyMainToolbar =
    pl.showMainToolbar &&
    (pl.showGroupAccount || pl.showGroupThemeAlerts || pl.showGroupSymbol || pl.showGroupStatus);
  const toolbarPosDisplay = toolbarFloatLive ?? pl.mainToolbarPos ?? DEFAULT_TOOLBAR_FLOAT;
  const mtfPosDisplay = mtfStripFloatLive ?? pl.mtfStripPos ?? DEFAULT_MTF_FLOAT;

  const startToolbarFloatDrag = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const base = toolbarFloatLive ?? pl.mainToolbarPos ?? DEFAULT_TOOLBAR_FLOAT;
    setToolbarFloatLive(base);
    setToolbarDrag({ sx: e.clientX, sy: e.clientY, bl: base.left, bt: base.top });
  };
  const startMtfStripFloatDrag = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const base = mtfStripFloatLive ?? pl.mtfStripPos ?? DEFAULT_MTF_FLOAT;
    setMtfStripFloatLive(base);
    setMtfStripDrag({ sx: e.clientX, sy: e.clientY, bl: base.left, bt: base.top });
  };

  const renderMtfChips = () =>
    mtfSignals.map((m) => {
      const isCurrent = m.tf === timeframe;
      const confirmed = (m.verdict === 'LONG' || m.verdict === 'SHORT') && m.confidence >= 70;
      const label = confirmed ? (m.verdict === 'LONG' ? 'L' : 'S') : '준비';
      const dReg = m.depthDeltaRegime ?? 'neutral';
      const dTxt = dReg === 'buy' ? 'Δ+' : dReg === 'sell' ? 'Δ-' : 'Δ0';
      return (
        <span
          key={m.tf}
          onClick={() => {
            prefetchMarketCandles(m.tf);
            setTimeframe(m.tf);
            requestLoad(m.tf);
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              prefetchMarketCandles(m.tf);
              setTimeframe(m.tf);
              requestLoad(m.tf);
            }
          }}
          className={`tool-chip tool-chip-button ${isCurrent ? 'tool-chip-active' : ''}`}
          style={{
            fontSize: 12,
            padding: '4px 10px',
            cursor: 'pointer',
            border: isCurrent ? '2px solid var(--border)' : undefined,
            color: m.verdict === 'LONG' ? '#22C55E' : m.verdict === 'SHORT' ? '#EF4444' : 'var(--muted)',
            fontWeight: confirmed ? 700 : 500,
          }}
          title={`${m.tf}: ${m.verdict} ${m.confidence}% · ${dTxt} ${Number(m.depthDeltaSmoothedPct ?? 0).toFixed(0)}%${confirmed ? ' (확정)' : ' (준비)'} (클릭 시 이동)`}
        >
          {m.tf} <span style={{ fontWeight: 700 }}>{label}</span> {m.confidence}%{' '}
          <span style={{ color: dReg === 'buy' ? '#86efac' : dReg === 'sell' ? '#fca5a5' : '#94a3b8' }}>{dTxt}</span>
        </span>
      );
    });

  const mainToolbarBody = anyMainToolbar ? (
    <>
      {pl.showGroupAccount && (
        <>
          <button
            type="button"
            className="tool-chip tool-chip-button"
            onClick={handleSiteLogout}
            title="로그아웃 후 다시 로그인"
          >
            로그아웃
          </button>
          {siteUser && (
            <div className="badge" title="현재 로그인 계정">
              ID: {siteUser}
            </div>
          )}
        </>
      )}
      {pl.showGroupThemeAlerts && (
        <>
          <button
            className="tool-chip tool-chip-button"
            onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
            title={theme === 'dark' ? '라이트 모드' : '다크 모드'}
            aria-label={theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'}
          >
            {theme === 'dark' ? '\u263C' : '\u263E'}
          </button>
          <button
            type="button"
            className={`tool-chip tool-chip-button ${signalAlertEnabled ? 'tool-chip-active' : ''}`}
            onClick={() => {
              const next = !signalAlertEnabled;
              setSignalAlertEnabled(next);
              saveSettings({ signalAlertEnabled: next });
            }}
            title="신호 진동/알림 ON/OFF"
          >
            알람 {signalAlertEnabled ? 'ON' : 'OFF'}
          </button>
          <button
            type="button"
            className={`tool-chip tool-chip-button ${signalSoundEnabled ? 'tool-chip-active' : ''}`}
            onClick={() => {
              const next = !signalSoundEnabled;
              setSignalSoundEnabled(next);
              saveSettings({ signalSoundEnabled: next });
            }}
            title="신호 소리 ON/OFF"
          >
            소리 {signalSoundEnabled ? 'ON' : 'OFF'}
          </button>
        </>
      )}
      {pl.showGroupSymbol && (
        <>
          <select className="select-pill" value={symbol} onChange={(e) => setSymbol(e.target.value)} aria-label="심볼 선택">
            {symbolList.map(s => <option key={s} value={s}>{s}{favoriteSymbols.includes(s) ? ' \u2605' : ''}</option>)}
          </select>
          <div ref={symbolSearchWrapRef} className="symbol-search-wrap">
            <input
              type="text"
              className="select-pill"
              style={{ width: 148, minWidth: 120, padding: '8px 12px', fontSize: 12 }}
              placeholder="심볼 검색"
              value={symbolSearchQuery}
              onChange={(e) => {
                setSymbolSearchQuery(e.target.value);
                setSymbolSearchOpen(true);
              }}
              onFocus={() => setSymbolSearchOpen(true)}
              aria-label="바이낸스 USDT 현물 심볼 검색"
              autoComplete="off"
              spellCheck={false}
            />
            {symbolSearchOpen && symbolSearchHits.length > 0 && (
              <ul
                role="listbox"
                aria-label="검색 결과"
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  marginTop: 6,
                  marginLeft: 0,
                  padding: 6,
                  listStyle: 'none',
                  background: 'var(--panel)',
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  maxHeight: 'min(320px, 40vh)',
                  overflowY: 'auto',
                  zIndex: 9602,
                  minWidth: 220,
                  boxShadow: '0 12px 32px rgba(0,0,0,0.4)',
                }}
              >
                {symbolSearchHits.map((h) => (
                  <li key={h.symbol} role="option">
                    <button
                      type="button"
                      className="tool-chip tool-chip-button"
                      style={{
                        width: '100%',
                        justifyContent: 'space-between',
                        marginBottom: 4,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        fontSize: 12,
                      }}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => pickSymbolFromSearch(h.symbol)}
                      title={`${h.symbol} 차트·분석으로 전환`}
                    >
                      <strong>{h.symbol}</strong>
                      <span style={{ color: 'var(--muted)', fontSize: 11 }}>{h.base}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button className="tool-chip tool-chip-button" onClick={() => toggleFavorite(symbol)} title={favoriteSymbols.includes(symbol) ? '즐겨찾기 해제' : '즐겨찾기 추가'}>
            {favoriteSymbols.includes(symbol) ? '\u2605' : '\u2606'}
          </button>
        </>
      )}
      {pl.showGroupStatus && (
        <>
          <div className={badgeClass} title={persistedSignal && !analysis ? '마지막 확정 신호 (저장됨)' : undefined}>
            {displayVerdict === 'LONG' ? 'L' : displayVerdict === 'SHORT' ? 'S' : '–'} · {displayConfidence}%
          </div>
          <div className="badge">
            {loading ? '분석 중...' : error ? '오류' : '실행 중'}
          </div>
          {visitor.count != null && (
            <div className="badge" title="실시간 접속자">
              {visitor.count}명 접속
            </div>
          )}
          {visitor.users.length > 0 && (
            <div className="badge" title="현재 접속 중인 아이디">
              방문 ID: {visitor.users.join(', ')}
            </div>
          )}
          {error && (
            <button type="button" className="badge" onClick={() => requestLoad()} style={{ marginLeft: 8, cursor: 'pointer' }}>
              다시 시도
            </button>
          )}
        </>
      )}
    </>
  ) : null;

  const showHeaderCard = pl.showPageTitle || (anyMainToolbar && !pl.mainToolbarFloat);

  if (siteAuth === 'loading') {
    return (
      <div style={{ minHeight: '50vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--muted)' }}>
        접속 확인 중…
        {visitor.count != null && <span style={{ fontSize: 12 }}>현재 {visitor.count}명 접속</span>}
      </div>
    );
  }

  if (siteAuth === 'anon') {
    return <AppSiteLogin onLoggedIn={() => setSiteAuth('authed')} />;
  }

  return (
    <>
      <TelegramMultiTfWatcher />
      <a href="#main-content" className="skip-link">본문으로 건너뛰기</a>
      <main id="main-content" role="main">
        <AppDisclaimerBanner variant="main" />
        {showHeaderCard && (
          <div className={`card header-card${!pl.showPageTitle ? ' header-card--toolbar-only' : ''}`}>
            {pl.showPageTitle && (
              <div>
                <div className="title">독수리1호 분석 엔진</div>
                <div className="subtle">SMC · 멀티타임프레임 · 스마트머니 · 신호 분석 · Ctrl+R 새로고침 · ←→ 타임프레임</div>
              </div>
            )}
            {anyMainToolbar && !pl.mainToolbarFloat && (
              <div className="select-row">{mainToolbarBody}</div>
            )}
          </div>
        )}

        {layoutPortalsReady && pl.mainToolbarFloat && anyMainToolbar &&
          createPortal(
            <div
              ref={mainToolbarFloatRef}
              className="card panel-pad page-layout-float-shell"
              style={{
                position: 'fixed',
                left: toolbarPosDisplay.left,
                top: toolbarPosDisplay.top,
                zIndex: 8500,
                maxWidth: 'min(calc(100vw - 16px), 720px)',
                padding: '10px 12px',
              }}
            >
              <div
                aria-label="툴바 이동"
                onPointerDown={startToolbarFloatDrag}
                style={{
                  cursor: 'grab',
                  touchAction: 'none',
                  WebkitUserSelect: 'none',
                  userSelect: 'none',
                  padding: '4px 8px',
                  margin: '-4px -4px 6px -4px',
                  fontSize: 11,
                  color: 'var(--muted)',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                ⋮⋮ 드래그로 이동 (터치·마우스)
              </div>
              <div className="select-row">{mainToolbarBody}</div>
            </div>,
            document.body
          )}

        {mtfSignals.length > 0 && pl.showMtfStrip && !pl.mtfStripFloat && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: 11, color: 'var(--muted)', marginRight: 6, alignSelf: 'center' }}>MTF 신호:</span>
            {renderMtfChips()}
          </div>
        )}

        {layoutPortalsReady && mtfSignals.length > 0 && pl.showMtfStrip && pl.mtfStripFloat &&
          createPortal(
            <div
              ref={mtfStripFloatRef}
              className="card panel-pad page-layout-float-shell"
              style={{
                position: 'fixed',
                left: mtfPosDisplay.left,
                top: mtfPosDisplay.top,
                zIndex: 8490,
                maxWidth: 'min(calc(100vw - 16px), 920px)',
                padding: '10px 12px',
              }}
            >
              <div
                aria-label="MTF 줄 이동"
                onPointerDown={startMtfStripFloatDrag}
                style={{
                  cursor: 'grab',
                  touchAction: 'none',
                  WebkitUserSelect: 'none',
                  userSelect: 'none',
                  padding: '4px 8px',
                  margin: '-4px -4px 6px -4px',
                  fontSize: 11,
                  color: 'var(--muted)',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                ⋮⋮ MTF 줄 이동
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: 'var(--muted)', marginRight: 4 }}>MTF:</span>
                {renderMtfChips()}
              </div>
            </div>,
            document.body
          )}

        {error && (
          <div className="card panel-pad" role="alert" style={{ background: 'rgba(255,123,123,0.1)', border: '1px solid rgba(255,123,123,0.3)' }}>
            <div className="section-title">\u26A0\uFE0F 연결 오류</div>
            <div className="subtle" style={{ marginTop: 8 }}>{error}</div>
            <button type="button" onClick={() => requestLoad()} style={{ marginTop: 12, padding: '8px 16px', cursor: 'pointer' }}>다시 시도</button>
          </div>
        )}

        <div className={showRightStack ? 'grid' : 'grid grid--single'}>
          <div className="left-stack">
            <div className="card panel-pad">
              {pl.showChartCardHeader && (
                <div className="space-between">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', minWidth: 0 }}>
                    <div>
                      <div className="section-title">코인 차트</div>
                      <div className="subtle">
                        {symbol} \u00B7 {uiMode === 'HOT_ZONE' ? '1D + 1W 듀얼' : timeframe} \u00B7 실시간
                      </div>
                    </div>
                    {(uiMode === 'MAX_ANALYSIS' ||
                      uiMode === 'SMC_DESK' ||
                      uiMode === 'SMC_DESK_COMPOSITE' ||
                      uiMode === 'SMC_DELTA_DESK' ||
                      uiMode === 'SMART_MONEY_MVP') &&
                      pl.showRightPanel && (
                      <button
                        type="button"
                        className={`tool-chip tool-chip-button${maxAnalysisWideChart ? ' tool-chip-active' : ''}`}
                        title={maxAnalysisWideChart ? '우측 패널(분석·AI) 다시 표시' : '우측 패널 숨기고 차트만 넓게 — TV·터미널에 가깝게'}
                        onClick={() => setMaxAnalysisWideChart((v) => !v)}
                        style={{ flexShrink: 0 }}
                      >
                        {maxAnalysisWideChart ? '분할(패널)' : '차트만 넓게'}
                      </button>
                    )}
                  </div>
                  {(analysis?.engine as any)?.pythonEngine ? (
                    <div className="badge" style={{ background: 'rgba(98,239,224,0.2)' }}>Python 엔진 연동</div>
                  ) : analysis && (
                    <div className="badge" style={{ background: 'rgba(98,239,224,0.2)', color: '#62efe0' }}>TS 엔진 연동</div>
                  )}
                  {uiMode === 'AI_ZONE' && (
                    <div className="badge" style={{ background: 'rgba(250,204,21,0.18)', color: '#fde68a' }}>
                      AI 분석 · 핵심 표시{' '}
                      {Array.isArray((analysis as any)?.overlays)
                        ? (analysis as any).overlays.filter((o: any) => String(o?.id || '').startsWith('ai-')).length
                        : 0}
                      개
                    </div>
                  )}
                  {(analysis as any)?.multiTF && (
                    <div className="badge">
                      {(analysis as any).multiTF.trend1M != null && (
                        <>1M: {(analysis as any).multiTF.trend1M} · </>
                      )}
                      상위 {(analysis as any).multiTF.htfLabel}: {(analysis as any).multiTF.htf || '-'} · 하위 {(analysis as any).multiTF.ltfLabel}: {(analysis as any).multiTF.ltf || '-'}
                    </div>
                  )}
                </div>
              )}
              {uiMode === 'HOT_ZONE' ? (
                <div
                  className="chart-wrap chart-wrap--hot-zone-dual"
                  style={{ display: 'flex', gap: 10, alignItems: 'stretch', flexWrap: 'wrap', width: '100%' }}
                >
                  <div style={{ flex: '1 1 340px', minWidth: 280, position: 'relative' }}>
                    <ChartView
                      ref={chartSnapshotRef}
                      key="hot-zone-1d"
                      symbol={symbol}
                      timeframe="1d"
                      analysis={analysis}
                      setTimeframe={noopSetTimeframeHotZoneDual}
                      theme={theme}
                      onChartPointClick={handleChartPointClick}
                      uiMode={uiMode}
                      onUiModeChange={handleUiModeChange}
                      zoneSignalSensitivity={zoneSignalSensitivity}
                      onZoneSignalSensitivityChange={(v) => {
                        setZoneSignalSensitivity(v);
                        saveSettings({ zoneSignalSensitivity: v });
                      }}
                      pre3SimilarityThreshold={pre3SimilarityThreshold}
                      onPre3SimilarityChange={(v) => {
                        const t = Math.max(0.55, Math.min(0.98, v));
                        setPre3SimilarityThreshold(t);
                        saveSettings({ pre3SimilarityThreshold: t });
                        requestLoad();
                      }}
                      pre3ConfirmOnCloseOnly={pre3ConfirmOnCloseOnly}
                      onPre3ConfirmOnCloseChange={(v) => {
                        setPre3ConfirmOnCloseOnly(v);
                        saveSettings({ pre3ConfirmOnCloseOnly: v });
                        requestLoad();
                      }}
                      structurePriceLinesMax={structurePriceLinesMax}
                      mtfSignals={mtfSignals}
                      hotZoneEmbed="left"
                    />
                  </div>
                  <div style={{ flex: '1 1 340px', minWidth: 280, position: 'relative' }}>
                    <ChartView
                      key="hot-zone-1w"
                      symbol={symbol}
                      timeframe="1w"
                      analysis={analysis}
                      setTimeframe={noopSetTimeframeHotZoneDual}
                      theme={theme}
                      onChartPointClick={handleChartPointClick}
                      uiMode={uiMode}
                      onUiModeChange={handleUiModeChange}
                      zoneSignalSensitivity={zoneSignalSensitivity}
                      onZoneSignalSensitivityChange={(v) => {
                        setZoneSignalSensitivity(v);
                        saveSettings({ zoneSignalSensitivity: v });
                      }}
                      pre3SimilarityThreshold={pre3SimilarityThreshold}
                      onPre3SimilarityChange={(v) => {
                        const t = Math.max(0.55, Math.min(0.98, v));
                        setPre3SimilarityThreshold(t);
                        saveSettings({ pre3SimilarityThreshold: t });
                        requestLoad();
                      }}
                      pre3ConfirmOnCloseOnly={pre3ConfirmOnCloseOnly}
                      onPre3ConfirmOnCloseChange={(v) => {
                        setPre3ConfirmOnCloseOnly(v);
                        saveSettings({ pre3ConfirmOnCloseOnly: v });
                        requestLoad();
                      }}
                      structurePriceLinesMax={structurePriceLinesMax}
                      mtfSignals={mtfSignals}
                      hotZoneEmbed="right"
                      suppressHotZoneHud
                    />
                  </div>
                </div>
              ) : (
              <div className="chart-wrap">
                <ChartView
                  ref={chartSnapshotRef}
                  symbol={symbol}
                  timeframe={timeframe}
                  analysis={analysis}
                  setTimeframe={setTimeframe}
                  onTimeframeChange={(tf) => {
                    prefetchMarketCandles(tf);
                    setTimeframe(tf);
                    timeframeRef.current = tf;
                    requestLoad(tf);
                  }}
                  theme={theme}
                  onChartPointClick={handleChartPointClick}
                  uiMode={uiMode}
                  onUiModeChange={handleUiModeChange}
                  zoneSignalSensitivity={zoneSignalSensitivity}
                  onZoneSignalSensitivityChange={(v) => {
                    setZoneSignalSensitivity(v);
                    saveSettings({ zoneSignalSensitivity: v });
                  }}
                  pre3SimilarityThreshold={pre3SimilarityThreshold}
                  onPre3SimilarityChange={(v) => {
                    const t = Math.max(0.55, Math.min(0.98, v));
                    setPre3SimilarityThreshold(t);
                    saveSettings({ pre3SimilarityThreshold: t });
                    requestLoad();
                  }}
                  pre3ConfirmOnCloseOnly={pre3ConfirmOnCloseOnly}
                  onPre3ConfirmOnCloseChange={(v) => {
                    setPre3ConfirmOnCloseOnly(v);
                    saveSettings({ pre3ConfirmOnCloseOnly: v });
                    requestLoad();
                  }}
                  structurePriceLinesMax={structurePriceLinesMax}
                  mtfSignals={mtfSignals}
                />
              </div>
              )}
                {loading && !analysis && (
                  <div
                    className="chart-analysis-loading"
                    role="status"
                    aria-live="polite"
                    aria-busy="true"
                  >
                    분석 로딩 중… (차트 데이터는 계속 로드)
                  </div>
                )}
              </div>
            </div>

          {showRightStack && (
          <div className="right-stack">
            <AIChatPanel analysis={analysis} symbol={symbol} timeframe={timeframe} chartSnapshotRef={chartSnapshotRef} triggerSendMessage={triggerChatMessage} onTriggerSendConsumed={() => setTriggerChatMessage('')} />

            <div className="card panel-pad" style={{ display: 'flex', flexDirection: 'column', minHeight: 380, maxHeight: 'min(86vh, 920px)' }}>
              <div className="panel-tabs" role="tablist">
                {(['trade', 'market', 'briefing', 'pattern', 'ref', 'etc', 'learning', 'virtual', 'candle'] as const).map((tab) => (
                  <button key={tab} type="button" role="tab" aria-selected={rightPanelTab === tab} className={`panel-tab ${rightPanelTab === tab ? 'active' : ''}`} onClick={() => setRightPanelTab(tab)}>
                    {tab === 'trade' && '트레이드'}
                    {tab === 'market' && '시장'}
                    {tab === 'briefing' && '브리핑'}
                    {tab === 'pattern' && '패턴'}
                    {tab === 'ref' && '참조'}
                    {tab === 'etc' && '기타'}
                    {tab === 'learning' && '자율학습'}
                    {tab === 'virtual' && '가상매매'}
                    {tab === 'candle' && '캔들비교'}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8, marginBottom: 8 }}>
                <button type="button" className="tool-chip tool-chip-button" onClick={() => setAllPanelFeatures(true)}>기능 전체 ON</button>
                <button type="button" className="tool-chip tool-chip-button" onClick={() => setAllPanelFeatures(false)}>기능 전체 OFF</button>
                <button type="button" className={`tool-chip tool-chip-button ${panelFeatures.unifiedGraph ? 'tool-chip-active' : ''}`} onClick={() => updatePanelFeature('unifiedGraph', !panelFeatures.unifiedGraph)}>통합그래프</button>
                <button type="button" className={`tool-chip tool-chip-button ${panelFeatures.signalBox ? 'tool-chip-active' : ''}`} onClick={() => updatePanelFeature('signalBox', !panelFeatures.signalBox)}>신호박스</button>
                <button type="button" className={`tool-chip tool-chip-button ${panelFeatures.executionBriefing ? 'tool-chip-active' : ''}`} onClick={() => updatePanelFeature('executionBriefing', !panelFeatures.executionBriefing)}>실행카드</button>
                <button type="button" className={`tool-chip tool-chip-button ${panelFeatures.focusOverlay ? 'tool-chip-active' : ''}`} onClick={() => updatePanelFeature('focusOverlay', !panelFeatures.focusOverlay)}>포커스</button>
                <button type="button" className={`tool-chip tool-chip-button ${panelFeatures.learningCard ? 'tool-chip-active' : ''}`} onClick={() => updatePanelFeature('learningCard', !panelFeatures.learningCard)}>자율학습</button>
                <button type="button" className={`tool-chip tool-chip-button ${panelFeatures.virtualCard ? 'tool-chip-active' : ''}`} onClick={() => updatePanelFeature('virtualCard', !panelFeatures.virtualCard)}>가상매매</button>
                <button type="button" className={`tool-chip tool-chip-button ${panelFeatures.candleCompareCard ? 'tool-chip-active' : ''}`} onClick={() => updatePanelFeature('candleCompareCard', !panelFeatures.candleCompareCard)}>캔들비교</button>
              </div>
              <div className="panel-tab-content">
                {rightPanelTab === 'trade' && (
                  <>
                    <AnalysisBoardHero analysis={analysis} symbol={symbol} timeframe={timeframe} loading={loading} />
                    {(uiMode === 'WHALE' || uiMode === 'AI_ZONE') && (
                      <div
                        style={{
                          marginBottom: 12,
                          padding: '12px 14px',
                          borderRadius: 12,
                          border: '1px solid rgba(251,191,36,0.28)',
                          background: 'rgba(15,23,42,0.78)',
                        }}
                      >
                        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                          <span style={{ fontSize: 12, fontWeight: 900, color: '#fcd34d' }}>
                            {uiMode === 'WHALE' ? '고래 · 세트 구조·반등' : 'AI 분석 · 세트 구조·반등'}
                          </span>
                          <button
                            type="button"
                            className={`tool-chip tool-chip-button ${whaleStructureBounceUi.enabled ? 'tool-chip-active' : ''}`}
                            onClick={toggleWhaleStructureBounce}
                            title="ON: 차트에 세트 단계 가로선(점선) + 아래 경로 요약"
                          >
                            {whaleStructureBounceUi.enabled ? 'ON' : 'OFF'}
                          </button>
                          <span style={{ fontSize: 10, color: '#94a3b8' }}>차트 ⚙ 고래 패널에서도 동일 토글 가능</span>
                        </div>
                        {!whaleStructureBounceUi.enabled && (
                          <p style={{ margin: 0, fontSize: 10, color: '#64748b', lineHeight: 1.5 }}>
                            OFF면 세트 반등 가로선은 차트에 나오지 않습니다.
                          </p>
                        )}
                        {whaleStructureBounceUi.enabled && whaleStructureBounceUi.path && (
                          <>
                            <div style={{ fontSize: 11, fontWeight: 800, color: '#f8fafc', marginBottom: 6 }}>
                              {whaleStructureBounceUi.path.headline}
                            </div>
                            <p style={{ margin: '0 0 10px', fontSize: 10, lineHeight: 1.55, color: '#cbd5e1' }}>
                              {whaleStructureBounceUi.path.summaryLine}
                            </p>
                            <ol style={{ margin: 0, paddingLeft: 18, fontSize: 10, lineHeight: 1.55, color: '#e2e8f0' }}>
                              {whaleStructureBounceUi.path.steps.map((s) => (
                                <li key={s.order} style={{ marginBottom: 8 }}>
                                  <span style={{ fontWeight: 800, color: '#fde68a' }}>{s.title}</span>
                                  <span style={{ color: '#94a3b8' }}>
                                    {' '}
                                    —{' '}
                                    {s.low >= 1
                                      ? s.low.toLocaleString(undefined, { maximumFractionDigits: 2 })
                                      : s.low.toFixed(6)}{' '}
                                    ~{' '}
                                    {s.high >= 1
                                      ? s.high.toLocaleString(undefined, { maximumFractionDigits: 2 })
                                      : s.high.toFixed(6)}
                                  </span>
                                  <div style={{ color: '#a8a29e', fontWeight: 500, marginTop: 2 }}>{s.detail}</div>
                                </li>
                              ))}
                            </ol>
                          </>
                        )}
                        {whaleStructureBounceUi.enabled && !whaleStructureBounceUi.path && (
                          <p style={{ margin: 0, fontSize: 10, color: '#64748b', lineHeight: 1.5 }}>
                            이 심볼·TF 분석에는 세트 경로(TP·OB 조건)가 아직 없습니다.
                          </p>
                        )}
                      </div>
                    )}
                    {uiMode === 'AI_ZONE' && (
                      <div
                        style={{
                          marginBottom: 12,
                          padding: '12px 14px',
                          borderRadius: 12,
                          border: '1px solid rgba(56,189,248,0.34)',
                          background: 'linear-gradient(135deg, rgba(8,20,34,0.88) 0%, rgba(15,23,42,0.86) 100%)',
                        }}
                      >
                        {analysis?.aiUnifiedLongShort ? (
                          <>
                            {analysis.aiZoneStats && (
                              <div
                                style={{
                                  marginBottom: 10,
                                  padding: '5px 8px',
                                  borderRadius: 8,
                                  border: '1px solid rgba(148,163,184,0.2)',
                                  background: 'rgba(15,23,42,0.4)',
                                  fontSize: 9,
                                  color: '#94a3b8',
                                  display: 'flex',
                                  gap: 8,
                                  flexWrap: 'wrap',
                                }}
                              >
                                <span>
                                  톤 {analysis.aiZoneStats.signalHealth >= 78 ? '공격' : analysis.aiZoneStats.signalHealth >= 58 ? '중립' : '방어'}
                                </span>
                                <span>일관 {analysis.aiZoneStats.signalHealth}%</span>
                                <span>오버레이 {analysis.aiZoneStats.overlays}</span>
                                <span>존 {analysis.aiZoneStats.zones}</span>
                                <span>라인 {analysis.aiZoneStats.lines}</span>
                              </div>
                            )}
                            <div
                              style={{
                                padding: '10px 11px',
                                borderRadius: 10,
                                border: '1px solid rgba(34,211,238,0.35)',
                                background: 'rgba(6,30,45,0.55)',
                              }}
                            >
                              <div
                                className="space-between"
                                style={{ alignItems: 'flex-start', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}
                              >
                                <div style={{ fontSize: 12, fontWeight: 900, color: '#5eead4' }}>AI 롱/숏 통합</div>
                                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                                  {analysis.aiUnifiedLongShort.metaTags.map((t) => (
                                    <span
                                      key={t}
                                      style={{
                                        fontSize: 8,
                                        fontWeight: 800,
                                        padding: '2px 6px',
                                        borderRadius: 999,
                                        background: 'rgba(15,23,42,0.7)',
                                        border: '1px solid rgba(148,163,184,0.3)',
                                        color: '#94a3b8',
                                        letterSpacing: '0.02em',
                                      }}
                                    >
                                      {t}
                                    </span>
                                  ))}
                                </div>
                              </div>
                              <p style={{ margin: '0 0 4px', fontSize: 12, lineHeight: 1.4, color: '#f8fafc', fontWeight: 800 }}>
                                {analysis.aiUnifiedLongShort.headline}
                              </p>
                              <p style={{ margin: '0 0 8px', fontSize: 9, lineHeight: 1.4, color: '#94a3b8' }}>
                                {analysis.aiUnifiedLongShort.subline}
                              </p>
                              <div
                                style={{
                                  display: 'grid',
                                  gridTemplateColumns: '1fr 1.15fr 1fr',
                                  gap: 5,
                                  marginBottom: 6,
                                  fontSize: 9,
                                  lineHeight: 1.35,
                                }}
                              >
                                <div style={{ padding: '6px', borderRadius: 8, background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)' }}>
                                  <div style={{ color: '#86efac', fontWeight: 900, marginBottom: 3 }}>롱 발판</div>
                                  {analysis.aiUnifiedLongShort.longLeg
                                    ? `${analysis.aiUnifiedLongShort.longLeg.low.toLocaleString(undefined, { maximumFractionDigits: 2 })}~${analysis.aiUnifiedLongShort.longLeg.high.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                                    : '—'}
                                  <div style={{ fontSize: 8, color: '#64748b', marginTop: 2 }}>{analysis.aiUnifiedLongShort.longLeg?.source ?? ' '}</div>
                                </div>
                                <div
                                  style={{
                                    padding: '6px',
                                    borderRadius: 8,
                                    background: 'rgba(2,132,199,0.12)',
                                    border: '1px solid rgba(56,189,248,0.45)',
                                  }}
                                >
                                  <div style={{ color: '#7dd3fc', fontWeight: 900, marginBottom: 3 }}>메인 감시</div>
                                  {analysis.aiUnifiedLongShort.watch ? (
                                    <>
                                      {analysis.aiUnifiedLongShort.watch.side} {analysis.aiUnifiedLongShort.watch.low.toLocaleString(undefined, { maximumFractionDigits: 2 })}~{analysis.aiUnifiedLongShort.watch.high.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                      <div style={{ fontSize: 8, color: '#93c5fd', marginTop: 2 }}>{analysis.aiUnifiedLongShort.watch.role} · {analysis.aiUnifiedLongShort.watch.note}</div>
                                    </>
                                  ) : (
                                    <span style={{ color: '#64748b' }}>감시 구간 미고정</span>
                                  )}
                                </div>
                                <div style={{ padding: '6px', borderRadius: 8, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(248,113,113,0.3)' }}>
                                  <div style={{ color: '#fca5a5', fontWeight: 900, marginBottom: 3 }}>숏 발판</div>
                                  {analysis.aiUnifiedLongShort.shortLeg
                                    ? `${analysis.aiUnifiedLongShort.shortLeg.low.toLocaleString(undefined, { maximumFractionDigits: 2 })}~${analysis.aiUnifiedLongShort.shortLeg.high.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                                    : '—'}
                                  <div style={{ fontSize: 8, color: '#64748b', marginTop: 2 }}>{analysis.aiUnifiedLongShort.shortLeg?.source ?? ' '}</div>
                                </div>
                              </div>
                              <div
                                style={{
                                  display: 'grid',
                                  gridTemplateColumns: '1fr 1fr',
                                  gap: 5,
                                  marginBottom: 6,
                                  fontSize: 9,
                                }}
                              >
                                <div style={{ padding: '5px 6px', borderRadius: 6, background: 'rgba(30,41,59,0.5)' }}>
                                  <span style={{ color: '#7dd3fc', fontWeight: 800 }}>상방 검증</span>
                                  <br />
                                  {analysis.aiUnifiedLongShort.breaks.forMoreUp
                                    ? `${analysis.aiUnifiedLongShort.breaks.forMoreUp.price.toLocaleString(undefined, { maximumFractionDigits: 2 })} — ${analysis.aiUnifiedLongShort.breaks.forMoreUp.label}`
                                    : '—'}
                                </div>
                                <div style={{ padding: '5px 6px', borderRadius: 6, background: 'rgba(30,41,59,0.5)' }}>
                                  <span style={{ color: '#fde68a', fontWeight: 800 }}>하방 검증</span>
                                  <br />
                                  {analysis.aiUnifiedLongShort.breaks.forMoreDown
                                    ? `${analysis.aiUnifiedLongShort.breaks.forMoreDown.price.toLocaleString(undefined, { maximumFractionDigits: 2 })} — ${analysis.aiUnifiedLongShort.breaks.forMoreDown.label}`
                                    : '—'}
                                </div>
                              </div>
                              {analysis.aiUnifiedLongShort.invalidation && (
                                <p style={{ margin: '0 0 6px', fontSize: 9, color: '#fda4af', lineHeight: 1.4 }}>
                                  무효(참고) {analysis.aiUnifiedLongShort.invalidation.price.toLocaleString(undefined, { maximumFractionDigits: 2 })} — {analysis.aiUnifiedLongShort.invalidation.context}
                                </p>
                              )}
                              <div
                                style={{
                                  padding: '6px 7px',
                                  borderRadius: 6,
                                  background: 'rgba(15,23,42,0.5)',
                                  border: '1px solid rgba(129,140,248,0.25)',
                                  fontSize: 8,
                                  lineHeight: 1.4,
                                  color: '#a5b4fc',
                                }}
                              >
                                <div style={{ fontWeight: 800, marginBottom: 3, color: '#c7d2fe' }}>시나리오</div>
                                <div>
                                  A) {analysis.aiUnifiedLongShort.scenarioA}
                                </div>
                                <div style={{ marginTop: 3 }}>B) {analysis.aiUnifiedLongShort.scenarioB}</div>
                              </div>
                            </div>
                            <ul
                              style={{
                                margin: '8px 0 0',
                                paddingLeft: 16,
                                lineHeight: 1.45,
                                color: '#cbd5e1',
                                fontSize: 9,
                              }}
                            >
                              {(analysis.aiUnifiedLongShort.insights ?? analysis.aiUnifiedLongShort.bullets ?? []).map((b, i) => (
                                <li key={i} style={{ marginBottom: 3 }}>
                                  {b}
                                </li>
                              ))}
                            </ul>
                          </>
                        ) : analysis?.aiZoneSignal ? (
                          <>
                            {analysis.aiZoneStats && (
                              <div
                                style={{
                                  marginBottom: 8,
                                  padding: '6px 8px',
                                  borderRadius: 8,
                                  border: '1px solid rgba(148,163,184,0.26)',
                                  background: 'rgba(15,23,42,0.55)',
                                  fontSize: 10,
                                  color: '#cbd5e1',
                                  display: 'flex',
                                  gap: 10,
                                  flexWrap: 'wrap',
                                }}
                              >
                                <span>
                                  판단 톤{' '}
                                  {analysis.aiZoneStats.signalHealth >= 78
                                    ? '공격'
                                    : analysis.aiZoneStats.signalHealth >= 58
                                      ? '중립'
                                      : '방어'}
                                </span>
                                <span>일관성 {analysis.aiZoneStats.signalHealth}%</span>
                                <span>차트 레이어 {analysis.aiZoneStats.overlays}</span>
                                <span>존 {analysis.aiZoneStats.zones}</span>
                                <span>라인 {analysis.aiZoneStats.lines}</span>
                                <span>추세 {analysis.aiZoneStats.trends}</span>
                              </div>
                            )}
                            <div
                              style={{
                                marginBottom: 8,
                                padding: '8px 10px',
                                borderRadius: 10,
                                background: 'rgba(15,23,42,0.75)',
                                border: '1px solid rgba(148,163,184,0.22)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: 10,
                                flexWrap: 'wrap',
                              }}
                            >
                              <div style={{ fontSize: 13, fontWeight: 900, color: analysis.aiZoneSignal.verdict === 'LONG' ? '#86efac' : analysis.aiZoneSignal.verdict === 'SHORT' ? '#fca5a5' : '#fcd34d' }}>
                                결론 {analysis.aiZoneSignal.verdict}
                              </div>
                              <div style={{ fontSize: 11, color: '#e2e8f0' }}>
                                신뢰도 {analysis.aiZoneSignal.confidence}% · 단계{' '}
                                <span style={{ color: analysis.aiZoneSignal.stage === 'confirmed' ? '#86efac' : analysis.aiZoneSignal.stage === 'prepared' ? '#fde68a' : '#94a3b8', fontWeight: 800 }}>
                                  {analysis.aiZoneSignal.stage === 'confirmed'
                                    ? '✓ 확정'
                                    : analysis.aiZoneSignal.stage === 'prepared'
                                      ? '◐ 준비'
                                      : '● 의견'}
                                </span>
                              </div>
                              <div style={{ fontSize: 10, color: '#94a3b8' }}>
                                L {analysis.aiZoneSignal.longScore} / S {analysis.aiZoneSignal.shortScore}
                              </div>
                            </div>
                            <div
                              style={{
                                display: 'grid',
                                gridTemplateColumns: '1fr 1fr',
                                gap: 8,
                                marginBottom: 6,
                              }}
                            >
                              <div style={{ padding: '6px 7px', borderRadius: 8, background: 'rgba(34,197,94,0.10)', border: '1px solid rgba(34,197,94,0.28)' }}>
                                <div style={{ fontSize: 9, color: '#86efac', fontWeight: 800 }}>
                                  롱 기준존 {analysis.nearestSupportOb ? '(BULL OB)' : analysis.nearestBuyZone ? '(HOTZONE)' : '(대체)'}
                                </div>
                                <div style={{ fontSize: 10, color: '#e2e8f0', marginTop: 2 }}>
                                  {analysis.nearestSupportOb
                                    ? `${analysis.nearestSupportOb.low.toLocaleString(undefined, { maximumFractionDigits: 2 })} ~ ${analysis.nearestSupportOb.high.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                                    : analysis.nearestBuyZone
                                      ? `${analysis.nearestBuyZone.low.toLocaleString(undefined, { maximumFractionDigits: 2 })} ~ ${analysis.nearestBuyZone.high.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                                      : analysis.supportLevel != null
                                        ? `${(Number((analysis.supportLevel as any)?.price ?? analysis.supportLevel) * 0.9975).toLocaleString(undefined, { maximumFractionDigits: 2 })} ~ ${(Number((analysis.supportLevel as any)?.price ?? analysis.supportLevel) * 1.0025).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                                        : analysis.currentPrice != null
                                          ? `${(analysis.currentPrice * 0.9975).toLocaleString(undefined, { maximumFractionDigits: 2 })} ~ ${(analysis.currentPrice * 1.0025).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                                          : '데이터 없음'}
                                </div>
                              </div>
                              <div style={{ padding: '6px 7px', borderRadius: 8, background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.28)' }}>
                                <div style={{ fontSize: 9, color: '#fca5a5', fontWeight: 800 }}>
                                  숏 기준존 {analysis.nearestResistanceOb ? '(BEAR OB)' : analysis.nearestSellZone ? '(HOTZONE)' : '(대체)'}
                                </div>
                                <div style={{ fontSize: 10, color: '#e2e8f0', marginTop: 2 }}>
                                  {analysis.nearestResistanceOb
                                    ? `${analysis.nearestResistanceOb.low.toLocaleString(undefined, { maximumFractionDigits: 2 })} ~ ${analysis.nearestResistanceOb.high.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                                    : analysis.nearestSellZone
                                      ? `${analysis.nearestSellZone.low.toLocaleString(undefined, { maximumFractionDigits: 2 })} ~ ${analysis.nearestSellZone.high.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                                      : analysis.resistanceLevel != null
                                        ? `${(Number((analysis.resistanceLevel as any)?.price ?? analysis.resistanceLevel) * 0.9975).toLocaleString(undefined, { maximumFractionDigits: 2 })} ~ ${(Number((analysis.resistanceLevel as any)?.price ?? analysis.resistanceLevel) * 1.0025).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                                        : analysis.currentPrice != null
                                          ? `${(analysis.currentPrice * 0.9975).toLocaleString(undefined, { maximumFractionDigits: 2 })} ~ ${(analysis.currentPrice * 1.0025).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                                          : '데이터 없음'}
                                </div>
                              </div>
                            </div>
                            <div
                              style={{
                                marginTop: 4,
                                padding: '7px 8px',
                                borderRadius: 8,
                                background: 'rgba(30,41,59,0.55)',
                                border: '1px solid rgba(148,163,184,0.2)',
                                fontSize: 10,
                                lineHeight: 1.45,
                                color: '#cbd5e1',
                              }}
                            >
                              무효 조건:{' '}
                              {analysis.aiZoneSignal.zone?.invalidation != null
                                ? `${analysis.aiZoneSignal.zone.invalidation.toLocaleString(undefined, { maximumFractionDigits: 2 })} 종가 이탈 시 시나리오 폐기`
                                : '고정 무효가 없음(준비 단계)'}
                            </div>
                            <div style={{ marginTop: 6, fontSize: 9, lineHeight: 1.4, color: '#a5b4fc' }}>
                              A) {analysis.aiZoneSignal.scenarios?.[0]?.summary ?? '-'}<br />
                              B) {analysis.aiZoneSignal.scenarios?.[1]?.summary ?? '-'}
                            </div>
                          </>
                        ) : (
                          <div style={{ fontSize: 10, color: '#64748b' }}>브리핑을 구성할 분석 데이터가 아직 충분하지 않습니다.</div>
                        )}
                      </div>
                    )}
                    {(uiMode === 'UNIFIED_DESK' || uiMode === 'AI_ZONE') && (
                      <>
                        <UnifiedDeskDashboardGuide />
                        <AiAnalysisLineHints analysis={analysis} />
                      </>
                    )}
                    {panelFeatures.unifiedGraph && <TradeUnifiedGraph
                      analysis={analysis}
                      candles={fusionCandles}
                      panelFeatures={panelFeatures}
                      onSelectRankingTimeframe={(tf) => {
                        prefetchMarketCandles(tf);
                        setTimeframe(tf);
                        timeframeRef.current = tf;
                        requestLoad(tf);
                      }}
                    />}
                    {panelFeatures.signalBox && <SignalBox analysis={analysis} candles={fusionCandles} panelFeatures={panelFeatures} />}
                    {panelFeatures.executionBriefing && analysis && (
                      <div style={{ marginBottom: 12 }}>
                        <ExecutionBriefingCard
                          analysis={analysis}
                          candles={fusionCandles}
                          theme={theme}
                          isTapMode={isTapMode}
                          swingSeedUsdt={swingSeedUsdt}
                          panelFeatures={panelFeatures}
                          onSwingSeedChange={(v) => {
                            setSwingSeedUsdt(v);
                            saveSettings({ swingSeedUsdt: v });
                          }}
                          onSwingSeedBlur={() => saveSettings({ swingSeedUsdt })}
                        />
                      </div>
                    )}
                    {isExecutionLikeMode && (analysis as any)?.rsiDivergenceSignal && (
                      <div className="rsi-div-panel" style={{ padding: '16px 18px', marginBottom: 14, border: '1px solid rgba(98,239,224,0.3)', background: 'rgba(15,23,42,0.98)', borderRadius: 12 }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0', marginBottom: 14 }}>RSI 다이버전스 스윙 신호</div>
                        {(() => {
                          const sig = (analysis as any).rsiDivergenceSignal as {
                            verdict: 'LONG' | 'SHORT' | 'WATCH' | 'NONE'; totalScore?: number; longScore: number; shortScore: number;
                            scoreBreakdown?: Array<{ label: string; value?: string; points: number; ok: boolean }>;
                            checklistDisplay?: { divergence: string; volume: string; candle: string; trend: string };
                            reasons?: string[];
                          };
                          const total = sig.totalScore ?? (sig.verdict === 'LONG' ? sig.longScore : sig.verdict === 'SHORT' ? sig.shortScore : Math.max(sig.longScore, sig.shortScore));
                          const c = sig.verdict === 'LONG' ? '#22C55E' : sig.verdict === 'SHORT' ? '#EF4444' : sig.verdict === 'WATCH' ? '#ffd666' : '#94a3b8';
                          const checklist = sig.checklistDisplay ?? { divergence: '–', volume: '–', candle: '–', trend: '–' };
                          const labelMap: Record<string, string> = { 'R디 다이버전스': 'Divergence', '거래량 확인': 'Volume', '캔들 확인': 'Candle', '추세 확인': 'Trend' };
                          const breakdown = (sig.scoreBreakdown ?? []).map((b: { label?: string; value?: string; points: number; ok: boolean }, i: number) => {
                            const rawVal = (b as { value?: string }).value;
                            const val = rawVal ?? (i === 0 ? checklist.divergence : i === 1 ? (checklist.volume === 'Vol OK' ? 'OK' : '–') : i === 2 ? (checklist.candle.includes('Bullish') ? 'Bullish' : checklist.candle.includes('Bearish') ? 'Bearish' : checklist.candle) : checklist.trend);
                            return { label: labelMap[b.label ?? ''] ?? b.label ?? '', value: val, points: b.points, ok: b.ok };
                          });
                          const checklistItems = [
                            { key: 'R디 다이버전스', val: checklist.divergence },
                            { key: '거래량 확인', val: checklist.volume },
                            { key: '캔들 확인', val: checklist.candle },
                            { key: '추세 확인', val: checklist.trend },
                          ];
                          return (
                            <>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                                <button type="button" style={{ padding: '10px 24px', fontWeight: 800, fontSize: 18, background: sig.verdict === 'LONG' ? 'rgba(98,239,224,0.2)' : sig.verdict === 'SHORT' ? 'rgba(255,123,123,0.2)' : sig.verdict === 'WATCH' ? 'rgba(255,214,102,0.15)' : 'rgba(148,163,184,0.15)', border: `2px solid ${c}`, color: c, borderRadius: 8 }}>
                                  {sig.verdict === 'LONG' ? 'LONG' : sig.verdict === 'SHORT' ? 'SHORT' : sig.verdict === 'WATCH' ? 'WATCH' : 'NONE'}
                                </button>
                                <div style={{ position: 'relative', width: 80, height: 80 }}>
                                  <svg viewBox="0 0 36 36" style={{ transform: 'rotate(-90deg)', width: 80, height: 80 }}>
                                    <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="2.8" />
                                    <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke={c} strokeWidth="2.8" strokeDasharray={`${total}, 100`} strokeLinecap="round" />
                                  </svg>
                                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 800, color: c }}>{total}</div>
                                </div>
                              </div>
                              <div style={{ marginBottom: 12 }}>
                                {breakdown.length ? breakdown.map((b, i) => (
                                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, marginBottom: 6 }}>
                                    <span style={{ color: b.ok ? '#62efe0' : '#64748b', width: 18 }}>{b.ok ? '✓' : '○'}</span>
                                    <span style={{ color: '#94a3b8', flex: 1 }}>{b.label}</span>
                                    {b.value !== '–' && <span style={{ color: b.ok ? c : '#64748b', fontWeight: 600 }}>{b.value}</span>}
                                    <span style={{ color: b.points > 0 ? c : '#64748b', fontWeight: 700 }}>+{b.points}</span>
                                  </div>
                                )) : [
                                  { label: 'Divergence', value: checklist.divergence, points: 0, ok: false },
                                  { label: 'Volume', value: checklist.volume === 'Vol OK' ? 'OK' : '–', points: 0, ok: false },
                                  { label: 'Candle', value: checklist.candle, points: 0, ok: false },
                                  { label: 'Trend', value: checklist.trend, points: 0, ok: false },
                                ].map((b, i) => (
                                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, marginBottom: 6 }}>
                                    <span style={{ color: b.value !== '–' ? '#62efe0' : '#64748b', width: 18 }}>{b.value !== '–' ? '✓' : '○'}</span>
                                    <span style={{ color: '#94a3b8', flex: 1 }}>{b.label}</span>
                                    {b.value !== '–' && <span style={{ color: c, fontWeight: 600 }}>{b.value}</span>}
                                    <span style={{ color: '#64748b', fontWeight: 700 }}>+{b.points}</span>
                                  </div>
                                ))}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                                <div style={{ flex: 1, height: 8, background: 'rgba(255,255,255,0.1)', borderRadius: 4, overflow: 'hidden' }}>
                                  <div style={{ width: `${Math.min(100, total)}%`, height: '100%', background: c, borderRadius: 4 }} />
                                </div>
                                <span style={{ fontSize: 13, color: '#94a3b8', fontWeight: 700, minWidth: 48 }}>{total}/100</span>
                              </div>
                              <div style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 10 }}>지표 상황</div>
                              {checklistItems.map((item, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, marginBottom: 6 }}>
                                  <span style={{ color: item.val !== '–' ? '#62efe0' : '#64748b', width: 18 }}>{item.val !== '–' ? '✓' : '○'}</span>
                                  <span style={{ color: '#94a3b8', minWidth: 100 }}>{item.key}</span>
                                  <span style={{ color: item.val !== '–' ? c : '#64748b', fontWeight: 600 }}>{item.val}</span>
                                </div>
                              ))}
                              {(sig.reasons?.length ?? 0) > 0 && (
                                <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                                  <div style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>판정 근거</div>
                                  {sig.reasons!.map((r, i) => (
                                    <div key={i} style={{ fontSize: 11, color: '#cbd5e1', marginBottom: 4 }}>{r}</div>
                                  ))}
                                </div>
                              )}
                              <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                                <div style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>Zone 민감도</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                  <input
                                    type="range"
                                    min={0.7}
                                    max={1.3}
                                    step={0.01}
                                    value={zoneSignalSensitivity}
                                    onChange={(e) => {
                                      const v = Math.max(0.7, Math.min(1.3, parseFloat(e.target.value) || 1));
                                      setZoneSignalSensitivity(v);
                                      saveSettings({ zoneSignalSensitivity: v });
                                    }}
                                    onMouseUp={() => saveSettings({ zoneSignalSensitivity })}
                                    onTouchEnd={() => saveSettings({ zoneSignalSensitivity })}
                                    style={{ width: '100%', accentColor: '#62efe0' }}
                                  />
                                  <span style={{ minWidth: 42, fontSize: 12, color: '#cbd5e1', fontWeight: 700 }}>{zoneSignalSensitivity.toFixed(2)}x</span>
                                </div>
                                <div style={{ marginTop: 4, fontSize: 10, color: '#64748b' }}>낮음=보수(신호 적음), 높음=공격(신호 많음)</div>
                              </div>
                              <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                                <div style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>Trendline Lookback (피벗)</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                  <input
                                    type="range"
                                    min={2}
                                    max={15}
                                    step={1}
                                    value={trendlineLookback}
                                    onChange={(e) => {
                                      const v = Math.max(2, Math.min(15, parseInt(e.target.value, 10) || 3));
                                      setTrendlineLookback(v);
                                      saveSettings({ trendlineLookback: v });
                                    }}
                                    onMouseUp={() => {
                                      saveSettings({ trendlineLookback });
                                      requestLoad();
                                    }}
                                    onTouchEnd={() => {
                                      saveSettings({ trendlineLookback });
                                      requestLoad();
                                    }}
                                    style={{ width: '100%', accentColor: '#a78bfa' }}
                                  />
                                  <span style={{ minWidth: 28, fontSize: 12, color: '#cbd5e1', fontWeight: 700 }}>{trendlineLookback}</span>
                                </div>
                                <div style={{ marginTop: 4, fontSize: 10, color: '#64748b' }}>클수록 넓은 스윙·장기 추세선, 작을수록 단기</div>
                              </div>
                              <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                                  <div style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8' }}>ParkF LinReg·추세선 색</div>
                                  <button
                                    type="button"
                                    className="tool-chip tool-chip-button"
                                    style={{ fontSize: 10, padding: '2px 8px' }}
                                    onClick={() => {
                                      const d = DEFAULT_PARKF_TRENDLINE_COLORS;
                                      setParkfLinRegBaseHex(d.linRegBaseHex);
                                      setParkfLinRegLargeHex(d.linRegLargeHex);
                                      setParkfLinRegMediumHex(d.linRegMediumHex);
                                      setParkfLinRegSmallHex(d.linRegSmallHex);
                                      setParkfTrendPrimaryHex(d.trendPrimaryHex);
                                      setParkfTrendSecondaryHex(d.trendSecondaryHex);
                                      saveSettings({
                                        parkfLinRegBaseHex: d.linRegBaseHex,
                                        parkfLinRegLargeHex: d.linRegLargeHex,
                                        parkfLinRegMediumHex: d.linRegMediumHex,
                                        parkfLinRegSmallHex: d.linRegSmallHex,
                                        parkfTrendPrimaryHex: d.trendPrimaryHex,
                                        parkfTrendSecondaryHex: d.trendSecondaryHex,
                                      });
                                      requestLoad();
                                    }}
                                  >
                                    기본값
                                  </button>
                                </div>
                                <div style={{ fontSize: 10, color: '#64748b', marginBottom: 8 }}>다크 배경용 밝은 기본색. 칸에서 색을 고른 뒤 바깥을 한 번 누르면 차트가 갱신됩니다.</div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '6px 10px', alignItems: 'center', fontSize: 11, color: '#cbd5e1' }}>
                                  <span>LinReg 기준선</span>
                                  <input type="color" value={parkfLinRegBaseHex} onChange={(e) => { const v = e.target.value; setParkfLinRegBaseHex(v); saveSettings({ parkfLinRegBaseHex: v }); }} onBlur={() => requestLoad()} style={{ width: 40, height: 26, padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' }} title="LinReg 기준선" />
                                  <span>LinReg 대(점선 밴드)</span>
                                  <input type="color" value={parkfLinRegLargeHex} onChange={(e) => { const v = e.target.value; setParkfLinRegLargeHex(v); saveSettings({ parkfLinRegLargeHex: v }); }} onBlur={() => requestLoad()} style={{ width: 40, height: 26, padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' }} />
                                  <span>LinReg 중</span>
                                  <input type="color" value={parkfLinRegMediumHex} onChange={(e) => { const v = e.target.value; setParkfLinRegMediumHex(v); saveSettings({ parkfLinRegMediumHex: v }); }} onBlur={() => requestLoad()} style={{ width: 40, height: 26, padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' }} />
                                  <span>LinReg 소</span>
                                  <input type="color" value={parkfLinRegSmallHex} onChange={(e) => { const v = e.target.value; setParkfLinRegSmallHex(v); saveSettings({ parkfLinRegSmallHex: v }); }} onBlur={() => requestLoad()} style={{ width: 40, height: 26, padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' }} />
                                  <span>1차 피벗 추세선</span>
                                  <input type="color" value={parkfTrendPrimaryHex} onChange={(e) => { const v = e.target.value; setParkfTrendPrimaryHex(v); saveSettings({ parkfTrendPrimaryHex: v }); }} onBlur={() => requestLoad()} style={{ width: 40, height: 26, padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' }} />
                                  <span>2차 피벗 추세선</span>
                                  <input type="color" value={parkfTrendSecondaryHex} onChange={(e) => { const v = e.target.value; setParkfTrendSecondaryHex(v); saveSettings({ parkfTrendSecondaryHex: v }); }} onBlur={() => requestLoad()} style={{ width: 40, height: 26, padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' }} />
                                </div>
                              </div>
                              <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                                  <div style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8' }}>ParkF 엔진 (Pine)</div>
                                  <button
                                    type="button"
                                    className="tool-chip tool-chip-button"
                                    style={{ fontSize: 10, padding: '2px 8px' }}
                                    onClick={() => {
                                      parkfEngineOptsRef.current = {};
                                      setParkfEngineOpts({});
                                      saveSettings({ parkfEngineOpts: undefined });
                                      requestLoad();
                                    }}
                                  >
                                    기본값
                                  </button>
                                </div>
                                <div style={{ fontSize: 10, color: '#64748b', marginBottom: 8 }}>LinReg·피벗·연장. 변경 시 바로 분석 URL에 반영됩니다.</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 11, color: '#cbd5e1' }}>
                                  <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ minWidth: 100 }}>LinReg 길이</span>
                                    <input
                                      type="number"
                                      min={1}
                                      max={5000}
                                      value={parkfEngineDisplay.linregLength}
                                      onChange={(e) => {
                                        const v = Math.min(5000, Math.max(1, parseInt(e.target.value, 10) || DEFAULT_PARKF_TRENDLINE_OPTS.linregLength));
                                        commitParkfEnginePatch({ linregLength: v });
                                      }}
                                      style={{ width: 80, background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, color: 'inherit', padding: '2px 6px' }}
                                    />
                                  </label>
                                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                                    <input type="checkbox" checked={parkfEngineDisplay.extendLinRegLeft} onChange={(e) => commitParkfEnginePatch({ extendLinRegLeft: e.target.checked })} />
                                    좌측 연장
                                  </label>
                                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                                    <input type="checkbox" checked={parkfEngineDisplay.extendLinRegRight} onChange={(e) => commitParkfEnginePatch({ extendLinRegRight: e.target.checked })} />
                                    우측 연장
                                  </label>
                                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                                    <input type="checkbox" checked={parkfEngineDisplay.useLogChart} onChange={(e) => commitParkfEnginePatch({ useLogChart: e.target.checked })} />
                                    로그 스케일 피벗
                                  </label>
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                                      <input type="checkbox" checked={parkfEngineDisplay.useLargeLinReg} onChange={(e) => commitParkfEnginePatch({ useLargeLinReg: e.target.checked })} />
                                      대 밴드
                                    </label>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                                      <input type="checkbox" checked={parkfEngineDisplay.useMediumLinReg} onChange={(e) => commitParkfEnginePatch({ useMediumLinReg: e.target.checked })} />
                                      중 밴드
                                    </label>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                                      <input type="checkbox" checked={parkfEngineDisplay.useSmallLinReg} onChange={(e) => commitParkfEnginePatch({ useSmallLinReg: e.target.checked })} />
                                      소 밴드
                                    </label>
                                  </div>
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                                      <input type="checkbox" checked={parkfEngineDisplay.showPrimaryTrendlines} onChange={(e) => commitParkfEnginePatch({ showPrimaryTrendlines: e.target.checked })} />
                                      1차 추세선
                                    </label>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                                      <input type="checkbox" checked={parkfEngineDisplay.showSecondaryTrendlines} onChange={(e) => commitParkfEnginePatch({ showSecondaryTrendlines: e.target.checked })} />
                                      2차 추세선
                                    </label>
                                  </div>
                                  <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ minWidth: 100 }}>1차 피벗</span>
                                    <input
                                      type="number"
                                      min={3}
                                      max={60}
                                      value={parkfEngineDisplay.primaryPivotLen}
                                      onChange={(e) =>
                                        commitParkfEnginePatch({
                                          primaryPivotLen: Math.min(60, Math.max(3, parseInt(e.target.value, 10) || DEFAULT_PARKF_TRENDLINE_OPTS.primaryPivotLen)),
                                        })
                                      }
                                      style={{ width: 64, background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, color: 'inherit', padding: '2px 6px' }}
                                    />
                                  </label>
                                  <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ minWidth: 100 }}>2차 피벗</span>
                                    <input
                                      type="number"
                                      min={2}
                                      max={40}
                                      value={parkfEngineDisplay.secondaryPivotLen}
                                      onChange={(e) =>
                                        commitParkfEnginePatch({
                                          secondaryPivotLen: Math.min(40, Math.max(2, parseInt(e.target.value, 10) || DEFAULT_PARKF_TRENDLINE_OPTS.secondaryPivotLen)),
                                        })
                                      }
                                      style={{ width: 64, background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, color: 'inherit', padding: '2px 6px' }}
                                    />
                                  </label>
                                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                    <span style={{ minWidth: 100 }}>1차 연장</span>
                                    <select
                                      value={parkfEngineDisplay.primaryExtension}
                                      onChange={(e) => commitParkfEnginePatch({ primaryExtension: e.target.value })}
                                      style={{ minWidth: 88, background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, color: 'inherit', padding: '4px 6px' }}
                                    >
                                      {PARKF_EXTENSION_OPTIONS.map((opt) => (
                                        <option key={opt} value={opt}>
                                          {opt === 'Infinate' ? '무한' : opt}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                    <span style={{ minWidth: 100 }}>2차 연장</span>
                                    <select
                                      value={parkfEngineDisplay.secondaryExtension}
                                      onChange={(e) => commitParkfEnginePatch({ secondaryExtension: e.target.value })}
                                      style={{ minWidth: 88, background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, color: 'inherit', padding: '4px 6px' }}
                                    >
                                      {PARKF_EXTENSION_OPTIONS.map((opt) => (
                                        <option key={opt} value={opt}>
                                          {opt === 'Infinate' ? '무한' : opt}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                </div>
                              </div>
                              <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                                <div style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>Major Support Zone 폭</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                  <input
                                    type="range"
                                    min={0.6}
                                    max={2.0}
                                    step={0.05}
                                    value={majorZoneWidth}
                                    onChange={(e) => setMajorZoneWidth(Math.max(0.6, Math.min(2.0, parseFloat(e.target.value) || 1)))}
                                    style={{ width: '100%', accentColor: '#22c55e' }}
                                  />
                                  <span style={{ minWidth: 44, fontSize: 12, color: '#cbd5e1', fontWeight: 700 }}>{majorZoneWidth.toFixed(2)}x</span>
                                </div>
                              </div>
                              <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                                <div style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>Major Zone 투명도</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                  <input
                                    type="range"
                                    min={0.08}
                                    max={0.55}
                                    step={0.01}
                                    value={majorZoneOpacity}
                                    onChange={(e) => setMajorZoneOpacity(Math.max(0.08, Math.min(0.55, parseFloat(e.target.value) || 0.24)))}
                                    style={{ width: '100%', accentColor: '#f59e0b' }}
                                  />
                                  <span style={{ minWidth: 44, fontSize: 12, color: '#cbd5e1', fontWeight: 700 }}>{majorZoneOpacity.toFixed(2)}</span>
                                </div>
                              </div>
                              <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                                <div style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>Major Zone 최소 반응 횟수</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                  <input
                                    type="range"
                                    min={2}
                                    max={6}
                                    step={1}
                                    value={majorZoneTouches}
                                    onChange={(e) => setMajorZoneTouches(Math.max(2, Math.min(6, parseInt(e.target.value, 10) || 2)))}
                                    style={{ width: '100%', accentColor: '#ef4444' }}
                                  />
                                  <span style={{ minWidth: 34, fontSize: 12, color: '#cbd5e1', fontWeight: 700 }}>{majorZoneTouches}회</span>
                                </div>
                              </div>
                              <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 12, color: '#cbd5e1' }}>
                                  <input
                                    type="checkbox"
                                    checked={structureBreakoutRocketWithoutRetest}
                                    onChange={(e) => {
                                      const v = e.target.checked;
                                      setStructureBreakoutRocketWithoutRetest(v);
                                      saveSettings({ structureBreakoutRocketWithoutRetest: v });
                                      requestLoad();
                                    }}
                                  />
                                  <span>구조: 돌파 봉 즉시 로켓(리테스트 없이, RSI·안착 조건 동일)</span>
                                </label>
                                <div style={{ marginTop: 4, fontSize: 10, color: '#64748b' }}>켜면 신호가 늘어날 수 있습니다. 끄면 리테스트 타점만 사용합니다.</div>
                              </div>
                              <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                                <div style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>구조 가격선 세트 수 (E/SL/TP/TP2)</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                  <input
                                    type="range"
                                    min={4}
                                    max={12}
                                    step={1}
                                    value={structurePriceLinesMax}
                                    onChange={(e) => {
                                      const v = Math.max(4, Math.min(12, parseInt(e.target.value, 10) || 8));
                                      setStructurePriceLinesMax(v);
                                      saveSettings({ structurePriceLinesMax: v });
                                    }}
                                    style={{ width: '100%', accentColor: '#a78bfa' }}
                                  />
                                  <span style={{ minWidth: 28, fontSize: 12, color: '#cbd5e1', fontWeight: 700 }}>{structurePriceLinesMax}</span>
                                </div>
                                <div style={{ marginTop: 4, fontSize: 10, color: '#64748b' }}>최근 N개 세트업만 축에 표시 (과밀 방지)</div>
                              </div>
                              <button type="button" className="tool-chip tool-chip-button" style={{ width: '100%', marginTop: 14, padding: '10px 16px', fontSize: 13 }} onClick={() => (document.querySelector('[title="차트 표시 옵션 및 라벨 설정"]') as HTMLButtonElement)?.click()}>
                                설정
                              </button>
                            </>
                          );
                        })()}
                      </div>
                    )}
                    <div className="section-title" style={{ marginTop: 0 }}>세력·고래 구간 (거래소 API)</div>
                    <div className="mini-grid" style={{ marginTop: 8 }}>
                      <div className="mini-card"><div className="metric-label">고래 매수 구간</div><div className="mini-value c-long">{(analysis as any)?.buyZoneProbability != null ? `${(analysis as any).buyZoneProbability}%` : analysis?.nearestBuyZone?.probability != null ? `${analysis.nearestBuyZone.probability}%` : '–'}</div></div>
                      <div className="mini-card"><div className="metric-label">고래 매도 구간</div><div className="mini-value c-short">{(analysis as any)?.sellZoneProbability != null ? `${(analysis as any).sellZoneProbability}%` : analysis?.nearestSellZone?.probability != null ? `${analysis.nearestSellZone.probability}%` : '–'}</div></div>
                      <div className="mini-card"><div className="metric-label">유지 확률 %</div><div className="metric-value">{(analysis as any)?.holdProbability != null ? (analysis as any).holdProbability : analysis?.nearestBuyZone?.holdProbability ?? '–'}</div></div>
                      <div className="mini-card"><div className="metric-label">돌파 확률 %</div><div className="metric-value">{(analysis as any)?.breakProbability != null ? (analysis as any).breakProbability : analysis?.nearestSellZone?.breakProbability ?? '–'}</div></div>
                      <div className="mini-card"><div className="metric-label">함정 위험 %</div><div className="metric-value">{(analysis as any)?.trapRisk != null ? (analysis as any).trapRisk : analysis?.nearestBuyZone?.trapRisk ?? analysis?.nearestSellZone?.trapRisk ?? '–'}</div></div>
                      <div className="mini-card"><div className="metric-label">신호</div><div className={`mini-value ${analysis?.verdict === 'LONG' ? 'c-long' : analysis?.verdict === 'SHORT' ? 'c-short' : ''}`}>{analysis?.verdict === 'LONG' ? '롱' : analysis?.verdict === 'SHORT' ? '숏' : '관망'}</div></div>
                      <div className="mini-card" title="LinReg 밴드·OB·최근 BOS/CHOCH 2/3 — 차트 합류·L/S와 동일. 종합 신호와 별도">
                        <div className="metric-label">SMC 합류(참고)</div>
                        <div
                          className={`mini-value ${
                            analysis?.smcDeskConfluenceLs?.side === 'LONG'
                              ? 'c-long'
                              : analysis?.smcDeskConfluenceLs?.side === 'SHORT'
                                ? 'c-short'
                                : ''
                          }`}
                        >
                          {analysis?.smcDeskConfluenceLs
                            ? analysis.smcDeskConfluenceLs.side === 'LONG'
                              ? '롱'
                              : '숏'
                            : '–'}
                        </div>
                      </div>
                      <div className="mini-card"><div className="metric-label">신뢰도</div><div className="mini-value">{analysis?.confidence ?? '–'}%</div></div>
                    </div>
                    {analysis?.smcDeskConfluenceLs?.differsFromVerdict && (
                      <div className="subtle" style={{ marginTop: 8, fontSize: 10, lineHeight: 1.45, color: '#fbbf24' }}>
                        ※ 종합 신호(롱/숏)는 추세·체결·레짐 등 다요소 합성이고, SMC 합류는 밴드·OB·구조만 본 참고축이라 서로 다를 수 있습니다.
                      </div>
                    )}
                    {(analysis?.nearestBuyZone || analysis?.nearestSellZone) && (
                      <div className="subtle" style={{ marginTop: 6, fontSize: 11 }}>
                        {analysis.nearestBuyZone && <span>고래 매수: {analysis.nearestBuyZone.low.toLocaleString()} ~ {analysis.nearestBuyZone.high.toLocaleString()}</span>}
                        {analysis.nearestBuyZone && analysis.nearestSellZone && ' · '}
                        {analysis.nearestSellZone && <span>고래 매도: {analysis.nearestSellZone.low.toLocaleString()} ~ {analysis.nearestSellZone.high.toLocaleString()}</span>}
                      </div>
                    )}
                    {(uiMode === 'WHALE' ||
                      uiMode === 'MAX_ANALYSIS' ||
                      uiMode === 'SMC_DESK' ||
                      uiMode === 'SMC_DESK_COMPOSITE' ||
                      uiMode === 'SMC_DELTA_DESK' ||
                      uiMode === 'SMART_MONEY_MVP' ||
                      uiMode === 'UNIFIED_DESK' ||
                      uiMode === 'AI_ZONE') &&
                      analysis?.aiModeAutoAnalysis && (
                      <>
                        <div className="section-title" style={{ marginTop: 14 }}>
                          {uiMode === 'WHALE'
                            ? '고래 모드 · 자동 분석'
                            : (uiMode === 'UNIFIED_DESK' || uiMode === 'AI_ZONE')
                              ? '통합작도 · 자동 분석'
                              : uiMode === 'SMC_DESK_COMPOSITE'
                                ? '데스크합성 · 자동 분석'
                              : uiMode === 'SMC_DELTA_DESK'
                                ? '데스크Δ · 자동 분석'
                              : uiMode === 'SMART_MONEY_MVP'
                                ? '세력MVP · 자동 분석'
                              : uiMode === 'SMC_DESK'
                                ? 'SMC 데스크 · 자동 분석'
                              : '최강분석 · 자동 분석'}
                        </div>
                        <div
                          className="subtle"
                          style={{
                            marginTop: 6,
                            padding: '10px 12px',
                            borderRadius: 8,
                            background: 'rgba(98,239,224,0.08)',
                            border: '1px solid rgba(98,239,224,0.22)',
                            fontSize: 11,
                            lineHeight: 1.55,
                          }}
                        >
                          <div style={{ fontWeight: 700, color: '#62efe0', marginBottom: 8 }}>{analysis.aiModeAutoAnalysis.headline}</div>
                          <ul style={{ margin: 0, paddingLeft: 18, color: '#e2e8f0' }}>
                            {analysis.aiModeAutoAnalysis.bullets.map((b, i) => (
                              <li key={i} style={{ marginBottom: 6 }}>{b}</li>
                            ))}
                          </ul>
                          {analysis.aiModeAutoAnalysis.liveCompression && (
                            <div style={{ marginTop: 8, fontSize: 10, color: '#38bdf8' }}>
                              청록 박스: 진행 압축 후보 (점수 {analysis.aiModeAutoAnalysis.liveCompression.score} · {analysis.aiModeAutoAnalysis.liveCompression.hint})
                            </div>
                          )}
                          {analysis.aiModeAutoAnalysis.compression && (
                            <div style={{ marginTop: 8, fontSize: 10, color: '#94a3b8' }}>
                              녹/적 박스: 이미 발생한 압축→장대 패턴 (변위 {analysis.aiModeAutoAnalysis.compression.barsAgo}봉 전).
                            </div>
                          )}
                        </div>
                      </>
                    )}
                    {!isExecutionLikeMode && (analysis as any)?.rsiDivergenceSignal && (
                      <>
                        <div className="section-title" style={{ marginTop: 14 }}>RSI 다이버전스 신호</div>
                        <div className="mini-grid" style={{ marginTop: 6 }}>
                          <div className="mini-card">
                            <div className="metric-label">신호</div>
                            <div className={`mini-value ${(analysis as any).rsiDivergenceSignal.verdict === 'LONG' ? 'c-long' : (analysis as any).rsiDivergenceSignal.verdict === 'SHORT' ? 'c-short' : (analysis as any).rsiDivergenceSignal.verdict === 'WATCH' ? 'c-watch' : ''}`} style={{ fontWeight: 700, color: (analysis as any).rsiDivergenceSignal.verdict === 'NONE' ? '#94a3b8' : undefined }}>
                              {(analysis as any).rsiDivergenceSignal.verdict === 'LONG' ? 'LONG' : (analysis as any).rsiDivergenceSignal.verdict === 'SHORT' ? 'SHORT' : (analysis as any).rsiDivergenceSignal.verdict === 'WATCH' ? 'WATCH' : 'NONE'}
                            </div>
                          </div>
                          <div className="mini-card"><div className="metric-label">롱 점수</div><div className="mini-value c-long">{(analysis as any).rsiDivergenceSignal.longScore}</div></div>
                          <div className="mini-card"><div className="metric-label">숏 점수</div><div className="mini-value c-short">{(analysis as any).rsiDivergenceSignal.shortScore}</div></div>
                          <div className="mini-card"><div className="metric-label">다이버전스</div><div className="metric-value" style={{ fontSize: 12 }}>{(analysis as any).rsiDivergenceSignal.divergence.label}</div></div>
                          <div className="mini-card"><div className="metric-label">거래량</div><div className="metric-value" style={{ fontSize: 12 }}>{(analysis as any).rsiDivergenceSignal.volume.label}</div></div>
                          <div className="mini-card"><div className="metric-label">캔들 패턴</div><div className="metric-value" style={{ fontSize: 12 }}>{(analysis as any).rsiDivergenceSignal.candle.label}</div></div>
                          <div className="mini-card"><div className="metric-label">추세</div><div className="metric-value" style={{ fontSize: 12 }}>{(analysis as any).rsiDivergenceSignal.trend.label}</div></div>
                        </div>
                        {((analysis as any).rsiDivergenceSignal.reasons?.length ?? 0) > 0 && (
                          <div className="subtle" style={{ marginTop: 8, fontSize: 11, lineHeight: 1.5 }}>
                            {(analysis as any).rsiDivergenceSignal.reasons.map((r: string, i: number) => (
                              <div key={i}>{r}</div>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                    {(analysis?.breakoutLevel || analysis?.invalidationLevel) && (
                      <div className="section-title" style={{ marginTop: 14 }}>돌파 레벨</div>
                    )}
                    {(analysis?.breakoutLevel || analysis?.invalidationLevel) && (
                      <div className="mini-grid" style={{ marginTop: 6 }}>
                        {analysis?.breakoutLevel && (
                          <div className="mini-card">
                            <div className="metric-label">돌파 상승 확률 (가격)</div>
                            <div className="mini-value c-long">{analysis.breakoutLevel.price.toLocaleString()}{(analysis as { breakoutLevelProbability?: number }).breakoutLevelProbability != null ? ` · ${(analysis as { breakoutLevelProbability: number }).breakoutLevelProbability}%` : ''}</div>
                          </div>
                        )}
                        {analysis?.invalidationLevel && (
                          <div className="mini-card">
                            <div className="metric-label">이탈 하락 확률 (가격)</div>
                            <div className="mini-value c-short">{analysis.invalidationLevel.price.toLocaleString()}{(analysis as { invalidationLevelProbability?: number }).invalidationLevelProbability != null ? ` · ${(analysis as { invalidationLevelProbability: number }).invalidationLevelProbability}%` : ''}</div>
                          </div>
                        )}
                      </div>
                    )}
                    {((a: any) => a?.dailyCloseLevel != null || a?.weeklyCloseLevel != null || a?.monthlyCloseLevel != null)(analysis as any) && (
                      <>
                        <div className="section-title" style={{ marginTop: 14 }}>종가 마감선</div>
                        <div className="mini-grid" style={{ marginTop: 6 }}>
                          {(analysis as any).dailyCloseLevel != null && (
                            <div className="mini-card">
                              <div className="metric-label">일봉 종가</div>
                              <div className="metric-value">{(analysis as any).dailyCloseLevel.toLocaleString()}</div>
                              <div className="metric-value" style={{ fontSize: 10 }}>{((s: string) => s === 'accepted_above' ? '✓ 안착 확정' : '✗ 마감 실패')((analysis as any).dailyState)}</div>
                            </div>
                          )}
                          {(analysis as any).weeklyCloseLevel != null && (
                            <div className="mini-card">
                              <div className="metric-label">주봉 종가</div>
                              <div className="metric-value">{(analysis as any).weeklyCloseLevel.toLocaleString()}</div>
                              <div className="metric-value" style={{ fontSize: 10 }}>{((s: string) => s === 'accepted_above' ? '✓ 안착 확정' : '✗ 마감 실패')((analysis as any).weeklyState)}</div>
                            </div>
                          )}
                          {(analysis as any).monthlyCloseLevel != null && (
                            <div className="mini-card">
                              <div className="metric-label">월봉 종가</div>
                              <div className="metric-value">{(analysis as any).monthlyCloseLevel.toLocaleString()}</div>
                              <div className="metric-value" style={{ fontSize: 10 }}>{((s: string) => s === 'accepted_above' ? '✓ 안착 확정' : '✗ 마감 실패')((analysis as any).monthlyState)}</div>
                            </div>
                          )}
                        </div>
                        {((x: any) => x?.mustHoldCloseLevel != null || x?.mustReclaimCloseLevel != null)(analysis as any) && (
                          <div className="mini-grid" style={{ marginTop: 6 }}>
                            {(analysis as any).mustHoldCloseLevel != null && (
                              <div className="mini-card">
                                <div className="metric-label">유지해야 할 종가선</div>
                                <div className="mini-value c-long">{(analysis as any).mustHoldCloseLevel.toLocaleString()}</div>
                              </div>
                            )}
                            {(analysis as any).mustReclaimCloseLevel != null && (
                              <div className="mini-card">
                                <div className="metric-label">재탈환해야 할 종가선</div>
                                <div className="mini-value c-short">{(analysis as any).mustReclaimCloseLevel.toLocaleString()}</div>
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    )}
                    {(analysis?.nearestSupportOb || analysis?.nearestResistanceOb) && (
                      <>
                        <div className="section-title" style={{ marginTop: 14 }}>롱 OB(지지) · 숏 OB(저항)</div>
                        <div className="mini-grid" style={{ marginTop: 6 }}>
                          {analysis?.nearestSupportOb && (
                            <div className="mini-card">
                              <div className="metric-label">롱 쪽 OB (지지)</div>
                              <div className="mini-value c-long">{analysis.nearestSupportOb.low.toLocaleString()} ~ {analysis.nearestSupportOb.high.toLocaleString()}</div>
                              <div className="metric-value" style={{ fontSize: 11 }}>
                                확률 {analysis.nearestSupportOb.probability}%
                                {analysis.nearestSupportOb.pastTouches != null && analysis.nearestSupportOb.pastTouches > 0
                                  ? ` · 과거 터치 ${analysis.nearestSupportOb.pastTouches}회·반응 ${analysis.nearestSupportOb.pastHits ?? 0}회`
                                  : ''}
                                {(analysis as any).supportObOrderbookDepth ? ` · 체결 ${(analysis as any).supportObOrderbookDepth === 'many' ? '많음' : (analysis as any).supportObOrderbookDepth === 'few' ? '적음' : '보통'}` : ''}
                              </div>
                            </div>
                          )}
                          {analysis?.nearestResistanceOb && (
                            <div className="mini-card">
                              <div className="metric-label">저항 OB (하락 OB)</div>
                              <div className="mini-value c-short">{analysis.nearestResistanceOb.low.toLocaleString()} ~ {analysis.nearestResistanceOb.high.toLocaleString()}</div>
                              <div className="metric-value" style={{ fontSize: 11 }}>
                                확률 {analysis.nearestResistanceOb.probability}%
                                {analysis.nearestResistanceOb.pastTouches != null && analysis.nearestResistanceOb.pastTouches > 0
                                  ? ` · 과거 터치 ${analysis.nearestResistanceOb.pastTouches}회·반응 ${analysis.nearestResistanceOb.pastHits ?? 0}회`
                                  : ''}
                                {(analysis as any).resistanceObOrderbookDepth ? ` · 체결 ${(analysis as any).resistanceObOrderbookDepth === 'many' ? '많음' : (analysis as any).resistanceObOrderbookDepth === 'few' ? '적음' : '보통'}` : ''}
                              </div>
                            </div>
                          )}
                        </div>
                      </>
                    )}
                    {analysis?.earlyObAnalysis && (
                      <div className="subtle" style={{ marginTop: 10, fontSize: 11, lineHeight: 1.4 }} title="OB 선포착 분석">
                        <span style={{ fontWeight: 600, color: '#94a3b8' }}>롱·숏 대기 구간 요약</span>
                        <div style={{ marginTop: 4 }}>{analysis.earlyObAnalysis}</div>
                      </div>
                    )}
                    {analysis?.currentZoneSummary && (
                      <div className="subtle" style={{ marginTop: 10, fontSize: 11, lineHeight: 1.4 }} title="지금 구간 (상승/하락 OB vs 과거 캔들)">
                        <span style={{ fontWeight: 600, color: '#94a3b8' }}>지금 구간</span>
                        <div style={{ marginTop: 4 }}>{analysis.currentZoneSummary}</div>
                      </div>
                    )}
                    {(analysis?.breakoutUpsideProbability != null && analysis?.verdict === 'LONG') && (
                      <div className="mini-card" style={{ marginTop: 10 }}>
                        <div className="metric-label">돌파 상승 확률</div>
                        <div className="mini-value c-long">{analysis.breakoutUpsideProbability}%</div>
                        {analysis.breakoutUpsideReasons?.length ? (
                          <div className="metric-value" style={{ fontSize: 10, marginTop: 4 }}>{analysis.breakoutUpsideReasons.join(' · ')}</div>
                        ) : null}
                      </div>
                    )}
                    <div className="section-title" style={{ marginTop: 14 }}>매매 신호</div>
                    <div className="mini-grid" style={{ marginTop: 6 }}>
                      <div className="mini-card"><div className="metric-label">진입</div><div className="metric-value">{analysis?.entry ?? '-'}</div></div>
                      <div className="mini-card"><div className="metric-label">손절</div><div className="metric-value">{analysis?.stopLoss ?? '-'}</div></div>
                      <div className="mini-card"><div className="metric-label">손익비</div><div className="metric-value">{(analysis as any)?.rr != null ? (analysis as any).rr : '-'}</div></div>
                      <div className="mini-card"><div className="metric-label">등급</div><div className="mini-value">{(analysis as any)?.confidenceGrade ?? '-'}</div></div>
                    </div>
                    <div className="list" style={{ marginTop: 6 }}>{(analysis?.targets || []).map((x, i) => <div key={i} className="list-item"><span className="badge">목표{i + 1}</span> {x}</div>)}</div>
                    {panelFeatures.focusOverlay && (
                      <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                        <div className="section-title" style={{ fontSize: '0.9rem' }}>매수 구간 · 포커스</div>
                        <FocusOverlay analysis={analysis} theme={theme} standalone />
                      </div>
                    )}
                    {analysis && (
                      <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                        <div className="section-title" style={{ fontSize: '0.9rem' }}>실행 · 포커스</div>
                        <div className="mini-grid" style={{ marginTop: 6 }}>
                          {(analysis as any).freshnessState && <div className="mini-card"><div className="metric-label">신선도</div><div className="mini-value">{(analysis as any).freshnessState}</div></div>}
                          {(analysis as any).executionState && <div className="mini-card"><div className="metric-label">실행 상태</div><div className="mini-value">{(analysis as any).executionState === 'CONFIRMED' ? '확정' : (analysis as any).executionState}</div></div>}
                          {(analysis as any).holdProbability != null && <div className="mini-card"><div className="metric-label">유지 확률</div><div className="metric-value">{(analysis as any).holdProbability}%</div></div>}
                          {(analysis as any).breakProbability != null && <div className="mini-card"><div className="metric-label">이탈 확률</div><div className="metric-value">{(analysis as any).breakProbability}%</div></div>}
                          {(analysis as any).trapRisk != null && <div className="mini-card"><div className="metric-label">함정 확률</div><div className="metric-value">{(analysis as any).trapRisk}%</div></div>}
                        </div>
                      </div>
                    )}
                    {(analysis as any)?.engine?.tailong && (() => {
                      const t = (analysis as any).engine.tailong;
                      return (
                        <div style={{ marginTop: 12 }}>
                          <div className="section-title" style={{ fontSize: '0.9rem' }}>타이롱</div>
                          <div className="mini-grid" style={{ marginTop: 6 }}>
                            <div className="mini-card"><div className="metric-label">지지</div><div className="metric-value">{t.tailongSupport > 0 ? t.tailongSupport.toFixed(2) : '-'}</div></div>
                            <div className="mini-card"><div className="metric-label">저항</div><div className="metric-value">{t.tailongResistance > 0 ? t.tailongResistance.toFixed(2) : '-'}</div></div>
                            <div className="mini-card"><div className="metric-label">돌파가</div><div className="metric-value">{t.tailongBreakPrice > 0 ? t.tailongBreakPrice.toFixed(2) : '-'}</div></div>
                            <div className="mini-card"><div className="metric-label">방향</div><div className={`mini-value ${t.tailongBreakDirection === 'bullish' ? 'c-long' : 'c-short'}`}>{t.tailongBreakDirection === 'bullish' ? '상승' : '하락'}</div></div>
                          </div>
                        </div>
                      );
                    })()}
                  </>
                )}
                {rightPanelTab === 'market' && (
                  <>
                    {(uiMode === 'UNIFIED_DESK' || uiMode === 'AI_ZONE') && (
                      <div style={{ marginBottom: 12 }}>
                        <UnifiedDeskDashboardGuide />
                        <AiAnalysisLineHints analysis={analysis} />
                      </div>
                    )}
                    <div className="section-title" style={{ marginTop: 0 }}>매수/매도 압력</div>
                  </>
                )}
                {rightPanelTab === 'briefing' && (
                  <>
                    <div className="space-between" style={{ marginTop: 0 }}><div className="section-title">자동 브리핑</div><button className="tool-chip tool-chip-button" onClick={() => window.print()} title="인쇄 / PDF 저장">리포트 저장</button></div>
                    <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                        <span className="subtle" style={{ fontSize: 11 }}>유사도 임계값</span>
                        <strong style={{ fontSize: 12 }}>{briefingSimilarityThreshold}%</strong>
                      </div>
                      <input
                        type="range"
                        min={60}
                        max={95}
                        step={1}
                        value={briefingSimilarityThreshold}
                        onChange={(e) => setBriefingSimilarityThreshold(Number(e.target.value))}
                      />
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                        <input
                          type="checkbox"
                          checked={briefingSimilarReplayEnabled}
                          onChange={(e) => setBriefingSimilarReplayEnabled(e.target.checked)}
                        />
                        유사 케이스 경로 차트 재작도
                      </label>
                    </div>
                    {analysis ? (() => {
                      const sim = (analysis as any).similarBriefing as AnalyzeResponse['similarBriefing'];
                      const briefingInput = sim && (sim.similarity ?? 0) < briefingSimilarityThreshold
                        ? ({ ...analysis, similarBriefing: null } as AnalyzeResponse)
                        : analysis;
                      const txt = generateAutoBriefing(briefingInput);
                      const lines = txt.split('\n');
                      const conclusionLine = lines[0];
                      const rest = lines.slice(1).join('\n');
                      const isLong = conclusionLine.includes('LONG') && !conclusionLine.includes('SHORT');
                      const isShort = conclusionLine.includes('SHORT');
                      return (
                        <div style={{ marginTop: 10 }}>
                          <div
                            style={{
                              padding: '10px 12px',
                              borderRadius: 8,
                              marginBottom: 12,
                              background: isLong ? 'rgba(34,197,94,0.12)' : isShort ? 'rgba(239,68,68,0.12)' : 'rgba(255,214,102,0.08)',
                              border: `1px solid ${isLong ? 'rgba(34,197,94,0.4)' : isShort ? 'rgba(239,68,68,0.4)' : 'rgba(255,214,102,0.3)'}`,
                            }}
                          >
                            <span className={isLong ? 'c-long' : isShort ? 'c-short' : 'c-watch'} style={{ fontWeight: 800, fontSize: 14 }}>{conclusionLine}</span>
                          </div>
                          <div className="subtle" style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{rest}</div>
                        </div>
                      );
                    })() : (loading ? '분석 중...' : '대기 중')}
                  </>
                )}
                {rightPanelTab === 'pattern' && (
                  <div className="section-title" style={{ marginTop: 0 }}>엔진 점수</div>
                )}
                {rightPanelTab === 'ref' && (
                  <>
                    <div className="section-title" style={{ marginTop: 0 }}>참조 매칭</div>
                    <div className="list" style={{ marginTop: 8 }}>{(analysis?.topReferences || []).length === 0 ? <div className="list-item">없음</div> : (analysis?.topReferences || []).map((x) => <div key={x.id} className="list-item" style={{ cursor: 'pointer' }} onClick={() => setRefDetailId(x.id)}><div><strong>{x.title || x.id}</strong> \u00B7 {(x.score * 100).toFixed(0)}%</div></div>)}</div>
                  </>
                )}
                {rightPanelTab === 'virtual' && (
                  <div style={{ marginTop: isExecutionLikeMode ? 0 : 8 }}>
                    <TelegramMultiTfCard />
                    {panelFeatures.virtualCard ? virtualTradeCardNode : <div className="subtle">가상매매 카드 OFF</div>}
                  </div>
                )}
                {rightPanelTab === 'learning' && (
                  panelFeatures.learningCard ? <AutonomousLearningCard analysis={analysis} /> : <div className="subtle">자율학습 카드 OFF</div>
                )}
                {rightPanelTab === 'candle' && (
                  panelFeatures.candleCompareCard ? <CandleCompareCard symbol={symbol} /> : <div className="subtle">캔들비교 카드 OFF</div>
                )}
                {rightPanelTab === 'etc' && (
                  <>
                    <div className="section-title" style={{ marginTop: 0 }}>포지션 관리</div>
                    {analysis && <div className="subtle" style={{ marginTop: 8 }}>잔고 {balance} \u00B7 리스크 {riskPercent}%</div>}
                    <button className="tool-chip tool-chip-button" onClick={runBacktest} disabled={backtestLoading} style={{ marginTop: 8 }}>{backtestLoading ? '실행 중...' : '백테스트 실행'}</button>
                    {backtest && <div className="mini-grid" style={{ marginTop: 10 }}><div className="mini-card"><div className="metric-label">승률</div><div className="mini-value">{backtest.winRate.toFixed(1)}%</div></div><div className="mini-card"><div className="metric-label">총손익</div><div className="mini-value">{backtest.totalPnlPct >= 0 ? '+' : ''}{backtest.totalPnlPct.toFixed(2)}%</div></div></div>}
                    <div className="section-title" style={{ marginTop: 14 }}>선택 심볼 요약</div>
                    <div className="subtle" style={{ marginTop: 4, fontSize: 11 }}>검색·드롭다운으로 고른 코인의 전체 분석(차트와 동일) 기준입니다.</div>
                    <div className="multi-grid" style={{ marginTop: 8 }}>{multiResults.map(m => <div key={m.symbol} className="multi-chip" onClick={() => setSymbol(m.symbol)}><strong>{m.symbol}</strong> <span className={m.verdict === 'LONG' ? 'c-long' : m.verdict === 'SHORT' ? 'c-short' : 'c-watch'}>{m.verdict === 'LONG' ? '롱' : m.verdict === 'SHORT' ? '숏' : '관망'} {m.confidence}%</span></div>)}</div>
                    <div className="section-title" style={{ marginTop: 14 }}>기록</div>
                    <div className="list" style={{ marginTop: 8 }}>{history.length === 0 ? <div className="list-item">아직 없음</div> : history.slice(0, 5).map((x, idx) => <div key={`${x.at}-${idx}`} className="list-item"><strong>{x.symbol}</strong> {x.timeframe} \u00B7 {x.verdict} \u00B7 {x.at}</div>)}</div>
                    <div className="section-title" style={{ marginTop: 14 }}>기능 설명 메뉴판</div>
                    <div className="list" style={{ marginTop: 8 }}>
                      <div className="list-item"><span className="badge">돌파</span> 저항선을 위로 넘는 구간</div>
                      <div className="list-item"><span className="badge">지지선</span> 가격이 받쳐지는 라인</div>
                      <div className="list-item"><span className="badge">저항선</span> 가격이 막히는 라인</div>
                      <div className="list-item"><span className="badge">진입선</span> 매수/매도 시작 기준선</div>
                      <div className="list-item"><span className="badge">손절</span> 반대 방향으로 틀릴 때 정리 가격</div>
                      <div className="list-item"><span className="badge">목표</span> 수익 실현 가격</div>
                      <div className="list-item"><span className="badge">유지 확률</span> 현재 방향 유지 가능성</div>
                      <div className="list-item"><span className="badge">돌파 확률</span> 라인/구간을 뚫을 가능성</div>
                      <div className="list-item"><span className="badge">함정 위험</span> 가짜 신호일 가능성</div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {refDetailId && (() => {
              const ref = getReferenceById(refDetailId);
              if (!ref) return null;
              return (
                <div role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setRefDetailId(null)}>
                  <div className="card panel-pad" style={{ maxWidth: 420, maxHeight: '80vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
                    <div className="space-between">
                      <div className="section-title">{ref.title}</div>
                      <button type="button" className="tool-chip tool-chip-button" onClick={() => setRefDetailId(null)}>닫기</button>
                    </div>
                    <div className="subtle" style={{ marginTop: 6 }}>{ref.tags.join(', ')}</div>
                    {ref.exampleBriefing && <div style={{ marginTop: 10 }}><strong>예시 브리핑</strong><div className="subtle" style={{ marginTop: 4 }}>{ref.exampleBriefing}</div></div>}
                  </div>
                </div>
              );
            })()}

            <ReferenceManager />
          </div>
          )}

        </div>

      </main>
      <PageLayoutFab layout={pageLayout} onChange={updatePageLayout} />
    </>
  );
}
