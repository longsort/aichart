'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { SYMBOLS } from '@/lib/constants';
import ChartView, { type ChartSnapshotRef } from './components/ChartView';
import AIChatPanel from './components/AIChatPanel';
import FocusOverlay from './components/FocusOverlay';
import ReferenceManager from './components/ReferenceManager';
import { AnalyzeResponse } from '@/types';
import { loadSettings, saveSettings } from '@/lib/settings';
import { fetchWithRetry } from '@/lib/fetchWithRetry';
import { getReferenceById } from '@/lib/referenceLibraryStore';
import { generateAutoBriefing } from '@/lib/autoBriefing';
import { simulateTrade } from '@/lib/risk/riskCalculator';
import { generateStrategies } from '@/lib/strategy/strategyGenerator';
import type { ChartExplainRequest } from '@/types/chartExplain';
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

type MultiResult = { symbol: string; verdict: string; confidence: number };

export default function HomePageContent() {
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [timeframe, setTimeframe] = useState('4h');
  const [analysis, setAnalysis] = useState<AnalyzeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [multiResults, setMultiResults] = useState<MultiResult[]>([]);
  const [backtest, setBacktest] = useState<{ winRate: number; totalPnlPct: number; totalTrades: number } | null>(null);
  const [backtestLoading, setBacktestLoading] = useState(false);
  const [webhookSent, setWebhookSent] = useState(false);
  const [webhookEnabled, setWebhookEnabled] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [webhookMinConfidence, setWebhookMinConfidence] = useState(70);
  const [favoriteSymbols, setFavoriteSymbols] = useState<string[]>([]);
  useEffect(() => {
    const s = loadSettings();
    setWebhookEnabled(s.webhookEnabled);
    setTheme(s.theme);
    setWebhookMinConfidence(s.webhookMinConfidence ?? 70);
    setFavoriteSymbols(s.favoriteSymbols ?? []);
  }, []);
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
  type RightPanelTab = 'trade' | 'market' | 'briefing' | 'pattern' | 'ref' | 'etc';
  const [rightPanelTab, setRightPanelTab] = useState<RightPanelTab>('trade');
  type UIMode = 'FULL' | 'FOCUS' | 'EXECUTION';
  const [uiMode, setUiMode] = useState<UIMode>('FOCUS');
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    saveSettings({ theme });
  }, [theme]);

  useEffect(() => {
    const raw = window.localStorage.getItem('ai-step12-history');
    if (raw) { try { setHistory(JSON.parse(raw)); } catch {} }
  }, []);

  useEffect(() => {
    fetch('/api/pattern-stats', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(setPatternStats).catch(() => setPatternStats(null));
  }, [analysis?.learnedPatternsTop5]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithRetry(`/api/analyze?symbol=${symbol}&timeframe=${timeframe}&collect=1`, { cache: 'no-store' });
      const contentType = res.headers.get('content-type') || '';
      let data: any;
      if (contentType.includes('application/json')) {
        data = await res.json();
      } else {
        const text = await res.text();
        throw new Error(res.ok ? '서버가 JSON이 아닌 응답을 반환했습니다.' : `서버 오류 (${res.status}). API 경로를 확인하세요.`);
      }
      if (!res.ok) throw new Error(data.error || data.summary || '분석 실패');
      if (data?.engine) {
        try {
          const { matchTopReferences } = await import('@/lib/referenceMatcherAdvanced');
          data.topReferences = matchTopReferences(data.engine, 3);
        } catch {}
      }
      setAnalysis(data);
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
      const res = await fetchWithRetry(`/api/backtest?symbol=${symbol}&timeframe=${timeframe}`, { cache: 'no-store' });
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analysis }),
      });
      const data = await res.json();
      if (data.ok) { load(); fetch('/api/pattern-stats', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(setPatternStats); }
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
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
    load();
    const timer = window.setInterval(load, 8000);
    return () => window.clearInterval(timer);
  }, [load]);

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
    sendWebhook();
  }, [analysis?.verdict, analysis?.confidence, webhookEnabled, webhookSent, webhookMinConfidence]);

  useEffect(() => {
    Promise.all(SYMBOLS.map(async s => {
      const res = await fetchWithRetry(`/api/analyze?symbol=${s}&timeframe=${timeframe}`, { cache: 'no-store' }, 2);
      const d = await res.json();
      return { symbol: s, verdict: d.verdict || 'WATCH', confidence: d.confidence || 50 };
    })).then(setMultiResults);
    const t = setInterval(() => {
      Promise.all(SYMBOLS.map(async s => {
        const res = await fetchWithRetry(`/api/analyze?symbol=${s}&timeframe=${timeframe}`, { cache: 'no-store' }, 2);
        const d = await res.json();
        return { symbol: s, verdict: d.verdict || 'WATCH', confidence: d.confidence || 50 };
      })).then(setMultiResults);
    }, 15000);
    return () => clearInterval(t);
  }, [timeframe]);

  const badgeClass = analysis?.verdict === 'LONG'
    ? 'status-pill status-long'
    : analysis?.verdict === 'SHORT'
      ? 'status-pill status-short'
      : 'status-pill status-watch';

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
            <div className={badgeClass}>
              {analysis?.verdict === 'LONG' ? '롱' : analysis?.verdict === 'SHORT' ? '숏' : '관망'} \u00B7 {analysis?.confidence || 50}%
            </div>
            <div className="badge">
              {loading ? '분석 중...' : error ? '오류' : '실행 중'}
            </div>
            {error && (
              <button className="badge" onClick={load} style={{ marginLeft: 8, cursor: 'pointer' }}>
                다시 시도
              </button>
            )}
          </div>
        </div>

        {(analysis?.closeSettlement?.length ?? 0) > 0 && (
          <div className="card panel-pad" style={{ padding: '8px 12px' }}>
            <div className="section-title" style={{ marginBottom: 6, fontSize: '0.9rem' }}>종가 마감</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {analysis!.closeSettlement!.map((row) => {
                const remainMin = Math.floor(row.remainingSec / 60);
                const remainStr = row.status === '확정' ? '마감' : `${remainMin}분`;
                const goodBadIcon = row.goodBad === 'good' ? '\u2713' : row.goodBad === 'bad' ? '\u2717' : '\u2013';
                const goodBadClass = row.goodBad === 'good' ? 'c-long' : row.goodBad === 'bad' ? 'c-short' : '';
                return (
                  <div key={row.tf} className="badge" style={{ padding: '4px 8px', fontSize: '0.8rem' }} title={`${row.label} ${row.status} · ${row.lastCandleBullish ? '양봉' : '음봉'}`}>
                    <strong>{row.label}</strong> {row.status} · {remainStr} <span className={goodBadClass}>{goodBadIcon}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {error && (
          <div className="card panel-pad" role="alert" style={{ background: 'rgba(255,123,123,0.1)', border: '1px solid rgba(255,123,123,0.3)' }}>
            <div className="section-title">\u26A0\uFE0F 연결 오류</div>
            <div className="subtle" style={{ marginTop: 8 }}>{error}</div>
            <button onClick={load} style={{ marginTop: 12, padding: '8px 16px', cursor: 'pointer' }}>다시 시도</button>
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
                    상위 {(analysis as any).multiTF.htfLabel}: {(analysis as any).multiTF.htf || '-'} \u00B7 하위 {(analysis as any).multiTF.ltfLabel}: {(analysis as any).multiTF.ltf || '-'}
                  </div>
                )}
              </div>
              <div className="chart-wrap">
                {loading && !analysis ? (
                  <div style={{ padding: 80, textAlign: 'center', color: '#666' }}>차트 로딩 중...</div>
                ) : (
                  <ChartView ref={chartSnapshotRef} symbol={symbol} timeframe={timeframe} analysis={analysis} setTimeframe={setTimeframe} theme={theme} onChartPointClick={handleChartPointClick} uiMode={uiMode} onUiModeChange={setUiMode} />
                )}
              </div>
            </div>
          </div>

          <div className="right-stack">
            <AIChatPanel analysis={analysis} symbol={symbol} timeframe={timeframe} chartSnapshotRef={chartSnapshotRef} triggerSendMessage={triggerChatMessage} onTriggerSendConsumed={() => setTriggerChatMessage('')} />

            <div className="card panel-pad" style={{ display: 'flex', flexDirection: 'column', minHeight: 320, maxHeight: 'min(75vh, 720px)' }}>
              <div className="panel-tabs" role="tablist">
                {(['trade', 'market', 'briefing', 'pattern', 'ref', 'etc'] as const).map((tab) => (
                  <button key={tab} type="button" role="tab" aria-selected={rightPanelTab === tab} className={`panel-tab ${rightPanelTab === tab ? 'active' : ''}`} onClick={() => setRightPanelTab(tab)}>
                    {tab === 'trade' && '트레이드'}
                    {tab === 'market' && '시장'}
                    {tab === 'briefing' && '브리핑'}
                    {tab === 'pattern' && '패턴'}
                    {tab === 'ref' && '참조'}
                    {tab === 'etc' && '기타'}
                  </button>
                ))}
              </div>
              <div className="panel-tab-content">
                {rightPanelTab === 'trade' && (
                  <>
                    <div className="section-title" style={{ marginTop: 0 }}>세력·고래 구간 (거래소 API)</div>
                    <div className="mini-grid" style={{ marginTop: 8 }}>
                      <div className="mini-card"><div className="metric-label">고래 매수 구간</div><div className="mini-value c-long">{(analysis as any)?.buyZoneProbability != null ? `${(analysis as any).buyZoneProbability}%` : analysis?.nearestBuyZone?.probability != null ? `${analysis.nearestBuyZone.probability}%` : '–'}</div></div>
                      <div className="mini-card"><div className="metric-label">고래 매도 구간</div><div className="mini-value c-short">{(analysis as any)?.sellZoneProbability != null ? `${(analysis as any).sellZoneProbability}%` : analysis?.nearestSellZone?.probability != null ? `${analysis.nearestSellZone.probability}%` : '–'}</div></div>
                      <div className="mini-card"><div className="metric-label">HOLD %</div><div className="metric-value">{(analysis as any)?.holdProbability != null ? (analysis as any).holdProbability : analysis?.nearestBuyZone?.holdProbability ?? '–'}</div></div>
                      <div className="mini-card"><div className="metric-label">BREAK %</div><div className="metric-value">{(analysis as any)?.breakProbability != null ? (analysis as any).breakProbability : analysis?.nearestSellZone?.breakProbability ?? '–'}</div></div>
                      <div className="mini-card"><div className="metric-label">TRAP %</div><div className="metric-value">{(analysis as any)?.trapRisk != null ? (analysis as any).trapRisk : analysis?.nearestBuyZone?.trapRisk ?? analysis?.nearestSellZone?.trapRisk ?? '–'}</div></div>
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
                        <div className="section-title" style={{ marginTop: 14 }}>지지 OB · 저항 OB</div>
                        <div className="mini-grid" style={{ marginTop: 6 }}>
                          {analysis?.nearestSupportOb && (
                            <div className="mini-card">
                              <div className="metric-label">지지 OB (상승 OB)</div>
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
                        <span style={{ fontWeight: 600, color: '#94a3b8' }}>OB 선포착 분석</span>
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
                  <div className="section-title" style={{ marginTop: 0 }}>Buy/Sell Pressure</div>
                )}
                {rightPanelTab === 'briefing' && (
                  <>
                    <div className="space-between" style={{ marginTop: 0 }}><div className="section-title">Auto Briefing</div><button className="tool-chip tool-chip-button" onClick={() => window.print()} title="인쇄 / PDF 저장">리포트 저장</button></div>
                    <div className="subtle" style={{ marginTop: 10, whiteSpace: 'pre-wrap' }}>{analysis ? generateAutoBriefing(analysis) : (loading ? '분석 중...' : '대기 중')}</div>
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
                {rightPanelTab === 'etc' && (
                  <>
                    <div className="section-title" style={{ marginTop: 0 }}>Position Manager</div>
                    {analysis && <div className="subtle" style={{ marginTop: 8 }}>잔고 {balance} \u00B7 리스크 {riskPercent}%</div>}
                    <button className="tool-chip tool-chip-button" onClick={runBacktest} disabled={backtestLoading} style={{ marginTop: 8 }}>{backtestLoading ? '실행 중...' : '백테스트 실행'}</button>
                    {backtest && <div className="mini-grid" style={{ marginTop: 10 }}><div className="mini-card"><div className="metric-label">승률</div><div className="mini-value">{backtest.winRate.toFixed(1)}%</div></div><div className="mini-card"><div className="metric-label">총손익</div><div className="mini-value">{backtest.totalPnlPct >= 0 ? '+' : ''}{backtest.totalPnlPct.toFixed(2)}%</div></div></div>}
                    <div className="section-title" style={{ marginTop: 14 }}>멀티 심볼</div>
                    <div className="multi-grid" style={{ marginTop: 8 }}>{multiResults.map(m => <div key={m.symbol} className="multi-chip" onClick={() => setSymbol(m.symbol)}><strong>{m.symbol}</strong> <span className={m.verdict === 'LONG' ? 'c-long' : m.verdict === 'SHORT' ? 'c-short' : 'c-watch'}>{m.verdict === 'LONG' ? '롱' : m.verdict === 'SHORT' ? '숏' : '관망'} {m.confidence}%</span></div>)}</div>
                    <div className="section-title" style={{ marginTop: 14 }}>기록</div>
                    <div className="list" style={{ marginTop: 8 }}>{history.length === 0 ? <div className="list-item">아직 없음</div> : history.slice(0, 5).map((x, idx) => <div key={`${x.at}-${idx}`} className="list-item"><strong>{x.symbol}</strong> {x.timeframe} \u00B7 {x.verdict} \u00B7 {x.at}</div>)}</div>
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
      </main>
    </>
  );
}
