'use client';

/**
 * 독수리1호 VMAX — 공유 이미지 레이아웃.
 * 기존 타점엔진·자동매매칩·실포지션 연동.
 * 패널마다 펴기/접기/OFF (localStorage).
 * 승률·수익은 확정 아님 · 표본 없으면 — 표시.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { UIMode } from '@/lib/settings';
import {
  TAPOINT_CHART_TFS,
  TAPOINT_SOURCE,
  TAPOINT_SYMBOLS,
  type TapointDecisionReport,
} from '@/lib/eagle1Tapoint/types';
import {
  readTapointModeConfig,
  writeTapointModeConfig,
} from '@/lib/eagle1Tapoint/config';
import {
  AUTO_TRADE_SYMBOL_OPTIONS,
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
  executeUnifiedAnalysisEntry,
  resolveUnifiedTradeMode,
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
import VmaxPanel from '@/app/components/eagle1Tapoint/VmaxPanel';
import TapointCleanChart, {
  type TapointCandle,
} from '@/app/components/eagle1Tapoint/TapointCleanChart';

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

function rsi14(closes: number[]): number | null {
  if (closes.length < 16) return null;
  let g = 0;
  let l = 0;
  for (let i = closes.length - 14; i < closes.length; i++) {
    const d = closes[i]! - closes[i - 1]!;
    if (d >= 0) g += d;
    else l -= d;
  }
  if (l === 0) return 100;
  const rs = g / l;
  return 100 - 100 / (1 + rs);
}

function FactorBar({ label, v }: { label: string; v: number }) {
  const pct = Math.max(0, Math.min(100, v));
  return (
    <div className="vmax-factor">
      <span>{label}</span>
      <div className="vmax-factor-track">
        <i style={{ width: `${pct}%` }} />
      </div>
      <b>{pct}</b>
    </div>
  );
}

export default function Eagle1TapointDeskView(props: Props) {
  const { symbol, timeframe, onSymbolChange, onRequestChartTf, setTimeframe } = props;

  const [prefs, setPrefs] = useState<VmaxPanelPrefs>(() => readVmaxPanelPrefs());
  const [candles, setCandles] = useState<TapointCandle[]>([]);
  const [report, setReport] = useState<TapointDecisionReport | null>(null);
  const [statusKo, setStatusKo] = useState('VMAX 준비…');
  const [cfg, setCfg] = useState(() => readTapointModeConfig());
  const [autoCfg, setAutoCfg] = useState<MergedDeskAutoTradeConfig>(() =>
    readAutoTradeConfig()
  );
  const [coinMap, setCoinMap] = useState<Record<string, CoinSnap>>({});
  const [tickers, setTickers] = useState<Record<string, number>>({});
  const [positions, setPositions] = useState<LivePosition[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [calcLev, setCalcLev] = useState(20);
  const [calcMargin, setCalcMargin] = useState(50);
  const [marginMode, setMarginMode] = useState<'isolated' | 'crossed'>('isolated');
  const [nowKo, setNowKo] = useState('');
  const [showPanelMgr, setShowPanelMgr] = useState(false);
  const busyRef = useRef(false);

  const pushLog = useCallback((msg: string) => {
    setLogs((prev) => [`${new Date().toLocaleTimeString('ko-KR')} · ${msg}`, ...prev].slice(0, 40));
  }, []);

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

  const loadCandles = useCallback(async () => {
    const q = new URLSearchParams({ symbol, timeframe, depth: 'recent' });
    const res = await fetch(`/api/market-bitget?${q}`, {
      credentials: 'same-origin',
      cache: 'no-store',
    });
    const j = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      candles?: TapointCandle[];
    };
    if (j.ok && Array.isArray(j.candles)) {
      setCandles(j.candles);
      const last = j.candles[j.candles.length - 1];
      if (last?.close) {
        setTickers((t) => ({ ...t, [symbol]: Number(last.close) }));
      }
      return j.candles;
    }
    return [] as TapointCandle[];
  }, [symbol, timeframe]);

  const runDecide = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const q = new URLSearchParams({ symbol, timeframe });
      const res = await fetch(`/api/eagle1/tapoint-decide?${q}`, {
        credentials: 'same-origin',
        cache: 'no-store',
      });
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
      pushLog(`${symbol} · ${decKo(j.report.decision)} · ENTRY ${j.report.scores.entry}`);

      const modeCfg = readTapointModeConfig();
      if (
        modeCfg.autoExecute &&
        (j.report.decision === 'CONFIRMED_LONG' ||
          j.report.decision === 'CONFIRMED_SHORT') &&
        j.report.signalId &&
        j.report.entry != null &&
        j.report.sl != null &&
        j.report.direction
      ) {
        const ac = readAutoTradeConfig();
        if (!isAutoTradeSymbolEnabled(ac, symbol)) {
          setStatusKo(`칩 OFF · ${symbol}`);
          return;
        }
        if (wasAutoTradeSignalFired(j.report.signalId)) return;
        const virt = readVirtualTradeSession();
        const mode = resolveUnifiedTradeMode(ac, virt.active);
        if (!mode) {
          setStatusKo('확정 · ARM 필요');
          return;
        }
        markAutoTradeSignalFired(j.report.signalId);
        const r = await executeUnifiedAnalysisEntry({
          mode,
          symbol,
          timeframe: j.report.timeframe,
          direction: j.report.direction,
          price: j.report.entry,
          sl: j.report.sl,
          tp: j.report.tp1 ?? undefined,
          source: TAPOINT_SOURCE,
          signalKo: j.report.reasonOneLineKo,
          cfg: ac,
          liveMark: j.report.entry,
          signalId: j.report.signalId,
          availableUsdt: mode === 'live' ? undefined : virt.equityUsdt,
          analysisTags: ['eagle1-vmax', j.report.execKind],
        });
        pushLog(r.ok ? `주문 ${r.msg}` : `스킵 ${r.msg}`);
        setStatusKo(r.ok ? `주문 · ${r.msg}` : `스킵 · ${r.msg}`);
      }
    } catch (e) {
      setStatusKo(e instanceof Error ? e.message : '오류');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [symbol, timeframe, pushLog]);

  const refreshMain = useCallback(async () => {
    await loadCandles();
    await runDecide();
  }, [loadCandles, runDecide]);

  /** 좌측 코인 신호 — 순차·저빈도 (부하↓) */
  useEffect(() => {
    if (prefs.leftSignals === 'off') return;
    let cancelled = false;
    const tick = async () => {
      const out: Record<string, CoinSnap> = {};
      for (const sym of TAPOINT_SYMBOLS) {
        if (cancelled) return;
        try {
          const q = new URLSearchParams({ symbol: sym, timeframe: '15m' });
          const res = await fetch(`/api/eagle1/tapoint-decide?${q}`, {
            credentials: 'same-origin',
            cache: 'no-store',
          });
          const j = (await res.json().catch(() => ({}))) as {
            ok?: boolean;
            report?: TapointDecisionReport;
          };
          if (j.ok && j.report) {
            out[sym] = {
              decision: j.report.decision,
              entry: j.report.entry,
              direction: j.report.direction,
              score: j.report.scores.entry,
              noteKo: j.report.reasonOneLineKo.slice(0, 36),
            };
            if (j.report.entry) {
              setTickers((t) => ({ ...t, [sym]: j.report!.entry! }));
            }
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
  }, [prefs.leftSignals]);

  useEffect(() => {
    if (prefs.rightPositions === 'off') return;
    let cancelled = false;
    const tick = async () => {
      try {
        const pack = await fetchLivePosition(symbol);
        if (cancelled) return;
        const list = (pack.positions || []).filter((p) => Number(p.size) > 0);
        setPositions(list);
      } catch {
        /* ignore */
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [symbol, prefs.rightPositions]);

  useEffect(() => {
    const t0 = window.setTimeout(() => void refreshMain(), 250);
    const t = window.setInterval(() => void refreshMain(), 60_000);
    const clock = window.setInterval(() => {
      setNowKo(
        new Date().toLocaleString('ko-KR', {
          timeZone: 'Asia/Seoul',
          hour12: false,
        })
      );
    }, 1000);
    return () => {
      window.clearTimeout(t0);
      window.clearInterval(t);
      window.clearInterval(clock);
    };
  }, [refreshMain]);

  useEffect(() => {
    setCalcLev(Math.round(Number(autoCfg.leverage) || 20));
    setCalcMargin(Math.max(5, Number(autoCfg.marginUsdt) || 50));
    setMarginMode(autoCfg.marginMode === 'crossed' ? 'crossed' : 'isolated');
  }, [autoCfg.leverage, autoCfg.marginUsdt, autoCfg.marginMode]);

  const virt = typeof window !== 'undefined' ? readVirtualTradeSession() : null;
  const equity = virt?.equityUsdt ?? null;

  const levels = useMemo(
    () => ({
      entry: report?.entry,
      sl: report?.sl,
      tp1: report?.tp1,
      tp2: report?.tp2,
      tp3: report?.tp3,
      zoneLo: report?.battleZone?.lo,
      zoneHi: report?.battleZone?.hi,
    }),
    [report]
  );

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

  const factors = useMemo(() => {
    const s = report?.scores;
    if (!s) return [];
    return [
      { label: '추세', v: s.direction },
      { label: '지지저항', v: s.location },
      { label: '유동성', v: s.liquidity },
      { label: '거래량', v: s.event },
      { label: 'CVD/흐름', v: s.flow },
      { label: '체결흐름', v: s.flow },
      { label: 'RSI', v: rsi != null ? Math.round(rsi) : 40 },
      { label: '패턴/셋업', v: s.setup },
      { label: '레짐', v: s.regime },
      { label: '실행확률', v: s.entry },
    ];
  }, [report, rsi]);

  const synthScore = report?.scores.entry ?? 0;
  const canLong =
    report?.decision === 'CONFIRMED_LONG' || report?.decision === 'ARMED_LONG';
  const canShort =
    report?.decision === 'CONFIRMED_SHORT' || report?.decision === 'ARMED_SHORT';

  const toggleChip = (id: AutoTradeSymbolId) => {
    setAutoCfg(toggleAutoTradeSymbol(autoCfg, id));
  };

  const armLive = () => {
    const next = writeAutoTradeConfig({
      enabled: true,
      liveArmed: !autoCfg.liveArmed,
      tradingMode: !autoCfg.liveArmed ? 'LIVE' : 'PAPER',
    });
    setAutoCfg(next);
    pushLog(next.liveArmed ? '실전 ARM ON' : '실전 ARM OFF');
  };

  return (
    <div className="vmax-root">
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
                  <span>시드(가상)</span>
                  <b>{equity != null ? `${equity.toFixed(2)} U` : '—'}</b>
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
                  <span>실패위험</span>
                  <b className="r">{report?.scores.failureRisk ?? '—'}</b>
                </div>
                <div>
                  <span>참고</span>
                  <b className="mute">확정수익·승률아님</b>
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
          <span className="vmax-dot">서버 정상</span>
          <time>{nowKo || '—' } KST</time>
          <button type="button" className="vmax-mini" onClick={() => setShowPanelMgr((v) => !v)}>
            패널설정
          </button>
        </div>
      </header>

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
              onClick={() => onSymbolChange(o.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                toggleChip(o.id);
              }}
            >
              {o.chipKo} <i>{on ? 'ON' : 'OFF'}</i>
            </button>
          );
        })}
        <div className="vmax-tfs">
          {TAPOINT_CHART_TFS.map((tf) => (
            <button
              key={tf}
              type="button"
              className={timeframe === tf || timeframe.toUpperCase() === tf ? 'on' : ''}
              onClick={() => {
                setTimeframe(tf);
                onRequestChartTf(tf);
                writeTapointModeConfig({ chartTf: tf });
              }}
            >
              {tf}
            </button>
          ))}
        </div>
        <label className="vmax-autoex">
          <input
            type="checkbox"
            checked={cfg.autoExecute}
            onChange={(e) =>
              setCfg(writeTapointModeConfig({ autoExecute: e.target.checked }))
            }
          />
          확정시주문
        </label>
        <button type="button" className="vmax-scan" disabled={busy} onClick={() => void refreshMain()}>
          {busy ? '스캔…' : '스캔'}
        </button>
      </div>

      <div className="vmax-grid">
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
                  <b>{buyDom}%</b>
                  <span>매수우세</span>
                </div>
              </div>
            </div>
          </VmaxPanel>

          <VmaxPanel title="마켓 레짐" mode={prefs.leftRegime} onCycle={() => cycle('leftRegime')}>
            <div className="vmax-regime">
              <strong>{report?.regimeKo || '—'}</strong>
              <ul>
                <li>상태 {report?.entryState || 'WAIT'}</li>
                <li>실행 {report?.execKind || 'WAIT'}</li>
                <li>이벤트 {report?.extreme?.kind || 'NONE'}</li>
              </ul>
            </div>
          </VmaxPanel>

          <VmaxPanel title="세션" mode={prefs.leftSession} onCycle={() => cycle('leftSession')}>
            <p className="vmax-session">KST 기준 · 주/월봉 마감 09:00 규칙 적용 예정</p>
          </VmaxPanel>
        </aside>

        <main className="vmax-center">
          <VmaxPanel
            title={`${symbol} · ${timeframe}`}
            mode={prefs.centerChart}
            onCycle={() => cycle('centerChart')}
            className="vmax-chart-panel"
          >
            <div className="vmax-chart-box">
              <TapointCleanChart
                candles={candles}
                levels={levels}
                decisionKo={decKo(report?.decision)}
              />
            </div>
          </VmaxPanel>

          <VmaxPanel title="AI 합성 신호 · 액션" mode={prefs.centerSynth} onCycle={() => cycle('centerSynth')}>
            <div className="vmax-synth">
              <div className="vmax-synth-score">
                <div
                  className="vmax-ring"
                  style={{
                    background: `conic-gradient(${
                      canLong ? '#22c55e' : canShort ? '#ef4444' : '#64748b'
                    } ${synthScore}%, #1e293b 0)`,
                  }}
                >
                  <div className="vmax-ring-hole">
                    <b>{synthScore || '—'}</b>
                    <span>/100</span>
                  </div>
                </div>
                <p className={`vmax-synth-state ${toneOf(report?.decision)}`}>
                  {report?.decision === 'CONFIRMED_LONG'
                    ? '롱 진입가능'
                    : report?.decision === 'CONFIRMED_SHORT'
                      ? '숏 진입가능'
                      : report?.decision?.startsWith('ARMED')
                        ? '무장 · 타점대기'
                        : '대기'}
                </p>
              </div>
              <div className="vmax-synth-body">
                <p>{statusKo}</p>
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
                    <b>{report?.historical?.n && report.historical.n >= 20 ? '표본있음' : '통계부족'}</b>
                  </div>
                </div>
                <div className="vmax-actions">
                  <button type="button" className="long" disabled={!canLong}>
                    LONG 매수
                  </button>
                  <button type="button" className="short" disabled={!canShort}>
                    SHORT 매도
                  </button>
                  <button type="button" className="ghost">
                    지정가대기
                  </button>
                  <button type="button" className="ghost">
                    알림
                  </button>
                  <button type="button" className="ghost">
                    관심
                  </button>
                </div>
              </div>
            </div>
          </VmaxPanel>

          <VmaxPanel title="팩터 체크리스트" mode={prefs.centerFactors} onCycle={() => cycle('centerFactors')}>
            <div className="vmax-factors">
              {factors.map((f) => (
                <FactorBar key={f.label} label={f.label} v={f.v} />
              ))}
            </div>
          </VmaxPanel>

          <VmaxPanel title="최근 로그" mode={prefs.centerHistory} onCycle={() => cycle('centerHistory')}>
            <ul className="vmax-log">
              {logs.length ? logs.slice(0, 10).map((l) => <li key={l}>{l}</li>) : <li>이력 없음</li>}
            </ul>
          </VmaxPanel>

          <VmaxPanel title="수익 통계" mode={prefs.centerProfit} onCycle={() => cycle('centerProfit')}>
            <p className="vmax-muted">실계좌/가상 체결 집계 연동 · 고정 승률 표시 안 함 · 확정아님</p>
          </VmaxPanel>
        </main>

        <aside className="vmax-right">
          <VmaxPanel title="핵심 목표가" mode={prefs.rightLevels} onCycle={() => cycle('rightLevels')}>
            <dl className="vmax-levels">
              {[
                ['TP3', report?.tp3],
                ['TP2', report?.tp2],
                ['TP1', report?.tp1],
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
                <button
                  type="button"
                  className={marginMode === 'isolated' ? 'on' : ''}
                  onClick={() => setMarginMode('isolated')}
                >
                  격리
                </button>
                <button
                  type="button"
                  className={marginMode === 'crossed' ? 'on' : ''}
                  onClick={() => setMarginMode('crossed')}
                >
                  교차
                </button>
              </div>
              <label>
                레버 {calcLev}x
                <input
                  type="range"
                  min={1}
                  max={125}
                  value={calcLev}
                  onChange={(e) => setCalcLev(Number(e.target.value))}
                />
              </label>
              <label>
                증거금(U)
                <input
                  type="number"
                  value={calcMargin}
                  onChange={(e) => setCalcMargin(Math.max(1, Number(e.target.value) || 1))}
                />
              </label>
              <ul>
                <li>
                  TP1 예상{' '}
                  <b className="g">
                    {calcPnl(report?.tp1 ?? null, report?.direction ?? null)?.toFixed(2) ?? '—'} U
                  </b>
                </li>
                <li>
                  SL 예상{' '}
                  <b className="r">
                    {calcPnl(report?.sl ?? null, report?.direction ?? null)?.toFixed(2) ?? '—'} U
                  </b>
                </li>
                <li>
                  R:R <b>{rr != null ? `1:${rr.toFixed(2)}` : '—'}</b>
                </li>
              </ul>
              <button
                type="button"
                className="vmax-exec"
                onClick={() => {
                  writeAutoTradeConfig({
                    leverage: calcLev,
                    marginUsdt: calcMargin,
                    marginMode,
                    sizeMode: 'fixedUsdt',
                  });
                  setAutoCfg(readAutoTradeConfig());
                  pushLog(`계산값 적용 · ${calcLev}x · ${calcMargin}U`);
                  void refreshMain();
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
                  <b className={Number(p.unrealizedPnl) >= 0 ? 'g' : 'r'}>
                    {Number(p.unrealizedPnl || 0).toFixed(2)}
                  </b>
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
        </aside>
      </div>

      {prefs.footer !== 'off' && (
        <footer className="vmax-foot">
          {prefs.footer === 'open' && (
            <>
              <span>데이터는 거짓말하지 않는다 · 해석은 겸손하게</span>
              <span>Bitget 연동</span>
              <span className="pulse">{autoCfg.liveArmed ? '자동매매 가동' : '자동매매 대기'}</span>
              <span>칩 우클릭=ON/OFF</span>
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
          padding: 10px 12px 12px;
          min-height: 78vh;
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
          background: var(--long);
          margin-right: 5px;
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
          grid-template-columns: 220px minmax(0, 1fr) 240px;
          gap: 8px;
          align-items: start;
        }
        @media (max-width: 1200px) {
          .vmax-grid {
            grid-template-columns: 1fr;
          }
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
        .vmax-chart-box {
          height: min(48vh, 460px);
          min-height: 320px;
        }
        .vmax-synth {
          display: grid;
          grid-template-columns: 120px 1fr;
          gap: 12px;
        }
        @media (max-width: 700px) {
          .vmax-synth {
            grid-template-columns: 1fr;
          }
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
        .vmax-synth-body > p {
          margin: 0 0 8px;
          font-size: 12px;
          line-height: 1.45;
          color: #cbd5e1;
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
        .vmax-factor {
          display: grid;
          grid-template-columns: 64px 1fr 28px;
          gap: 6px;
          align-items: center;
          font-size: 11px;
          margin-bottom: 4px;
        }
        .vmax-factor-track {
          height: 6px;
          background: #0b1220;
          border-radius: 99px;
          overflow: hidden;
        }
        .vmax-factor-track i {
          display: block;
          height: 100%;
          background: linear-gradient(90deg, #16a34a, #4ade80);
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
