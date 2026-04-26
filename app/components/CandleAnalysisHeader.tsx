'use client';

import { useEffect, useMemo, useState } from 'react';
import type { AnalyzeResponse, OverlayItem } from '@/types';
import type { Candle } from '@/types';
import type { UserSettings } from '@/lib/settings';
import {
  volumeSpikeRecent,
  resolveCandleAnalysisDirection,
  computeCandleAnalysisSituation,
} from '@/lib/candleAnalysisGuide';
import { multiTimeframeStrip } from '@/lib/candleAnalysisSmartPack';
import { buildSmartCandleInsights, buildSmartOverlayPayload } from '@/lib/smartOverlayPayload';
import type { SmartOverlayConfirmation } from '@/types/smartOverlay';
import {
  addEstimatedCostUsd,
  getStoredBriefingPassword,
  getStoredBriefingUser,
  getStoredOpenAIKey,
} from '@/lib/clientAiCredentials';

const DETAIL_LS = 'ailongshort-candle-situation-open-v1';

type Theme = 'dark' | 'light';

export type CandleAnalysisAiDrawCallbacks = {
  active: boolean;
  onApply: (bundle: { overlays: OverlayItem[]; commentary: string[] }) => void;
  onClear: () => void;
  requestPayload: {
    symbol: string;
    timeframe: string;
    candles: Array<{ time: number; open: number; high: number; low: number; close: number; volume: number }>;
    analysis?: {
      verdict?: string;
      currentPrice?: number;
      smartOverlay?: AnalyzeResponse['smartOverlay'];
    };
  };
};

function gradeFromConfidence(conf: number, grade?: string | null): string {
  const g = (grade || '').trim().toUpperCase();
  if (g === 'A' || g === 'B' || g === 'C' || g === 'D') return g;
  if (conf >= 85) return 'A';
  if (conf >= 70) return 'B';
  if (conf >= 55) return 'C';
  return 'D';
}

function formatSymbol(sym: string): string {
  const s = sym.trim();
  if (/USDT$/i.test(s)) return `${s.replace(/USDT$/i, '').replace(/[-_]/g, '')} / USDT`;
  return s.replace(/[-_]/g, '/');
}

function ConfirmationStrip({
  confirmation,
  theme,
}: {
  confirmation: SmartOverlayConfirmation;
  theme: Theme;
}) {
  const sub = theme === 'dark' ? '#94a3b8' : '#64748b';
  const hl =
    confirmation.headline === 'BULL_CONFIRM'
      ? '#4ade80'
      : confirmation.headline === 'BEAR_CONFIRM'
        ? '#f87171'
        : sub;
  return (
    <div style={{ fontSize: 9, fontWeight: 700, lineHeight: 1.35, marginTop: 2 }}>
      <span style={{ color: hl }}>{confirmation.headline_ko}</span>
      <span style={{ color: sub, fontWeight: 600 }}>
        {' '}
        · ↑{confirmation.bull.score}/3 ↓{confirmation.bear.score}/3{' '}
        <span style={{ fontWeight: 500 }}>(구조·종가·2봉)</span>
      </span>
    </div>
  );
}

function toneColor(tone: 'neutral' | 'ok' | 'warn' | 'bad', theme: Theme): string {
  if (tone === 'ok') return '#4ade80';
  if (tone === 'warn') return '#fbbf24';
  if (tone === 'bad') return '#f87171';
  return theme === 'dark' ? '#cbd5e1' : '#475569';
}

export default function CandleAnalysisHeader({
  analysis,
  candles,
  symbol,
  theme = 'dark',
  applySettings,
  candleAnalysisBrowserNotify = false,
  candleAnalysisAiComment = false,
  candleAnalysisAutoCommentaryOnly = true,
  candleAnalysisExecutiveView = true,
  candleAnalysisDirectTheoryPath = true,
  candleAnalysisHashFibEnabled = true,
  candleAnalysisBosWavesEnabled = true,
  candleAnalysisVifvgEnabled = true,
  candleAnalysisBreakerBlocksEnabled = true,
  /** BOS·VIFVG·브레이커 존을 차트에 그릴지(기본 끔) */
  candleAnalysisZoneChartVisible = false,
  candleAnalysisCoreSdZones = true,
  candleAnalysisAiDraw,
  autoCommentaryLines = [],
  /** 좁은 화면에서 상단 차트 툴바 높이만큼 아래로 내림 (겹침 방지) */
  layoutTopPx = 8,
}: {
  analysis: AnalyzeResponse;
  candles: Candle[];
  symbol: string;
  theme?: Theme;
  applySettings?: (patch: Partial<UserSettings>) => void;
  candleAnalysisBrowserNotify?: boolean;
  candleAnalysisAiComment?: boolean;
  /** true: 자동 분석 중 OB만 차트, 나머지는 해설 텍스트 */
  candleAnalysisAutoCommentaryOnly?: boolean;
  /** 핵심 돌파·이론 경로·요약 존 */
  candleAnalysisExecutiveView?: boolean;
  /** 현재가→목표 직진 보라 점선 */
  candleAnalysisDirectTheoryPath?: boolean;
  /** Hash Auto Fibonacci(동적 룩백·피보·골든포켓·ATR SL) 차트·해설 */
  candleAnalysisHashFibEnabled?: boolean;
  /** BOSWaves 유동성 풀·스윕·BUY/SELL 존 투영 */
  candleAnalysisBosWavesEnabled?: boolean;
  /** UAlgo VIFVG(역 FVG·거래량 막대) */
  candleAnalysisVifvgEnabled?: boolean;
  /** AlgoAlpha Breaker Blocks (OB→브레이커·리젝션) */
  candleAnalysisBreakerBlocksEnabled?: boolean;
  /** 존형 지표(BOSWaves·VIFVG·브레이커) 차트 레이어 표시 */
  candleAnalysisZoneChartVisible?: boolean;
  /** 엔진 Supply/Demand 핵심 존 — TV 스타일 띠(기본 켜짐) */
  candleAnalysisCoreSdZones?: boolean;
  /** AI 작도 API → 차트 오버레이 병합 */
  candleAnalysisAiDraw?: CandleAnalysisAiDrawCallbacks;
  autoCommentaryLines?: string[];
  layoutTopPx?: number;
}) {
  const dir = resolveCandleAnalysisDirection(analysis);
  const verdict = analysis.verdict;

  const smart = useMemo(() => {
    return analysis.smartOverlay ?? buildSmartOverlayPayload(analysis, candles);
  }, [analysis, candles]);

  const insightChips = useMemo(() => buildSmartCandleInsights(analysis, candles), [analysis, candles]);

  const mtfStrip = useMemo(() => multiTimeframeStrip(analysis), [analysis]);

  const [detailOpen, setDetailOpen] = useState(false);
  const [aiLine, setAiLine] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiDrawLoading, setAiDrawLoading] = useState(false);
  const [aiDrawError, setAiDrawError] = useState<string | null>(null);

  const runAiDraw = () => {
    const pay = candleAnalysisAiDraw?.requestPayload;
    if (!pay || pay.candles.length < 8) {
      setAiDrawError('캔들 8개 이상 필요');
      return;
    }
    setAiDrawLoading(true);
    setAiDrawError(null);
    void fetch('/api/candle-analysis-draw', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symbol: pay.symbol,
        timeframe: pay.timeframe,
        candles: pay.candles,
        analysis: pay.analysis,
        openaiApiKey: getStoredOpenAIKey() || undefined,
        briefingLogin: { user: getStoredBriefingUser(), password: getStoredBriefingPassword() },
      }),
      credentials: 'same-origin',
    })
      .then(async (r) => {
        const j = (await r.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          overlays?: OverlayItem[];
          commentary?: string[];
          usage?: { estimatedCostUsd?: number };
        };
        if (!r.ok || j.ok === false) {
          setAiDrawError(j.error || `요청 실패 ${r.status}`);
          return;
        }
        const ovs = Array.isArray(j.overlays) ? j.overlays : [];
        const comm = Array.isArray(j.commentary) ? j.commentary.map(String) : [];
        candleAnalysisAiDraw?.onApply({ overlays: ovs, commentary: comm });
        const c = j.usage?.estimatedCostUsd;
        if (typeof c === 'number' && c > 0) addEstimatedCostUsd(c);
      })
      .catch(() => setAiDrawError('네트워크 오류'))
      .finally(() => setAiDrawLoading(false));
  };

  useEffect(() => {
    try {
      const v = window.localStorage.getItem(DETAIL_LS);
      if (v === '1') setDetailOpen(true);
      else setDetailOpen(false);
    } catch {}
  }, []);

  useEffect(() => {
    if (!candleAnalysisBrowserNotify || typeof window === 'undefined' || !analysis) return;
    const smartNow = smart;
    const lastT = candles[candles.length - 1]?.time ?? 0;
    const tf = analysis.timeframe;
    const notifyOnce = (id: string, title: string, body: string) => {
      try {
        const key = `ca-n-${id}-${symbol}-${tf}-${lastT}`;
        if (sessionStorage.getItem(key)) return;
        sessionStorage.setItem(key, '1');
        if (Notification.permission === 'granted') {
          new Notification(title, { body, tag: key });
        }
      } catch {
        /* ignore */
      }
    };
    if (smartNow?.status === '진입 가능') {
      notifyOnce('entry', `${symbol} ${tf}`, '캔들분석: 진입 가능');
    }
    const sz = analysis.settlementZone;
    if (sz?.state === 'confirmed') {
      notifyOnce('settle', `${symbol} ${tf}`, '캔들분석: 안착 확인');
    }
  }, [candleAnalysisBrowserNotify, analysis, candles, smart, symbol]);

  useEffect(() => {
    if (!candleAnalysisAiComment || !analysis) {
      setAiLine(null);
      setAiLoading(false);
      return;
    }
    const ac = new AbortController();
    const lastT = candles[candles.length - 1]?.time ?? 0;
    const t = setTimeout(() => {
      setAiLoading(true);
      void fetch('/api/candle-analysis-ai-comment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol,
          timeframe: analysis.timeframe,
          verdict: analysis.verdict,
          status: smart?.status,
          ruleComment: smart?.comment,
          insights: insightChips.slice(0, 10),
          openaiApiKey: getStoredOpenAIKey() || undefined,
          briefingLogin: { user: getStoredBriefingUser(), password: getStoredBriefingPassword() },
        }),
        signal: ac.signal,
        credentials: 'same-origin',
      })
        .then((r) => r.json())
        .then((j: { aiLine?: string; usage?: { estimatedCostUsd?: number } }) => {
          if (ac.signal.aborted) return;
          if (j?.aiLine) setAiLine(String(j.aiLine));
          else setAiLine(null);
          const c = j?.usage?.estimatedCostUsd;
          if (typeof c === 'number' && c > 0) addEstimatedCostUsd(c);
        })
        .catch(() => {
          if (!ac.signal.aborted) setAiLine(null);
        })
        .finally(() => {
          if (!ac.signal.aborted) setAiLoading(false);
        });
    }, 720);
    return () => {
      clearTimeout(t);
      ac.abort();
    };
  }, [
    candleAnalysisAiComment,
    symbol,
    analysis,
    analysis.timeframe,
    analysis.verdict,
    candles,
    smart?.status,
    smart?.comment,
    insightChips,
  ]);

  const lastBarKey = candles[candles.length - 1]?.time ?? 0;

  const toggleDetail = () => {
    setDetailOpen((o) => {
      const n = !o;
      try {
        window.localStorage.setItem(DETAIL_LS, n ? '1' : '0');
      } catch {}
      return n;
    });
  };

  const situationLines = useMemo(() => computeCandleAnalysisSituation(analysis, candles), [analysis, candles]);

  const prob = analysis.probability;
  const longP = smart
    ? Math.round(smart.prob_long)
    : Math.round(
        prob?.longProbability ?? analysis.breakoutLevelProbability ?? analysis.breakoutUpsideProbability ?? analysis.confidence ?? 50
      );
  const shortP = smart
    ? Math.round(smart.prob_short)
    : Math.round(prob?.shortProbability ?? analysis.invalidationLevelProbability ?? Math.max(0, 100 - longP));
  const upPct = verdict === 'SHORT' ? shortP : longP;
  const downPct = Math.max(0, Math.min(100, 100 - upPct));

  const grade = smart?.confidence ?? gradeFromConfidence(analysis.confidence ?? 0, analysis.confidenceGrade);
  const headline = smart?.status ?? dir.headlineKo;
  const last = candles[candles.length - 1];
  const prev = candles.length >= 2 ? candles[candles.length - 2] : last;
  const chg = last && prev && prev.close > 0 ? ((last.close - prev.close) / prev.close) * 100 : 0;
  const volSpike = volumeSpikeRecent(candles, 20, 2);

  const fg = theme === 'dark' ? '#e2e8f0' : '#0f172a';
  const sub = theme === 'dark' ? '#94a3b8' : '#64748b';
  const cardBg = theme === 'dark' ? 'rgba(15,23,42,0.92)' : 'rgba(255,255,255,0.96)';

  const toggleNotify = () => {
    const next = !candleAnalysisBrowserNotify;
    applySettings?.({ candleAnalysisBrowserNotify: next });
    if (next && typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      void Notification.requestPermission();
    }
  };

  const toggleAi = () => {
    applySettings?.({ candleAnalysisAiComment: !candleAnalysisAiComment });
  };

  const toggleAutoChartLayers = () => {
    applySettings?.({ candleAnalysisAutoCommentaryOnly: !candleAnalysisAutoCommentaryOnly });
  };

  const toggleExecutiveView = () => {
    applySettings?.({ candleAnalysisExecutiveView: !candleAnalysisExecutiveView });
  };

  const toggleDirectTheoryPath = () => {
    applySettings?.({ candleAnalysisDirectTheoryPath: !candleAnalysisDirectTheoryPath });
  };

  const toggleHashFib = () => {
    applySettings?.({ candleAnalysisHashFibEnabled: !candleAnalysisHashFibEnabled });
  };

  const toggleBosWaves = () => {
    applySettings?.({ candleAnalysisBosWavesEnabled: !candleAnalysisBosWavesEnabled });
  };

  const toggleVifvg = () => {
    applySettings?.({ candleAnalysisVifvgEnabled: !candleAnalysisVifvgEnabled });
  };

  const toggleBreakerBlocks = () => {
    applySettings?.({ candleAnalysisBreakerBlocksEnabled: !candleAnalysisBreakerBlocksEnabled });
  };

  const toggleZoneChart = () => {
    applySettings?.({ candleAnalysisZoneChartVisible: !candleAnalysisZoneChartVisible });
  };

  const toggleCoreSdZones = () => {
    const on = candleAnalysisCoreSdZones !== false;
    applySettings?.({ candleAnalysisCoreSdZones: !on });
  };

  const hasDetailBody =
    situationLines.length > 0 ||
    !!smart?.comment ||
    !!aiLine ||
    !!smart?.confirmation ||
    autoCommentaryLines.length > 0;

  return (
    <div
      className="candle-analysis-header-root"
      style={{
        position: 'absolute',
        left: 8,
        right: 8,
        top: layoutTopPx,
        zIndex: 36,
        pointerEvents: 'auto',
        borderRadius: 10,
        padding: 0,
        background: cardBg,
        border: theme === 'dark' ? `1px solid ${dir.color}40` : `1px solid rgba(15,23,42,0.12)`,
        boxShadow: `0 4px 18px rgba(0,0,0,0.22), inset 0 0 24px ${dir.color}0a`,
        color: fg,
        overflow: 'visible',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'stretch', minHeight: 38 }}>
        <div
          style={{
            width: 4,
            flexShrink: 0,
            background: `linear-gradient(180deg, ${dir.color}, ${dir.color}99)`,
            borderRadius: '10px 0 0 10px',
          }}
        />
        <div
          style={{
            flex: 1,
            padding: '6px 10px',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            minWidth: 0,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: '1 1 auto' }}>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 800,
                  color: dir.color,
                  letterSpacing: 0.3,
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={smart?.status && smart.status !== dir.headlineKo ? `${headline} · ${dir.headlineKo}` : headline}
              >
                {headline}
              </span>
              <span style={{ fontSize: 10, fontWeight: 600, color: sub, whiteSpace: 'nowrap' }}>{formatSymbol(symbol)}</span>
              {last && (
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 800,
                    fontVariantNumeric: 'tabular-nums',
                    color: chg >= 0 ? '#4ade80' : '#f87171',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {last.close.toLocaleString('en-US', { maximumFractionDigits: last.close < 1 ? 6 : 2 })}
                  <span style={{ fontSize: 9, fontWeight: 700, marginLeft: 6 }}>
                    {chg >= 0 ? '+' : ''}
                    {chg.toFixed(2)}%
                  </span>
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 9, fontWeight: 800, color: '#a78bfa' }}>{grade}</span>
              {volSpike && (
                <span style={{ fontSize: 8, fontWeight: 700, color: '#4ade80' }} title="최근 거래량 급증">
                  Vol↑
                </span>
              )}
              {applySettings ? (
                <>
                  <button
                    type="button"
                    onClick={toggleNotify}
                    title="브라우저 알림 — 진입 가능·안착 확인 시 1회(봉 기준)"
                    style={{
                      fontSize: 8,
                      fontWeight: 800,
                      padding: '3px 6px',
                      borderRadius: 6,
                      border: candleAnalysisBrowserNotify ? `1px solid #4ade80` : `1px solid ${dir.color}33`,
                      background: candleAnalysisBrowserNotify ? 'rgba(34,197,94,0.15)' : 'transparent',
                      color: candleAnalysisBrowserNotify ? '#4ade80' : sub,
                      cursor: 'pointer',
                    }}
                  >
                    알림
                  </button>
                  <button
                    type="button"
                    onClick={toggleAi}
                    title="AI 한 줄 코멘트 — 로그인·API 키 필요"
                    style={{
                      fontSize: 8,
                      fontWeight: 800,
                      padding: '3px 6px',
                      borderRadius: 6,
                      border: candleAnalysisAiComment ? `1px solid #a78bfa` : `1px solid ${dir.color}33`,
                      background: candleAnalysisAiComment ? 'rgba(167,139,250,0.12)' : 'transparent',
                      color: candleAnalysisAiComment ? '#c4b5fd' : sub,
                      cursor: 'pointer',
                    }}
                  >
                    AI
                  </button>
                  <button
                    type="button"
                    onClick={toggleAutoChartLayers}
                    title={
                      candleAnalysisAutoCommentaryOnly
                        ? '자동 분석: OB만 차트 — 매물대·피보 등은 해설. 클릭 시 차트에 전부 표시'
                        : '자동 분석 레이어를 차트에 전부 표시 중 — 클릭 시 해설만(OB만 차트)'
                    }
                    style={{
                      fontSize: 8,
                      fontWeight: 800,
                      padding: '3px 6px',
                      borderRadius: 6,
                      border: candleAnalysisAutoCommentaryOnly ? `1px solid ${dir.color}33` : `1px solid #38bdf8`,
                      background: candleAnalysisAutoCommentaryOnly ? 'transparent' : 'rgba(56,189,248,0.12)',
                      color: candleAnalysisAutoCommentaryOnly ? sub : '#38bdf8',
                      cursor: 'pointer',
                    }}
                  >
                    {candleAnalysisAutoCommentaryOnly ? '해설만' : '차트전부'}
                  </button>
                  <button
                    type="button"
                    onClick={toggleExecutiveView}
                    title={
                      candleAnalysisExecutiveView
                        ? '핵심 뷰: 돌파·지지·저항선 + 이론 경로(점선). 끄면 FVG·비전·엘리엇·플레이북 경로 전부'
                        : '전체 레이어 표시 중 — 클릭 시 핵심 뷰'
                    }
                    style={{
                      fontSize: 8,
                      fontWeight: 800,
                      padding: '3px 6px',
                      borderRadius: 6,
                      border: candleAnalysisExecutiveView ? `1px solid #c4b5fd` : `1px solid ${dir.color}33`,
                      background: candleAnalysisExecutiveView ? 'rgba(196,181,253,0.12)' : 'transparent',
                      color: candleAnalysisExecutiveView ? '#ddd6fe' : sub,
                      cursor: 'pointer',
                    }}
                  >
                    핵심
                  </button>
                  <button
                    type="button"
                    onClick={toggleDirectTheoryPath}
                    disabled={!candleAnalysisExecutiveView}
                    title={
                      !candleAnalysisExecutiveView
                        ? '핵심 뷰를 켠 뒤 사용 — 현재가→목표 한 줄 직진 보라 점선'
                        : candleAnalysisDirectTheoryPath
                          ? '직진 목표 점선 켜짐 — 클릭 시 끔(3단 이론 경로만)'
                          : '직진 목표 점선 끔 — 클릭 시 현재가→목표 한 줄 추가'
                    }
                    style={{
                      fontSize: 8,
                      fontWeight: 800,
                      padding: '3px 6px',
                      borderRadius: 6,
                      border: candleAnalysisDirectTheoryPath ? `1px solid #e9d5ff` : `1px solid ${dir.color}33`,
                      background:
                        candleAnalysisDirectTheoryPath && candleAnalysisExecutiveView
                          ? 'rgba(233,213,255,0.14)'
                          : 'transparent',
                      color:
                        !candleAnalysisExecutiveView ? sub : candleAnalysisDirectTheoryPath ? '#f5e6ff' : sub,
                      cursor: candleAnalysisExecutiveView ? 'pointer' : 'not-allowed',
                      opacity: candleAnalysisExecutiveView ? 1 : 0.45,
                    }}
                  >
                    직진
                  </button>
                  <button
                    type="button"
                    onClick={toggleHashFib}
                    title={
                      candleAnalysisHashFibEnabled
                        ? 'Hash Auto Fib: 피보·골든포켓·ATR SL — 클릭 시 끔(교육·참고)'
                        : 'Hash Auto Fib 끔 — 클릭 시 차트·해설에 표시'
                    }
                    style={{
                      fontSize: 8,
                      fontWeight: 800,
                      padding: '3px 6px',
                      borderRadius: 6,
                      border: candleAnalysisHashFibEnabled ? `1px solid #f59e0b` : `1px solid ${dir.color}33`,
                      background: candleAnalysisHashFibEnabled ? 'rgba(245,158,11,0.14)' : 'transparent',
                      color: candleAnalysisHashFibEnabled ? '#fbbf24' : sub,
                      cursor: 'pointer',
                    }}
                  >
                    Fib
                  </button>
                  <button
                    type="button"
                    onClick={toggleCoreSdZones}
                    title={
                      candleAnalysisCoreSdZones !== false
                        ? 'S/D ON: Supply·Demand 띠 + 피벗(가격·거래량) — 클릭 시 숨김'
                        : 'S/D OFF — 띠·피벗 숨김, 클릭 시 표시'
                    }
                    style={{
                      fontSize: 8,
                      fontWeight: 800,
                      padding: '3px 6px',
                      borderRadius: 6,
                      border: candleAnalysisCoreSdZones !== false ? `1px solid #a855f7` : `1px solid ${dir.color}33`,
                      background: candleAnalysisCoreSdZones !== false ? 'rgba(168,85,247,0.12)' : 'transparent',
                      color: candleAnalysisCoreSdZones !== false ? '#e9d5ff' : sub,
                      cursor: 'pointer',
                    }}
                  >
                    S/D
                  </button>
                  <button
                    type="button"
                    onClick={toggleZoneChart}
                    title={
                      candleAnalysisZoneChartVisible
                        ? '존 차트 ON: BOS·VIFVG·브레이커 존 레이어 표시 — 클릭 시 차트에서만 숨김(해설·Δ/VIF/BB 토글은 유지)'
                        : '존 차트 OFF(기본): BOS·VIFVG·브레이커 존은 해설만, 차트 레이어 숨김 — 클릭 시 표시'
                    }
                    style={{
                      fontSize: 8,
                      fontWeight: 800,
                      padding: '3px 6px',
                      borderRadius: 6,
                      border: candleAnalysisZoneChartVisible ? `1px solid #94a3b8` : `1px solid ${dir.color}33`,
                      background: candleAnalysisZoneChartVisible ? 'rgba(148,163,184,0.2)' : 'transparent',
                      color: candleAnalysisZoneChartVisible ? '#e2e8f0' : sub,
                      cursor: 'pointer',
                    }}
                  >
                    존
                  </button>
                  <button
                    type="button"
                    onClick={toggleBosWaves}
                    title={
                      candleAnalysisBosWavesEnabled
                        ? 'BOSWaves: 유동성 풀·스윕·투영 존 — 클릭 시 끔(MPL-2.0 포팅)'
                        : 'BOSWaves 끔 — 클릭 시 차트·해설에 표시'
                    }
                    style={{
                      fontSize: 8,
                      fontWeight: 800,
                      padding: '3px 6px',
                      borderRadius: 6,
                      border: candleAnalysisBosWavesEnabled ? `1px solid #38bdf8` : `1px solid ${dir.color}33`,
                      background: candleAnalysisBosWavesEnabled ? 'rgba(56,189,248,0.12)' : 'transparent',
                      color: candleAnalysisBosWavesEnabled ? '#7dd3fc' : sub,
                      cursor: 'pointer',
                    }}
                  >
                    Δ
                  </button>
                  <button
                    type="button"
                    onClick={toggleVifvg}
                    title={
                      candleAnalysisVifvgEnabled
                        ? 'UAlgo VIFVG: 역 FVG·Bull/Bear/Str 막대 — 클릭 시 끔(CC BY-NC-SA 포팅)'
                        : 'VIFVG 끔 — 클릭 시 차트·해설에 표시'
                    }
                    style={{
                      fontSize: 8,
                      fontWeight: 800,
                      padding: '3px 6px',
                      borderRadius: 6,
                      border: candleAnalysisVifvgEnabled ? `1px solid #2dd4bf` : `1px solid ${dir.color}33`,
                      background: candleAnalysisVifvgEnabled ? 'rgba(45,212,191,0.12)' : 'transparent',
                      color: candleAnalysisVifvgEnabled ? '#5eead4' : sub,
                      cursor: 'pointer',
                    }}
                  >
                    VIF
                  </button>
                  <button
                    type="button"
                    onClick={toggleBreakerBlocks}
                    title={
                      candleAnalysisBreakerBlocksEnabled
                        ? 'AlgoAlpha Breaker Blocks: OB·브레이커·리젝션 ▲▼ — 클릭 시 끔(Pine 포팅)'
                        : 'Breaker Blocks 끔 — 클릭 시 차트·해설에 표시'
                    }
                    style={{
                      fontSize: 8,
                      fontWeight: 800,
                      padding: '3px 6px',
                      borderRadius: 6,
                      border: candleAnalysisBreakerBlocksEnabled ? `1px solid #fb7185` : `1px solid ${dir.color}33`,
                      background: candleAnalysisBreakerBlocksEnabled ? 'rgba(251,113,133,0.12)' : 'transparent',
                      color: candleAnalysisBreakerBlocksEnabled ? '#fda4af' : sub,
                      cursor: 'pointer',
                    }}
                  >
                    BB
                  </button>
                  {candleAnalysisAiDraw ? (
                    <>
                      <button
                        type="button"
                        onClick={runAiDraw}
                        disabled={aiDrawLoading || candleAnalysisAiDraw.requestPayload.candles.length < 8}
                        title="OpenAI/Gemini로 지지·저항·진입·손절·목표 존/선 JSON 작도(교육용)"
                        style={{
                          fontSize: 8,
                          fontWeight: 800,
                          padding: '3px 6px',
                          borderRadius: 6,
                          border: candleAnalysisAiDraw.active ? `1px solid #f0abfc` : `1px solid ${dir.color}33`,
                          background: candleAnalysisAiDraw.active ? 'rgba(240,171,252,0.14)' : 'transparent',
                          color: candleAnalysisAiDraw.active ? '#f5d0fe' : sub,
                          cursor:
                            aiDrawLoading || candleAnalysisAiDraw.requestPayload.candles.length < 8
                              ? 'not-allowed'
                              : 'pointer',
                          opacity: candleAnalysisAiDraw.requestPayload.candles.length < 8 ? 0.45 : 1,
                        }}
                      >
                        {aiDrawLoading ? '작도…' : 'AI작도'}
                      </button>
                      {candleAnalysisAiDraw.active ? (
                        <button
                          type="button"
                          onClick={() => {
                            candleAnalysisAiDraw.onClear();
                            setAiDrawError(null);
                          }}
                          title="AI 작도 레이어 제거"
                          style={{
                            fontSize: 8,
                            fontWeight: 800,
                            padding: '3px 6px',
                            borderRadius: 6,
                            border: `1px solid ${dir.color}33`,
                            background: 'transparent',
                            color: sub,
                            cursor: 'pointer',
                          }}
                        >
                          AI지움
                        </button>
                      ) : null}
                    </>
                  ) : null}
                </>
              ) : null}
              <button
                type="button"
                onClick={toggleDetail}
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  padding: '3px 8px',
                  borderRadius: 6,
                  border: `1px solid ${dir.color}44`,
                  background: `${dir.color}14`,
                  color: dir.color,
                  cursor: 'pointer',
                }}
              >
                해설 {detailOpen ? '▲' : '▼'}
              </button>
            </div>
            {aiDrawError ? (
              <div style={{ fontSize: 8, fontWeight: 600, color: '#f87171', lineHeight: 1.3 }}>{aiDrawError}</div>
            ) : null}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div
              style={{
                flex: 1,
                minWidth: 60,
                maxWidth: 200,
                display: 'flex',
                height: 5,
                borderRadius: 999,
                overflow: 'hidden',
                border: theme === 'dark' ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.06)',
              }}
            >
              <div style={{ flex: Math.max(1, upPct), background: verdict === 'SHORT' ? '#EF4444' : '#22C55E', minWidth: 3 }} />
              <div style={{ flex: Math.max(1, downPct), background: verdict === 'SHORT' ? '#22C55E' : '#64748b', minWidth: 3 }} />
            </div>
            <span style={{ fontSize: 8, fontWeight: 700, color: sub, whiteSpace: 'nowrap' }}>
              {verdict === 'SHORT' ? '숏' : '롱'} {upPct}%
            </span>
            <span style={{ fontSize: 8, color: sub }}>캔들분석</span>
          </div>
          {smart?.confirmation ? (
            <ConfirmationStrip confirmation={smart.confirmation} theme={theme} />
          ) : null}
          {mtfStrip ? (
            <div
              style={{
                fontSize: 9,
                fontWeight: 800,
                color: sub,
                letterSpacing: 0.3,
                fontVariantNumeric: 'tabular-nums',
              }}
              title="상위·하위 타임프레임 추세(엔진 multiTF)"
            >
              TF {mtfStrip}
            </div>
          ) : null}
          {insightChips.length > 0 ? (
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 4,
                alignItems: 'center',
                marginTop: 1,
              }}
              aria-label="맥락 요약"
            >
              {insightChips.map((t, i) => (
                <span
                  key={`${lastBarKey}-${i}-${t}`}
                  style={{
                    fontSize: 8,
                    fontWeight: 700,
                    padding: '2px 7px',
                    borderRadius: 999,
                    background: `${dir.color}12`,
                    border: `1px solid ${dir.color}28`,
                    color: theme === 'dark' ? '#cbd5e1' : '#475569',
                    maxWidth: '100%',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={t}
                >
                  {t}
                </span>
              ))}
            </div>
          ) : null}
          {smart?.comment ? (
            <div
              style={{
                fontSize: 9,
                fontWeight: 600,
                color: sub,
                lineHeight: 1.35,
                overflow: 'hidden',
                display: '-webkit-box',
                WebkitBoxOrient: 'vertical' as const,
                WebkitLineClamp: 2,
                wordBreak: 'break-word',
              }}
              title={smart.comment}
            >
              {smart.comment}
            </div>
          ) : null}
          {candleAnalysisAiComment && (aiLoading || aiLine) ? (
            <div
              style={{
                fontSize: 9,
                fontStyle: 'italic',
                fontWeight: 600,
                color: '#c4b5fd',
                lineHeight: 1.35,
                opacity: aiLoading ? 0.65 : 1,
              }}
              title="AI 한 줄 (존·가격은 룰 엔진 기준)"
            >
              {aiLoading ? 'AI 요약 불러오는 중…' : aiLine}
            </div>
          ) : null}
        </div>
      </div>
      {detailOpen && hasDetailBody && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: '100%',
            marginTop: 4,
            borderRadius: 10,
            background: cardBg,
            border: theme === 'dark' ? `1px solid ${dir.color}33` : `1px solid rgba(15,23,42,0.12)`,
            boxShadow: '0 12px 32px rgba(0,0,0,0.35)',
            maxHeight: 'min(48vh, 380px)',
            overflowY: 'auto',
            padding: '8px 10px 10px',
            zIndex: 40,
          }}
        >
          <div style={{ fontSize: 9, fontWeight: 800, color: sub, marginBottom: 6 }}>안착 · 거래량 · 다음 관심가</div>
          {smart?.confirmation ? (
            <div style={{ marginBottom: 10, paddingBottom: 8, borderBottom: `1px solid ${theme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}` }}>
              <div style={{ fontSize: 9, fontWeight: 800, color: sub, marginBottom: 4 }}>확정 규칙 — 구조 + 종가 돌파/이탈 + 2봉 유지</div>
              <p style={{ margin: '0 0 6px', fontSize: 10, fontWeight: 700, color: fg }}>{smart.confirmation.headline_ko}</p>
              <p style={{ margin: '0 0 6px', fontSize: 9, color: sub, lineHeight: 1.4 }}>{smart.confirmation.progress_ko}</p>
              <div style={{ fontSize: 9, fontWeight: 700, color: '#4ade80', marginBottom: 2 }}>상승 축 ↑{smart.confirmation.bull.score}/3</div>
              <ul style={{ margin: '0 0 8px', paddingLeft: 14, fontSize: 9, lineHeight: 1.4, color: fg }}>
                {(smart.confirmation.bull_detail ?? []).map((line, i) => (
                  <li key={`bd-${i}`}>{line}</li>
                ))}
              </ul>
              <div style={{ fontSize: 9, fontWeight: 700, color: '#f87171', marginBottom: 2 }}>하락 축 ↓{smart.confirmation.bear.score}/3</div>
              <ul style={{ margin: 0, paddingLeft: 14, fontSize: 9, lineHeight: 1.4, color: fg }}>
                {(smart.confirmation.bear_detail ?? []).map((line, i) => (
                  <li key={`sd-${i}`}>{line}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {aiLine ? (
            <p style={{ margin: '0 0 8px', fontSize: 10, lineHeight: 1.45, color: '#c4b5fd', fontStyle: 'italic' }}>{aiLine}</p>
          ) : null}
          {autoCommentaryLines.length > 0 ? (
            <div
              style={{
                marginBottom: 10,
                paddingBottom: 8,
                borderBottom: `1px solid ${theme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
              }}
            >
              <div style={{ fontSize: 9, fontWeight: 800, color: sub, marginBottom: 4 }}>
                자동 분석 요약 {candleAnalysisAutoCommentaryOnly ? '(차트는 OB 위주)' : ''}
              </div>
              <ul
                style={{
                  margin: 0,
                  paddingLeft: 14,
                  fontSize: 9,
                  lineHeight: 1.5,
                  listStyle: 'disc',
                  color: fg,
                }}
              >
                {autoCommentaryLines.map((line, i) => {
                  const isHead = line.startsWith('통합 해석');
                  const isSubHead =
                    line.startsWith('인접 관심') ||
                    line.startsWith('종가 ±2%') ||
                    line.startsWith('차트의 짧은') ||
                    line.startsWith('보라·청록 점선') ||
                    line.startsWith('보라색 점선') ||
                    line.startsWith('유사 과거 경로');
                  const isNote = line.startsWith('(규칙 기반');
                  const isSep = line.startsWith('— ');
                  const isDrawNote = line.startsWith('작도 안내');
                  const isDirLine =
                    line.startsWith('방향(') || line.startsWith('엔진 지지') || line.startsWith('엔진 상단');
                  const isSupLine = line.startsWith('▼');
                  const isResLine = line.startsWith('▲');
                  const blockSep = isSep || isDrawNote || line.startsWith('— 지지·저항');
                  return (
                    <li
                      key={`auto-${i}`}
                      style={{
                        marginBottom: blockSep ? 6 : 4,
                        listStyle: blockSep ? 'none' : 'disc',
                        marginLeft: blockSep ? -6 : 0,
                        fontSize: isHead || isDirLine ? 10 : isNote || isDrawNote ? 8 : 9,
                        fontWeight: isHead || isSubHead || isDirLine || isSupLine || isResLine ? 650 : 500,
                        color: isNote || isDrawNote ? sub : isSupLine ? '#6ee7b7' : isResLine ? '#fca5a5' : fg,
                        fontStyle: isNote || isDrawNote ? 'italic' : undefined,
                      }}
                    >
                      {line}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
          {situationLines.length > 0 ? (
            <ul style={{ margin: 0, paddingLeft: 14, fontSize: 10, lineHeight: 1.45, listStyle: 'disc' }}>
              {situationLines.map((row, i) => (
                <li key={i} style={{ color: toneColor(row.tone, theme), marginBottom: 3 }}>
                  {row.text}
                </li>
              ))}
            </ul>
          ) : smart?.comment ? (
            <p style={{ margin: 0, fontSize: 10, lineHeight: 1.5, color: fg }}>{smart.comment}</p>
          ) : null}
        </div>
      )}
    </div>
  );
}
