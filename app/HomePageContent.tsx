'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { SYMBOLS } from '../lib/constants';
import ChartView, { type ChartSnapshotRef } from './components/ChartView';
import { type UIMode } from './components/UIModeSwitcher';
import AppSiteLogin from './components/AppSiteLogin';
import AIChatPanel from './components/AIChatPanel';
import FocusOverlay from './components/FocusOverlay';
import ExecutionBriefingCard from './components/ExecutionBriefingCard';
import VirtualTradeCard from './components/VirtualTradeCard';
import { useVirtualTradeBackground } from '@/lib/useVirtualTradeBackground';
import { hydrateFromServer } from '@/lib/virtualTradeStore';
import BriefingResultCard from './components/BriefingResultCard';
import ReferenceManager from './components/ReferenceManager';
import { AnalyzeResponse } from '@/types';
import { loadSettings, saveSettings } from '@/lib/settings';
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
type MTFSignal = { tf: string; verdict: string; confidence: number };

export default function HomePageContent() {
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [timeframe, setTimeframe] = useState('4h');
  const [analysis, setAnalysis] = useState<AnalyzeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [multiResults, setMultiResults] = useState<MultiResult[]>([]);
  const [mtfSignals, setMtfSignals] = useState<MTFSignal[]>([]);
  const [backtest, setBacktest] = useState<{ winRate: number; totalPnlPct: number; totalTrades: number } | null>(null);
  const [backtestLoading, setBacktestLoading] = useState(false);
  const [webhookSent, setWebhookSent] = useState(false);
  const [webhookEnabled, setWebhookEnabled] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [webhookMinConfidence, setWebhookMinConfidence] = useState(70);
  const [favoriteSymbols, setFavoriteSymbols] = useState<string[]>([]);
  const [swingSeedUsdt, setSwingSeedUsdt] = useState(3000);
  const [virtualTradeSeedUsdt, setVirtualTradeSeedUsdt] = useState(1000);
  const [virtualTradeEnabled, setVirtualTradeEnabled] = useState(true);
  const [virtualTradeSymbols, setVirtualTradeSymbols] = useState<string[]>(['BTCUSDT']);
  const [virtualTradeTimeframes, setVirtualTradeTimeframes] = useState<string[]>(['1m', '5m', '15m', '1h', '4h', '1d', '1w', '1M']);
  const [virtualTradeRefresh, setVirtualTradeRefresh] = useState(0);
  useEffect(() => {
    const s = loadSettings();
    setWebhookEnabled(s.webhookEnabled);
    setTheme(s.theme);
    setWebhookMinConfidence(s.webhookMinConfidence ?? 70);
    setFavoriteSymbols(s.favoriteSymbols ?? []);
    setSwingSeedUsdt(s.swingSeedUsdt ?? 3000);
    setVirtualTradeSeedUsdt(s.virtualTradeSeedUsdt ?? 1000);
    setVirtualTradeEnabled(s.virtualTradeEnabled ?? true);
    setVirtualTradeSymbols(s.virtualTradeSymbols ?? ['BTCUSDT']);
    setVirtualTradeTimeframes(s.virtualTradeTimeframes ?? ['1m', '5m', '15m', '1h', '4h', '1d', '1w', '1M']);
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
    onRefresh: () => setVirtualTradeRefresh(t => t + 1),
  });
  const toggleFavorite = (s: string) => {
    setFavoriteSymbols(prev => {
      const next = prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s];
      saveSettings({ favoriteSymbols: next });
      return next;
    });
  };
  const symbolList = [...new Set([...favoriteSymbols, ...SYMBOLS])];
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
  const [lastExplainRequest, setLastExplainRequest] = useState<ChartExplainRequest | null>(null);
  const [balance, setBalance] = useState(10000);
  const [riskPercent, setRiskPercent] = useState(1);
  const [structureAlerts, setStructureAlerts] = useState<Array<{ id: string; message: string; at: number }>>([]);
  const strategies = generateStrategies();
  type RightPanelTab = 'trade' | 'market' | 'briefing' | 'pattern' | 'ref' | 'etc' | 'virtual';
  const [rightPanelTab, setRightPanelTab] = useState<RightPanelTab>('trade');
  const [uiMode, setUiMode] = useState<UIMode>('EXECUTION');
  const [briefingCollapsed, setBriefingCollapsed] = useState(true);
  /** 사이트 로그인(쿠키) — API 미들웨어와 동기 */
  const [siteAuth, setSiteAuth] = useState<'loading' | 'anon' | 'authed'>('loading');
  const visitorCount = useVisitorCount();
  const timeframeRef = useRef(timeframe);
  useEffect(() => { timeframeRef.current = timeframe; }, [timeframe]);
  const isExecutionLikeMode = uiMode === 'EXECUTION' || uiMode === 'TAPPOINT';
  const isTapMode = uiMode === 'TAPPOINT';
  useEffect(() => {
    if (isExecutionLikeMode) setRightPanelTab('trade');
  }, [isExecutionLikeMode]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    saveSettings({ theme });
  }, [theme]);

  const [persistedSignal, setPersistedSignal] = useState<PersistedSignal | null>(null);

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
      .then((d: { authenticated?: boolean }) => {
        setSiteAuth(d.authenticated ? 'authed' : 'anon');
      })
      .catch(() => setSiteAuth('anon'));
  }, []);

  useEffect(() => {
    if (siteAuth !== 'authed') return;
    fetch('/api/pattern-stats', { cache: 'no-store', credentials: 'same-origin' }).then(r => r.ok ? r.json() : null).then(setPatternStats).catch(() => setPatternStats(null));
  }, [analysis?.learnedPatternsTop5, siteAuth]);

  const load = useCallback(async (overrideTf?: string) => {
    const requestedTf = overrideTf ?? timeframe;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithRetry(`/api/analyze?symbol=${symbol}&timeframe=${encodeURIComponent(requestedTf)}&collect=1`, { cache: 'no-store', credentials: 'same-origin' });
      const contentType = res.headers.get('content-type') || '';
      let data: any;
      if (contentType.includes('application/json')) {
        data = await res.json();
      } else {
        const text = await res.text();
        throw new Error(res.ok ? '서버가 JSON이 아닌 응답을 반환했습니다.' : `서버 오류 (${res.status}). API 경로를 확인하세요.`);
      }
      if (!res.ok) throw new Error(data.error || data.summary || '분석 실패');
      if (timeframeRef.current !== requestedTf) return;
      if (data?.engine) {
        try {
          const { matchTopReferences } = await import('@/lib/referenceMatcherAdvanced');
          data.topReferences = matchTopReferences(data.engine, 3);
        } catch {}
      }
      data.timeframe = data.timeframe ?? requestedTf;
      setAnalysis(data);
      if ((data.verdict === 'LONG' || data.verdict === 'SHORT') && (data.confidence ?? 0) >= MIN_CONFIDENCE_PERSIST) {
        const ps: PersistedSignal = { symbol: data.symbol ?? symbol, timeframe: data.timeframe ?? requestedTf, verdict: data.verdict, confidence: data.confidence ?? 0, at: new Date().toISOString() };
        setPersistedSignal(ps);
        try { window.localStorage.setItem(PERSISTED_SIGNAL_KEY, JSON.stringify(ps)); } catch {}
      }
      const queue = pushStructureAlertsFromAnalysis(data.dominantPattern ?? null);
      setStructureAlerts(queue);
      setHistory(prev => {
        const next = [{ symbol, timeframe, verdict: data.verdict, confidence: data.confidence, at: new Date().toLocaleTimeString('ko-KR', { hour12: false }), summary: data.summary }, ...prev].slice(0, 20);
        window.localStorage.setItem('ai-step12-history', JSON.stringify(next));
        return next;
      });
      setWebhookSent(false);
    } catch (e: any) {
      const msg = e?.message || '';
      if (msg.includes('Unexpected token') || msg.includes('<!DOCTYPE') || msg.includes('is not valid JSON')) {
        setError('서버가 HTML을 반환했습니다. 개발 서버가 실행 중인지, /api/analyze 경로가 정상인지 확인하세요.');
      } else {
        setError(msg || '연결 오류');
      }
    } finally {
      setLoading(false);
    }
  }, [symbol, timeframe]);

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
    load();
    const timer = window.setInterval(load, 8000);
    return () => window.clearInterval(timer);
  }, [load, siteAuth]);

  useEffect(() => {
    const TIMEFRAMES = ['1m', '3m', '5m', '15m', '1h', '4h', '1d', '1w', '1M', '1Y'];
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'r' || e.key === 'R') { if (!e.ctrlKey && !e.metaKey) return; e.preventDefault(); load(); }
      const idx = TIMEFRAMES.indexOf(timeframe);
      if (e.key === 'ArrowLeft' && idx > 0) { e.preventDefault(); setTimeframe(TIMEFRAMES[idx - 1]); }
      if (e.key === 'ArrowRight' && idx >= 0 && idx < TIMEFRAMES.length - 1) { e.preventDefault(); setTimeframe(TIMEFRAMES[idx + 1]); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [load, timeframe]);

  useEffect(() => {
    if (!webhookEnabled || !analysis || webhookSent) return;
    if (analysis.verdict !== 'LONG' && analysis.verdict !== 'SHORT') return;
    if ((analysis.confidence ?? 0) < webhookMinConfidence) return;
    // 타점 모드에서는 4요소 확정일 때만 알림 전송
    if (isTapMode && !(analysis as any)?.confirmedSignal?.confirmed) return;
    sendWebhook();
  }, [analysis?.verdict, analysis?.confidence, (analysis as any)?.confirmedSignal?.confirmed, webhookEnabled, webhookSent, webhookMinConfidence, isTapMode]);

  useEffect(() => {
    if (siteAuth !== 'authed') return;
    Promise.all(SYMBOLS.map(async s => {
      const res = await fetchWithRetry(`/api/analyze?symbol=${s}&timeframe=${timeframe}`, { cache: 'no-store', credentials: 'same-origin' }, 2);
      const d = await res.json();
      return { symbol: s, verdict: d.verdict || 'WATCH', confidence: d.confidence || 50 };
    })).then(setMultiResults);
    const t = setInterval(() => {
      Promise.all(SYMBOLS.map(async s => {
        const res = await fetchWithRetry(`/api/analyze?symbol=${s}&timeframe=${timeframe}`, { cache: 'no-store', credentials: 'same-origin' }, 2);
        const d = await res.json();
        return { symbol: s, verdict: d.verdict || 'WATCH', confidence: d.confidence || 50 };
      })).then(setMultiResults);
    }, 15000);
    return () => clearInterval(t);
  }, [timeframe, siteAuth]);

  const MTF_TFS = ['1m', '5m', '15m', '1h', '4h', '1d', '1w', '1M', '1Y'];
  useEffect(() => {
    if (siteAuth !== 'authed') return;
    const fetchMtf = () => {
      Promise.all(MTF_TFS.map(async (tf) => {
        const res = await fetchWithRetry(`/api/analyze?symbol=${symbol}&timeframe=${encodeURIComponent(tf)}`, { cache: 'no-store', credentials: 'same-origin' }, 1);
        const d = await res.json().catch(() => ({}));
        return { tf, verdict: d.verdict || 'WATCH', confidence: d.confidence || 50 };
      })).then(setMtfSignals).catch(() => {});
    };
    fetchMtf();
    const t = setInterval(fetchMtf, 25000);
    return () => clearInterval(t);
  }, [symbol, siteAuth]);

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

  if (siteAuth === 'loading') {
    return (
      <div style={{ minHeight: '50vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--muted)' }}>
        접속 확인 중…
        {visitorCount != null && <span style={{ fontSize: 12 }}>현재 {visitorCount}명 접속</span>}
      </div>
    );
  }

  if (siteAuth === 'anon') {
    return <AppSiteLogin onLoggedIn={() => setSiteAuth('authed')} />;
  }

  return (
    <>
      <a href="#main-content" className="skip-link">본문으로 건너뛰기</a>
      <main id="main-content" role="main">
        <div className="card header-card">
          <div>
            <div className="title">AI 트레이더 분석 엔진</div>
            <div className="subtle">SMC · 멀티타임프레임 · 스마트머니 · 신호 분석 · Ctrl+R 새로고침 · ←→ 타임프레임</div>
          </div>
          <div className="select-row">
            <button
              type="button"
              className="tool-chip tool-chip-button"
              onClick={handleSiteLogout}
              title="로그아웃 후 다시 로그인"
            >
              로그아웃
            </button>
            <button
              className="tool-chip tool-chip-button"
              onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
              title={theme === 'dark' ? '라이트 모드' : '다크 모드'}
              aria-label={theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'}
            >
              {theme === 'dark' ? '\u263C' : '\u263E'}
            </button>
            <select className="select-pill" value={symbol} onChange={(e) => setSymbol(e.target.value)} aria-label="심볼 선택">
              {symbolList.map(s => <option key={s} value={s}>{s}{favoriteSymbols.includes(s) ? ' \u2605' : ''}</option>)}
            </select>
            <button className="tool-chip tool-chip-button" onClick={() => toggleFavorite(symbol)} title={favoriteSymbols.includes(symbol) ? '즐겨찾기 해제' : '즐겨찾기 추가'}>
              {favoriteSymbols.includes(symbol) ? '\u2605' : '\u2606'}
            </button>
            <div className={badgeClass} title={persistedSignal && !analysis ? '마지막 확정 신호 (저장됨)' : undefined}>
              {displayVerdict === 'LONG' ? 'L' : displayVerdict === 'SHORT' ? 'S' : '–'} · {displayConfidence}%
            </div>
            <div className="badge">
              {loading ? '분석 중...' : error ? '오류' : '실행 중'}
            </div>
            {visitorCount != null && (
              <div className="badge" title="실시간 접속자">
                {visitorCount}명 접속
              </div>
            )}
            {error && (
              <button type="button" className="badge" onClick={() => load()} style={{ marginLeft: 8, cursor: 'pointer' }}>
                다시 시도
              </button>
            )}
          </div>
        </div>

        {mtfSignals.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: 11, color: 'var(--muted)', marginRight: 6, alignSelf: 'center' }}>MTF 신호:</span>
            {mtfSignals.map((m) => {
              const isCurrent = m.tf === timeframe;
              const confirmed = (m.verdict === 'LONG' || m.verdict === 'SHORT') && m.confidence >= 70;
              const label = confirmed ? (m.verdict === 'LONG' ? 'L' : 'S') : '준비';
              return (
                <span
                  key={m.tf}
                  onClick={() => { setTimeframe(m.tf); load(m.tf); }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setTimeframe(m.tf); load(m.tf); } }}
                  className={`tool-chip tool-chip-button ${isCurrent ? 'tool-chip-active' : ''}`}
                  style={{
                    fontSize: 12,
                    padding: '4px 10px',
                    cursor: 'pointer',
                    border: isCurrent ? '2px solid var(--border)' : undefined,
                    color: m.verdict === 'LONG' ? '#22C55E' : m.verdict === 'SHORT' ? '#EF4444' : 'var(--muted)',
                    fontWeight: confirmed ? 700 : 500,
                  }}
                  title={`${m.tf}: ${m.verdict} ${m.confidence}%${confirmed ? ' (확정)' : ' (준비)'} (클릭 시 이동)`}
                >
                  {m.tf} <span style={{ fontWeight: 700 }}>{label}</span> {m.confidence}%
                </span>
              );
            })}
          </div>
        )}

        {error && (
          <div className="card panel-pad" role="alert" style={{ background: 'rgba(255,123,123,0.1)', border: '1px solid rgba(255,123,123,0.3)' }}>
            <div className="section-title">\u26A0\uFE0F 연결 오류</div>
            <div className="subtle" style={{ marginTop: 8 }}>{error}</div>
            <button type="button" onClick={() => load()} style={{ marginTop: 12, padding: '8px 16px', cursor: 'pointer' }}>다시 시도</button>
          </div>
        )}

        <div className="grid">
          <div className="left-stack">
            <div className="card panel-pad">
              <div className="space-between">
                <div>
                  <div className="section-title">코인 차트</div>
                  <div className="subtle">{symbol} \u00B7 {timeframe} \u00B7 실시간</div>
                </div>
                {(analysis?.engine as any)?.pythonEngine ? (
                  <div className="badge" style={{ background: 'rgba(98,239,224,0.2)' }}>Python 엔진 연동</div>
                ) : analysis && (
                  <div className="badge" style={{ background: 'rgba(98,239,224,0.2)', color: '#62efe0' }}>TS 엔진 연동</div>
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
              <div className="chart-wrap">
                {loading && !analysis ? (
                  <div style={{ padding: 80, textAlign: 'center', color: '#666' }}>차트 로딩 중...</div>
                ) : (
                  <ChartView ref={chartSnapshotRef} symbol={symbol} timeframe={timeframe} analysis={analysis} setTimeframe={setTimeframe} onTimeframeChange={(tf) => { setTimeframe(tf); timeframeRef.current = tf; load(tf); }} theme={theme} onChartPointClick={handleChartPointClick} uiMode={uiMode} onUiModeChange={setUiMode} />
                )}
              </div>
            </div>
          </div>

          <div className="right-stack">
            <AIChatPanel analysis={analysis} symbol={symbol} timeframe={timeframe} chartSnapshotRef={chartSnapshotRef} triggerSendMessage={triggerChatMessage} onTriggerSendConsumed={() => setTriggerChatMessage('')} />

            <div className="card panel-pad" style={{ display: 'flex', flexDirection: 'column', minHeight: 320, maxHeight: 'min(75vh, 720px)' }}>
              <div className="panel-tabs" role="tablist">
                {(['trade', 'market', 'briefing', 'pattern', 'ref', 'etc', 'virtual'] as const).map((tab) => (
                  <button key={tab} type="button" role="tab" aria-selected={rightPanelTab === tab} className={`panel-tab ${rightPanelTab === tab ? 'active' : ''}`} onClick={() => setRightPanelTab(tab)}>
                    {tab === 'trade' && '트레이드'}
                    {tab === 'market' && '시장'}
                    {tab === 'briefing' && '브리핑'}
                    {tab === 'pattern' && '패턴'}
                    {tab === 'ref' && '참조'}
                    {tab === 'etc' && '기타'}
                    {tab === 'virtual' && '가상매매'}
                  </button>
                ))}
              </div>
              <div className="panel-tab-content">
                {isExecutionLikeMode && <BriefingResultCard analysis={analysis} />}
                {rightPanelTab === 'trade' && (
                  <>
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
                      <div className="mini-card"><div className="metric-label">신뢰도</div><div className="mini-value">{analysis?.confidence ?? '–'}%</div></div>
                    </div>
                    {(analysis?.nearestBuyZone || analysis?.nearestSellZone) && (
                      <div className="subtle" style={{ marginTop: 6, fontSize: 11 }}>
                        {analysis.nearestBuyZone && <span>고래 매수: {analysis.nearestBuyZone.low.toLocaleString()} ~ {analysis.nearestBuyZone.high.toLocaleString()}</span>}
                        {analysis.nearestBuyZone && analysis.nearestSellZone && ' · '}
                        {analysis.nearestSellZone && <span>고래 매도: {analysis.nearestSellZone.low.toLocaleString()} ~ {analysis.nearestSellZone.high.toLocaleString()}</span>}
                      </div>
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
                              <div className="metric-value" style={{ fontSize: 10 }}>{((s: string) => s === 'accepted_above' ? '위 안착' : s === 'accepted_below' ? '아래' : s === 'reclaiming' ? '재진입' : '–')((analysis as any).dailyState)}</div>
                            </div>
                          )}
                          {(analysis as any).weeklyCloseLevel != null && (
                            <div className="mini-card">
                              <div className="metric-label">주봉 종가</div>
                              <div className="metric-value">{(analysis as any).weeklyCloseLevel.toLocaleString()}</div>
                              <div className="metric-value" style={{ fontSize: 10 }}>{((s: string) => s === 'accepted_above' ? '위 안착' : s === 'accepted_below' ? '아래' : s === 'reclaiming' ? '재진입' : '–')((analysis as any).weeklyState)}</div>
                            </div>
                          )}
                          {(analysis as any).monthlyCloseLevel != null && (
                            <div className="mini-card">
                              <div className="metric-label">월봉 종가</div>
                              <div className="metric-value">{(analysis as any).monthlyCloseLevel.toLocaleString()}</div>
                              <div className="metric-value" style={{ fontSize: 10 }}>{((s: string) => s === 'accepted_above' ? '위 안착' : s === 'accepted_below' ? '아래' : s === 'reclaiming' ? '재진입' : '–')((analysis as any).monthlyState)}</div>
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
                              <div className="metric-value" style={{ fontSize: 11 }}>확률 {analysis.nearestSupportOb.probability}%{(analysis as any).supportObOrderbookDepth ? ` · 체결 ${(analysis as any).supportObOrderbookDepth === 'many' ? '많음' : (analysis as any).supportObOrderbookDepth === 'few' ? '적음' : '보통'}` : ''}</div>
                            </div>
                          )}
                          {analysis?.nearestResistanceOb && (
                            <div className="mini-card">
                              <div className="metric-label">저항 OB (하락 OB)</div>
                              <div className="mini-value c-short">{analysis.nearestResistanceOb.low.toLocaleString()} ~ {analysis.nearestResistanceOb.high.toLocaleString()}</div>
                              <div className="metric-value" style={{ fontSize: 11 }}>확률 {analysis.nearestResistanceOb.probability}%{(analysis as any).resistanceObOrderbookDepth ? ` · 체결 ${(analysis as any).resistanceObOrderbookDepth === 'many' ? '많음' : (analysis as any).resistanceObOrderbookDepth === 'few' ? '적음' : '보통'}` : ''}</div>
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
                    <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                      <div className="section-title" style={{ fontSize: '0.9rem' }}>매수 구간 · 포커스</div>
                      <FocusOverlay analysis={analysis} theme={theme} standalone />
                    </div>
                    {uiMode !== 'FULL' && analysis && (
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
                  <div className="section-title" style={{ marginTop: 0 }}>매수/매도 압력</div>
                )}
                {rightPanelTab === 'briefing' && (
                  <>
                    <div className="space-between" style={{ marginTop: 0 }}><div className="section-title">자동 브리핑</div><button className="tool-chip tool-chip-button" onClick={() => window.print()} title="인쇄 / PDF 저장">리포트 저장</button></div>
                    {analysis ? (() => {
                      const txt = generateAutoBriefing(analysis);
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
                    <VirtualTradeCard
                      seedUsdt={virtualTradeSeedUsdt}
                      onSeedChange={(v) => { setVirtualTradeSeedUsdt(v); saveSettings({ virtualTradeSeedUsdt: v }); }}
                      onSeedBlur={() => saveSettings({ virtualTradeSeedUsdt: virtualTradeSeedUsdt })}
                      enabled={virtualTradeEnabled}
                      onEnabledChange={(v) => { setVirtualTradeEnabled(v); saveSettings({ virtualTradeEnabled: v }); }}
                      symbols={virtualTradeSymbols}
                      onSymbolsChange={(v) => { setVirtualTradeSymbols(v); saveSettings({ virtualTradeSymbols: v }); }}
                      timeframes={virtualTradeTimeframes}
                      refreshTrigger={virtualTradeRefresh}
                    />
                  </div>
                )}
                {rightPanelTab === 'etc' && (
                  <>
                    <div className="section-title" style={{ marginTop: 0 }}>포지션 관리</div>
                    {analysis && <div className="subtle" style={{ marginTop: 8 }}>잔고 {balance} \u00B7 리스크 {riskPercent}%</div>}
                    <button className="tool-chip tool-chip-button" onClick={runBacktest} disabled={backtestLoading} style={{ marginTop: 8 }}>{backtestLoading ? '실행 중...' : '백테스트 실행'}</button>
                    {backtest && <div className="mini-grid" style={{ marginTop: 10 }}><div className="mini-card"><div className="metric-label">승률</div><div className="mini-value">{backtest.winRate.toFixed(1)}%</div></div><div className="mini-card"><div className="metric-label">총손익</div><div className="mini-value">{backtest.totalPnlPct >= 0 ? '+' : ''}{backtest.totalPnlPct.toFixed(2)}%</div></div></div>}
                    <div className="section-title" style={{ marginTop: 14 }}>멀티 심볼</div>
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
        </div>

        {isExecutionLikeMode && analysis && (
          <div style={{ marginTop: 16 }}>
            <button
              type="button"
              className="tool-chip tool-chip-button"
              onClick={() => setBriefingCollapsed(c => !c)}
              style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}
              aria-expanded={!briefingCollapsed}
            >
              {briefingCollapsed ? '브리핑 펼치기' : '브리핑 접기'}
              <span style={{ fontSize: 12 }}>{briefingCollapsed ? '\u25B6' : '\u25BC'}</span>
            </button>
            {!briefingCollapsed && (
              <>
                <ExecutionBriefingCard
                  analysis={analysis}
                  theme={theme}
                  isTapMode={isTapMode}
                  swingSeedUsdt={swingSeedUsdt}
                  onSwingSeedChange={(v) => {
                    setSwingSeedUsdt(v);
                    saveSettings({ swingSeedUsdt: v });
                  }}
                  onSwingSeedBlur={() => saveSettings({ swingSeedUsdt })}
                />
                <div style={{ marginTop: 12 }}>
                  <VirtualTradeCard
                    seedUsdt={virtualTradeSeedUsdt}
                    onSeedChange={(v) => { setVirtualTradeSeedUsdt(v); saveSettings({ virtualTradeSeedUsdt: v }); }}
                    onSeedBlur={() => saveSettings({ virtualTradeSeedUsdt: virtualTradeSeedUsdt })}
                    enabled={virtualTradeEnabled}
                    onEnabledChange={(v) => { setVirtualTradeEnabled(v); saveSettings({ virtualTradeEnabled: v }); }}
                    symbols={virtualTradeSymbols}
                    onSymbolsChange={(v) => { setVirtualTradeSymbols(v); saveSettings({ virtualTradeSymbols: v }); }}
                    timeframes={virtualTradeTimeframes}
                    refreshTrigger={virtualTradeRefresh}
                  />
                </div>
              </>
            )}
          </div>
        )}
      </main>
    </>
  );
}
