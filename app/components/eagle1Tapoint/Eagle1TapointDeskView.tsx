'use client';

/**
 * 독수리1호 VMAX — 타점엔진 고유 화면.
 * TapointCleanChart + 자동매매칩 + AI합성. 통합·분석과 별개 모드.
 * 패널마다 펴기/접기/OFF (localStorage).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/** 1초 시계 — 부모 전체 리렌더 방지(차트 반짝 완화) */
function TapointKstClock() {
  const [nowKo, setNowKo] = useState('');
  useEffect(() => {
    const tick = () => {
      setNowKo(
        new Date().toLocaleString('ko-KR', {
          timeZone: 'Asia/Seoul',
          hour12: false,
        })
      );
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);
  return <time>{nowKo || '—'} KST</time>;
}
import { loadSettings, saveSettings, type UIMode } from '@/lib/settings';
import {
  TAPOINT_CHART_TFS,
  TAPOINT_SOURCE,
  TAPOINT_SYMBOLS,
  type TapointDecisionReport,
} from '@/lib/eagle1Tapoint/types';
import {
  readTapointModeConfig,
  writeTapointModeConfig,
  tapOnlyArmHintKo,
  tapOnlyStatusKo,
} from '@/lib/eagle1Tapoint/config';
import {
  normalizeTapointTf,
  resolveTapointEntryTf,
  tapointEntryTfLabelKo,
} from '@/lib/eagle1Tapoint/symbolEntryTf';
import { normalizeChartTimeframe, timeframeRank } from '@/lib/constants';
import { subscribeBitgetCandleWs } from '@/lib/bitgetCandleWebsocket';
import {
  chartLiveTipPollMs,
  isChartCandleTipStale,
} from '@/lib/chartLiveKeepAlive';
import { setVisibleInterval } from '@/lib/visibleInterval';
import {
  fetchServerArmHealth,
  syncServerArm,
  type ServerArmHealthSnap,
} from '@/lib/mergedDeskServerArmClient';
import { TapointAutoTradeWatch } from '@/app/components/eagle1Tapoint/TapointAutoTradeWatch';
import { hydrateTapointAccumFromServer } from '@/lib/tapointAccumClient';
import { hydrateCoinStatsFromServer } from '@/lib/mergedDeskCoinStatsPersistClient';
import {
  AUTO_TRADE_SYMBOL_OPTIONS,
  AUTO_TRADE_CFG_EVENT,
  isAutoTradeSymbolEnabled,
  readAutoTradeConfig,
  toggleAutoTradeSymbol,
  writeAutoTradeConfig,
  type AutoTradeSymbolId,
  type MergedDeskAutoTradeConfig,
  wasAutoTradeSignalFired,
  markAutoTradeSignalFired,
} from '@/lib/mergedDeskAutoTradeConfig';
import {
  executeUnifiedAnalysisEntryMulti,
  resolveUnifiedTradeModes,
} from '@/lib/mergedDeskUnifiedAnalysisEntry';
import { readVirtualTradeSession } from '@/lib/mergedDeskVirtualTradeSession';
import { fetchLivePosition, type LivePosition } from '@/lib/mergedDeskLiveOrderClient';
import {
  DEFAULT_VMAX_PANEL_PREFS,
  VMAX_PANEL_LABEL_KO,
  cycleVmaxPanelMode,
  readVmaxPanelPrefs,
  writeVmaxPanelPrefs,
  type VmaxPanelId,
  type VmaxPanelPrefs,
} from '@/lib/eagle1Tapoint/vmaxPanelPrefs';
import {
  TAPOINT_PHONE_MQ,
  readTapointPhoneFsPrefs,
  writeTapointPhoneFsPrefs,
  type TapointPhoneFsMode,
  type TapointPhoneFsPrefs,
} from '@/lib/eagle1Tapoint/phoneFullscreenPrefs';
import {
  buildTapointSignalLiveRows,
  resolveSignalLiveAutoEntry,
  SIGNAL_LIVE_COLOR_LEGEND_KO,
  type SignalLiveRow,
} from '@/lib/eagle1Tapoint/signalLiveBriefing';
import { fireTapointConfirmAlert } from '@/lib/eagle1Tapoint/tapointConfirmAlert';
import type { TapointConfirmSide } from '@/lib/eagle1Tapoint/tapointConfirmAlert';
import {
  buildInstitutionalBandTapPlan,
  INST_BAND_SCALP_A_TAG,
} from '@/lib/eagle1Tapoint/institutionalBandTapPlan';
import { resolveInstBandTripleEntry, instBandStructureSlTp } from '@/lib/eagle1Tapoint/instBandTripleEntry';
import { resolveCoinSkillRiskForSymbol } from '@/lib/mergedDeskCoinSkillRisk';
import {
  buildTapointFactorRows,
  summarizeTapointFactorLean,
  rsi14,
  type FactorRow,
} from '@/lib/eagle1Tapoint/tapointFactorLean';
import { applyInstBandScalpADefaults } from '@/lib/eagle1Tapoint/instBandScalpA';
import {
  readSigLiveCardOrder,
  resetSigLiveCardOrder,
  sortSigLiveRowsByOrder,
  moveSigLiveCard,
  reorderSigLiveCard,
} from '@/lib/eagle1Tapoint/signalLiveCardOrder';
import {
  ENTRY_SIGNAL_GUIDE_BLOCKS,
  ENTRY_SIGNAL_GUIDE_TITLE_KO,
} from '@/lib/eagle1Tapoint/entrySignalGuideKo';
import VmaxPanel from '@/app/components/eagle1Tapoint/VmaxPanel';
import TapointCleanChart, {
  type TapointCandle,
} from '@/app/components/eagle1Tapoint/TapointCleanChart';
import TapointPhoneFullscreenShell from '@/app/components/eagle1Tapoint/TapointPhoneFullscreenShell';
import { TfCandleCloseRemain } from '@/app/components/TfCandleCloseRemain';
import type { AnalyzeResponse, Candle } from '@/types';
import { SETTINGS_CHANGED_EVENT } from '@/lib/useSettingsChangeTick';
import {
  TAPOINT_SHARED_MERGED_FEATURE_CHIPS,
  readTapointSharedMergedFeatureFlags,
  toggleTapointSharedMergedFeature,
  type TapointSharedMergedFeatureFlags,
} from '@/lib/tapointSharedMergedFeatures';
import {
  buildTapointInstitutionalBandSegments,
  buildTapointInstitutionalBand2Segments,
  buildTapointInstBandTouchMarkers,
  buildTapointMtfDumpZoneBands,
  buildTapointRocketMarkersFromAnalysis,
  buildTapointCartBasketMarkers,
  buildTapointSfpMarkers,
  buildTapointParallelChannelSegments,
  mergeTapointSignalsWithSharedLayers,
} from '@/lib/eagle1Tapoint/buildTapointSharedMergedLayers';
import { buildBandMove7Overlay } from '@/lib/eagle1Tapoint/bandMove7';
import type { TapointChartMarker } from '@/lib/eagle1Tapoint/chartSignals';
import { applyTapointBattleZoneStyle } from '@/lib/eagle1Tapoint/applyTapointBattleZoneStyle';
import { applyTapointDumpZoneStyle } from '@/lib/eagle1Tapoint/applyTapointDumpZoneStyle';
import {
  fetchClientMarketCandles,
  peekClientMarketCandles,
} from '@/lib/clientMarketCandleCache';
import { sanitizeChartCandlesForSeries } from '@/lib/volumeHistogramIntelligence';
import {
  MTF_DUMP_HTF_ALWAYS,
  isMtfDumpChartLocalOnlyTf,
  resolveMtfDumpScanTfs,
} from '@/lib/mergedDeskMtfDumpZoneBridge';

import MergedDeskAutoTradePanel from '@/app/components/mergedAnalysis/MergedDeskAutoTradePanel';
import { resolveProfitPatternMonitor } from '@/lib/profitPattern15m/liveSignal';
import { buildProfitPatternChartLines } from '@/lib/profitPattern15m/chartLines';
import {
  ppClearLockedLevels,
  ppGetLockedLevels,
  ppLockLevels,
  type PpLockedLevels,
} from '@/lib/profitPattern15m/lockedLevels';
import { ppJournalAppend, ppJournalList } from '@/lib/profitPattern15m/tradeJournal';
import { ppDayCapRecordTrade } from '@/lib/profitPattern15m/dayCap';
import {
  PP_PAPER_POLICY_KO,
  PROFIT_PATTERN_HOCHUNG,
  PROFIT_PATTERN_SKILL_ID,
  ppNormalizeSymbol,
} from '@/lib/profitPattern15m';

type Props = {
  symbol: string;
  timeframe: string;
  theme?: 'dark' | 'light';
  uiMode: UIMode;
  onUiModeChange: (m: UIMode) => void;
  onSymbolChange: (s: string) => void;
  onRequestChartTf: (tf: string) => void;
  setTimeframe: (tf: string) => void;
};

type CoinSnap = {
  decision: string;
  entry: number | null;
  direction: string | null;
  score: number;
  noteKo: string;
  autoReady?: boolean;
  autoDir?: 'LONG' | 'SHORT' | null;
  autoReasonKo?: string;
  liveScore?: number;
  signalId?: string | null;
};

function decKo(d?: string): string {
  if (d === 'CONFIRMED_LONG') return '확정롱';
  if (d === 'CONFIRMED_SHORT') return '확정숏';
  if (d === 'ARMED_LONG') return '무장롱';
  if (d === 'ARMED_SHORT') return '무장숏';
  if (d === 'LONG') return '롱';
  if (d === 'SHORT') return '숏';
  return '대기';
}

function toneOf(d?: string): 'long' | 'short' | 'armed' | 'wait' {
  if (d?.includes('LONG') && d.includes('CONFIRMED')) return 'long';
  if (d?.includes('SHORT') && d.includes('CONFIRMED')) return 'short';
  if (d?.startsWith('ARMED') || d === 'LONG' || d === 'SHORT') return 'armed';
  return 'wait';
}

/** 한눈 롱/숏 — 중앙 0 · 왼쪽 숏(빨강) · 오른쪽 롱(초록) */
function FactorBar({ row }: { row: FactorRow }) {
  const mag = Math.max(0, Math.min(100, Math.abs(row.signed) || row.strength));
  const longPct = row.signed > 0 ? mag : 0;
  const shortPct = row.signed < 0 ? mag : 0;
  const tag =
    row.bias === 'long' ? '롱' : row.bias === 'short' ? '숏' : '중립';
  const tagCls =
    row.bias === 'long' ? 'long' : row.bias === 'short' ? 'short' : 'flat';
  return (
    <div className={`vmax-factor vmax-factor--${tagCls}`} title={row.noteKo || ''}>
      <span className="vmax-factor-name">{row.label}</span>
      <div className="vmax-factor-bipolar" aria-hidden>
        <div className="vmax-factor-neg">
          <i style={{ width: `${shortPct}%` }} />
        </div>
        <div className="vmax-factor-mid" />
        <div className="vmax-factor-pos">
          <i style={{ width: `${longPct}%` }} />
        </div>
      </div>
      <b className={`vmax-factor-tag ${tagCls}`}>
        {tag}
        {mag > 0 ? mag : '—'}
      </b>
    </div>
  );
}

function strengthKo(n: number): string {
  if (n >= 85) return '매우 강함';
  if (n >= 70) return '강함';
  if (n >= 50) return '보통';
  if (n > 0) return '약함';
  return '—';
}

function decisionBannerKo(
  d?: string,
  auto?: { ready: boolean; reasonKo: string } | null
): { text: string; tone: 'long' | 'short' | 'wait' } {
  if (d === 'CONFIRMED_LONG') {
    if (auto?.ready) {
      return { text: 'LONG 자동진입 준비', tone: 'long' };
    }
    return {
      text: `확정롱 · 합류대기${auto?.reasonKo ? ` · ${String(auto.reasonKo).slice(0, 18)}` : ''}`,
      tone: 'long',
    };
  }
  if (d === 'ARMED_LONG' || d === 'LONG') {
    return { text: 'LONG 무장 · 타점대기', tone: 'long' };
  }
  if (d === 'CONFIRMED_SHORT') {
    if (auto?.ready) {
      return { text: 'SHORT 자동진입 준비', tone: 'short' };
    }
    return {
      text: `확정숏 · 합류대기${auto?.reasonKo ? ` · ${String(auto.reasonKo).slice(0, 18)}` : ''}`,
      tone: 'short',
    };
  }
  if (d === 'ARMED_SHORT' || d === 'SHORT') {
    return { text: 'SHORT 무장 · 타점대기', tone: 'short' };
  }
  return { text: 'WAIT · 대기', tone: 'wait' };
}

export default function Eagle1TapointDeskView(props: Props) {
  const {
    symbol,
    timeframe,
    onSymbolChange,
    onRequestChartTf,
    setTimeframe,
    onUiModeChange,
  } = props;

  const [prefs, setPrefs] = useState<VmaxPanelPrefs>(() => readVmaxPanelPrefs());
  const [phoneFs, setPhoneFs] = useState<TapointPhoneFsPrefs>(() => readTapointPhoneFsPrefs());
  const [isPhone, setIsPhone] = useState(false);
  const [closeNowMs, setCloseNowMs] = useState(() => Date.now());
  const [candles, setCandles] = useState<TapointCandle[]>([]);
  /** 차트에 그리는 봉은 이 심볼·TF와 맞을 때만. 이전 봉을 다른 TF로 먼저 그리지 않음 */
  const [chartPaint, setChartPaint] = useState<{
    symbol: string;
    tf: string;
    candles: TapointCandle[];
  } | null>(null);
  const [report, setReport] = useState<TapointDecisionReport | null>(null);
  /** 신호감지·팩터 — 사용자가 보고 있는 차트 봉 */
  const [viewReport, setViewReport] = useState<TapointDecisionReport | null>(null);
  const [statusKo, setStatusKo] = useState('VMAX 준비…');
  const [cfg, setCfg] = useState(() => readTapointModeConfig());
  const [autoCfg, setAutoCfg] = useState<MergedDeskAutoTradeConfig>(() =>
    readAutoTradeConfig()
  );
  const [coinMap, setCoinMap] = useState<Record<string, CoinSnap>>({});
  const [tickers, setTickers] = useState<Record<string, number>>({});
  const [positions, setPositions] = useState<LivePosition[]>([]);
  const [exchangeUsdt, setExchangeUsdt] = useState<number | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [calcLev, setCalcLev] = useState(20);
  const [calcMargin, setCalcMargin] = useState(50);
  const [calcTpRoe, setCalcTpRoe] = useState(8);
  const [marginMode, setMarginMode] = useState<'isolated' | 'crossed'>('isolated');
  const [showPanelMgr, setShowPanelMgr] = useState(false);
  const [autoTradePanelOpen, setAutoTradePanelOpen] = useState(
    () => readAutoTradeConfig().enabled || readAutoTradeConfig().liveArmed
  );
  const [showEntryGuide, setShowEntryGuide] = useState(false);
  const [serverHealth, setServerHealth] = useState<ServerArmHealthSnap | null>(null);
  const [confirmFlashUntil, setConfirmFlashUntil] = useState(0);
  const [confirmFlashSide, setConfirmFlashSide] = useState<TapointConfirmSide | null>(null);
  const [confirmFlashTick, setConfirmFlashTick] = useState(0);
  const [confirmChartCard, setConfirmChartCard] = useState<{
    side: TapointConfirmSide;
    symbol: string;
    tf: string;
    lineKo: string;
  } | null>(null);
  const [sigLiveOrder, setSigLiveOrder] = useState<string[]>(() => readSigLiveCardOrder());
  const [sigLiveReorderOn, setSigLiveReorderOn] = useState(false);
  const dragCardIdRef = useRef<string | null>(null);
  const busyRef = useRef(false);
  /** 실시간 정체 감지용 — 마지막 봉 open time(sec) */
  const lastCandleTimeRef = useRef<number>(0);
  const [sharedFeat, setSharedFeat] = useState<TapointSharedMergedFeatureFlags>(() =>
    readTapointSharedMergedFeatureFlags()
  );
  const [battleFillOp, setBattleFillOp] = useState(() => {
    const n = Number(loadSettings().tapointBattleZoneFillOpacity);
    return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 14;
  });
  const [battleBorder, setBattleBorder] = useState(
    () => loadSettings().tapointBattleZoneBorderColor || '#facc15'
  );
  const [labelFontPx, setLabelFontPx] = useState(() => {
    const n = Number(loadSettings().tapointChartLabelFontSize);
    return Number.isFinite(n) ? Math.max(7, Math.min(16, Math.round(n))) : 9;
  });
  const [labelColor, setLabelColor] = useState(() => loadSettings().tapointChartLabelColor || '');
  const [dumpEdgeFs, setDumpEdgeFs] = useState(() => {
    const n = Number(loadSettings().chartMergedDeskDumpEdgePriceFontSize);
    return Number.isFinite(n) ? Math.max(7, Math.min(18, Math.round(n))) : 8;
  });
  const [dumpEdgeColor, setDumpEdgeColor] = useState(
    () => loadSettings().chartMergedDeskDumpEdgePriceColor || '#fef08a'
  );
  const [dumpZoneColorMode, setDumpZoneColorMode] = useState<'auto' | 'custom'>(() =>
    loadSettings().chartMergedDeskDumpZoneColorMode === 'auto' ? 'auto' : 'custom'
  );
  const [dumpZoneFill, setDumpZoneFill] = useState(
    () => loadSettings().chartMergedDeskDumpZoneFillColor || '#38bdf8'
  );
  const [dumpZoneBorder, setDumpZoneBorder] = useState(
    () => loadSettings().chartMergedDeskDumpZoneBorderColor || '#38bdf8'
  );
  const [dumpFaceFs, setDumpFaceFs] = useState(() => {
    const n = Number(loadSettings().chartMergedDeskDumpFaceLabelFontSize);
    return Number.isFinite(n) ? Math.max(7, Math.min(18, Math.round(n))) : 9;
  });

  const [mtfDumpCandlesByTf, setMtfDumpCandlesByTf] = useState<Record<string, Candle[]>>({});
  const [rocketAnalyze, setRocketAnalyze] = useState<AnalyzeResponse | null>(null);
  /** 로켓·하락 — 봉 open time에 누적 고정(과거 스크롤용) */
  const rocketPersistRef = useRef<Map<string, TapointChartMarker>>(new Map());
  const candlesForSharedRef = useRef(candles);
  candlesForSharedRef.current = candles;

  /** 진입 후 E/SL/TP 고정 — 재계산으로 이동 금지 */
  const [lockedLevels, setLockedLevels] = useState<PpLockedLevels | null>(() =>
    typeof window !== 'undefined' ? ppGetLockedLevels(symbol) : null
  );
  const [ppJournalPreview, setPpJournalPreview] = useState(() =>
    typeof window !== 'undefined' ? ppJournalList({ symbol, limit: 8 }) : []
  );

  /** 차트 표시 TF · 부모 리렌더/자동진입 TF와 분리 (분·시·일·주·달 전환용) */
  const [chartTf, setChartTf] = useState(() => {
    const fromProp = normalizeChartTimeframe(timeframe);
    if (fromProp) return fromProp;
    return normalizeChartTimeframe(resolveTapointEntryTf(symbol)) || '3m';
  });
  const setTimeframeRef = useRef(setTimeframe);
  const onRequestChartTfRef = useRef(onRequestChartTf);
  setTimeframeRef.current = setTimeframe;
  onRequestChartTfRef.current = onRequestChartTf;
  const prevSymbolForTfRef = useRef<string | null>(null);

  const pushLog = useCallback((msg: string) => {
    setLogs((prev) => [`${new Date().toLocaleTimeString('ko-KR')} · ${msg}`, ...prev].slice(0, 40));
  }, []);

  /** 타점전용 + 기관밴드A안(TP15/SL8 ROE) · 코인칩·서버ARM·TG */
  const tipBootLoggedRef = useRef(false);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setCfg(writeTapointModeConfig({ tapOnly: true, autoExecute: true, enabled: true }));
      const applied = await applyInstBandScalpADefaults({ forceAllChipsOn: true });
      if (cancelled) return;
      setAutoCfg(readAutoTradeConfig());
      setSharedFeat(readTapointSharedMergedFeatureFlags());
      setAutoTradePanelOpen(true);
      void hydrateTapointAccumFromServer().then((h) => {
        if (h.restoredKo) pushLog(h.restoredKo);
      });
      void hydrateCoinStatsFromServer().then((h) => {
        if (h.restoredKo) pushLog(h.restoredKo);
      });
      if (!tipBootLoggedRef.current) {
        tipBootLoggedRef.current = true;
        pushLog(
          applied.ok
            ? `${applied.noteKo} · TG진입연동`
            : `타점전용 · ${tapointEntryTfLabelKo()} · Dual/로켓/초단 실주문 OFF`
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pushLog]);

  const refreshServerHealth = useCallback(async (logOnce = false) => {
    const snap = await fetchServerArmHealth();
    setServerHealth(snap);
    if (logOnce) {
      pushLog(
        snap.ok
          ? `서버점검 · ${snap.healthKo}${snap.serverEntryReady ? ' · 무접속진입가능' : ''}`
          : `서버점검실패 · ${snap.healthKo}`
      );
    }
  }, [pushLog]);

  /** 서버 ARM·틱 점검 · 60초 */
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      const snap = await fetchServerArmHealth();
      if (!cancelled) setServerHealth(snap);
    };
    void tick();
    const id = window.setInterval(() => void tick(), 20_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [autoCfg.liveArmed]);

  useEffect(() => {
    const bump = () => setAutoCfg(readAutoTradeConfig());
    window.addEventListener(AUTO_TRADE_CFG_EVENT, bump);
    return () => window.removeEventListener(AUTO_TRADE_CFG_EVENT, bump);
  }, []);

  /** 폰 뷰포트만 전체화면 A/B 적용 · 데스크톱은 전뷰 유지 */
  useEffect(() => {
    const mq = window.matchMedia(TAPOINT_PHONE_MQ);
    const sync = () => setIsPhone(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  /** TF 칩 · 봉마감 카운트다운 (Bitget 거래소 정렬) */
  useEffect(() => {
    setCloseNowMs(Date.now());
    const id = window.setInterval(() => setCloseNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const setPhoneFsMode = (mode: TapointPhoneFsMode) => {
    const next = writeTapointPhoneFsPrefs({
      mode,
      factorExpanded: mode === 'B' ? true : mode === 'A' ? false : phoneFs.factorExpanded,
    });
    setPhoneFs(next);
  };

  const togglePhoneFsFactor = () => {
    const next = writeTapointPhoneFsPrefs({ factorExpanded: !phoneFs.factorExpanded });
    setPhoneFs(next);
  };

  /** 코인이 바뀔 때만 실행 TF로 차트 맞춤 · 그 외에는 사용자 선택 유지 */
  useEffect(() => {
    if (prevSymbolForTfRef.current === symbol) return;
    prevSymbolForTfRef.current = symbol;
    const tf = normalizeChartTimeframe(resolveTapointEntryTf(symbol)) || '15m';
    setChartTf(tf);
    setTimeframeRef.current(tf);
    onRequestChartTfRef.current(tf);
    writeTapointModeConfig({ chartTf: tf });
  }, [symbol]);

  const cycle = (id: VmaxPanelId) => {
    const next = writeVmaxPanelPrefs({
      [id]: cycleVmaxPanelMode(prefs[id]),
    });
    setPrefs(next);
  };

  const setMode = (id: VmaxPanelId, mode: 'open' | 'fold' | 'off') => {
    const next = writeVmaxPanelPrefs({ [id]: mode });
    setPrefs(next);
  };

  /** 차트 표시용 캔들 — chartTf · 실패·빈응답 시 기존 캔들 유지(블랙/리셋 금지) */
  const loadCandles = useCallback(async () => {
    const tf = normalizeChartTimeframe(chartTf) || chartTf || '15m';
    try {
      const q = new URLSearchParams({ symbol, timeframe: tf, depth: 'recent' });
      const res = await fetch(`/api/market-bitget?${q}`, {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (!res.ok) {
        pushLog(`캔들 ${res.status} · ${tf} · 기존차트유지`);
        return null;
      }
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        candles?: TapointCandle[];
        error?: string;
      };
      if (j.ok && Array.isArray(j.candles) && j.candles.length >= 8) {
        const next = j.candles;
        setChartPaint({ symbol, tf, candles: next });
        setCandles((prev) => {
          if (
            prev.length === next.length &&
            prev.length > 0 &&
            Number(prev[prev.length - 1]?.time) === Number(next[next.length - 1]?.time) &&
            Number(prev[prev.length - 1]?.close) === Number(next[next.length - 1]?.close) &&
            Number(prev[0]?.time) === Number(next[0]?.time)
          ) {
            return prev;
          }
          return next;
        });
        const last = j.candles[j.candles.length - 1];
        if (last?.time != null) lastCandleTimeRef.current = Number(last.time);
        if (last?.close) {
          setTickers((t) => ({ ...t, [symbol]: Number(last.close) }));
        }
        return j.candles;
      }
      pushLog(
        `캔들부족 · ${tf}${j.error ? ` · ${j.error}` : ''} · 기존차트유지`
      );
      return null;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'fetch 실패';
      pushLog(`캔들오류 · ${tf} · ${msg} · 기존차트유지`);
      setStatusKo(`차트 일시지연 · 기존봉 유지`);
      return null;
    }
  }, [symbol, chartTf, pushLog]);

  const tryTapExecute = useCallback(
    async (sym: string, report: TapointDecisionReport) => {
      const modeCfg = readTapointModeConfig();
      if (!modeCfg.autoExecute || !modeCfg.tapOnly) return;

      const ac = readAutoTradeConfig();
      if (!isAutoTradeSymbolEnabled(ac, sym)) {
        pushLog(`칩 OFF · ${sym}`);
        return;
      }
      const needTf = resolveTapointEntryTf(sym);
      const virt = readVirtualTradeSession();
      const modes = resolveUnifiedTradeModes(ac, virt.active);
      if (!modes.length) {
        pushLog(`${sym} · 실전 ARM 또는 가상매매 ON 필요`);
        if (sym === symbol) setStatusKo('ARM/가상 ON 필요');
        return;
      }

      const localBand =
        report.instBandPlan?.upper && report.instBandPlan?.lower
          ? report.instBandPlan
          : sym === symbol && candles.length >= 24
            ? buildInstitutionalBandTapPlan(candles as Candle[], chartTf)
            : report.instBandPlan;
      const skillLev = resolveCoinSkillRiskForSymbol(sym).leverage;
      const aligned = resolveInstBandTripleEntry(
        {
          ...report,
          instBandPlan: localBand
            ? {
                ...(report.instBandPlan || {}),
                ...localBand,
                grade: localBand.grade,
              }
            : report.instBandPlan,
        },
        { leverage: Math.max(1, Math.round(Number(skillLev) || Number(ac.leverage) || 10)) }
      );
      if (
        !aligned.ok ||
        !aligned.direction ||
        aligned.entry == null ||
        aligned.sl == null ||
        aligned.tp == null
      ) {
        pushLog(`${sym} · ${aligned.reasonKo}`);
        if (sym === symbol) setStatusKo(aligned.reasonKo);
        return;
      }
      if (normalizeTapointTf(report.timeframe) !== normalizeTapointTf(needTf)) {
        pushLog(`${sym} TF불일치 · 필요 ${needTf} · 신호 ${report.timeframe}`);
        return;
      }
      const barKey = Math.round(aligned.entry);
      const signalId = `ib-align-${sym}-${needTf}-${aligned.direction}-${barKey}`;
      if (wasAutoTradeSignalFired(signalId)) return;
      markAutoTradeSignalFired(signalId);
      const r = await executeUnifiedAnalysisEntryMulti({
        modes,
        virtActive: virt.active,
        symbol: sym,
        timeframe: needTf,
        direction: aligned.direction,
        price: aligned.entry,
        sl: aligned.sl,
        tp: aligned.tp,
        source: TAPOINT_SOURCE,
        signalKo: aligned.reasonKo,
        evidenceKo: `세판정 · 밴드구조 SL/TP · ${aligned.reasonKo}`,
        cfg: ac,
        liveMark: aligned.entry,
        signalId,
        availableUsdt: virt.equityUsdt,
        analysisTags: [
          'eagle1-vmax',
          'tap-only',
          'triple-align',
          INST_BAND_SCALP_A_TAG,
          `modes:${modes.join('+')}`,
        ],
        leverageFit: aligned.leverage,
      });
      pushLog(r.ok ? `${sym} 세판정 ${aligned.direction} ${r.msg}` : `${sym} 스킵 ${r.msg}`);
      if (sym === symbol) setStatusKo(r.ok ? `세판정주문 · ${r.msg}` : `스킵 · ${r.msg}`);
      if (r.ok && aligned.direction && aligned.entry != null && aligned.sl != null && aligned.tp != null) {
        const locked = ppLockLevels({
          symbol: sym,
          direction: aligned.direction,
          entry: aligned.entry,
          sl: aligned.sl,
          tp: aligned.tp,
          lockedAt: Math.floor(Date.now() / 1000),
          eventId: signalId,
          source: 'instBand',
          lineEntryKo: '진입고정',
          lineSlKo: '손절고정',
          lineTpKo: '익절고정',
        });
        if (sym === symbol) setLockedLevels(locked);
        ppDayCapRecordTrade(sym);
        ppJournalAppend({
          kind: 'ENTRY',
          symbol: sym,
          timeframe: needTf,
          direction: aligned.direction,
          entry: aligned.entry,
          sl: aligned.sl,
          tp: aligned.tp,
          eventId: signalId,
          reasonKo: aligned.reasonKo,
          policyKo: '진입후 E/SL/TP 고정',
        });
        ppJournalAppend({
          kind: 'LOCK',
          symbol: sym,
          direction: aligned.direction,
          entry: aligned.entry,
          sl: aligned.sl,
          tp: aligned.tp,
          eventId: signalId,
          reasonKo: '차트 E/SL/TP 고정',
        });
        if (sym === symbol) setPpJournalPreview(ppJournalList({ symbol: sym, limit: 8 }));
      }
    },
    [pushLog, symbol, candles, chartTf]
  );

  const notifyConfirmIfNeeded = useCallback(
    async (sym: string, nextReport: TapointDecisionReport) => {
      const r = await fireTapointConfirmAlert(nextReport, { telegram: true });
      if (!r.fired || !r.side) return;
      pushLog(`${sym} · ${r.reasonKo} · TG·알림·진동`);
      if (sym === symbol) {
        setConfirmFlashSide(r.side);
        setConfirmFlashUntil(r.flashUntil);
        setConfirmFlashTick((n) => n + 1);
        if (readTapointModeConfig().chartConfirmCardOn !== false) {
          const sideKo = r.side === 'SHORT' ? '확정숏' : '확정롱';
          setConfirmChartCard({
            side: r.side,
            symbol: sym,
            tf: String(nextReport.timeframe || ''),
            lineKo: `타점결정 ${sideKo} · ${String(nextReport.reasonOneLineKo || '').slice(0, 80)}`,
          });
        }
      }
    },
    [symbol, pushLog]
  );

  const runDecide = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      /** 자동진입 판정은 코인별 실행 TF 유지 · 차트 TF와 분리 */
      const entryTf = resolveTapointEntryTf(symbol);
      const q = new URLSearchParams({ symbol, timeframe: entryTf });
      const res = await fetch(`/api/eagle1/tapoint-decide?${q}`, {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (!res.ok) {
        setStatusKo(`판정 HTTP ${res.status}`);
        pushLog(`판정실패 · ${res.status}`);
        return;
      }
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        report?: TapointDecisionReport;
        error?: string;
      };
      if (!j.ok || !j.report) {
        setStatusKo(j.error || '판정 실패');
        return;
      }
      setReport(j.report);
      setStatusKo(j.report.reasonOneLineKo);
      const gateFail = (j.report.gate?.failReasons || []).slice(0, 2).join('·');
      pushLog(
        `${symbol} · ${decKo(j.report.decision)} · ENTRY ${j.report.scores.entry}${
          gateFail ? ` · 게이트 ${gateFail}` : ''
        }${j.report.sharedMerged?.dailyFace?.labelKo ? ` · ${j.report.sharedMerged.dailyFace.labelKo}` : ''}${
          j.report.sharedMerged?.advVolume?.actionKo
            ? ` · 선진 ${j.report.sharedMerged.advVolume.actionKo}`
            : ''
        }`
      );
      await notifyConfirmIfNeeded(symbol, j.report);
      await tryTapExecute(symbol, j.report);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '오류';
      setStatusKo(msg);
      pushLog(`판정오류 · ${msg}`);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [symbol, pushLog, tryTapExecute, notifyConfirmIfNeeded]);

  const refreshMain = useCallback(async () => {
    try {
      await loadCandles();
      await runDecide();
    } catch (e) {
      const msg = e instanceof Error ? e.message : '새로고침 실패';
      setStatusKo(msg);
      pushLog(msg);
    }
  }, [loadCandles, runDecide, pushLog]);

  /** 신호감지·팩터는 화면 봉으로 다시 판정. 자동주문은 코인 실행봉 report를 유지 */
  useEffect(() => {
    let cancelled = false;
    const tf = normalizeChartTimeframe(chartTf) || chartTf || '15m';
    const load = async () => {
      try {
        const q = new URLSearchParams({ symbol, timeframe: tf });
        const res = await fetch(`/api/eagle1/tapoint-decide?${q}`, {
          credentials: 'same-origin',
          cache: 'no-store',
        });
        const j = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          report?: TapointDecisionReport;
        };
        if (!cancelled && j.ok && j.report) setViewReport(j.report);
      } catch {
        /* 카드 갱신만 */
      }
    };
    void load();
    const id = window.setInterval(() => void load(), 20_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [symbol, chartTf]);

  /** 차트 TF만 바뀌면 캔들만 재로드 (자동진입 판정 TF는 유지) · 실패 시 기존봉 유지 */
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const bars = await loadCandles();
      if (cancelled || !bars?.length) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [loadCandles]);

  /**
   * 실시간 차트 — Bitget WS + REST tip 폴링 + 정체 감시.
   * (이전: TF 변경 시에만 load → 수시간 고착)
   */
  useEffect(() => {
    let cancelled = false;
    const tf = normalizeChartTimeframe(chartTf) || chartTf || '15m';

    const applyWsCandle = (candle: {
      time: number;
      open: number;
      high: number;
      low: number;
      close: number;
      volume?: number;
    }) => {
      if (cancelled) return;
      const paintTf = normalizeChartTimeframe(chartTf) || chartTf || '15m';
      lastCandleTimeRef.current = Number(candle.time) || lastCandleTimeRef.current;
      const patchTip = (prev: TapointCandle[]): TapointCandle[] => {
        if (prev.length < 8) return prev;
        const last = prev[prev.length - 1]!;
        if (Number(last.time) === Number(candle.time)) {
          const next = prev.slice();
          next[next.length - 1] = {
            time: candle.time,
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close,
            volume: candle.volume ?? last.volume ?? 0,
          };
          return next;
        }
        if (Number(candle.time) > Number(last.time)) {
          return prev.concat({
            time: candle.time,
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close,
            volume: candle.volume ?? 0,
          });
        }
        return prev;
      };
      setCandles((prev) => patchTip(prev));
      setChartPaint((prev) => {
        if (!prev || prev.symbol !== symbol || prev.tf !== paintTf) return prev;
        const next = patchTip(prev.candles);
        if (next === prev.candles) return prev;
        return { ...prev, candles: next };
      });
      if (candle.close) {
        setTickers((t) => ({ ...t, [symbol]: Number(candle.close) }));
      }
    };

    const unsub = subscribeBitgetCandleWs(symbol, tf, ({ candle }) => {
      applyWsCandle(candle);
    });

    const tipMs = chartLiveTipPollMs(tf);
    const clearTip = setVisibleInterval(() => {
      void loadCandles();
    }, tipMs);

    const clearStale = setVisibleInterval(() => {
      if (cancelled) return;
      if (!isChartCandleTipStale(lastCandleTimeRef.current || null, tf)) return;
      void loadCandles();
    }, 8_000);

    const onVis = () => {
      if (document.visibilityState !== 'visible' || cancelled) return;
      void loadCandles();
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      cancelled = true;
      unsub();
      clearTip();
      clearStale();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [symbol, chartTf, loadCandles]);

  /** 전 코인 타점 스캔 · 코인별 실행 TF */
  useEffect(() => {
    if (!cfg.autoExecute) return;
    let cancelled = false;
    const tick = async () => {
      const ac = readAutoTradeConfig();
      for (const sym of TAPOINT_SYMBOLS) {
        if (cancelled) return;
        if (!isAutoTradeSymbolEnabled(ac, sym)) continue;
        try {
          const tf = resolveTapointEntryTf(sym);
          const q = new URLSearchParams({ symbol: sym, timeframe: tf });
          const res = await fetch(`/api/eagle1/tapoint-decide?${q}`, {
            credentials: 'same-origin',
            cache: 'no-store',
          });
          const j = (await res.json().catch(() => ({}))) as {
            ok?: boolean;
            report?: TapointDecisionReport;
          };
          if (!j.ok || !j.report) continue;
          if (sym === symbol) setReport(j.report);
          const live = resolveSignalLiveAutoEntry(j.report);
          setCoinMap((prev) => ({
            ...prev,
            [sym]: {
              decision: j.report!.decision,
              entry: j.report!.entry,
              direction: j.report!.direction,
              score: j.report!.scores?.entry ?? 0,
              noteKo: `${tf} · ${String(live.reasonKo || '').slice(0, 32)}`,
              autoReady: live.ready,
              autoDir: live.direction,
              autoReasonKo: live.reasonKo,
              liveScore: live.liveScore,
              signalId: j.report!.signalId,
            },
          }));
          await notifyConfirmIfNeeded(sym, j.report);
          await tryTapExecute(sym, j.report);
        } catch {
          /* ignore */
        }
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 45_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [cfg.autoExecute, symbol, tryTapExecute, notifyConfirmIfNeeded]);

  /** 좌측 코인 신호 — 코인별 실행 TF */
  useEffect(() => {
    if (prefs.leftSignals === 'off') return;
    let cancelled = false;
    const tick = async () => {
      const out: Record<string, CoinSnap> = {};
      for (const sym of TAPOINT_SYMBOLS) {
        if (cancelled) return;
        try {
          const tf = resolveTapointEntryTf(sym);
          const q = new URLSearchParams({ symbol: sym, timeframe: tf });
          const res = await fetch(`/api/eagle1/tapoint-decide?${q}`, {
            credentials: 'same-origin',
            cache: 'no-store',
          });
          const j = (await res.json().catch(() => ({}))) as {
            ok?: boolean;
            report?: TapointDecisionReport;
          };
          if (j.ok && j.report) {
            void notifyConfirmIfNeeded(sym, j.report);
            const live = resolveSignalLiveAutoEntry(j.report);
            out[sym] = {
              decision: j.report.decision,
              entry: j.report.entry,
              direction: j.report.direction,
              score: j.report.scores?.entry ?? 0,
              noteKo: `${tf} · ${String(j.report.reasonOneLineKo || '').slice(0, 28)}`,
              autoReady: live.ready,
              autoDir: live.direction,
              autoReasonKo: live.reasonKo,
              liveScore: live.liveScore,
              signalId: j.report.signalId,
            };
            if (j.report.entry) {
              setTickers((t) => ({ ...t, [sym]: j.report!.entry! }));
            }
            if (sym === symbol) setReport(j.report);
          }
        } catch {
          /* ignore */
        }
      }
      if (!cancelled) setCoinMap(out);
    };
    void tick();
    const id = window.setInterval(() => void tick(), 90_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [prefs.leftSignals, notifyConfirmIfNeeded, symbol]);

  const refreshMainRef = useRef(refreshMain);
  refreshMainRef.current = refreshMain;

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const pack = await fetchLivePosition(symbol);
        if (cancelled) return;
        const avail = Number(pack.availableUsdt);
        const eq = Number(pack.equityUsdt);
        if (Number.isFinite(avail) && avail >= 0) setExchangeUsdt(avail);
        else if (Number.isFinite(eq) && eq >= 0) setExchangeUsdt(eq);
        if (prefs.rightPositions !== 'off') {
          const list = (pack.positions || []).filter((p) => Number(p.size) > 0);
          setPositions(list);
          /** 포지션 없으면 고정선 해제 · 기록 */
          const locked = ppGetLockedLevels(symbol);
          if (locked && list.length === 0) {
            ppJournalAppend({
              kind: 'EXIT_MANUAL',
              symbol,
              direction: locked.direction,
              entry: locked.entry,
              sl: locked.sl,
              tp: locked.tp,
              eventId: locked.eventId,
              reasonKo: '포지션 없음 · E/SL/TP 고정 해제',
            });
            ppClearLockedLevels(symbol);
            setLockedLevels(null);
            setPpJournalPreview(ppJournalList({ symbol, limit: 8 }));
          }
        }
      } catch {
        /* ignore · Failed to fetch 오버레이 방지 */
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 12_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [symbol, prefs.rightPositions]);

  /** 심볼 기준 주기 새로고침 · TF 전환마다 판정 재호출 안 함 */
  useEffect(() => {
    const run = () => {
      void refreshMainRef.current().catch(() => {
        /* ignore */
      });
    };
    const t0 = window.setTimeout(run, 250);
    const t = window.setInterval(run, 60_000);
    return () => {
      window.clearTimeout(t0);
      window.clearInterval(t);
    };
  }, [symbol]);

  useEffect(() => {
    setCalcLev(Math.round(Number(autoCfg.leverage) || 20));
    setCalcMargin(Math.max(5, Number(autoCfg.marginUsdt) || 50));
    setCalcTpRoe(Math.max(1, Math.min(50, Number(autoCfg.scalpTp1RoePct) || 8)));
    setMarginMode(autoCfg.marginMode === 'crossed' ? 'crossed' : 'isolated');
  }, [autoCfg.leverage, autoCfg.marginUsdt, autoCfg.marginMode, autoCfg.scalpTp1RoePct]);

  /** 거래소 가용 USDT만 표시 · 미연동 시 — */
  const equityDisplay = exchangeUsdt;

  const bandPlan = useMemo(() => {
    if (report?.instBandPlan) return report.instBandPlan;
    if (!sharedFeat.institutionalBand || candles.length < 24) return null;
    try {
      return buildInstitutionalBandTapPlan(candles as Candle[], chartTf);
    } catch {
      return null;
    }
  }, [report?.instBandPlan, sharedFeat.institutionalBand, candles, chartTf]);

  const bandPx = useMemo(
    () =>
      instBandStructureSlTp({
        direction: bandPlan?.direction,
        entry: bandPlan?.entry,
        upper: bandPlan?.upper,
        lower: bandPlan?.lower,
        atr: bandPlan?.atr,
        huntExtreme: bandPlan?.huntExtreme,
      }),
    [bandPlan]
  );

  useEffect(() => {
    setLockedLevels(ppGetLockedLevels(symbol));
    setPpJournalPreview(ppJournalList({ symbol, limit: 8 }));
    /** 서버 무접속 진입 고정선 동기화 */
    void fetch(
      `/api/profit-pattern/locks?symbol=${encodeURIComponent(symbol)}`,
      { credentials: 'same-origin', cache: 'no-store' }
    )
      .then((r) => r.json())
      .then((j: { ok?: boolean; lock?: PpLockedLevels | null }) => {
        if (!j?.ok || !j.lock) return;
        const locked = ppLockLevels(j.lock);
        setLockedLevels(locked);
      })
      .catch(() => {});
  }, [symbol]);

  const levels = useMemo(() => {
    if (lockedLevels && lockedLevels.symbol === ppNormalizeSymbol(symbol)) {
      return {
        entry: lockedLevels.entry,
        sl: lockedLevels.sl,
        tp1: lockedLevels.tp,
        tp2: null as number | null,
        tp3: null as number | null,
        zoneLo: report?.battleZone?.lo,
        zoneHi: report?.battleZone?.hi,
        zoneMid: report?.battleZone?.mid,
      };
    }
    const struct =
      sharedFeat.institutionalBand && bandPlan
        ? instBandStructureSlTp({
            direction: bandPlan.direction,
            entry: bandPlan.entry,
            upper: bandPlan.upper,
            lower: bandPlan.lower,
            atr: bandPlan.atr,
            huntExtreme: bandPlan.huntExtreme,
          })
        : null;
    const useBand = Boolean(struct);
    return {
      entry: useBand ? struct!.entry : report?.entry,
      sl: useBand ? struct!.sl : report?.sl,
      tp1: useBand ? struct!.tp : report?.tp1,
      tp2: report?.tp2,
      tp3: report?.tp3,
      zoneLo: report?.battleZone?.lo,
      zoneHi: report?.battleZone?.hi,
      zoneMid: report?.battleZone?.mid,
    };
  }, [
    lockedLevels,
    symbol,
    sharedFeat.institutionalBand,
    bandPlan,
    report?.entry,
    report?.sl,
    report?.tp1,
    report?.tp2,
    report?.tp3,
    report?.battleZone?.lo,
    report?.battleZone?.hi,
    report?.battleZone?.mid,
  ]);

  const chartSignalsBase = useMemo(() => report?.chartSignals ?? null, [report?.chartSignals]);

  /** 수익패턴엔진 — 전코인 · 15m 차트에서 모니터 · 차트 가로줄 */
  const profitPatternMon = useMemo(() => {
    const tf = String(normalizeChartTimeframe(chartTf) || chartTf || '').toLowerCase();
    if (tf !== '15m' && tf !== '15') {
      return resolveProfitPatternMonitor({
        symbol,
        timeframe: tf || '3m',
        candles: [],
      });
    }
    return resolveProfitPatternMonitor({
      symbol,
      timeframe: '15m',
      candles: candles as Candle[],
    });
  }, [symbol, chartTf, candles]);

  const ppSignalLoggedRef = useRef<string>('');
  useEffect(() => {
    if (profitPatternMon.status !== 'SIGNAL' || !profitPatternMon.ok) return;
    const eid = `${PROFIT_PATTERN_SKILL_ID}-${profitPatternMon.symbol}-${profitPatternMon.barTime}-${profitPatternMon.direction}`;
    if (ppSignalLoggedRef.current === eid) return;
    ppSignalLoggedRef.current = eid;
    ppJournalAppend({
      kind: 'SIGNAL',
      symbol: profitPatternMon.symbol,
      timeframe: '15m',
      direction: profitPatternMon.direction,
      entry: profitPatternMon.entry,
      sl: profitPatternMon.sl,
      tp: profitPatternMon.tp,
      sizeScale: profitPatternMon.sizeScale,
      reasonKo: profitPatternMon.reasonKo,
      policyKo: PP_PAPER_POLICY_KO,
      eventId: eid,
    });
    setPpJournalPreview(ppJournalList({ symbol, limit: 8 }));
  }, [profitPatternMon, symbol]);

  /** 전투구간 슬라이더 조작 중에는 SETTINGS sync로 setState 하지 않음(무한루프 방지) */
  const battleStyleEditRef = useRef(false);

  useEffect(() => {
    const sync = () => {
      setSharedFeat((prev) => {
        const next = readTapointSharedMergedFeatureFlags();
        if (
          prev.institutionalBand === next.institutionalBand &&
          prev.institutionalBand2 === next.institutionalBand2 &&
          prev.mtfDumpZone === next.mtfDumpZone &&
          prev.structureRocket === next.structureRocket &&
          prev.cartBasket === next.cartBasket &&
          prev.sfp === next.sfp &&
          prev.parallelChannel === next.parallelChannel
        ) {
          return prev;
        }
        return next;
      });
      if (battleStyleEditRef.current) return;
      const s = loadSettings();
      const n = Number(s.tapointBattleZoneFillOpacity);
      const nextOp = Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 14;
      const nextBorder =
        typeof s.tapointBattleZoneBorderColor === 'string' &&
        /^#[0-9a-fA-F]{6}$/.test(s.tapointBattleZoneBorderColor)
          ? s.tapointBattleZoneBorderColor
          : '#facc15';
      setBattleFillOp((prev) => (prev === nextOp ? prev : nextOp));
      setBattleBorder((prev) => (prev === nextBorder ? prev : nextBorder));
      {
        const lf = Number(s.tapointChartLabelFontSize);
        const nextFs = Number.isFinite(lf) ? Math.max(7, Math.min(16, Math.round(lf))) : 9;
        setLabelFontPx((prev) => (prev === nextFs ? prev : nextFs));
      }
      {
        const dfs = Number(s.chartMergedDeskDumpEdgePriceFontSize);
        const nextDfs = Number.isFinite(dfs) ? Math.max(7, Math.min(18, Math.round(dfs))) : 8;
        setDumpEdgeFs((prev) => (prev === nextDfs ? prev : nextDfs));
        const dcol =
          typeof s.chartMergedDeskDumpEdgePriceColor === 'string' &&
          /^#[0-9a-fA-F]{6}$/.test(s.chartMergedDeskDumpEdgePriceColor)
            ? s.chartMergedDeskDumpEdgePriceColor
            : '#fef08a';
        setDumpEdgeColor((prev) => (prev === dcol ? prev : dcol));
        const mode = s.chartMergedDeskDumpZoneColorMode === 'auto' ? 'auto' : 'custom';
        setDumpZoneColorMode((prev) => (prev === mode ? prev : mode));
        const fill =
          typeof s.chartMergedDeskDumpZoneFillColor === 'string' &&
          /^#[0-9a-fA-F]{6}$/.test(s.chartMergedDeskDumpZoneFillColor)
            ? s.chartMergedDeskDumpZoneFillColor
            : '#38bdf8';
        setDumpZoneFill((prev) => (prev === fill ? prev : fill));
        const border =
          typeof s.chartMergedDeskDumpZoneBorderColor === 'string' &&
          /^#[0-9a-fA-F]{6}$/.test(s.chartMergedDeskDumpZoneBorderColor)
            ? s.chartMergedDeskDumpZoneBorderColor
            : fill;
        setDumpZoneBorder((prev) => (prev === border ? prev : border));
        const ffs = Number(s.chartMergedDeskDumpFaceLabelFontSize);
        const nextFace = Number.isFinite(ffs) ? Math.max(7, Math.min(18, Math.round(ffs))) : 9;
        setDumpFaceFs((prev) => (prev === nextFace ? prev : nextFace));
      }
    };
    sync();
    window.addEventListener(SETTINGS_CHANGED_EVENT, sync);
    return () => window.removeEventListener(SETTINGS_CHANGED_EVENT, sync);
  }, []);

  /** MTF 폭락존 — 통합·분석과 동일 fetch */
  useEffect(() => {
    if (!sharedFeat.mtfDumpZone) {
      setMtfDumpCandlesByTf({});
      return;
    }
    let cancelled = false;
    const chartTfNorm = normalizeChartTimeframe(chartTf) || chartTf;
    setMtfDumpCandlesByTf({});
    const source = 'bitget';
    const fetchTfs = isMtfDumpChartLocalOnlyTf(chartTfNorm)
      ? []
      : [...new Set([...MTF_DUMP_HTF_ALWAYS, ...resolveMtfDumpScanTfs(chartTf)])]
          .filter((tf) => tf !== chartTfNorm)
          .sort((a, b) => {
            const aPri = (MTF_DUMP_HTF_ALWAYS as readonly string[]).includes(a) ? 0 : 1;
            const bPri = (MTF_DUMP_HTF_ALWAYS as readonly string[]).includes(b) ? 0 : 1;
            return aPri - bPri || timeframeRank(a) - timeframeRank(b);
          });
    const minBarsForTf = (tf: string) => {
      const n = normalizeChartTimeframe(tf);
      if (n === '1w' || n === '1M' || n === '1d') return 6;
      if (n === '4h' || n === '1h') return 10;
      return 14;
    };
    const putTf = (tf: string, bars: Candle[]) => {
      if (cancelled || !bars.length) return;
      setMtfDumpCandlesByTf((prev) => ({ ...prev, [tf]: bars }));
    };
    void Promise.all(
      fetchTfs.map(async (tf, idx) => {
        const minBars = minBarsForTf(tf);
        const cached = peekClientMarketCandles(symbol, tf, source, true);
        if (cached && cached.length >= minBars) {
          putTf(tf, sanitizeChartCandlesForSeries(cached, tf));
        }
        if (idx > 0) {
          await new Promise((r) => window.setTimeout(r, 200 + idx * 160));
          if (cancelled) return;
        }
        try {
          const raw = await fetchClientMarketCandles({
            symbol,
            timeframe: tf,
            source,
            skipHtfFullUpgrade: true,
          });
          if (cancelled) return;
          const safe = sanitizeChartCandlesForSeries(raw, tf);
          if (safe.length >= minBars) putTf(tf, safe);
        } catch {
          /* skip */
        }
      })
    );
    return () => {
      cancelled = true;
    };
  }, [sharedFeat.mtfDumpZone, symbol, chartTf]);

  /** 구조 로켓 — analyze (뜬 봉에 persist) */
  useEffect(() => {
    if (!sharedFeat.structureRocket) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const q = new URLSearchParams({
          symbol,
          timeframe: normalizeChartTimeframe(chartTf) || chartTf,
          depth: 'recent',
        });
        const res = await fetch(`/api/analyze?${q}`, {
          credentials: 'same-origin',
          cache: 'no-store',
        });
        if (!res.ok || cancelled) return;
        const j = (await res.json().catch(() => null)) as AnalyzeResponse | null;
        if (cancelled || !j) return;
        setRocketAnalyze(j);
        const fresh = buildTapointRocketMarkersFromAnalysis(j, candlesForSharedRef.current as Candle[]);
        const map = rocketPersistRef.current;
        for (const m of fresh) {
          map.set(`${m.time}|${m.label}`, m);
        }
        /** 뜬 봉 마커는 맵에 누적 — 심볼/TF 변경 시에만 clear */
      } catch {
        /* ignore */
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 28_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
    // candles는 tick 내부 ref로 최신 사용 — 의존에서 제외해 analyze 폭주 방지
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharedFeat.structureRocket, symbol, chartTf]);

  useEffect(() => {
    rocketPersistRef.current.clear();
    setRocketAnalyze(null);
  }, [symbol, chartTf]);

  const institutionalBandSegments = useMemo(() => {
    if (!sharedFeat.institutionalBand || candles.length < 8) return [];
    return buildTapointInstitutionalBandSegments(candles as Candle[]);
  }, [sharedFeat.institutionalBand, candles]);

  const institutionalBand2Segments = useMemo(() => {
    if (!sharedFeat.institutionalBand2 || candles.length < 8) return [];
    return buildTapointInstitutionalBand2Segments(candles as Candle[], chartTf);
  }, [sharedFeat.institutionalBand2, candles, chartTf]);

  const parallelChannelSegments = useMemo(() => {
    if (!sharedFeat.parallelChannel || candles.length < 40) return [];
    return buildTapointParallelChannelSegments(
      candles as Candle[],
      `${symbol}|${chartTf}|pce`
    );
  }, [sharedFeat.parallelChannel, candles, symbol, chartTf]);

  const dumpZones = useMemo(() => {
    if (!sharedFeat.mtfDumpZone || candles.length < 12) return [];
    return buildTapointMtfDumpZoneBands(
      candles as Candle[],
      chartTf,
      mtfDumpCandlesByTf,
      symbol
    ).zones;
  }, [sharedFeat.mtfDumpZone, candles, chartTf, mtfDumpCandlesByTf, symbol]);

  const rocketMarkers = useMemo(() => {
    if (!sharedFeat.structureRocket) return [] as TapointChartMarker[];
    const map = rocketPersistRef.current;
    const fresh = buildTapointRocketMarkersFromAnalysis(rocketAnalyze, candles as Candle[]);
    for (const m of fresh) map.set(`${m.time}|${m.label}`, m);
    return Array.from(map.values()).sort((a, b) => a.time - b.time);
  }, [sharedFeat.structureRocket, rocketAnalyze, candles]);

  /** 기관밴드 ON이면 ST선 + LH/SH 터치 전부(전부) */
  const bandTouchMarkers = useMemo(() => {
    if (!sharedFeat.institutionalBand || candles.length < 16) return [] as TapointChartMarker[];
    return buildTapointInstBandTouchMarkers(candles as Candle[], chartTf);
  }, [sharedFeat.institutionalBand, candles, chartTf]);

  /** 3분 · 밴드1·2 연속 터치 이후 ±7% 도달 봉 / 대기 가격선 */
  const bandMove7 = useMemo(() => {
    if (normalizeChartTimeframe(chartTf) !== '3m') return null;
    if (!sharedFeat.institutionalBand && !sharedFeat.institutionalBand2) return null;
    if (candles.length < 40) return null;
    return buildBandMove7Overlay(candles as Candle[]);
  }, [
    chartTf,
    candles,
    sharedFeat.institutionalBand,
    sharedFeat.institutionalBand2,
  ]);

  const cartMarkers = useMemo(() => {
    if (!sharedFeat.cartBasket || candles.length < 24) return [] as TapointChartMarker[];
    return buildTapointCartBasketMarkers(candles as Candle[], chartTf);
  }, [sharedFeat.cartBasket, candles, chartTf]);

  const sfpMarkers = useMemo(() => {
    if (!sharedFeat.sfp || candles.length < 20) return [] as TapointChartMarker[];
    return buildTapointSfpMarkers(candles as Candle[], chartTf);
  }, [sharedFeat.sfp, candles, chartTf]);

  const chartSignals = useMemo(() => {
    const merged = mergeTapointSignalsWithSharedLayers({
      base: chartSignalsBase,
      dumpZones,
      rocketMarkers,
      bandTouchMarkers,
      cartMarkers,
      sfpMarkers,
      dumpOn: sharedFeat.mtfDumpZone,
      rocketOn: sharedFeat.structureRocket,
      bandTouchOn: sharedFeat.institutionalBand,
      cartOn: sharedFeat.cartBasket,
      sfpOn: sharedFeat.sfp,
    });
    const styledBase = applyTapointDumpZoneStyle(applyTapointBattleZoneStyle(merged));
    const styled =
      bandMove7 && (bandMove7.markers.length || bandMove7.lines.length)
        ? {
            ...styledBase,
            markers: [...(styledBase?.markers || []), ...bandMove7.markers],
            lines: [...(styledBase?.lines || []), ...bandMove7.lines],
          }
        : styledBase;
    const struct = sharedFeat.institutionalBand
      ? instBandStructureSlTp({
          direction: bandPlan?.direction,
          entry: bandPlan?.entry,
          upper: bandPlan?.upper,
          lower: bandPlan?.lower,
          atr: bandPlan?.atr,
          huntExtreme: bandPlan?.huntExtreme,
        })
      : null;
    let lines = styled?.lines ? [...styled.lines] : [];
    /** 진입 고정값이 있으면 진입/손절/익절1 가격 고정 */
    if (lockedLevels) {
      lines = lines.map((line) => {
        const title = String(line.title || '');
        if (title === '진입' || title.includes('진입') || title.includes('50x')) {
          if (/스탑|손절|SL/i.test(title)) return { ...line, price: lockedLevels.sl };
          if (/목표|익절|TP/i.test(title)) return { ...line, price: lockedLevels.tp };
          if (/진입|롱|숏|E\b/i.test(title) && !/스탑|목표|손절|익절/i.test(title)) {
            return { ...line, price: lockedLevels.entry };
          }
        }
        if (title === '진입') return { ...line, price: lockedLevels.entry };
        if (title === '손절') return { ...line, price: lockedLevels.sl };
        if (title === '익절1') return { ...line, price: lockedLevels.tp };
        return line;
      });
    } else if (struct && lines.length) {
      lines = lines.map((line) => {
        const title = String(line.title || '');
        if (title === '진입') return { ...line, price: struct.entry };
        if (title === '손절') return { ...line, price: struct.sl };
        if (title === '익절1') return { ...line, price: struct.tp };
        return line;
      });
    }
    /** 수익패턴 50x 가로줄 — 전코인 · 고정 우선 */
    const ppLines = buildProfitPatternChartLines({
      locked: lockedLevels,
      monitor: profitPatternMon,
    });
    for (const pl of ppLines) {
      const exists = lines.some(
        (L) => String(L.title) === pl.title && Math.abs(Number(L.price) - pl.price) < 1e-8
      );
      if (!exists) {
        lines.push({
          title: pl.title,
          price: pl.price,
          color: pl.color,
          lineStyle: pl.lineStyle || 'solid',
          lineWidth: pl.lineWidth || 2,
        });
      }
    }
    if (!styled && !lines.length) return styled;
    return {
      ...(styled || { lines: [], zones: [], markers: [], legendKo: [] }),
      lines,
      legendKo: [
        ...((styled?.legendKo || []) as string[]),
        lockedLevels ? 'E/SL/TP고정' : '',
        profitPatternMon?.status === 'SIGNAL' ? PROFIT_PATTERN_HOCHUNG : '',
      ].filter(Boolean),
    };
  }, [
    chartSignalsBase,
    dumpZones,
    rocketMarkers,
    bandTouchMarkers,
    cartMarkers,
    sfpMarkers,
    sharedFeat.mtfDumpZone,
    sharedFeat.structureRocket,
    sharedFeat.institutionalBand,
    bandPlan,
    sharedFeat.cartBasket,
    sharedFeat.sfp,
    bandMove7,
    battleFillOp,
    battleBorder,
    dumpZoneColorMode,
    dumpZoneFill,
    dumpZoneBorder,
    lockedLevels,
    profitPatternMon,
  ]);


  const closes = useMemo(() => candles.map((c) => Number(c.close)).filter((x) => x > 0), [candles]);
  const rsi = useMemo(() => rsi14(closes), [closes]);
  const buyDom = useMemo(() => {
    const s = report?.scores;
    if (!s) return 50;
    return Math.round((s.direction * 0.45 + s.flow * 0.35 + s.setup * 0.2) );
  }, [report]);

  const rr = useMemo(() => {
    const e = report?.entry;
    const sl = report?.sl;
    const tp = report?.tp1;
    if (!(e && sl && tp) || Math.abs(e - sl) < 1e-9) return null;
    return Math.abs(tp - e) / Math.abs(e - sl);
  }, [report]);

  const calcPnl = (target: number | null | undefined, dir: 'LONG' | 'SHORT' | null) => {
    const e = report?.entry;
    if (!(e && target && dir)) return null;
    const move = dir === 'LONG' ? (target - e) / e : (e - target) / e;
    return calcMargin * calcLev * move;
  };

  const viewTf = normalizeChartTimeframe(chartTf) || chartTf || '15m';
  const cardReport = useMemo(() => {
    if (!viewReport) return null;
    const got = normalizeChartTimeframe(viewReport.timeframe) || viewReport.timeframe;
    return got === viewTf ? viewReport : null;
  }, [viewReport, viewTf]);

  const factors = useMemo(
    (): FactorRow[] => buildTapointFactorRows(cardReport, cardReport?.chartRsi ?? rsi),
    [cardReport, rsi]
  );

  /** 팩터 합류 롱/숏 한눈 요약 */
  const factorLs = useMemo(() => summarizeTapointFactorLean(factors), [factors]);

  const synthScore = cardReport?.scores.entry ?? 0;
  const signalLiveRows = useMemo(() => buildTapointSignalLiveRows(cardReport), [cardReport]);
  const liveAuto = useMemo(() => resolveSignalLiveAutoEntry(report), [report]);
  const confirmFlashOn = confirmFlashUntil > Date.now();
  const signalLiveRowsFlash = useMemo(() => {
    const base = !confirmFlashOn
      ? signalLiveRows
      : signalLiveRows.map((row) =>
          row.id === 'decision' ? { ...row, pulse: true } : row
        );
    return sortSigLiveRowsByOrder(base, sigLiveOrder);
  }, [signalLiveRows, confirmFlashOn, confirmFlashTick, sigLiveOrder]);

  useEffect(() => {
    if (!confirmFlashUntil) return;
    const left = confirmFlashUntil - Date.now();
    if (left <= 0) {
      setConfirmFlashUntil(0);
      setConfirmFlashSide(null);
      return;
    }
    const id = window.setTimeout(() => {
      setConfirmFlashUntil(0);
      setConfirmFlashSide(null);
    }, left);
    return () => window.clearTimeout(id);
  }, [confirmFlashUntil, confirmFlashTick]);
  const banner = useMemo(
    () => decisionBannerKo(cardReport?.decision, resolveSignalLiveAutoEntry(cardReport)),
    [cardReport]
  );

  const renderSigLiveBody = (opts: { compact?: boolean }) => {
    const compact = opts.compact === true;
    return (
      <div className={`vmax-siglive${compact ? ' is-compact' : ''}`}>
        <div className="vmax-siglive-head">
          <span className="vmax-siglive-pulse-dot" aria-hidden />
          <b>실시간 활동 · {viewTf}</b>
          {confirmFlashOn ? (
            <em
              className={`vmax-siglive-confirm-toast${
                confirmFlashSide === 'SHORT' ? ' is-short' : ' is-long'
              }`}
            >
              {confirmFlashSide === 'SHORT' ? '확정숏 · 알림' : '확정롱 · 알림'}
            </em>
          ) : null}
          <button
            type="button"
            className={`vmax-siglive-order-btn${sigLiveReorderOn ? ' is-on' : ''}`}
            title="카드 순서 배치 · 드래그 또는 ▲▼"
            onClick={() => setSigLiveReorderOn((v) => !v)}
          >
            {sigLiveReorderOn ? '배치중' : '배치'}
          </button>
          {sigLiveReorderOn ? (
            <button
              type="button"
              className="vmax-siglive-order-btn"
              title="기본 순서로 복원"
              onClick={() => {
                setSigLiveOrder(resetSigLiveCardOrder());
                pushLog('신호카드 순서 · 기본복원');
              }}
            >
              기본
            </button>
          ) : null}
          <button
            type="button"
            className={`vmax-siglive-guide-btn${showEntryGuide ? ' is-on' : ''}`}
            aria-expanded={showEntryGuide}
            onClick={() => setShowEntryGuide((v) => !v)}
          >
            진입설명
          </button>
          <em>{SIGNAL_LIVE_COLOR_LEGEND_KO}</em>
        </div>
        {showEntryGuide ? (
          <div className="vmax-siglive-guide" role="region" aria-label={ENTRY_SIGNAL_GUIDE_TITLE_KO}>
            <strong className="vmax-siglive-guide-title">{ENTRY_SIGNAL_GUIDE_TITLE_KO}</strong>
            {ENTRY_SIGNAL_GUIDE_BLOCKS.map((block) => (
              <div key={block.title} className="vmax-siglive-guide-block">
                <b>{block.title}</b>
                <ul>
                  {block.lines.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : null}
        <div className="vmax-siglive-coins">
          {TAPOINT_SYMBOLS.map((sym) => {
            const c = coinMap[sym];
            const chipOn = isAutoTradeSymbolEnabled(autoCfg, sym as AutoTradeSymbolId);
            const ready = c?.autoReady === true;
            const dir = c?.autoDir;
            const tone =
              ready && dir === 'LONG'
                ? 'long'
                : ready && dir === 'SHORT'
                  ? 'short'
                  : c?.decision?.includes('LONG')
                    ? 'armed'
                    : c?.decision?.includes('SHORT')
                      ? 'armed'
                      : 'wait';
            return (
              <button
                key={sym}
                type="button"
                className={`vmax-siglive-coin tone-${tone}${ready ? ' is-ready' : ''}${
                  !chipOn ? ' is-off' : ''
                }${symbol === sym ? ' is-sel' : ''}`}
                title={
                  chipOn
                    ? `${sym} · ${c?.autoReasonKo || decKo(c?.decision)} · 칩ON`
                    : `${sym} 칩 OFF · 진입금지`
                }
                onClick={() => onSymbolChange(sym)}
              >
                <strong>{sym.replace('USDT', '')}</strong>
                <span className="vmax-siglive-coin-dir">
                  {ready
                    ? dir === 'SHORT'
                      ? '숏진입'
                      : '롱진입'
                    : c?.decision === 'ARMED_SHORT'
                      ? '숏준비'
                      : c?.decision === 'ARMED_LONG'
                        ? '롱준비'
                        : c?.decision === 'CONFIRMED_SHORT'
                          ? '숏확정'
                          : c?.decision === 'CONFIRMED_LONG'
                            ? '롱확정'
                            : decKo(c?.decision)}
                </span>
                <em>
                  {chipOn
                    ? ready
                      ? 'AUTO'
                      : c?.decision?.startsWith('CONFIRMED')
                        ? '합류대기'
                        : c?.decision?.startsWith('ARMED')
                          ? '스캔'
                          : '스캔'
                    : 'OFF'}
                </em>
                <i
                  className="vmax-siglive-coin-bar"
                  style={{ width: `${Math.max(8, c?.liveScore ?? c?.score ?? 8)}%` }}
                />
              </button>
            );
          })}
        </div>
        <div className="vmax-siglive-grid">
          {signalLiveRowsFlash.map((row: SignalLiveRow, idx: number) => (
            <div
              key={row.id}
              className={`vmax-siglive-card tone-${row.tone}${row.pulse ? ' is-pulse' : ''}${
                confirmFlashOn && row.id === 'decision'
                  ? ` is-confirm-flash${confirmFlashSide === 'SHORT' ? ' is-short' : ' is-long'}`
                  : ''
              }${sigLiveReorderOn ? ' is-reorder' : ''}`}
              draggable={sigLiveReorderOn && row.id !== 'idle'}
              onDragStart={(e) => {
                if (!sigLiveReorderOn || row.id === 'idle') return;
                dragCardIdRef.current = row.id;
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', row.id);
              }}
              onDragOver={(e) => {
                if (!sigLiveReorderOn) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
              }}
              onDrop={(e) => {
                if (!sigLiveReorderOn) return;
                e.preventDefault();
                const from =
                  dragCardIdRef.current || e.dataTransfer.getData('text/plain');
                dragCardIdRef.current = null;
                if (!from || from === row.id) return;
                setSigLiveOrder(reorderSigLiveCard(sigLiveOrder, from, row.id));
              }}
              onDragEnd={() => {
                dragCardIdRef.current = null;
              }}
            >
              {sigLiveReorderOn && row.id !== 'idle' ? (
                <div className="vmax-siglive-order-rail" aria-label="카드 순서">
                  <button
                    type="button"
                    className="vmax-siglive-order-move"
                    disabled={idx <= 0}
                    title="위로"
                    onClick={() =>
                      setSigLiveOrder(moveSigLiveCard(sigLiveOrder, row.id, 'up'))
                    }
                  >
                    ▲
                  </button>
                  <span className="vmax-siglive-order-grip" title="드래그로 이동">
                    ⋮⋮
                  </span>
                  <button
                    type="button"
                    className="vmax-siglive-order-move"
                    disabled={idx >= signalLiveRowsFlash.length - 1}
                    title="아래로"
                    onClick={() =>
                      setSigLiveOrder(moveSigLiveCard(sigLiveOrder, row.id, 'down'))
                    }
                  >
                    ▼
                  </button>
                </div>
              ) : null}
              <div className="vmax-siglive-top">
                <span className="vmax-siglive-emoji" aria-hidden>
                  {row.emoji}
                </span>
                <div className="vmax-siglive-meta">
                  <strong>{row.name}</strong>
                  <small>{row.statusKo}</small>
                  <p className="vmax-siglive-brief">{row.briefKo}</p>
                </div>
                <div className="vmax-siglive-gauge">
                  <span className={`vmax-siglive-badge tone-${row.tone}`}>{row.dirBadge}</span>
                  <div
                    className="vmax-siglive-ring"
                    style={{
                      background: `conic-gradient(var(--sig-accent) ${row.value}%, rgba(30,41,59,0.85) 0)`,
                    }}
                    title={`${row.dirBadge} · ${row.value}`}
                  >
                    <span>{row.value}</span>
                  </div>
                </div>
              </div>
              <div className="vmax-siglive-bar">
                <i style={{ width: `${row.value}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const symbolTradeOn = isAutoTradeSymbolEnabled(autoCfg, symbol as AutoTradeSymbolId);
  const canLong =
    symbolTradeOn &&
    (report?.decision === 'CONFIRMED_LONG' || report?.decision === 'ARMED_LONG');
  const canShort =
    symbolTradeOn &&
    (report?.decision === 'CONFIRMED_SHORT' || report?.decision === 'ARMED_SHORT');

  const toggleChip = (id: AutoTradeSymbolId) => {
    const next = toggleAutoTradeSymbol(autoCfg, id);
    setAutoCfg(next);
    onSymbolChange(id);
    const on = isAutoTradeSymbolEnabled(next, id);
    pushLog(
      on
        ? `${id.replace('USDT', '')} 매매 ON`
        : `${id.replace('USDT', '')} 매매 OFF · 신규진입 금지`
    );
    if (next.liveArmed) {
      void syncServerArm({
        ...next,
        symbols: [...TAPOINT_SYMBOLS],
        leverage: Number(next.leverage) || 50,
        marginUsdt: Number(next.marginUsdt) || Number(calcMargin) || 10,
      });
    }
  };

  const armLive = () => {
    const next = writeAutoTradeConfig({
      enabled: true,
      liveArmed: !autoCfg.liveArmed,
      tradingMode: !autoCfg.liveArmed ? 'LIVE' : 'PAPER',
      aiZoneDriveEnabled: false,
    });
    setAutoCfg(next);
    setAutoTradePanelOpen(true);
    /** 전코인 서버 ARM 동기화 → cron 무접속 진입 */
    void syncServerArm({
      ...next,
      symbols: [...TAPOINT_SYMBOLS],
      leverage: Number(next.leverage) || 50,
      marginUsdt: Number(next.marginUsdt) || Number(calcMargin) || 10,
    }).then((r) => pushLog(r.msg));
    pushLog(tapOnlyArmHintKo(next.liveArmed));
    void refreshServerHealth(true);
  };

  const goMergedChart = () => {
    onUiModeChange('MERGED_ANALYSIS_DESK');
  };

  const fireManual = async (dir: 'LONG' | 'SHORT') => {
    if (!report?.entry || !report?.sl || !report.direction) {
      pushLog('진입/손절 없음 · 스캔 후 재시도');
      return;
    }
    if (
      (dir === 'LONG' && !canLong) ||
      (dir === 'SHORT' && !canShort)
    ) {
      pushLog(`${dir} 조건 미충족`);
      return;
    }
    const ac = readAutoTradeConfig();
    if (!isAutoTradeSymbolEnabled(ac, symbol as AutoTradeSymbolId)) {
      pushLog(`칩 OFF · ${symbol}`);
      return;
    }
    const virt = readVirtualTradeSession();
    const modes = resolveUnifiedTradeModes(ac, virt.active);
    if (!modes.length) {
      pushLog('실전 ARM 또는 가상매매 필요');
      return;
    }
    setBusy(true);
    try {
      const r = await executeUnifiedAnalysisEntryMulti({
        modes,
        virtActive: virt.active,
        symbol,
        timeframe: resolveTapointEntryTf(symbol),
        direction: dir,
        price: report.entry,
        sl: report.sl,
        tp: report.tp1,
        source: 'eagle1-tap-engine',
        signalKo: `타점엔진 ${dir}`,
        cfg: ac,
        signalId: report.signalId || `vmax-manual-${symbol}-${Date.now()}`,
        entryScore: report.scores.entry,
        candles,
        availableUsdt: virt.equityUsdt,
        analysisTags: ['eagle1-vmax', 'manual', 'dual-virt-live', `modes:${modes.join('+')}`],
      });
      pushLog(r.msg || (r.ok ? `${dir} 주문요청` : `${dir} 실패`));
      setStatusKo(r.msg);
    } finally {
      setBusy(false);
    }
  };

  const phoneFsActive = isPhone && phoneFs.mode !== 'off';
  const phoneFsFactorOpen =
    phoneFsActive && (phoneFs.mode === 'B' || phoneFs.factorExpanded);
  const phoneFsRootClass = phoneFsActive
    ? ` is-phone-fs is-phone-fs-${phoneFs.mode}${
        phoneFsFactorOpen ? ' is-factor-open' : ' is-factor-fold'
      }`
    : '';
  const showLeft =
    !phoneFsActive &&
    (prefs.leftSignals !== 'off' ||
      prefs.leftGauge !== 'off' ||
      prefs.leftRegime !== 'off' ||
      prefs.leftSession !== 'off' ||
      prefs.rightSignalLive !== 'off');
  const showRight = !phoneFsActive && prefs.rightSet !== 'off';
  const sigLivePanelMode = prefs.rightSignalLive;

  const tapointChartEl = (
    <TapointCleanChart
      candles={
        chartPaint &&
        chartPaint.symbol === symbol &&
        chartPaint.tf === (normalizeChartTimeframe(chartTf) || chartTf)
          ? chartPaint.candles
          : []
      }
      timeframe={chartTf}
      symbol={symbol}
      levels={levels}
      signals={chartSignals}
      decisionKo={decKo(report?.decision)}
      institutionalBandOn={sharedFeat.institutionalBand}
      institutionalBandSegments={institutionalBandSegments}
      institutionalBand2On={sharedFeat.institutionalBand2}
      institutionalBand2Segments={institutionalBand2Segments}
      parallelChannelOn={sharedFeat.parallelChannel}
      parallelChannelSegments={parallelChannelSegments}
      onRestoreCandles={() => {
        void loadCandles().then(() => {
          pushLog('캔들복원 · 마켓 재로드');
        });
      }}
    />
  );

  const confirmChartCardEl =
    cfg.chartConfirmCardOn !== false &&
    confirmChartCard &&
    confirmChartCard.symbol === symbol ? (
      <aside
        className={`vmax-confirm-card${confirmChartCard.side === 'SHORT' ? ' is-short' : ' is-long'}`}
        role="status"
      >
        <header>
          <strong>
            타점결정 {confirmChartCard.side === 'SHORT' ? '확정숏' : '확정롱'}
          </strong>
          <button type="button" onClick={() => setConfirmChartCard(null)}>
            끄기
          </button>
        </header>
        <p>
          {confirmChartCard.symbol.replace(/USDT$/i, '')}
          {confirmChartCard.tf ? ` · ${confirmChartCard.tf}` : ''}
        </p>
        <p>{confirmChartCard.lineKo}</p>
      </aside>
    ) : null;

  return (
    <div className={`vmax-root${phoneFsRootClass}`}>
      <header className="vmax-head">
        <div className="vmax-brand">
          <span className="vmax-eagle">E1</span>
          <div>
            <strong>독수리1호 VMAX</strong>
            <em>AI AUTO TRADING SYSTEM</em>
          </div>
        </div>

        {prefs.headerStats !== 'off' && (
          <div className={`vmax-stats ${prefs.headerStats === 'fold' ? 'fold' : ''}`}>
            {prefs.headerStats === 'open' && (
              <>
                <div>
                  <span>자산현황</span>
                  <b className="g">
                    {equityDisplay != null
                      ? `${equityDisplay.toLocaleString('en-US', { maximumFractionDigits: 2 })} U`
                      : '—'}
                  </b>
                </div>
                <div>
                  <span>진입점수</span>
                  <b className="g">{synthScore || '—'}</b>
                </div>
                <div>
                  <span>유사표본</span>
                  <b>{report?.historical?.n ?? '—'}</b>
                </div>
                <div>
                  <span>Profit Factor</span>
                  <b>—</b>
                </div>
                <div>
                  <span>실패위험</span>
                  <b className="r">{report?.scores.failureRisk ?? '—'}</b>
                </div>
              </>
            )}
            <button type="button" className="vmax-mini" onClick={() => cycle('headerStats')}>
              성과
            </button>
          </div>
        )}

        <div className="vmax-head-right">
          <button
            type="button"
            className={`vmax-arm ${autoCfg.liveArmed ? 'on' : ''}`}
            onClick={armLive}
          >
            {autoCfg.liveArmed ? '자동매매 ON' : '자동매매 OFF'}
          </button>
          <button
            type="button"
            className={`vmax-mini ${autoTradePanelOpen ? 'on' : ''}`}
            onClick={() => setAutoTradePanelOpen((v) => !v)}
            title="타점엔진 매매창 · 칩·ARM·익절ROE 연동"
          >
            {autoTradePanelOpen ? '매매창닫기' : '매매창'}
          </button>
          <button
            type="button"
            className="vmax-mini"
            onClick={() => void refreshServerHealth(true)}
            title="서버 ARM·최근틱·API키 점검 (주문 없음)"
          >
            서버점검
          </button>
          <span
            className={`vmax-dot ${
              serverHealth?.serverEntryReady
                ? 'ok'
                : serverHealth?.arm?.liveArmed
                  ? 'warn'
                  : ''
            }`}
            title={serverHealth?.noteKo || serverHealth?.healthKo || '서버 ARM 상태'}
          >
            {serverHealth?.serverEntryReady
              ? '서버진입OK'
              : serverHealth?.arm?.liveArmed
                ? 'ARM·키확인'
                : serverHealth?.ok === false
                  ? '서버점검실패'
                  : '서버대기'}
          </span>
          <TapointKstClock />
          <button type="button" className="vmax-mini" onClick={() => setShowPanelMgr((v) => !v)}>
            패널설정
          </button>
        </div>
      </header>

      {serverHealth && (
        <div
          className={`vmax-server-health ${serverHealth.serverEntryReady ? 'ready' : ''}`}
          title={serverHealth.noteKo}
        >
          <b>서버</b>
          <span>{serverHealth.healthKo}</span>
          {serverHealth.arm?.lastStatusKo ? (
            <em>{serverHealth.arm.lastStatusKo.slice(0, 56)}</em>
          ) : null}
        </div>
      )}

      <TapointAutoTradeWatch health={serverHealth} />

      {showPanelMgr && (
        <div className="vmax-mgr">
          <p>각 기능 · 열기 / 접기 / OFF</p>
          <div className="vmax-mgr-grid">
            {(Object.keys(DEFAULT_VMAX_PANEL_PREFS) as VmaxPanelId[]).map((id) => (
              <label key={id}>
                <span>{VMAX_PANEL_LABEL_KO[id]}</span>
                <select
                  value={prefs[id]}
                  onChange={(e) =>
                    setMode(id, e.target.value as 'open' | 'fold' | 'off')
                  }
                >
                  <option value="open">열기</option>
                  <option value="fold">접기</option>
                  <option value="off">OFF</option>
                </select>
              </label>
            ))}
          </div>
        </div>
      )}

      {prefs.ticker !== 'off' && (
        <div className="vmax-ticker">
          {prefs.ticker === 'open' &&
            TAPOINT_SYMBOLS.map((s) => (
              <button
                key={s}
                type="button"
                className={symbol === s ? 'on' : ''}
                onClick={() => onSymbolChange(s)}
              >
                {s.replace('USDT', '')}{' '}
                <b>{tickers[s] != null ? tickers[s]!.toFixed(s.startsWith('BTC') ? 1 : 3) : '—'}</b>
              </button>
            ))}
          <button type="button" className="vmax-mini" onClick={() => cycle('ticker')}>
            시세
          </button>
          {prefs.news !== 'off' && prefs.news === 'open' && (
            <div className="vmax-news">속보 · 데이터 품질·게이트 우선 · 확정아님</div>
          )}
        </div>
      )}

      <div className="vmax-chips">
        {AUTO_TRADE_SYMBOL_OPTIONS.map((o) => {
          const on = isAutoTradeSymbolEnabled(autoCfg, o.id);
          return (
            <button
              key={o.id}
              type="button"
              className={`chip ${on ? 'on' : ''} ${symbol === o.id ? 'sel' : ''}`}
              title={
                on
                  ? `${o.chipKo} 매매 ON · 클릭하면 OFF(진입금지)`
                  : `${o.chipKo} 매매 OFF · 클릭하면 ON`
              }
              onClick={() => toggleChip(o.id)}
            >
              {o.chipKo} <i>{on ? 'ON' : 'OFF'}</i>
            </button>
          );
        })}
        <button
          type="button"
          className="chip merged-link"
          title="통합·분석 모드로 전환"
          onClick={goMergedChart}
        >
          통합·분석
        </button>
        <button
          type="button"
          className="chip merged-link on"
          title="타점엔진 고유 차트 화면"
        >
          타점엔진
        </button>
        {isPhone ? (
          <>
            <button
              type="button"
              className={`chip${phoneFs.mode === 'off' ? ' on' : ''}`}
              title="일반 전뷰 · 기존 타점 화면"
              onClick={() => setPhoneFsMode('off')}
            >
              전뷰
            </button>
            <button
              type="button"
              className={`chip${phoneFs.mode === 'A' ? ' on' : ''}`}
              title="전체화면 A · 게이지+차트 · 팩터접힘"
              onClick={() => setPhoneFsMode('A')}
            >
              전체화면 A
            </button>
            <button
              type="button"
              className={`chip${phoneFs.mode === 'B' ? ' on' : ''}`}
              title="전체화면 B · 게이지+차트 · 팩터펼침"
              onClick={() => setPhoneFsMode('B')}
            >
              전체화면 B
            </button>
          </>
        ) : null}
        <div className="vmax-tfs" title="차트 분봉 전환 · 자동진입은 코인별 실행TF 유지">
          {TAPOINT_CHART_TFS.map((tf) => {
            const apiTf = normalizeChartTimeframe(tf) || tf;
            const on =
              normalizeChartTimeframe(chartTf) === apiTf ||
              normalizeTapointTf(chartTf) === normalizeTapointTf(tf);
            return (
              <button
                key={tf}
                type="button"
                className={on ? 'on' : ''}
                onClick={() => {
                  setChartTf(apiTf);
                  setTimeframeRef.current(apiTf);
                  onRequestChartTfRef.current(apiTf);
                  writeTapointModeConfig({ chartTf: apiTf });
                  pushLog(`차트 TF · ${apiTf} (자동진입 ${resolveTapointEntryTf(symbol)} 유지)`);
                }}
              >
                {tf}
                <TfCandleCloseRemain
                  tf={apiTf}
                  nowMs={closeNowMs}
                  active={on}
                  compact
                  exchange="bitget"
                />
              </button>
            );
          })}
        </div>
        <label className="vmax-autoex">
          <input
            type="checkbox"
            checked={cfg.autoExecute}
            onChange={(e) =>
              setCfg(writeTapointModeConfig({ autoExecute: e.target.checked, tapOnly: true }))
            }
          />
          확정시주문
        </label>
        <label
          className="vmax-autoex"
          title="확정롱/숏 전환 · 텔레그램·반짝임·OS알림·진동 (주문과 별개)"
        >
          <input
            type="checkbox"
            checked={cfg.confirmAlertOn !== false}
            onChange={(e) => {
              const next = writeTapointModeConfig({ confirmAlertOn: e.target.checked });
              setCfg(next);
              pushLog(
                e.target.checked
                  ? '확정알림 ON · TG·반짝임·알림'
                  : '확정알림 OFF · TG·반짝임·알림 중지'
              );
            }}
          />
          확정알림
        </label>
        <label
          className="vmax-autoex"
          title="신호감지 타점결정 확정롱/숏 · 차트 작은 카드. 끄면 카드만 숨김. 텔레그램은 확정알림"
        >
          <input
            type="checkbox"
            checked={cfg.chartConfirmCardOn !== false}
            onChange={(e) => {
              const next = writeTapointModeConfig({ chartConfirmCardOn: e.target.checked });
              setCfg(next);
              if (!e.target.checked) setConfirmChartCard(null);
              pushLog(e.target.checked ? '차트 확정카드 ON' : '차트 확정카드 OFF');
            }}
          />
          차트카드
        </label>
        <span className="vmax-tf-map" title="코인별 타점 실행 분봉">
          {tapointEntryTfLabelKo()}
        </span>
        <button type="button" className="vmax-scan" disabled={busy} onClick={() => void refreshMain()}>
          {busy ? '스캔…' : '스캔'}
        </button>
      </div>

      {phoneFsActive && phoneFs.mode !== 'off' ? (
        <TapointPhoneFullscreenShell
          mode={phoneFs.mode}
          factorOpen={phoneFsFactorOpen}
          gauges={signalLiveRowsFlash}
          confirmFlash={confirmFlashOn}
          confirmFlashSide={confirmFlashSide}
          factorsNode={
            <div className="vmax-factors vmax-fs-factors-desk">
              <div className={`vmax-factor-summary lean-${factorLs.lean}`}>
                <div className="vmax-factor-summary-head">
                  <span className="long">LONG {factorLs.longPct}</span>
                  <span className="mid">{factorLs.leanKo}</span>
                  <span className="short">SHORT {factorLs.shortPct}</span>
                </div>
                <div className="vmax-factor-tug" aria-hidden>
                  <i className="long" style={{ width: `${factorLs.longPct}%` }} />
                  <i className="short" style={{ width: `${factorLs.shortPct}%` }} />
                </div>
                <p className="vmax-factor-summary-note">
                  초록→롱 · 빨강→숏 · 중앙 0 · 합류 참고(확정 아님)
                  {report?.direction ? ` · 엔진방향 ${report.direction}` : ''}
                </p>
              </div>
              <div className="vmax-factor-axis" aria-hidden>
                <span>숏</span>
                <span>0</span>
                <span>롱</span>
              </div>
              {factors.map((f) => (
                <FactorBar key={f.label} row={f} />
              ))}
            </div>
          }
          chart={<div className="vmax-chart-box vmax-chart-box--tall vmax-fs-chart-box">{tapointChartEl}{confirmChartCardEl}</div>}
          onMode={setPhoneFsMode}
          onToggleFactor={togglePhoneFsFactor}
        />
      ) : (
      <div
        className={
          'vmax-grid vmax-grid--tap-native' +
          (!showLeft ? ' no-left' : '') +
          (!showRight ? ' no-right' : '')
        }
      >
        {showLeft && (
        <aside className="vmax-left">
          <VmaxPanel title="코인별 신호" mode={prefs.leftSignals} onCycle={() => cycle('leftSignals')}>
            <ul className="vmax-coin-list">
              {TAPOINT_SYMBOLS.map((s) => {
                const c = coinMap[s];
                const t = toneOf(c?.decision);
                return (
                  <li key={s} className={t}>
                    <button type="button" onClick={() => onSymbolChange(s)}>
                      <strong>{s.replace('USDT', '')}</strong>
                      <span className={`tag ${t}`}>{decKo(c?.decision)}</span>
                      <em>{c?.score ?? '—'}</em>
                      <small>{c?.noteKo || '스캔대기'}</small>
                    </button>
                  </li>
                );
              })}
            </ul>
          </VmaxPanel>

          <VmaxPanel title="시장 종합" mode={prefs.leftGauge} onCycle={() => cycle('leftGauge')}>
            <div className="vmax-gauge">
              <div
                className="vmax-gauge-arc"
                style={{
                  background: `conic-gradient(#22c55e ${buyDom}%, #1e293b 0)`,
                }}
              >
                <div className="vmax-gauge-hole">
                  <b>{buyDom}</b>
                  <span>매수 우위</span>
                </div>
              </div>
            </div>
          </VmaxPanel>

          <VmaxPanel
            title={`신호감지 · 라이브 · ${viewTf}`}
            mode={sigLivePanelMode}
            onCycle={() => cycle('rightSignalLive')}
            className="vmax-siglive-left-panel"
          >
            {renderSigLiveBody({ compact: true })}
          </VmaxPanel>

          <div className="vmax-left-regime-session">
            <VmaxPanel title="마켓 레짐" mode={prefs.leftRegime} onCycle={() => cycle('leftRegime')}>
              <div className="vmax-regime">
                <strong className="vmax-regime-chip">{report?.regimeKo || '—'}</strong>
                <ul>
                  <li>상태 {report?.entryState || 'WAIT'}</li>
                  <li>실행 {report?.execKind || 'WAIT'}</li>
                  <li>이벤트 {report?.extreme?.kind || 'NONE'}</li>
                </ul>
              </div>
            </VmaxPanel>

            <VmaxPanel title="세션" mode={prefs.leftSession} onCycle={() => cycle('leftSession')}>
              <p className="vmax-session">KST · 주/월봉 마감 09:00</p>
            </VmaxPanel>
          </div>
        </aside>
        )}

        <main className="vmax-center">
          <VmaxPanel
            title={`${symbol} · ${chartTf} · 타점엔진`}
            mode={prefs.centerChart}
            onCycle={() => cycle('centerChart')}
            className="vmax-chart-panel"
            keepMounted
          >
            <div className="vmax-shared-feat-chips" role="toolbar" aria-label="통합분석 공동 작도">
              {TAPOINT_SHARED_MERGED_FEATURE_CHIPS.map((c) => {
                const on = sharedFeat[c.id];
                return (
                  <button
                    key={c.id}
                    type="button"
                    className={`tool-chip tool-chip-button${on ? ' tool-chip-active' : ''}`}
                    title={c.hintKo}
                    onClick={() => setSharedFeat(toggleTapointSharedMergedFeature(c.id))}
                  >
                    {c.labelKo}
                  </button>
                );
              })}
            </div>
            {sharedFeat.institutionalBand && bandPlan ? (
              <div
                className={`vmax-iband-card${
                  bandPlan.actionable
                    ? bandPlan.direction === 'SHORT'
                      ? ' is-short'
                      : ' is-long'
                    : ' is-wait'
                }`}
                title="기관밴드 · 손절은 스탑헌팅(1.272·꼬리·ATR) 바깥 · 익절은 반대 밴드 · SL 8%ROE 초과 또는 TP 8%ROE 미만은 버림"
              >
                <header>
                  <strong>기관밴드A</strong>
                  <span>
                    {bandPlan.actionable
                      ? bandPlan.direction === 'SHORT'
                        ? 'READY숏·자동'
                        : 'READY롱·자동'
                      : String(bandPlan.status || 'WAIT').replace(/_/g, '')}
                  </span>
                  {bandPlan.grade ? <em>합류{bandPlan.grade}</em> : null}
                </header>
                <div className="vmax-iband-levels">
                  <b>
                    E{' '}
                    {bandPlan.entry != null
                      ? Number(bandPlan.entry).toLocaleString(undefined, {
                          maximumFractionDigits: 1,
                        })
                      : '—'}
                  </b>
                  <b className="sl">
                    SL{' '}
                    {(bandPx?.sl ?? bandPlan.sl) != null
                      ? Number(bandPx?.sl ?? bandPlan.sl).toLocaleString(undefined, {
                          maximumFractionDigits: 1,
                        })
                      : '—'}
                  </b>
                  <b className="tp">
                    TP{' '}
                    {(bandPx?.tp ?? bandPlan.tp1) != null
                      ? Number(bandPx?.tp ?? bandPlan.tp1).toLocaleString(undefined, {
                          maximumFractionDigits: 1,
                        })
                      : '—'}
                  </b>
                  <i>
                    {bandPx
                      ? '스탑헌팅 SL · 반대밴드 TP'
                      : `RR ${bandPlan.rr != null ? Number(bandPlan.rr).toFixed(2) : '—'}`}
                  </i>
                </div>
                <p className="vmax-iband-candle">캔들 · {bandPlan.candleKo || '—'}</p>
                <p className="vmax-iband-reason">{bandPlan.reasonKo || '—'}</p>
              </div>
            ) : null}
            <div
              className={`vmax-iband-card${
                profitPatternMon.status === 'SIGNAL'
                  ? profitPatternMon.direction === 'SHORT'
                    ? ' is-short'
                    : ' is-long'
                  : ' is-wait'
              }`}
              title={`수익패턴엔진 · 전코인 · 롱만·SL0.4%·H1·비중캡·메이커·일일4회 · ${PP_PAPER_POLICY_KO}`}
            >
              <header>
                <strong>{PROFIT_PATTERN_HOCHUNG}</strong>
                <span>
                  {profitPatternMon.status === 'SIGNAL'
                    ? lockedLevels
                      ? '진입고정'
                      : profitPatternMon.monitorKo
                    : profitPatternMon.monitorKo || 'WAIT'}
                </span>
                <em>{symbol.replace('USDT', '')}</em>
              </header>
              <div className="vmax-iband-levels">
                <b>
                  E{' '}
                  {(lockedLevels?.entry ?? profitPatternMon.entry) != null
                    ? Number(lockedLevels?.entry ?? profitPatternMon.entry).toLocaleString(
                        undefined,
                        { maximumFractionDigits: 2 }
                      )
                    : '—'}
                </b>
                <b className="sl">
                  SL{' '}
                  {(lockedLevels?.sl ?? profitPatternMon.sl) != null
                    ? Number(lockedLevels?.sl ?? profitPatternMon.sl).toLocaleString(undefined, {
                        maximumFractionDigits: 2,
                      })
                    : '—'}
                </b>
                <b className="tp">
                  TP{' '}
                  {(lockedLevels?.tp ?? profitPatternMon.tp) != null
                    ? Number(lockedLevels?.tp ?? profitPatternMon.tp).toLocaleString(undefined, {
                        maximumFractionDigits: 2,
                      })
                    : '—'}
                </b>
                <i>
                  50x · SL{profitPatternMon.slPct}% · TP≈{profitPatternMon.tpMovePct}%
                  {lockedLevels ? ' · 고정' : ''}
                  {profitPatternMon.status === 'SIGNAL' ? ' · SIGNAL' : ''}
                </i>
              </div>
              <p className="vmax-iband-candle">패턴 · {profitPatternMon.pattern}</p>
              <p className="vmax-iband-reason">{profitPatternMon.reasonKo || '—'}</p>
              {lockedLevels ? (
                <button
                  type="button"
                  className="vmax-mini"
                  style={{ marginTop: 6 }}
                  onClick={() => {
                    ppJournalAppend({
                      kind: 'NOTE',
                      symbol,
                      direction: lockedLevels.direction,
                      entry: lockedLevels.entry,
                      sl: lockedLevels.sl,
                      tp: lockedLevels.tp,
                      eventId: lockedLevels.eventId,
                      reasonKo: '수동 · E/SL/TP 고정 해제',
                    });
                    ppClearLockedLevels(symbol);
                    setLockedLevels(null);
                    setPpJournalPreview(ppJournalList({ symbol, limit: 8 }));
                    pushLog(`${symbol} · E/SL/TP 고정 해제`);
                  }}
                >
                  고정 해제
                </button>
              ) : null}
              {ppJournalPreview.length ? (
                <ul className="vmax-log" style={{ marginTop: 8, maxHeight: 120, overflow: 'auto' }}>
                  {ppJournalPreview.slice(0, 6).map((row) => (
                    <li key={row.id}>
                      {row.kind} · {row.direction || '—'} ·{' '}
                      {row.reasonKo?.slice(0, 42) || row.eventId || ''}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            <div className="vmax-battle-style" title="전투구간(Battle Zone) 면·테두리 — 다중합류 배경 참고">
              <span className="vmax-battle-style-title">전투구간</span>
              <label className="vmax-battle-style-op">
                면 {battleFillOp}
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={battleFillOp}
                  onPointerDown={() => {
                    battleStyleEditRef.current = true;
                  }}
                  onChange={(e) => {
                    const v = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                    battleStyleEditRef.current = true;
                    setBattleFillOp(v);
                  }}
                  onPointerUp={(e) => {
                    const v = Math.max(
                      0,
                      Math.min(100, Number((e.target as HTMLInputElement).value) || 0)
                    );
                    setBattleFillOp(v);
                    saveSettings({ tapointBattleZoneFillOpacity: v });
                    window.setTimeout(() => {
                      battleStyleEditRef.current = false;
                    }, 50);
                  }}
                  onKeyUp={(e) => {
                    const v = Math.max(
                      0,
                      Math.min(100, Number((e.target as HTMLInputElement).value) || 0)
                    );
                    saveSettings({ tapointBattleZoneFillOpacity: v });
                    window.setTimeout(() => {
                      battleStyleEditRef.current = false;
                    }, 50);
                  }}
                />
              </label>
              <label className="vmax-battle-style-border">
                테두리
                <input
                  type="color"
                  value={/^#[0-9a-fA-F]{6}$/.test(battleBorder) ? battleBorder : '#facc15'}
                  onChange={(e) => {
                    const hex = e.target.value;
                    if (hex === battleBorder) return;
                    battleStyleEditRef.current = true;
                    setBattleBorder(hex);
                    saveSettings({ tapointBattleZoneBorderColor: hex });
                    window.setTimeout(() => {
                      battleStyleEditRef.current = false;
                    }, 50);
                  }}
                />
              </label>
              <label className="vmax-battle-style-op" title="BOS·CHoCH·SWEEP·존 라벨 글자 크기">
                라벨 {labelFontPx}
                <input
                  type="range"
                  min={7}
                  max={16}
                  value={labelFontPx}
                  onPointerDown={() => {
                    battleStyleEditRef.current = true;
                  }}
                  onChange={(e) => {
                    const v = Math.max(7, Math.min(16, Number(e.target.value) || 9));
                    battleStyleEditRef.current = true;
                    setLabelFontPx(v);
                  }}
                  onPointerUp={(e) => {
                    const v = Math.max(
                      7,
                      Math.min(16, Number((e.target as HTMLInputElement).value) || 9)
                    );
                    setLabelFontPx(v);
                    saveSettings({ tapointChartLabelFontSize: v });
                    window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
                    window.setTimeout(() => {
                      battleStyleEditRef.current = false;
                    }, 50);
                  }}
                  onKeyUp={(e) => {
                    const v = Math.max(
                      7,
                      Math.min(16, Number((e.target as HTMLInputElement).value) || 9)
                    );
                    saveSettings({ tapointChartLabelFontSize: v });
                    window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
                    window.setTimeout(() => {
                      battleStyleEditRef.current = false;
                    }, 50);
                  }}
                />
              </label>
              <label className="vmax-battle-style-border" title="켜면 차트 라벨을 이 색으로. 끄면 기능색">
                라벨색
                <input
                  type="checkbox"
                  checked={/^#[0-9a-fA-F]{6}$/.test(labelColor)}
                  onChange={(e) => {
                    const hex = e.target.checked
                      ? /^#[0-9a-fA-F]{6}$/.test(labelColor)
                        ? labelColor
                        : '#e2e8f0'
                      : '';
                    setLabelColor(hex);
                    saveSettings({ tapointChartLabelColor: hex });
                    window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
                  }}
                />
                <input
                  type="color"
                  disabled={!/^#[0-9a-fA-F]{6}$/.test(labelColor)}
                  value={/^#[0-9a-fA-F]{6}$/.test(labelColor) ? labelColor : '#e2e8f0'}
                  onChange={(e) => {
                    const hex = e.target.value;
                    setLabelColor(hex);
                    saveSettings({ tapointChartLabelColor: hex });
                    window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
                  }}
                />
              </label>
            </div>
            <div
              className="vmax-battle-style"
              title="폭락존 면·테두리 색 · TF 면 라벨 크기 · 상·하 가격숫자"
            >
              <span className="vmax-battle-style-title">폭락존</span>
              <button
                type="button"
                className={`vmax-mini${dumpZoneColorMode === 'custom' ? ' on' : ''}`}
                title="면색 고정(OFF=엔진 자동색)"
                onClick={() => {
                  const next = dumpZoneColorMode === 'custom' ? 'auto' : 'custom';
                  setDumpZoneColorMode(next);
                  saveSettings({ chartMergedDeskDumpZoneColorMode: next });
                  window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
                }}
              >
                {dumpZoneColorMode === 'custom' ? '색고정' : '색자동'}
              </button>
              <label className="vmax-battle-style-border" title="폭락존 면 색">
                면
                <input
                  type="color"
                  disabled={dumpZoneColorMode !== 'custom'}
                  value={/^#[0-9a-fA-F]{6}$/.test(dumpZoneFill) ? dumpZoneFill : '#38bdf8'}
                  onChange={(e) => {
                    const hex = e.target.value;
                    battleStyleEditRef.current = true;
                    setDumpZoneFill(hex);
                    saveSettings({
                      chartMergedDeskDumpZoneFillColor: hex,
                      chartMergedDeskDumpZoneColorMode: 'custom',
                    });
                    setDumpZoneColorMode('custom');
                    window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
                    window.setTimeout(() => {
                      battleStyleEditRef.current = false;
                    }, 50);
                  }}
                />
              </label>
              <label className="vmax-battle-style-border" title="폭락존 테두리 색">
                테두리
                <input
                  type="color"
                  disabled={dumpZoneColorMode !== 'custom'}
                  value={/^#[0-9a-fA-F]{6}$/.test(dumpZoneBorder) ? dumpZoneBorder : '#38bdf8'}
                  onChange={(e) => {
                    const hex = e.target.value;
                    battleStyleEditRef.current = true;
                    setDumpZoneBorder(hex);
                    saveSettings({
                      chartMergedDeskDumpZoneBorderColor: hex,
                      chartMergedDeskDumpZoneColorMode: 'custom',
                    });
                    setDumpZoneColorMode('custom');
                    window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
                    window.setTimeout(() => {
                      battleStyleEditRef.current = false;
                    }, 50);
                  }}
                />
              </label>
              <label className="vmax-battle-style-op" title="TF(분·시·일·주·달) 면 라벨 크기">
                라벨 {dumpFaceFs}
                <input
                  type="range"
                  min={7}
                  max={18}
                  value={dumpFaceFs}
                  onPointerDown={() => {
                    battleStyleEditRef.current = true;
                  }}
                  onChange={(e) => {
                    const v = Math.max(7, Math.min(18, Number(e.target.value) || 9));
                    battleStyleEditRef.current = true;
                    setDumpFaceFs(v);
                  }}
                  onPointerUp={(e) => {
                    const v = Math.max(
                      7,
                      Math.min(18, Number((e.target as HTMLInputElement).value) || 9)
                    );
                    setDumpFaceFs(v);
                    saveSettings({ chartMergedDeskDumpFaceLabelFontSize: v });
                    window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
                    window.setTimeout(() => {
                      battleStyleEditRef.current = false;
                    }, 50);
                  }}
                />
              </label>
              <label className="vmax-battle-style-op" title="상·하 테두리 가격 글자 크기">
                가격 {dumpEdgeFs}
                <input
                  type="range"
                  min={7}
                  max={18}
                  value={dumpEdgeFs}
                  onPointerDown={() => {
                    battleStyleEditRef.current = true;
                  }}
                  onChange={(e) => {
                    const v = Math.max(7, Math.min(18, Number(e.target.value) || 8));
                    battleStyleEditRef.current = true;
                    setDumpEdgeFs(v);
                  }}
                  onPointerUp={(e) => {
                    const v = Math.max(
                      7,
                      Math.min(18, Number((e.target as HTMLInputElement).value) || 8)
                    );
                    setDumpEdgeFs(v);
                    saveSettings({ chartMergedDeskDumpEdgePriceFontSize: v });
                    window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
                    window.setTimeout(() => {
                      battleStyleEditRef.current = false;
                    }, 50);
                  }}
                />
              </label>
              <label className="vmax-battle-style-border" title="상·하 테두리 가격 색">
                가격색
                <input
                  type="color"
                  value={/^#[0-9a-fA-F]{6}$/.test(dumpEdgeColor) ? dumpEdgeColor : '#fef08a'}
                  onChange={(e) => {
                    const hex = e.target.value;
                    if (hex === dumpEdgeColor) return;
                    battleStyleEditRef.current = true;
                    setDumpEdgeColor(hex);
                    saveSettings({ chartMergedDeskDumpEdgePriceColor: hex });
                    window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
                    window.setTimeout(() => {
                      battleStyleEditRef.current = false;
                    }, 50);
                  }}
                />
              </label>
            </div>
            <div className="vmax-chart-box vmax-chart-box--tall">
              {tapointChartEl}
              {confirmChartCardEl}
            </div>
          </VmaxPanel>

          <VmaxPanel title="AI 합성 신호 · 액션" mode={prefs.centerSynth} onCycle={() => cycle('centerSynth')}>
            <div className="vmax-synth">
              <div className="vmax-synth-score">
                <div
                  className="vmax-ring"
                  style={{
                    background: `conic-gradient(${
                      banner.tone === 'long'
                        ? '#22c55e'
                        : banner.tone === 'short'
                          ? '#ef4444'
                          : '#64748b'
                    } ${synthScore}%, #1e293b 0)`,
                  }}
                >
                  <div className="vmax-ring-hole">
                    <b>{synthScore || '—'}</b>
                    <span>/100</span>
                  </div>
                </div>
                <p className={`vmax-synth-state ${banner.tone}`}>{banner.text}</p>
                {!liveAuto.ready &&
                (report?.decision === 'CONFIRMED_LONG' ||
                  report?.decision === 'CONFIRMED_SHORT') ? (
                  <p className="vmax-synth-auto-hint">
                    자동주문 아직 안 함 · {liveAuto.reasonKo}
                  </p>
                ) : null}
              </div>
              <div className="vmax-synth-body">
                <p>{statusKo}</p>
                {(report?.sharedMerged?.advVolume || report?.sharedMerged?.dailyFace) && (
                  <p className="vmax-shared-hint">
                    {[
                      report.sharedMerged?.advVolume
                        ? `선진V ${report.sharedMerged.advVolume.actionKo || report.sharedMerged.advVolume.action}`
                        : null,
                      report.sharedMerged?.dailyFace?.labelKo || null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                )}
                <div className="vmax-synth-boxes">
                  <div>
                    <span>예상구간</span>
                    <b>
                      {report?.tp1 && report?.entry
                        ? `${(((report.tp1 - report.entry) / report.entry) * 100 * (report.direction === 'SHORT' ? -1 : 1)).toFixed(2)}%`
                        : '—'}
                    </b>
                  </div>
                  <div>
                    <span>R:R</span>
                    <b>{rr != null ? `1:${rr.toFixed(2)}` : '—'}</b>
                  </div>
                  <div>
                    <span>신뢰</span>
                    <b>
                      {report?.historical?.n && report.historical.n >= 20 ? '표본있음' : '통계부족'}
                    </b>
                  </div>
                </div>
                <div className="vmax-actions">
                  <button type="button" className="long" disabled={!canLong || busy} onClick={() => void fireManual('LONG')}>
                    LONG 매수
                  </button>
                  <button type="button" className="short" disabled={!canShort || busy} onClick={() => void fireManual('SHORT')}>
                    SHORT 매도
                  </button>
                  <button type="button" className="ghost">지정가대기</button>
                  <button type="button" className="ghost" onClick={goMergedChart}>통합·분석</button>
                </div>
              </div>
            </div>
          </VmaxPanel>

          <VmaxPanel title={`팩터 체크리스트 · ${viewTf}`} mode={prefs.centerFactors} onCycle={() => cycle('centerFactors')}>
            <div className="vmax-factors">
              <div className={`vmax-factor-summary lean-${factorLs.lean}`}>
                <div className="vmax-factor-summary-head">
                  <span className="long">LONG {factorLs.longPct}</span>
                  <span className="mid">{factorLs.leanKo}</span>
                  <span className="short">SHORT {factorLs.shortPct}</span>
                </div>
                <div className="vmax-factor-tug" aria-hidden>
                  <i className="long" style={{ width: `${factorLs.longPct}%` }} />
                  <i className="short" style={{ width: `${factorLs.shortPct}%` }} />
                </div>
                <p className="vmax-factor-summary-note">
                  초록→롱 · 빨강→숏 · 중앙 0 · 합류 참고(확정 아님)
                  {report?.direction ? ` · 엔진방향 ${report.direction}` : ''}
                </p>
              </div>
              <div className="vmax-factor-axis" aria-hidden>
                <span>숏</span>
                <span>0</span>
                <span>롱</span>
              </div>
              {factors.map((f) => (
                <FactorBar key={f.label} row={f} />
              ))}
            </div>
          </VmaxPanel>

          <VmaxPanel title="거래 내역" mode={prefs.centerHistory} onCycle={() => cycle('centerHistory')}>
            <ul className="vmax-log">
              {logs.length ? logs.slice(0, 10).map((l) => <li key={l}>{l}</li>) : <li>이력 없음</li>}
            </ul>
          </VmaxPanel>

          <VmaxPanel title="수익 통계" mode={prefs.centerProfit} onCycle={() => cycle('centerProfit')}>
            <p className="vmax-muted">실계좌/가상 집계 · 고정 승률 표시 안 함</p>
          </VmaxPanel>
        </main>

        {showRight && (
        <aside className={`vmax-right ${prefs.rightSet === 'open' ? 'linked' : ''}`.trim()}>
          <VmaxPanel
            title={`신호감지 · 라이브 · ${viewTf}`}
            mode={prefs.rightSignalLive}
            onCycle={() => cycle('rightSignalLive')}
            className="vmax-siglive-desk-panel"
          >
            {renderSigLiveBody({ compact: false })}
          </VmaxPanel>

          <VmaxPanel
            title="트레이딩 세트"
            mode={prefs.rightSet}
            onCycle={() => cycle('rightSet')}
            className="vmax-right-set"
          >
            <VmaxPanel title="타점 브리핑" mode={prefs.rightBrief} onCycle={() => cycle('rightBrief')}>
              <div className="vmax-brief">
                <p className="vmax-oneline">{report?.reasonOneLineKo || statusKo || '스캔 대기'}</p>
                <ul className="vmax-brief-list">
                  <li>
                    게이트{' '}
                    {report?.gate?.ok
                      ? '통과'
                      : (report?.gate?.failReasons || []).slice(0, 2).join(' · ') || '대기'}
                  </li>
                  <li>
                    선진{' '}
                    {report?.sharedMerged?.advVolume?.actionKo ||
                      report?.sharedMerged?.advVolume?.action ||
                      '—'}
                  </li>
                  <li>{report?.sharedMerged?.dailyFace?.labelKo || '일봉면 —'}</li>
                  <li>
                    무효·거절{' '}
                    {report?.rejectReasonKo ||
                      (report?.battleZone
                        ? `구간 ${report.battleZone.lo.toFixed(0)}~${report.battleZone.hi.toFixed(0)}`
                        : '—')}
                  </li>
                  <li>
                    볼륨폭발{' '}
                    {report?.volRoeBurst?.fired
                      ? report.volRoeBurst.noteKo
                      : report?.volRoeBurst?.noteKo || '대기'}
                  </li>
                </ul>
              </div>
            </VmaxPanel>

            <VmaxPanel title="유사표본 · 10배ROE통계" mode={prefs.rightHist} onCycle={() => cycle('rightHist')}>
              <dl className="vmax-levels vmax-hist">
                {[
                  [
                    '방향',
                    report?.historical?.biasKo ||
                      (report?.direction === 'LONG'
                        ? '롱유사'
                        : report?.direction === 'SHORT'
                          ? '숏유사'
                          : '—'),
                  ],
                  ['표본N(샘플)', report?.historical?.n],
                  ['유사도', report?.historical?.similarity],
                  [
                    report?.direction === 'SHORT' ? '3봉숏유리' : '3봉롱유리',
                    report?.historical?.up3 != null
                      ? `${(report.historical.up3 * 100).toFixed(0)}%`
                      : null,
                  ],
                  [
                    report?.direction === 'SHORT' ? '5봉숏유리' : '5봉롱유리',
                    report?.historical?.up5 != null
                      ? `${(report.historical.up5 * 100).toFixed(0)}%`
                      : null,
                  ],
                  [
                    'MFE',
                    report?.historical?.mfe != null
                      ? `${(report.historical.mfe * 100).toFixed(2)}%`
                      : null,
                  ],
                  [
                    'MAE',
                    report?.historical?.mae != null
                      ? `${(report.historical.mae * 100).toFixed(2)}%`
                      : null,
                  ],
                  [
                    '10x·ROE5%',
                    report?.historical?.roeHit5at10x != null
                      ? `${(report.historical.roeHit5at10x * 100).toFixed(0)}%도달`
                      : null,
                  ],
                  [
                    '10x·ROE7%',
                    report?.historical?.roeHit7at10x != null
                      ? `${(report.historical.roeHit7at10x * 100).toFixed(0)}%도달`
                      : null,
                  ],
                ].map(([k, v]) => (
                  <div key={String(k)}>
                    <dt>{k}</dt>
                    <dd>{v != null && v !== '' ? String(v) : '—'}</dd>
                  </div>
                ))}
              </dl>
              <p className="vmax-muted">
                {report?.historical?.noteKo ||
                  '표본N=샘플수 · 롱/숏유사=지금 방향 기준 · 확정 수익·승률 아님'}
              </p>
              {report?.sweepTfBoard?.length ? (
                <div style={{ marginTop: 8, fontSize: 11 }}>
                  <b>스윕 TF · 1회기록/2회진입</b>
                  <ul style={{ margin: '4px 0 0', paddingLeft: 16 }}>
                    {report.sweepTfBoard.slice(0, 8).map((r) => (
                      <li key={r.tf}>{r.noteKo}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </VmaxPanel>

            <VmaxPanel title="주요 타점 가격" mode={prefs.rightLevels} onCycle={() => cycle('rightLevels')}>
            <dl className="vmax-levels">
              {[
                ['익절3', report?.tp3],
                ['익절2', report?.tp2],
                ['익절1', report?.tp1],
                ['현재', tickers[symbol]],
                ['진입', report?.entry],
                ['손절', report?.sl],
              ].map(([k, v]) => (
                <div key={String(k)}>
                  <dt>{k}</dt>
                  <dd>{v != null ? Number(v).toFixed(2) : '—'}</dd>
                </div>
              ))}
            </dl>
          </VmaxPanel>

            <VmaxPanel title="포지션 계산" mode={prefs.rightCalc} onCycle={() => cycle('rightCalc')}>
            <div className="vmax-calc">
              <div className="vmax-seg">
                <button type="button" className={marginMode === 'isolated' ? 'on' : ''} onClick={() => setMarginMode('isolated')}>격리</button>
                <button type="button" className={marginMode === 'crossed' ? 'on' : ''} onClick={() => setMarginMode('crossed')}>교차</button>
              </div>
              <label>
                레버 {calcLev}x
                <input type="range" min={1} max={125} value={calcLev} onChange={(e) => setCalcLev(Number(e.target.value))} />
              </label>
              <label>
                증거금(U)
                <input type="number" value={calcMargin} onChange={(e) => setCalcMargin(Math.max(1, Number(e.target.value) || 1))} />
              </label>
              <label>
                익절 ROE%
                <input
                  type="number"
                  min={1}
                  max={50}
                  step={0.5}
                  value={calcTpRoe}
                  onChange={(e) =>
                    setCalcTpRoe(Math.max(1, Math.min(50, Number(e.target.value) || 8)))
                  }
                />
              </label>
              <div className="vmax-seg">
                {[5, 8, 10, 12].map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={calcTpRoe === n ? 'on' : ''}
                    onClick={() => setCalcTpRoe(n)}
                  >
                    {n}%
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="vmax-exec"
                onClick={() => {
                  const next = writeAutoTradeConfig({
                    leverage: calcLev,
                    marginUsdt: calcMargin,
                    marginMode,
                    sizeMode: 'fixedUsdt',
                    scalpTp1RoePct: calcTpRoe,
                    scalpExitMode: 'TP1_CUT',
                    aiZoneDriveEnabled: false,
                  });
                  setAutoCfg(next);
                  if (next.liveArmed) {
                    void syncServerArm({
                      ...next,
                      symbols: [...TAPOINT_SYMBOLS],
                      leverage: calcLev,
                      marginUsdt: calcMargin,
                    });
                  }
                  pushLog(`주문설정 · ${calcLev}x · ${calcMargin}U · 익절ROE ${calcTpRoe}%`);
                }}
              >
                주문설정 적용
              </button>
            </div>
          </VmaxPanel>

            <VmaxPanel title="실시간 포지션" mode={prefs.rightPositions} onCycle={() => cycle('rightPositions')}>
            <ul className="vmax-pos">
              {positions.length === 0 && <li>포지션 없음</li>}
              {positions.map((p) => (
                <li key={`${p.symbol}-${p.direction}`}>
                  <strong>{String(p.symbol).replace('USDT', '')}</strong>
                  <span className={p.direction === 'LONG' ? 'g' : 'r'}>{p.direction}</span>
                  <em>{Number(p.size).toFixed(4)}</em>
                  <b className={Number(p.unrealizedPnl) >= 0 ? 'g' : 'r'}>{Number(p.unrealizedPnl || 0).toFixed(2)}</b>
                </li>
              ))}
            </ul>
          </VmaxPanel>

            <VmaxPanel title="알림 / 로그" mode={prefs.rightLog} onCycle={() => cycle('rightLog')}>
            <ul className="vmax-log">
              {logs.slice(0, 12).map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </VmaxPanel>
          </VmaxPanel>
        </aside>
        )}
      </div>

      )}

      {(autoTradePanelOpen || autoCfg.enabled || autoCfg.liveArmed) && (
        <MergedDeskAutoTradePanel
          symbol={symbol}
          timeframe={resolveTapointEntryTf(symbol)}
          uiVisible={autoTradePanelOpen}
          onOpenUi={() => setAutoTradePanelOpen(true)}
          onClose={() => setAutoTradePanelOpen(false)}
          onConfigChange={(c) => setAutoCfg(c)}
          tapOnly
          onStatusKo={(msg) => {
            setStatusKo(msg);
            pushLog(msg);
          }}
          liveStatusKo={
            autoCfg.liveArmed
              ? tapOnlyStatusKo()
              : '타점 대기 · ARM OFF'
          }
          livePrice={tickers[symbol] ?? report?.entry ?? null}
          planDirection={
            report?.direction === 'LONG' || report?.direction === 'SHORT'
              ? report.direction
              : null
          }
          planEntry={report?.entry ?? null}
          planSl={report?.sl ?? null}
          planTp1={report?.tp1 ?? null}
        />
      )}

      {prefs.footer !== 'off' && (
        <footer className="vmax-foot">
          {prefs.footer === 'open' && (
            <>
              <span>타점엔진 전용 · Dual/AIZONE OFF</span>
              <span>Bitget 연동</span>
              <span className="pulse">
                {serverHealth?.serverEntryReady
                  ? '서버 무접속진입 OK'
                  : autoCfg.liveArmed
                    ? '타점 ARM · 서버키확인'
                    : '타점 ARM 대기'}
              </span>
              <span>칩 클릭=ON/OFF</span>
            </>
          )}
          <button type="button" className="vmax-mini" onClick={() => cycle('footer')}>
            하단
          </button>
        </footer>
      )}

      <style jsx global>{`
        .vmax-root {
          --bg: #070d18;
          --panel: #0d1524;
          --line: #1a2740;
          --text: #e8eef8;
          --mute: #7b8ba5;
          --long: #22c55e;
          --short: #ef4444;
          --armed: #eab308;
          --cyan: #38bdf8;
          background: radial-gradient(1200px 600px at 20% -10%, #122033 0%, var(--bg) 55%);
          color: var(--text);
          border-radius: 12px;
          padding: 8px 10px 10px;
          min-height: 78vh;
          width: 100%;
          max-width: 100%;
          box-sizing: border-box;
          font-family: 'IBM Plex Sans KR', Pretendard, 'Noto Sans KR', sans-serif;
        }
        .vmax-head {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 8px;
        }
        .vmax-brand {
          display: flex;
          gap: 8px;
          align-items: center;
        }
        .vmax-eagle {
          width: 36px;
          height: 36px;
          border-radius: 9px;
          display: grid;
          place-items: center;
          font-weight: 800;
          background: #143024;
          color: var(--long);
          border: 1px solid #1f5a3a;
        }
        .vmax-brand strong {
          display: block;
          font-size: 15px;
          letter-spacing: -0.03em;
        }
        .vmax-brand em {
          font-style: normal;
          font-size: 10px;
          color: var(--mute);
        }
        .vmax-stats {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          align-items: center;
        }
        .vmax-stats > div {
          background: var(--panel);
          border: 1px solid var(--line);
          border-radius: 8px;
          padding: 6px 10px;
          min-width: 88px;
        }
        .vmax-stats span {
          display: block;
          font-size: 10px;
          color: var(--mute);
        }
        .vmax-stats b {
          font-size: 13px;
        }
        .vmax-stats.fold > div {
          display: none;
        }
        .vmax-head-right {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          align-items: center;
          font-size: 11px;
          color: var(--mute);
        }
        .vmax-arm {
          border: 1px solid #14532d;
          background: #052e1a;
          color: var(--long);
          border-radius: 999px;
          padding: 6px 12px;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
        }
        .vmax-arm.on {
          box-shadow: 0 0 0 1px #22c55e55;
        }
        .vmax-dot::before {
          content: '';
          display: inline-block;
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: var(--mute);
          margin-right: 5px;
        }
        .vmax-dot.ok::before {
          background: var(--long);
        }
        .vmax-dot.warn::before {
          background: var(--armed);
        }
        .vmax-server-health {
          display: flex;
          flex-wrap: wrap;
          align-items: baseline;
          gap: 8px 12px;
          margin: 4px 0 8px;
          padding: 6px 10px;
          border: 1px solid var(--line);
          border-radius: 8px;
          background: #0a1220;
          font-size: 11px;
          color: var(--mute);
          line-height: 1.35;
        }
        .vmax-server-health.ready {
          border-color: #14532d;
          color: #bbf7d0;
        }
        .vmax-server-health b {
          color: var(--cyan);
          font-size: 10px;
          letter-spacing: 0.04em;
        }
        .vmax-server-health span {
          color: var(--text);
          font-weight: 600;
        }
        .vmax-server-health em {
          font-style: normal;
          color: var(--mute);
          opacity: 0.9;
        }
        .vmax-mini {
          border: 1px solid var(--line);
          background: transparent;
          color: var(--mute);
          border-radius: 6px;
          padding: 3px 7px;
          font-size: 10px;
          cursor: pointer;
        }
        .vmax-mgr {
          border: 1px solid var(--line);
          background: var(--panel);
          border-radius: 10px;
          padding: 10px;
          margin-bottom: 8px;
        }
        .vmax-mgr p {
          margin: 0 0 8px;
          font-size: 12px;
          color: var(--mute);
        }
        .vmax-mgr-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
          gap: 6px;
        }
        .vmax-mgr-grid label {
          display: flex;
          justify-content: space-between;
          gap: 6px;
          font-size: 11px;
          align-items: center;
        }
        .vmax-mgr-grid select {
          background: #0b1220;
          color: var(--text);
          border: 1px solid var(--line);
          border-radius: 4px;
          font-size: 11px;
        }
        .vmax-ticker {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          align-items: center;
          margin-bottom: 8px;
        }
        .vmax-ticker > button:not(.vmax-mini) {
          border: 1px solid var(--line);
          background: var(--panel);
          color: var(--text);
          border-radius: 7px;
          padding: 5px 8px;
          font-size: 11px;
          cursor: pointer;
        }
        .vmax-ticker > button.on {
          outline: 1px solid var(--cyan);
        }
        .vmax-news {
          margin-left: auto;
          background: #3f1d1d;
          color: #fecaca;
          border: 1px solid #7f1d1d;
          border-radius: 6px;
          padding: 4px 8px;
          font-size: 11px;
        }
        .vmax-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          align-items: center;
          margin-bottom: 8px;
        }
        .vmax-chips .chip {
          border: 1px solid var(--line);
          background: transparent;
          color: var(--mute);
          border-radius: 8px;
          padding: 5px 9px;
          font-size: 12px;
          cursor: pointer;
        }
        .vmax-chips .chip.on {
          color: var(--text);
          border-color: #334155;
        }
        .vmax-chips .chip.sel {
          outline: 2px solid #3b82f6;
        }
        .vmax-chips .chip.merged-link {
          border-color: #0ea5e9;
          color: #7dd3fc;
        }
        .vmax-chips .chip.merged-link.on {
          background: rgba(14, 165, 233, 0.18);
          border-color: #38bdf8;
          color: #e0f2fe;
          font-weight: 700;
        }
        .vmax-chips .chip i {
          font-style: normal;
          font-size: 10px;
          opacity: 0.7;
        }
        .vmax-tfs {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
          margin-left: 6px;
        }
        .vmax-tfs button {
          border: 1px solid var(--line);
          background: transparent;
          color: var(--mute);
          border-radius: 999px;
          padding: 3px 8px;
          font-size: 10px;
          cursor: pointer;
        }
        .vmax-tfs button.on {
          background: #1d4ed8;
          color: #fff;
          border-color: #2563eb;
        }
        .vmax-autoex {
          font-size: 11px;
          color: var(--mute);
          display: flex;
          gap: 4px;
          align-items: center;
        }
        .vmax-tf-map {
          font-size: 11px;
          color: #facc15;
          letter-spacing: -0.02em;
          white-space: nowrap;
          max-width: 300px;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .vmax-scan {
          border: 1px solid var(--line);
          background: var(--panel);
          color: var(--text);
          border-radius: 7px;
          padding: 5px 10px;
          font-size: 12px;
          cursor: pointer;
        }
        .vmax-grid {
          display: grid;
          grid-template-columns: minmax(200px, 0.95fr) minmax(0, 2.4fr) minmax(240px, 1fr);
          gap: 6px;
          align-items: stretch;
          width: 100%;
        }
        .vmax-grid.no-left.no-right {
          grid-template-columns: minmax(0, 1fr);
        }
        .vmax-grid.no-left:not(.no-right) {
          grid-template-columns: minmax(0, 2.4fr) minmax(240px, 1fr);
        }
        .vmax-grid.no-right:not(.no-left) {
          grid-template-columns: minmax(200px, 0.95fr) minmax(0, 2.4fr);
        }
        .vmax-left,
        .vmax-center,
        .vmax-right {
          min-width: 0;
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: 6px;
          align-self: start;
          overflow: visible;
        }
        .vmax-left > .vmax-panel,
        .vmax-center > .vmax-panel,
        .vmax-right > .vmax-panel {
          width: 100%;
          margin-bottom: 0;
          box-sizing: border-box;
        }
        .vmax-right-set > .vmax-panel-b {
          display: flex;
          flex-direction: column;
          gap: 10px;
          padding: 8px;
          /* 길이 제한으로 뒤 카드가 잘리거나 빈 검정 스크롤면이 덮지 않게 */
          max-height: none;
          height: auto;
          overflow: visible;
        }
        .vmax-right-set {
          overflow: visible;
          max-height: none;
          height: auto;
        }
        .vmax-right-set .vmax-panel {
          margin: 0;
          box-shadow: none;
          overflow: visible;
          flex: 0 0 auto;
          position: relative;
          z-index: 1;
          background: var(--panel);
        }
        .vmax-right-set .vmax-panel-b {
          overflow: visible;
          min-height: 0;
        }
        /* 글자 없는 빈 검정 바디 · 뒤 카드 가림 방지 */
        .vmax-right-set .vmax-panel-b:empty {
          display: none !important;
          padding: 0 !important;
          border: 0 !important;
          min-height: 0 !important;
        }
        .vmax-right-set .vmax-panel-h h3 {
          flex: 1;
          min-width: 0;
          padding-right: 8px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .vmax-right.linked {
          outline: 1px solid rgba(56, 189, 248, 0.25);
          border-radius: 12px;
          padding: 4px;
          background: transparent;
          overflow: visible;
        }
        .vmax-brief-list {
          list-style: none;
          margin: 0;
          padding: 0;
          font-size: 11px;
          color: #94a3b8;
          line-height: 1.55;
        }
        .vmax-brief-list li {
          border-top: 1px solid rgba(51, 65, 85, 0.55);
          padding: 4px 0;
        }
        .vmax-siglive {
          display: flex;
          flex-direction: column;
          gap: 6px;
          width: 100%;
          min-width: 0;
        }
        .vmax-siglive-head {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 10px;
          color: #94a3b8;
        }
        .vmax-siglive-coins {
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          gap: 4px;
          margin: 0 0 6px;
        }
        .vmax-siglive-coin {
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 1px;
          padding: 5px 6px 8px;
          border-radius: 7px;
          border: 1px solid rgba(148, 163, 184, 0.25);
          background: rgba(15, 23, 42, 0.65);
          color: #e2e8f0;
          cursor: pointer;
          overflow: hidden;
          text-align: left;
        }
        .vmax-siglive-coin strong {
          font-size: 11px;
        }
        .vmax-siglive-coin-dir {
          font-size: 10px;
          opacity: 0.92;
        }
        .vmax-siglive-coin em {
          font-size: 9px;
          font-style: normal;
          opacity: 0.7;
        }
        .vmax-siglive-coin-bar {
          position: absolute;
          left: 0;
          bottom: 0;
          height: 2px;
          background: var(--sig-accent, #38bdf8);
        }
        .vmax-siglive-coin.tone-long {
          --sig-accent: #22c55e;
          border-color: rgba(34, 197, 94, 0.45);
        }
        .vmax-siglive-coin.tone-short {
          --sig-accent: #f43f5e;
          border-color: rgba(244, 63, 94, 0.45);
        }
        .vmax-siglive-coin.tone-armed {
          --sig-accent: #f59e0b;
        }
        .vmax-siglive-coin.tone-wait {
          --sig-accent: #64748b;
        }
        .vmax-siglive-coin.is-ready {
          box-shadow: 0 0 0 1px rgba(56, 189, 248, 0.35);
        }
        .vmax-siglive-coin.is-off {
          opacity: 0.45;
        }
        .vmax-siglive-coin.is-sel {
          outline: 1px solid rgba(125, 211, 252, 0.55);
        }
        @media (max-width: 900px) {
          .vmax-siglive-coins {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
        }
        .vmax-siglive-head b {
          color: #e2e8f0;
          font-size: 12px;
        }
        .vmax-siglive-head em {
          margin-left: auto;
          font-style: normal;
          font-size: 10px;
          color: #64748b;
          flex-shrink: 0;
        }
        .vmax-siglive-confirm-toast {
          margin-left: 8px !important;
          font-weight: 800 !important;
          font-size: 11px !important;
          padding: 2px 8px;
          border-radius: 4px;
          animation: vmaxConfirmFlash 0.55s ease-in-out infinite;
        }
        .vmax-siglive-confirm-toast.is-short {
          color: #fecaca !important;
          background: rgba(127, 29, 29, 0.85);
          border: 1px solid rgba(248, 113, 113, 0.7);
        }
        .vmax-siglive-confirm-toast.is-long {
          color: #bbf7d0 !important;
          background: rgba(20, 83, 45, 0.85);
          border: 1px solid rgba(74, 222, 128, 0.7);
        }
        .vmax-fs-gauge.is-confirm-flash {
          animation: vmaxConfirmFlash 0.55s ease-in-out infinite;
          filter: drop-shadow(0 0 8px rgba(239, 68, 68, 0.75));
        }
        .vmax-fs-gauge.is-confirm-flash.is-long {
          filter: drop-shadow(0 0 8px rgba(34, 197, 94, 0.75));
        }
        .vmax-siglive-guide-btn {
          border: 1px solid rgba(100, 116, 139, 0.55);
          background: rgba(30, 41, 59, 0.7);
          color: #94a3b8;
          font-size: 10px;
          padding: 2px 8px;
          border-radius: 4px;
          cursor: pointer;
          flex-shrink: 0;
        }
        .vmax-siglive-order-btn {
          border: 1px solid rgba(100, 116, 139, 0.55);
          background: rgba(30, 41, 59, 0.7);
          color: #94a3b8;
          font-size: 10px;
          padding: 2px 8px;
          border-radius: 4px;
          cursor: pointer;
          flex-shrink: 0;
        }
        .vmax-siglive-order-btn.is-on,
        .vmax-siglive-order-btn:hover {
          color: #fde68a;
          border-color: rgba(250, 204, 21, 0.55);
          background: rgba(113, 63, 18, 0.35);
        }
        .vmax-siglive-card.is-reorder {
          display: flex;
          flex-direction: column;
          gap: 4px;
          cursor: grab;
          border-style: dashed;
        }
        .vmax-siglive-card.is-reorder:active {
          cursor: grabbing;
        }
        .vmax-siglive-order-rail {
          display: flex;
          align-items: center;
          gap: 6px;
          margin: -2px 0 2px;
        }
        .vmax-siglive-order-move {
          border: 1px solid rgba(71, 85, 105, 0.8);
          background: rgba(15, 23, 42, 0.9);
          color: #e2e8f0;
          font-size: 10px;
          line-height: 1;
          padding: 3px 7px;
          border-radius: 4px;
          cursor: pointer;
        }
        .vmax-siglive-order-move:disabled {
          opacity: 0.35;
          cursor: default;
        }
        .vmax-siglive-order-grip {
          font-size: 11px;
          color: #64748b;
          letter-spacing: -2px;
          user-select: none;
        }
        .vmax-siglive-guide-btn.is-on,
        .vmax-siglive-guide-btn:hover {
          color: #e2e8f0;
          border-color: rgba(56, 189, 248, 0.55);
          background: rgba(14, 116, 144, 0.25);
        }
        .vmax-siglive-guide {
          display: flex;
          flex-direction: column;
          gap: 8px;
          padding: 8px 10px;
          border: 1px solid rgba(51, 65, 85, 0.75);
          border-radius: 8px;
          background: rgba(15, 23, 42, 0.92);
          max-height: 280px;
          overflow: auto;
        }
        .vmax-siglive-guide-title {
          font-size: 12px;
          color: #e2e8f0;
        }
        .vmax-siglive-guide-block b {
          display: block;
          font-size: 11px;
          color: #38bdf8;
          margin-bottom: 2px;
        }
        .vmax-siglive-guide-block ul {
          margin: 0;
          padding-left: 16px;
          color: #94a3b8;
          font-size: 10px;
          line-height: 1.45;
        }
        .vmax-siglive-pulse-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #22c55e;
          box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.55);
          animation: vmaxSigDot 1.4s ease-out infinite;
          flex-shrink: 0;
        }
        @keyframes vmaxSigDot {
          0% {
            box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.55);
          }
          70% {
            box-shadow: 0 0 0 8px rgba(34, 197, 94, 0);
          }
          100% {
            box-shadow: 0 0 0 0 rgba(34, 197, 94, 0);
          }
        }
        .vmax-siglive-grid {
          display: flex;
          flex-direction: column;
          gap: 5px;
          width: 100%;
          min-width: 0;
        }
        .vmax-siglive-card {
          --sig-accent: #64748b;
          border: 1px solid rgba(51, 65, 85, 0.7);
          border-radius: 7px;
          padding: 5px 8px;
          background: linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.55));
          width: 100%;
          min-width: 0;
          box-sizing: border-box;
        }
        .vmax-siglive-card.tone-long {
          --sig-accent: #22c55e;
          border-color: rgba(34, 197, 94, 0.35);
        }
        .vmax-siglive-card.tone-short {
          --sig-accent: #ef4444;
          border-color: rgba(239, 68, 68, 0.35);
        }
        .vmax-siglive-card.tone-hot {
          --sig-accent: #fbbf24;
          border-color: rgba(251, 191, 36, 0.35);
        }
        .vmax-siglive-card.tone-ok {
          --sig-accent: #38bdf8;
          border-color: rgba(56, 189, 248, 0.35);
        }
        .vmax-siglive-card.tone-wait {
          --sig-accent: #94a3b8;
        }
        .vmax-siglive-card.is-pulse {
          animation: vmaxSigCard 1.8s ease-in-out infinite;
        }
        .vmax-siglive-card.is-confirm-flash {
          position: relative;
          z-index: 2;
          animation: vmaxConfirmFlash 0.55s ease-in-out infinite;
          box-shadow: 0 0 0 2px var(--sig-accent), 0 0 18px rgba(239, 68, 68, 0.45);
        }
        .vmax-siglive-card.is-confirm-flash.is-long {
          box-shadow: 0 0 0 2px #22c55e, 0 0 18px rgba(34, 197, 94, 0.5);
        }
        .vmax-siglive-card.is-confirm-flash.is-short {
          box-shadow: 0 0 0 2px #ef4444, 0 0 20px rgba(239, 68, 68, 0.55);
        }
        .vmax-siglive-card.is-confirm-flash::after {
          content: attr(data-flash);
          pointer-events: none;
        }
        @keyframes vmaxConfirmFlash {
          0%,
          100% {
            filter: brightness(1);
            transform: scale(1);
            border-color: var(--sig-accent);
          }
          50% {
            filter: brightness(1.45);
            transform: scale(1.02);
            border-color: #fff;
          }
        }
        @keyframes vmaxSigCard {
          0%,
          100% {
            filter: brightness(1);
          }
          50% {
            filter: brightness(1.12);
          }
        }
        .vmax-siglive-top {
          display: flex;
          align-items: center;
          gap: 6px;
          width: 100%;
          min-width: 0;
        }
        .vmax-siglive-emoji {
          font-size: 15px;
          line-height: 1;
          text-align: center;
          width: 22px;
          flex-shrink: 0;
        }
        .vmax-siglive-meta {
          flex: 1;
          min-width: 0;
        }
        .vmax-siglive-meta strong {
          display: block;
          font-size: 11px;
          color: #f1f5f9;
          font-weight: 700;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .vmax-siglive-meta small {
          display: block;
          margin-top: 2px;
          font-size: 10px;
          color: #94a3b8;
          line-height: 1.35;
          white-space: normal;
          word-break: keep-all;
          overflow-wrap: anywhere;
        }
        .vmax-siglive-brief {
          margin: 3px 0 0;
          padding: 3px 6px;
          border-radius: 5px;
          border: 1px solid rgba(148, 163, 184, 0.22);
          background: rgba(15, 23, 42, 0.72);
          font-size: 9px;
          line-height: 1.35;
          color: #cbd5e1;
          word-break: keep-all;
          overflow-wrap: anywhere;
        }
        .vmax-siglive-card.tone-long .vmax-siglive-brief {
          border-color: rgba(34, 197, 94, 0.35);
          color: #bbf7d0;
        }
        .vmax-siglive-card.tone-short .vmax-siglive-brief {
          border-color: rgba(239, 68, 68, 0.4);
          color: #fecaca;
        }
        .vmax-siglive-card.tone-hot .vmax-siglive-brief {
          border-color: rgba(251, 191, 36, 0.35);
          color: #fde68a;
        }
        .vmax-siglive-gauge {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 3px;
          flex-shrink: 0;
        }
        .vmax-siglive-badge {
          font-size: 9px;
          font-weight: 800;
          letter-spacing: 0.02em;
          padding: 1px 6px;
          border-radius: 999px;
          background: rgba(51, 65, 85, 0.9);
          color: #cbd5e1;
          line-height: 1.3;
        }
        .vmax-siglive-badge.tone-long {
          background: rgba(22, 163, 74, 0.35);
          color: #4ade80;
        }
        .vmax-siglive-badge.tone-short {
          background: rgba(220, 38, 38, 0.4);
          color: #f87171;
        }
        .vmax-siglive-badge.tone-hot {
          background: rgba(202, 138, 4, 0.35);
          color: #fbbf24;
        }
        .vmax-siglive-badge.tone-ok {
          background: rgba(14, 165, 233, 0.3);
          color: #38bdf8;
        }
        .vmax-siglive-left-panel {
          display: none;
        }
        .vmax-left-regime-session {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .vmax-siglive-desk-panel {
          order: -1;
          margin-bottom: 2px;
        }
        /* 폰 전체화면 A/B 셸 — 기본 숨김 */
        .vmax-fs-shell {
          display: none;
        }
        .vmax-phone-fs-modes,
        .vmax-phone-fs-top,
        .vmax-phone-fs-card-bar,
        .vmax-phone-fs-extra {
          display: none;
        }
        .vmax-phone-fs-chip {
          appearance: none;
          border: 1px solid var(--line);
          background: #0f1a2c;
          color: var(--mute);
          font-size: 11px;
          font-weight: 700;
          padding: 5px 9px;
          border-radius: 999px;
          cursor: pointer;
        }
        .vmax-phone-fs-chip.on {
          color: #e0f2fe;
          border-color: rgba(56, 189, 248, 0.65);
          background: rgba(14, 116, 144, 0.35);
        }
        .vmax-siglive-ring {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          display: grid;
          place-items: center;
          position: relative;
          flex-shrink: 0;
        }
        .vmax-siglive-ring::before {
          content: '';
          position: absolute;
          inset: 4px;
          border-radius: 50%;
          background: #0b1220;
        }
        .vmax-siglive-ring span {
          position: relative;
          z-index: 1;
          font-size: 9px;
          font-weight: 800;
          color: #e2e8f0;
        }
        .vmax-siglive-bar {
          margin-top: 5px;
          height: 4px;
          border-radius: 999px;
          background: rgba(30, 41, 59, 0.9);
          overflow: hidden;
          width: 100%;
        }
        .vmax-siglive-bar i {
          display: block;
          height: 100%;
          min-width: 0;
          border-radius: 999px;
          background: linear-gradient(90deg, transparent, var(--sig-accent));
          transition: width 0.45s ease;
        }
        .vmax-hist {
          margin-bottom: 6px;
        }
        .vmax-levels {
          margin: 0;
          width: 100%;
          min-width: 0;
        }
        .vmax-levels > div {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          gap: 8px;
          font-size: 12px;
          padding: 5px 0;
          border-bottom: 1px solid #152033;
          min-width: 0;
        }
        .vmax-levels dt {
          color: var(--mute);
          flex-shrink: 0;
        }
        .vmax-levels dd {
          margin: 0;
          font-variant-numeric: tabular-nums;
          font-weight: 600;
          text-align: right;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .vmax-grid--tap-native .vmax-chart-box--tall {
          min-height: min(58vh, 640px);
          height: min(58vh, 640px);
        }
        .vmax-grid--tap-native .vmax-chart-panel .vmax-panel-b {
          padding: 6px;
        }
        .vmax-mini.on {
          color: var(--cyan);
          border-color: #0ea5e9;
        }
        @media (max-width: 1200px) {
          .vmax-grid {
            grid-template-columns: 1fr;
          }
        }
        .vmax-banner {
          text-align: center;
          font-weight: 800;
          font-size: 14px;
          letter-spacing: 0.02em;
          padding: 10px 8px;
          border-radius: 8px;
          margin-bottom: 10px;
        }
        .vmax-banner.long {
          background: rgba(34, 197, 94, 0.2);
          color: #4ade80;
          border: 1px solid rgba(34, 197, 94, 0.45);
        }
        .vmax-banner.short {
          background: rgba(239, 68, 68, 0.2);
          color: #f87171;
          border: 1px solid rgba(239, 68, 68, 0.45);
        }
        .vmax-banner.wait {
          background: rgba(100, 116, 139, 0.2);
          color: #cbd5e1;
          border: 1px solid rgba(100, 116, 139, 0.4);
        }
        .vmax-synth--right {
          flex-direction: column;
          gap: 10px;
        }
        .vmax-synth--right .vmax-synth-score {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .vmax-oneline {
          margin: 8px 0;
          font-size: 11px;
          color: #cbd5e1;
          line-height: 1.45;
          background: #0b1220;
          border: 1px solid var(--line);
          border-radius: 6px;
          padding: 8px;
        }
        .vmax-link-hint {
          border: 1px dashed #334155;
          border-radius: 10px;
          padding: 14px 12px;
          margin-bottom: 8px;
          text-align: center;
          background: #0b1220;
        }
        .vmax-link-hint p {
          margin: 0 0 8px;
          font-size: 12px;
          color: var(--mute);
        }
        .vmax-link-hint small {
          display: block;
          margin-top: 8px;
          font-size: 10px;
          color: var(--mute);
        }
        .vmax-buybar {
          position: relative;
          height: 14px;
          margin-top: 10px;
          background: #1e293b;
          border-radius: 999px;
          overflow: hidden;
        }
        .vmax-buybar i {
          display: block;
          height: 100%;
          background: linear-gradient(90deg, #16a34a, #22c55e);
        }
        .vmax-buybar span {
          position: absolute;
          top: 0;
          font-size: 9px;
          line-height: 14px;
          padding: 0 6px;
          color: #e2e8f0;
        }
        .vmax-buybar span:first-of-type {
          left: 0;
        }
        .vmax-buybar span:last-of-type {
          right: 0;
        }
        .vmax-regime-chip {
          display: inline-block;
          padding: 4px 8px;
          border-radius: 6px;
          background: rgba(34, 211, 238, 0.12);
          color: #67e8f9;
          border: 1px solid rgba(34, 211, 238, 0.35);
          font-size: 12px;
        }
        .vmax-session-map .vmax-session-row {
          display: flex;
          gap: 6px;
          margin-bottom: 6px;
        }
        .vmax-session-map .vmax-session-row span {
          flex: 1;
          text-align: center;
          font-size: 10px;
          padding: 6px 4px;
          border-radius: 6px;
          background: #122033;
          color: var(--mute);
        }
        .vmax-session-map .vmax-session-row span.on {
          background: rgba(34, 197, 94, 0.18);
          color: #86efac;
          border: 1px solid rgba(34, 197, 94, 0.35);
        }
        .vmax-session-map p {
          margin: 0;
          font-size: 10px;
          color: var(--mute);
        }
        .vmax-ind-row {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 6px;
          margin-top: 8px;
        }
        .vmax-ind-row > div {
          background: #0b1220;
          border: 1px solid var(--line);
          border-radius: 6px;
          padding: 6px;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .vmax-ind-row span {
          font-size: 9px;
          color: var(--mute);
        }
        .vmax-ind-row b {
          font-size: 11px;
        }
        .vmax-profit-tabs {
          display: flex;
          gap: 4px;
          margin-bottom: 8px;
        }
        .vmax-profit-tabs span {
          font-size: 10px;
          padding: 3px 8px;
          border-radius: 999px;
          border: 1px solid var(--line);
          color: var(--mute);
        }
        .vmax-profit-tabs span.on {
          background: #1d4ed8;
          color: #fff;
          border-color: #2563eb;
        }
        .vmax-profit-meta {
          display: flex;
          gap: 10px;
          font-size: 11px;
          color: var(--mute);
          margin-top: 6px;
        }
        .vmax-levels .tp dd {
          color: #4ade80;
        }
        .vmax-levels .sl dd {
          color: #f87171;
        }
        .vmax-levels .en dd {
          color: #38bdf8;
        }
        .vmax-panel {
          background: var(--panel);
          border: 1px solid var(--line);
          border-radius: 10px;
          margin-bottom: 8px;
          overflow: hidden;
        }
        .vmax-panel-h {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 7px 10px;
          border-bottom: 1px solid var(--line);
        }
        .vmax-panel-h h3 {
          margin: 0;
          font-size: 12px;
          font-weight: 600;
          color: #cbd5e1;
        }
        .vmax-panel-tog {
          border: 0;
          background: transparent;
          color: var(--mute);
          font-size: 10px;
          cursor: pointer;
        }
        .vmax-panel-b {
          padding: 8px 10px 10px;
        }
        .vmax-panel.is-fold .vmax-panel-b {
          display: none;
        }
        .vmax-coin-list {
          list-style: none;
          margin: 0;
          padding: 0;
        }
        .vmax-coin-list button {
          width: 100%;
          text-align: left;
          border: 0;
          background: transparent;
          color: var(--text);
          padding: 7px 2px;
          border-bottom: 1px solid #152033;
          cursor: pointer;
          display: grid;
          grid-template-columns: 36px 52px 28px 1fr;
          gap: 4px;
          align-items: center;
          font-size: 11px;
        }
        .vmax-coin-list .tag {
          font-size: 10px;
          font-weight: 700;
        }
        .vmax-coin-list .tag.long,
        .g {
          color: var(--long);
        }
        .vmax-coin-list .tag.short,
        .r {
          color: var(--short);
        }
        .vmax-coin-list .tag.armed {
          color: var(--armed);
        }
        .vmax-coin-list .tag.wait,
        .mute,
        .vmax-muted {
          color: var(--mute);
        }
        .vmax-coin-list small {
          color: var(--mute);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .vmax-gauge {
          display: flex;
          justify-content: center;
          padding: 6px 0;
        }
        .vmax-gauge-arc {
          width: 110px;
          height: 110px;
          border-radius: 50%;
          display: grid;
          place-items: center;
        }
        .vmax-gauge-hole {
          width: 78px;
          height: 78px;
          border-radius: 50%;
          background: var(--panel);
          display: grid;
          place-content: center;
          text-align: center;
        }
        .vmax-gauge-hole b {
          font-size: 18px;
        }
        .vmax-gauge-hole span {
          font-size: 10px;
          color: var(--mute);
        }
        .vmax-regime strong {
          display: block;
          margin-bottom: 6px;
        }
        .vmax-regime ul {
          margin: 0;
          padding-left: 16px;
          font-size: 11px;
          color: var(--mute);
        }
        .vmax-session {
          margin: 0;
          font-size: 11px;
          color: var(--mute);
        }
        .vmax-shared-feat-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          padding: 6px 8px 0;
          align-items: center;
        }

        .vmax-battle-style {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 10px 14px;
          margin: 0 0 8px;
          padding: 6px 10px;
          border: 1px solid #1e293b;
          border-radius: 8px;
          background: #0b1220;
          font-size: 11px;
          color: #94a3b8;
        }
        .vmax-battle-style-title {
          font-weight: 800;
          color: #facc15;
          letter-spacing: 0.02em;
        }
        .vmax-battle-style-op {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          min-width: 160px;
          flex: 1;
        }
        .vmax-battle-style-op input[type='range'] {
          flex: 1;
          accent-color: #facc15;
        }
        .vmax-battle-style-border {
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .vmax-battle-style-border input[type='color'] {
          width: 28px;
          height: 22px;
          padding: 0;
          border: 1px solid #334155;
          border-radius: 4px;
          background: transparent;
          cursor: pointer;
        }
        .vmax-shared-feat-chips .tool-chip {
          font-size: 11px;
          font-weight: 700;
          padding: 4px 10px;
        }
        .vmax-iband-card {
          margin: 6px 0 8px;
          padding: 8px 10px;
          border-radius: 8px;
          border: 1px solid rgba(148, 163, 184, 0.35);
          background: rgba(15, 23, 42, 0.92);
          font-size: 11px;
          color: #e2e8f0;
        }
        .vmax-iband-card.is-long {
          border-color: rgba(74, 222, 128, 0.55);
          box-shadow: 0 0 0 1px rgba(34, 197, 94, 0.12);
        }
        .vmax-iband-card.is-short {
          border-color: rgba(248, 113, 113, 0.55);
          box-shadow: 0 0 0 1px rgba(239, 68, 68, 0.12);
        }
        .vmax-iband-card.is-wait {
          border-color: rgba(148, 163, 184, 0.28);
        }
        .vmax-iband-card header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 6px;
        }
        .vmax-iband-card header strong {
          font-size: 12px;
          letter-spacing: 0.02em;
        }
        .vmax-iband-card header span {
          font-weight: 800;
          color: #94a3b8;
        }
        .vmax-iband-card.is-long header span {
          color: #4ade80;
        }
        .vmax-iband-card.is-short header span {
          color: #f87171;
        }
        .vmax-iband-card header em {
          margin-left: auto;
          font-style: normal;
          font-size: 10px;
          color: #fbbf24;
        }
        .vmax-iband-levels {
          display: flex;
          flex-wrap: wrap;
          gap: 8px 12px;
          font-variant-numeric: tabular-nums;
        }
        .vmax-iband-levels b {
          font-weight: 700;
          color: #38bdf8;
        }
        .vmax-iband-levels b.sl {
          color: #f87171;
        }
        .vmax-iband-levels b.tp {
          color: #4ade80;
        }
        .vmax-iband-levels i {
          font-style: normal;
          color: #94a3b8;
        }
        .vmax-iband-candle,
        .vmax-iband-reason {
          margin: 4px 0 0;
          color: #94a3b8;
          line-height: 1.35;
        }
        .vmax-iband-candle {
          color: #cbd5e1;
        }
        .vmax-chart-box {
          height: min(48vh, 460px);
          min-height: 320px;
          width: 100%;
          position: relative;
        }
        .vmax-chart-box.vmax-chart-box--tall {
          height: min(58vh, 640px);
          min-height: min(58vh, 640px);
        }
        .vmax-confirm-card {
          position: absolute;
          top: 10px;
          right: 10px;
          z-index: 8;
          width: min(220px, 72%);
          padding: 8px 10px 9px;
          border-radius: 10px;
          background: rgba(15, 23, 42, 0.94);
          border: 1px solid #22c55e;
          color: #e2e8f0;
          font-size: 12px;
          line-height: 1.35;
          box-shadow: 0 10px 28px rgba(0, 0, 0, 0.4);
          pointer-events: auto;
        }
        .vmax-confirm-card.is-short {
          border-color: #ef4444;
        }
        .vmax-confirm-card header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }
        .vmax-confirm-card strong {
          color: #4ade80;
        }
        .vmax-confirm-card.is-short strong {
          color: #f87171;
        }
        .vmax-confirm-card button {
          border: 0;
          border-radius: 6px;
          background: #334155;
          color: #e2e8f0;
          font-size: 11px;
          padding: 2px 8px;
          cursor: pointer;
        }
        .vmax-confirm-card p {
          margin: 4px 0 0;
          color: #cbd5e1;
        }
        .vmax-synth {
          display: grid;
          grid-template-columns: 120px minmax(0, 1fr);
          gap: 12px;
          width: 100%;
          box-sizing: border-box;
        }
        @media (max-width: 700px) {
          .vmax-synth {
            grid-template-columns: 1fr;
          }
          /* 폰: 차트 덮개 금지 · 왼쪽(레짐·세션 자리)에 신호감지 */
          .vmax-siglive-left-panel {
            display: block !important;
          }
          .vmax-left-regime-session {
            display: none;
          }
          .vmax-siglive-desk-panel {
            display: none !important;
          }
          .vmax-siglive.is-compact .vmax-siglive-head {
            gap: 4px;
            margin-bottom: 4px;
          }
          .vmax-siglive.is-compact .vmax-siglive-head b {
            font-size: 11px;
          }
          .vmax-siglive.is-compact .vmax-siglive-head em {
            font-size: 9px;
            max-width: 48%;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
          .vmax-siglive.is-compact .vmax-siglive-coins {
            gap: 4px;
            margin-bottom: 4px;
          }
          .vmax-siglive.is-compact .vmax-siglive-coin {
            padding: 4px 5px 6px;
            min-height: 0;
          }
          .vmax-siglive.is-compact .vmax-siglive-coin strong {
            font-size: 10px;
          }
          .vmax-siglive.is-compact .vmax-siglive-coin-dir {
            font-size: 9px;
          }
          .vmax-siglive.is-compact .vmax-siglive-grid {
            gap: 4px;
          }
          .vmax-siglive.is-compact .vmax-siglive-card {
            padding: 5px 7px;
            border-radius: 6px;
          }
          .vmax-siglive.is-compact .vmax-siglive-emoji {
            font-size: 14px;
            width: 20px;
          }
          .vmax-siglive.is-compact .vmax-siglive-meta strong {
            font-size: 10px;
          }
          .vmax-siglive.is-compact .vmax-siglive-meta small {
            font-size: 9px;
          }
          .vmax-siglive.is-compact .vmax-siglive-brief {
            margin-top: 3px;
            padding: 3px 5px;
            font-size: 9px;
            line-height: 1.35;
          }
          .vmax-siglive.is-compact .vmax-siglive-ring {
            width: 34px;
            height: 34px;
          }
          .vmax-siglive.is-compact .vmax-siglive-ring::before {
            inset: 4px;
          }
          .vmax-siglive.is-compact .vmax-siglive-ring span {
            font-size: 9px;
          }
          .vmax-siglive.is-compact .vmax-siglive-badge {
            font-size: 8px;
            padding: 0 5px;
          }
          .vmax-siglive.is-compact .vmax-siglive-bar {
            margin-top: 4px;
            height: 3px;
          }
          /* —— 폰 전체화면 A/B 셸: 게이지·차트·팩터 · 스크롤 금지 —— */
          .vmax-root.is-phone-fs {
            padding: 4px 6px 6px;
            min-height: 100dvh;
            overflow: hidden;
          }
          .vmax-root.is-phone-fs .vmax-head,
          .vmax-root.is-phone-fs .vmax-chips,
          .vmax-root.is-phone-fs .vmax-ticker,
          .vmax-root.is-phone-fs .vmax-news,
          .vmax-root.is-phone-fs .vmax-server-health,
          .vmax-root.is-phone-fs .vmax-foot,
          .vmax-root.is-phone-fs .vmax-mgr,
          .vmax-root.is-phone-fs .vmax-stats {
            display: none !important;
          }
          .vmax-root.is-phone-fs .vmax-fs-shell {
            display: flex;
            flex-direction: column;
            height: calc(100dvh - 12px);
            max-height: calc(100dvh - 12px);
            overflow: hidden;
            gap: 4px;
          }
          .vmax-fs-bar {
            display: flex;
            gap: 6px;
            flex-shrink: 0;
            padding: 2px 2px 0;
          }
          .vmax-fs-chip {
            appearance: none;
            border: 1px solid var(--line);
            background: #0f1a2c;
            color: var(--mute);
            font-size: 12px;
            font-weight: 800;
            min-width: 36px;
            padding: 6px 10px;
            border-radius: 999px;
            cursor: pointer;
          }
          .vmax-fs-chip.on {
            color: #e0f2fe;
            border-color: rgba(56, 189, 248, 0.7);
            background: rgba(14, 116, 144, 0.4);
          }
          .vmax-fs-gauges {
            flex-shrink: 0;
            display: flex;
            flex-direction: column;
            gap: 4px;
            padding: 2px 0;
          }
          .vmax-fs-gauge-rings {
            display: grid;
            grid-template-columns: repeat(6, 1fr);
            gap: 4px;
          }
          .vmax-fs-gauge {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 2px;
            min-width: 0;
            appearance: none;
            border: 0;
            background: transparent;
            padding: 0;
            cursor: pointer;
            -webkit-tap-highlight-color: transparent;
          }
          .vmax-fs-hint {
            margin-left: auto;
            font-size: 10px;
            color: var(--mute);
          }
          .vmax-fs-gauge-ring {
            width: 36px;
            height: 36px;
            border-radius: 50%;
            display: grid;
            place-items: center;
            position: relative;
          }
          .vmax-fs-gauge-ring::before {
            content: '';
            position: absolute;
            inset: 4px;
            border-radius: 50%;
            background: #0b1220;
          }
          .vmax-fs-gauge-ring span {
            position: relative;
            z-index: 1;
            font-size: 9px;
            font-weight: 800;
            color: #e2e8f0;
          }
          .vmax-fs-gauge em {
            font-style: normal;
            font-size: 9px;
            font-weight: 700;
            max-width: 100%;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
          .vmax-fs-gauge.tone-wait em { color: #fbbf24 !important; }
          .vmax-fs-gauge.tone-long em { color: #4ade80 !important; }
          .vmax-fs-gauge.tone-short em { color: #f87171 !important; }
          .vmax-fs-gauge.tone-wait .vmax-fs-gauge-ring {
            box-shadow: 0 0 0 1px rgba(234, 179, 8, 0.25);
          }
          .vmax-fs-gauge.tone-long .vmax-fs-gauge-ring {
            box-shadow: 0 0 0 1px rgba(34, 197, 94, 0.25);
          }
          .vmax-fs-gauge.tone-short .vmax-fs-gauge-ring {
            box-shadow: 0 0 0 1px rgba(239, 68, 68, 0.25);
          }
          .vmax-fs-gauge.is-pulse .vmax-fs-gauge-ring {
            animation: vmaxSigCard 1.4s ease-in-out infinite;
          }
          .vmax-fs-chart {
            flex: 1 1 auto;
            min-height: 0;
            overflow: hidden;
          }
          .vmax-fs-chart-box,
          .vmax-root.is-phone-fs .vmax-fs-chart-box {
            height: 100% !important;
            min-height: 0 !important;
          }
          .vmax-root.is-phone-fs.is-factor-open .vmax-fs-chart {
            flex: 1 1 42%;
          }
          .vmax-fs-factor {
            flex-shrink: 0;
            border: 1px solid var(--line);
            border-radius: 10px;
            background: #0b1422;
            overflow: hidden;
          }
          .vmax-fs-factor-tog {
            width: 100%;
            appearance: none;
            border: 0;
            background: transparent;
            color: var(--text);
            font-size: 12px;
            font-weight: 700;
            padding: 8px 10px;
            cursor: pointer;
            text-align: left;
          }
          .vmax-fs-factor-body {
            padding: 0 8px 8px;
            max-height: min(36vh, 280px);
            overflow-x: hidden;
            overflow-y: auto;
            -webkit-overflow-scrolling: touch;
          }
          .vmax-fs-factors-desk .vmax-factor-summary-note {
            font-size: 10px;
          }
          .vmax-fs-help {
            position: fixed;
            inset: 0;
            z-index: 80;
            background: rgba(2, 6, 23, 0.72);
            display: grid;
            place-items: center;
            padding: 16px;
          }
          .vmax-fs-help-card {
            width: min(92vw, 360px);
            border-radius: 12px;
            border: 1px solid var(--line);
            background: #0d1524;
            padding: 12px 14px;
          }
          .vmax-fs-help-card header {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 8px;
          }
          .vmax-fs-help-card header strong {
            flex: 1;
            font-size: 14px;
          }
          .vmax-fs-help-card header span {
            font-size: 11px;
            font-weight: 700;
            color: var(--mute);
          }
          .vmax-fs-help-card.tone-long header span { color: #4ade80; }
          .vmax-fs-help-card.tone-short header span { color: #f87171; }
          .vmax-fs-help-card.tone-wait header span { color: #fbbf24; }
          .vmax-fs-help-card header button {
            appearance: none;
            border: 0;
            background: #1e293b;
            color: #e2e8f0;
            width: 28px;
            height: 28px;
            border-radius: 8px;
            font-size: 16px;
            cursor: pointer;
          }
          .vmax-fs-help-status {
            margin: 0 0 6px;
            font-size: 12px;
            font-weight: 700;
            color: #e2e8f0;
          }
          .vmax-fs-help-brief {
            margin: 0 0 8px;
            font-size: 12px;
            line-height: 1.45;
            color: #cbd5e1;
          }
          .vmax-fs-help-note {
            margin: 0;
            font-size: 10px;
            color: var(--mute);
          }
        }
        @media (min-width: 701px) {
          .vmax-siglive-left-panel {
            display: none !important;
          }
          .vmax-left-regime-session {
            display: flex;
          }
          /* 데스크톱: 전체화면 셸 미사용 */
          .vmax-fs-shell { display: none !important; }
        }
        .vmax-ring {
          width: 100px;
          height: 100px;
          border-radius: 50%;
          display: grid;
          place-items: center;
          margin: 0 auto;
        }
        .vmax-ring-hole {
          width: 72px;
          height: 72px;
          border-radius: 50%;
          background: var(--panel);
          display: grid;
          place-content: center;
          text-align: center;
        }
        .vmax-ring-hole b {
          font-size: 20px;
        }
        .vmax-ring-hole span {
          font-size: 10px;
          color: var(--mute);
        }
        .vmax-synth-state {
          text-align: center;
          font-size: 12px;
          font-weight: 700;
          margin: 6px 0 0;
        }
        .vmax-synth-state.long {
          color: var(--long);
        }
        .vmax-synth-state.short {
          color: var(--short);
        }
        .vmax-synth-auto-hint {
          margin: 4px 0 0;
          font-size: 10px;
          line-height: 1.35;
          color: #fbbf24;
          text-align: center;
          max-width: 148px;
        }
        .vmax-synth-body > p {
          margin: 0 0 8px;
          font-size: 12px;
          line-height: 1.45;
          color: #cbd5e1;
        }
        .vmax-shared-hint {
          margin: -4px 0 8px !important;
          font-size: 11px !important;
          color: #94a3b8 !important;
        }
        .vmax-synth-boxes {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 6px;
          margin-bottom: 8px;
        }
        .vmax-synth-boxes div {
          background: #0b1220;
          border-radius: 7px;
          padding: 6px;
        }
        .vmax-synth-boxes span {
          display: block;
          font-size: 10px;
          color: var(--mute);
        }
        .vmax-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }
        .vmax-actions button {
          border: 0;
          border-radius: 8px;
          padding: 8px 12px;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
        }
        .vmax-actions .long {
          background: #166534;
          color: #fff;
        }
        .vmax-actions .short {
          background: #7f1d1d;
          color: #fff;
        }
        .vmax-actions .ghost {
          background: #111827;
          color: var(--mute);
          border: 1px solid var(--line);
        }
        .vmax-actions button:disabled {
          opacity: 0.35;
          cursor: not-allowed;
        }
        .vmax-factor-summary {
          margin-bottom: 10px;
          padding: 8px 10px;
          border: 1px solid #1e293b;
          border-radius: 8px;
          background: linear-gradient(180deg, #0f172a, #0b1220);
        }
        .vmax-factor-summary.lean-long {
          border-color: rgba(34, 197, 94, 0.35);
        }
        .vmax-factor-summary.lean-short {
          border-color: rgba(239, 68, 68, 0.35);
        }
        .vmax-factor-summary-head {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.02em;
          margin-bottom: 6px;
        }
        .vmax-factor-summary-head .long {
          color: #4ade80;
        }
        .vmax-factor-summary-head .short {
          color: #f87171;
        }
        .vmax-factor-summary-head .mid {
          color: #e2e8f0;
          font-size: 12px;
        }
        .vmax-factor-tug {
          display: flex;
          height: 10px;
          border-radius: 99px;
          overflow: hidden;
          background: #020617;
        }
        .vmax-factor-tug i {
          display: block;
          height: 100%;
        }
        .vmax-factor-tug i.long {
          background: linear-gradient(90deg, #166534, #4ade80);
        }
        .vmax-factor-tug i.short {
          background: linear-gradient(90deg, #f87171, #991b1b);
        }
        .vmax-factor-summary-note {
          margin: 6px 0 0;
          font-size: 10px;
          color: #64748b;
          line-height: 1.35;
        }
        .vmax-factor-axis {
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          font-size: 9px;
          color: #64748b;
          margin-bottom: 4px;
          padding: 0 72px 0 64px;
        }
        .vmax-factor-axis span:first-child {
          text-align: left;
          color: #f87171;
        }
        .vmax-factor-axis span:last-child {
          text-align: right;
          color: #4ade80;
        }
        .vmax-factor-axis span:nth-child(2) {
          text-align: center;
        }
        .vmax-factor {
          display: grid;
          grid-template-columns: 64px 1fr 44px;
          gap: 6px;
          align-items: center;
          font-size: 11px;
          margin-bottom: 5px;
        }
        .vmax-factor-name {
          color: #94a3b8;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .vmax-factor-bipolar {
          display: grid;
          grid-template-columns: 1fr 2px 1fr;
          height: 8px;
          border-radius: 99px;
          overflow: hidden;
          background: #020617;
          border: 1px solid #1e293b;
        }
        .vmax-factor-neg,
        .vmax-factor-pos {
          position: relative;
          height: 100%;
          overflow: hidden;
        }
        .vmax-factor-neg {
          display: flex;
          justify-content: flex-end;
          background: rgba(127, 29, 29, 0.2);
        }
        .vmax-factor-pos {
          background: rgba(20, 83, 45, 0.2);
        }
        .vmax-factor-neg i {
          display: block;
          height: 100%;
          background: linear-gradient(270deg, #ef4444, #fb7185);
        }
        .vmax-factor-pos i {
          display: block;
          height: 100%;
          background: linear-gradient(90deg, #22c55e, #4ade80);
        }
        .vmax-factor-mid {
          background: #94a3b8;
          opacity: 0.55;
        }
        .vmax-factor-tag {
          font-variant-numeric: tabular-nums;
          font-size: 10px;
          font-weight: 800;
          text-align: right;
        }
        .vmax-factor-tag.long {
          color: #4ade80;
        }
        .vmax-factor-tag.short {
          color: #f87171;
        }
        .vmax-factor-tag.flat {
          color: #94a3b8;
        }
        .vmax-levels {
          margin: 0;
        }
        .vmax-levels > div {
          display: flex;
          justify-content: space-between;
          font-size: 12px;
          padding: 4px 0;
          border-bottom: 1px solid #152033;
        }
        .vmax-levels dt {
          color: var(--mute);
        }
        .vmax-levels dd {
          margin: 0;
          font-variant-numeric: tabular-nums;
          font-weight: 600;
        }
        .vmax-calc label {
          display: block;
          font-size: 11px;
          color: var(--mute);
          margin-bottom: 8px;
        }
        .vmax-calc input[type='number'],
        .vmax-calc input[type='range'] {
          width: 100%;
          margin-top: 4px;
        }
        .vmax-calc input[type='number'] {
          background: #0b1220;
          border: 1px solid var(--line);
          color: var(--text);
          border-radius: 6px;
          padding: 6px;
        }
        .vmax-seg {
          display: flex;
          gap: 4px;
          margin-bottom: 8px;
        }
        .vmax-seg button {
          flex: 1;
          border: 1px solid var(--line);
          background: transparent;
          color: var(--mute);
          border-radius: 6px;
          padding: 5px;
          font-size: 11px;
          cursor: pointer;
        }
        .vmax-seg button.on {
          background: #1d4ed8;
          color: #fff;
        }
        .vmax-calc ul {
          list-style: none;
          margin: 0 0 8px;
          padding: 0;
          font-size: 11px;
        }
        .vmax-exec {
          width: 100%;
          border: 0;
          border-radius: 8px;
          padding: 10px;
          background: #1d4ed8;
          color: #fff;
          font-weight: 700;
          cursor: pointer;
        }
        .vmax-pos,
        .vmax-log {
          list-style: none;
          margin: 0;
          padding: 0;
          font-size: 11px;
        }
        .vmax-pos li,
        .vmax-log li {
          padding: 5px 0;
          border-bottom: 1px solid #152033;
        }
        .vmax-pos li {
          display: grid;
          grid-template-columns: 40px 40px 1fr auto;
          gap: 4px;
        }
        .vmax-foot {
          margin-top: 8px;
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          align-items: center;
          font-size: 11px;
          color: var(--mute);
          border-top: 1px solid var(--line);
          padding-top: 8px;
        }
        .vmax-foot .pulse {
          color: var(--long);
        }
      `}</style>
    </div>
  );
}
