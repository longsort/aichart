'use client';

import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { MARKET_BARS_3Y } from '@/lib/constants';
import type { PatternForecastResult } from '@/lib/patternForecast';
import type { VolumeShockForecastResult, VolumeShockHorizonStat } from '@/lib/volumeShockForecast';
import type { Candle } from '@/types';
import styles from './CandleCompareCard.module.css';

type Row = {
  tf: string;
  label: string;
  loading: boolean;
  error?: string;
  last?: Candle;
  prev?: Candle;
};

function fmtPrice(n: number) {
  if (!Number.isFinite(n)) return '-';
  return n >= 1000 ? n.toLocaleString('en-US', { maximumFractionDigits: 2 }) : n.toPrecision(6);
}

function pctChange(last: Candle, prev: Candle) {
  if (!prev || prev.close === 0) return null;
  return ((last.close - prev.close) / prev.close) * 100;
}

function isBull(c: Candle) {
  return c.close >= c.open;
}

function fmtPct(n: number) {
  if (!Number.isFinite(n)) return '-';
  const s = n >= 0 ? '+' : '';
  return `${s}${n.toFixed(2)}%`;
}

function heatCellBg(p: number): { background: string; color: string } {
  const t = Math.max(0, Math.min(1, p));
  const alpha = 0.2 + 0.65 * t;
  return {
    background: `rgba(34, 197, 94, ${alpha})`,
    color: t > 0.42 ? '#0f172a' : '#f1f5f9',
  };
}

/** 비율 p에 대한 Wilson 95% 신뢰구간 (이항 비율) */
function wilson95(p: number, n: number): { low: number; high: number } {
  if (n <= 0 || !Number.isFinite(p)) return { low: 0, high: 1 };
  const z = 1.96;
  const phat = Math.max(0, Math.min(1, p));
  const denom = 1 + (z * z) / n;
  const center = (phat + (z * z) / (2 * n)) / denom;
  const inner = (phat * (1 - phat)) / n + (z * z) / (4 * n * n);
  const margin = (z / denom) * Math.sqrt(Math.max(0, inner));
  return { low: Math.max(0, center - margin), high: Math.min(1, center + margin) };
}

function fmtWilsonRange(p: number, n: number): string {
  if (n <= 0) return '—';
  const w = wilson95(p, n);
  return `${(w.low * 100).toFixed(0)}~${(w.high * 100).toFixed(0)}%`;
}

type TrustTier = 'high' | 'medium' | 'low';

function trustTier(n: number): TrustTier {
  if (n >= 100) return 'high';
  if (n >= 30) return 'medium';
  return 'low';
}

function trustClass(stylesMod: typeof styles, tier: TrustTier): string {
  if (tier === 'high') return stylesMod.trust_high;
  if (tier === 'medium') return stylesMod.trust_medium;
  return stylesMod.trust_low;
}

function CandleCompareCardInner({ symbol }: { symbol: string }) {
  const [rows, setRows] = useState<Row[]>([
    { tf: '15m', label: '15분', loading: true },
    { tf: '1h', label: '1시간', loading: true },
    { tf: '4h', label: '4시간', loading: true },
  ]);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const [pfTf, setPfTf] = useState<'15m' | '1h' | '4h'>('15m');
  const [pfLoading, setPfLoading] = useState(false);
  const [pfError, setPfError] = useState<string | null>(null);
  const [pf, setPf] = useState<PatternForecastResult | null>(null);

  const [vsLoading, setVsLoading] = useState(false);
  const [vsError, setVsError] = useState<string | null>(null);
  const [vs, setVs] = useState<VolumeShockForecastResult | null>(null);
  /** 동적 P95·P99 임계 포함 여부 */
  const [vsIncludeDynamic, setVsIncludeDynamic] = useState(true);

  const load = useCallback(async () => {
    const sym = String(symbol || 'BTCUSDT').toUpperCase();
    setRows([
      { tf: '15m', label: '15분', loading: true },
      { tf: '1h', label: '1시간', loading: true },
      { tf: '4h', label: '4시간', loading: true },
    ]);
    const tfs = ['15m', '1h', '4h'] as const;
    const results = await Promise.all(
      tfs.map(async (tf) => {
        try {
          const res = await fetch(`/api/market?symbol=${encodeURIComponent(sym)}&timeframe=${encodeURIComponent(tf)}`, {
            cache: 'no-store',
            credentials: 'same-origin',
          });
          const j = (await res.json()) as { ok?: boolean; candles?: Candle[]; error?: string };
          if (!res.ok || !j.ok || !Array.isArray(j.candles) || j.candles.length < 2) {
            return { tf, label: tf, loading: false, error: j.error || '데이터 부족' };
          }
          const candles = j.candles;
          return { tf, label: tf, loading: false, last: candles[candles.length - 1], prev: candles[candles.length - 2] };
        } catch (e: unknown) {
          return { tf, label: tf, loading: false, error: e instanceof Error ? e.message : '요청 실패' };
        }
      })
    );
    setRows(results);
    setUpdatedAt(new Date().toLocaleTimeString('ko-KR', { hour12: false }));
  }, [symbol]);

  const loadPatternForecast = useCallback(async () => {
    const sym = String(symbol || 'BTCUSDT').toUpperCase();
    setPfLoading(true);
    setPfError(null);
    try {
      const q = new URLSearchParams({
        symbol: sym,
        timeframe: pfTf,
        patternBars: '32',
        maxBars: String(MARKET_BARS_3Y[pfTf] ?? MARKET_BARS_3Y['15m']),
        topK: '12',
        horizons: pfTf === '4h' ? '1,3,6' : '1,4,12',
      });
      const res = await fetch(`/api/pattern-forecast?${q.toString()}`, { cache: 'no-store', credentials: 'same-origin' });
      const j = (await res.json()) as { ok?: boolean; forecast?: PatternForecastResult; error?: string };
      if (!res.ok || !j.ok || !j.forecast) {
        setPfError(j.error || '패턴 통계 계산 실패');
        return;
      }
      setPf(j.forecast);
    } catch (e: unknown) {
      setPfError(e instanceof Error ? e.message : '요청 실패');
    } finally {
      setPfLoading(false);
    }
  }, [symbol, pfTf]);

  const loadVolumeShock = useCallback(async () => {
    const sym = String(symbol || 'BTCUSDT').toUpperCase();
    setVsLoading(true);
    setVsError(null);
    try {
      const q = new URLSearchParams({
        symbol: sym,
        timeframe: '15m',
        thresholds: '5000,10000',
        horizons: '1,4,12',
        includeDynamic: vsIncludeDynamic ? '1' : '0',
        lookbackDays: '30',
      });
      const res = await fetch(`/api/volume-shock-forecast?${q.toString()}`, { cache: 'no-store', credentials: 'same-origin' });
      const j = (await res.json()) as { ok?: boolean; result?: VolumeShockForecastResult; error?: string };
      if (!res.ok || !j.ok || !j.result) {
        setVsError(j.error || '빅숏 통계 계산 실패');
        return;
      }
      setVs(j.result);
    } catch (e: unknown) {
      setVsError(e instanceof Error ? e.message : '요청 실패');
    } finally {
      setVsLoading(false);
    }
  }, [symbol, vsIncludeDynamic]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadPatternForecast();
  }, [loadPatternForecast]);

  useEffect(() => {
    void loadVolumeShock();
  }, [loadVolumeShock]);

  const bulls = rows.filter((r) => r.last && r.prev && isBull(r.last)).length;
  const bears = rows.filter((r) => r.last && r.prev && !isBull(r.last)).length;
  const alignment =
    bulls === 3 ? '세 타임프레임 모두 양봉' : bears === 3 ? '세 타임프레임 모두 음봉' : bulls >= 2 ? '양봉 우세' : bears >= 2 ? '음봉 우세' : '혼조';

  const vsBestStat = useMemo(() => {
    if (!vs?.eventStats?.length) return null;
    return vs.eventStats.reduce((a, b) => (a.sampleCount >= b.sampleCount ? a : b));
  }, [vs]);

  return (
    <div className={`card panel-pad ${styles.root}`}>
      <div className={styles.inner}>
      <div className={`section-title ${styles.titleRow}`}>
        <span className={styles.titleMain}>
          <span className={styles.liveDot} aria-hidden />
          실시간 캔들 / 거래량 비교
        </span>
        <span className={styles.badge}>대시보드</span>
      </div>
      <div className="subtle" style={{ fontSize: 11, marginTop: 4, lineHeight: 1.45, color: '#cbd5e1' }}>
        차트 기준: 바이낸스 현물 OHLCV(실패 시 Bybit 폴백). 빅숏 반응 통계는
        <code style={{ fontSize: 10, color: '#22d3ee', marginLeft: 6 }}>data/bitget-futures</code> CSV를 사용합니다.
      </div>

      <div className={styles.toolbar}>
        <div className={`mini-card ${styles.alignCard}`}>
          <div className="metric-label">방향 정렬</div>
          <div className="metric-value" style={{ fontSize: 13 }}>{alignment}</div>
        </div>
        <button type="button" className={`tool-chip tool-chip-button ${styles.btnCyan}`} onClick={() => void load()}>
          새로고침
        </button>
      </div>
      {updatedAt && <div className="subtle" style={{ fontSize: 10, marginTop: 6 }}>갱신 시각: {updatedAt}</div>}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>타임프레임</th>
              <th>종가</th>
              <th>직전봉 대비</th>
              <th>봉 방향</th>
              <th>거래량</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.tf}>
                <td style={{ fontWeight: 700, color: '#e2e8f0' }}>{r.label}</td>
                <td>{r.loading ? '...' : r.error ? <span className="c-short">{r.error}</span> : r.last ? fmtPrice(r.last.close) : '-'}</td>
                <td>
                  {r.last && r.prev ? (() => {
                    const p = pctChange(r.last, r.prev);
                    if (p == null) return '-';
                    return <span style={{ color: p >= 0 ? '#4ade80' : '#f87171', fontWeight: 700 }}>{fmtPct(p)}</span>;
                  })() : '-'}
                </td>
                <td>{r.last ? <span className={isBull(r.last) ? 'c-long' : 'c-short'}>{isBull(r.last) ? '양봉' : '음봉'}</span> : '-'}</td>
                <td style={{ color: '#94a3b8' }}>{r.last && Number.isFinite(r.last.volume) ? r.last.volume.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={`${styles.section} ${styles.sectionPink}`}>
        <div className={`section-title ${styles.sectionTitlePink}`}>빅숏 거래량 반응 통계 (비트겟 15분)</div>
        <div className="subtle" style={{ fontSize: 10, marginTop: 4, lineHeight: 1.45, color: '#fecdd3' }}>
          조건: 음봉 + 거래량 임계(고정 5k·10k + 최근 30일 분포 기준 동적 상위 5%·1%). 반등은 수익률 0%·0.3%·0.7% 초과 비율을 함께 봅니다.
        </div>
        <div className={styles.toolbarRow}>
          <button type="button" className={`tool-chip tool-chip-button ${styles.btnRose}`} onClick={() => void loadVolumeShock()}>
            빅숏 통계 재계산
          </button>
          <label className={styles.toggleLabel}>
            <input
              type="checkbox"
              checked={vsIncludeDynamic}
              onChange={(e) => setVsIncludeDynamic(e.target.checked)}
            />
            동적 임계(P95·P99) 포함
          </label>
        </div>
        {vsLoading && !vs && <div className="subtle" style={{ fontSize: 11, marginTop: 8 }}>빅숏 통계 계산 중...</div>}
        {vsError && <div style={{ fontSize: 11, marginTop: 8, color: '#f87171' }}>{vsError}</div>}
        {vs && (
          <div className={`${styles.vsBody} ${vsLoading ? styles.vsBodyBusy : ''}`} style={{ marginTop: 10 }}>
            {vsLoading && (
              <div className={styles.busyOverlay} aria-busy="true" aria-live="polite">
                <div className={styles.skelBlock}>
                  <div className={styles.skelBar} style={{ width: '72%' }} />
                  <div className={styles.skelBar} style={{ width: '55%' }} />
                  <div className={styles.skelBar} style={{ width: '88%' }} />
                </div>
                <span className={styles.busyLabel}>갱신 중…</span>
              </div>
            )}
            {vs.lowSampleWarning && (
              <div className={styles.sampleWarn} role="status">
                일부 임계에서 표본이 30 미만입니다. 통계는 참고용으로만 보세요.
              </div>
            )}
            {vs.dynamicVolume && vsIncludeDynamic && (
              <div className={styles.dynamicHint}>
                최근 {vs.lookbackBars.toLocaleString('ko-KR')}봉 기준 거래량 분위: 동적 P95 ≈{' '}
                {vs.dynamicVolume.p95.toLocaleString('ko-KR', { maximumFractionDigits: 0 })} · P99 ≈{' '}
                {vs.dynamicVolume.p99.toLocaleString('ko-KR', { maximumFractionDigits: 0 })}
              </div>
            )}
            <div className={styles.regimeRow}>
              <span className={styles.regimeBadge}>
                최근 {vs.shortTermRegime.windowBars}봉 {vs.shortTermRegime.label} (Δ {fmtPct(vs.shortTermRegime.changePct)})
              </span>
              <div className={styles.scoreBlock}>
                <div className={styles.scoreLabel}>
                  <span>빅숏 이벤트 강도</span>
                  <span>{vs.currentEventScore}점</span>
                </div>
                <div className={styles.scoreTrack}>
                  <div className={styles.scoreFill} style={{ width: `${vs.currentEventScore}%` }} />
                </div>
              </div>
            </div>
            {vsBestStat && vsBestStat.sampleCount > 0 && (
              <div className={styles.heatWrap}>
                <div className={styles.heatTitle}>
                  표본 최다 임계({vsBestStat.thresholdLabel}) — 반등 확률 히트맵 (%)
                </div>
                {(() => {
                  const h1b = vsBestStat.horizons.find((x) => x.bars === 1);
                  const p0 = h1b?.probRebound ?? 0;
                  const n = vsBestStat.sampleCount;
                  const tier = trustTier(n);
                  return (
                    <div className={styles.ciHint}>
                      표본 n={n.toLocaleString('ko-KR')} · 신뢰도{' '}
                      <span className={`${styles.trustBadge} ${trustClass(styles, tier)}`}>
                        {tier === 'high' ? '높음' : tier === 'medium' ? '중간' : '낮음'}
                      </span>
                      {h1b && (
                        <span className={styles.ciSub}>
                          {' '}
                          · +1봉 0%초과 Wilson 95%: {fmtWilsonRange(p0, n)}
                        </span>
                      )}
                    </div>
                  );
                })()}
                <div className={styles.heatScroll}>
                  <div className={styles.heatGrid}>
                  <div />
                  <div className={styles.heatHead}>+1봉</div>
                  <div className={styles.heatHead}>+4봉</div>
                  <div className={styles.heatHead}>+12봉</div>
                  {(['probRebound', 'probReboundT03', 'probReboundT07'] as const).map((key) => {
                    const label = key === 'probRebound' ? '0% 초과' : key === 'probReboundT03' ? '0.3% 초과' : '0.7% 초과';
                    return (
                      <div key={key} style={{ display: 'contents' }}>
                        <div className={styles.heatLabel}>{label}</div>
                        {[1, 4, 12].map((bars) => {
                          const h = vsBestStat.horizons.find((x) => x.bars === bars);
                          const p = h ? h[key] : 0;
                          const st = heatCellBg(p);
                          return (
                            <div key={bars} className={styles.heatCell} style={{ background: st.background, color: st.color }}>
                              {(p * 100).toFixed(0)}%
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                  </div>
                </div>
              </div>
            )}
            <div className="subtle" style={{ fontSize: 10, marginBottom: 8, marginTop: 8 }}>
              현재 15분봉 거래량: <strong style={{ color: '#fda4af' }}>{vs.current.volume.toLocaleString('ko-KR', { maximumFractionDigits: 0 })}</strong> · 봉: {vs.current.isBear ? '음봉' : '양봉'} ·
              조건 충족: {vs.current.hitThresholds.length ? vs.current.hitThresholds.map((x) => `${x.toLocaleString('ko-KR')}`).join(', ') : '없음'}
            </div>
            <div className={styles.tableScroll}>
            <table className={styles.smallTable}>
              <thead>
                <tr style={{ color: '#fbcfe8' }}>
                  <th>임계</th>
                  <th>표본</th>
                  <th>+1봉</th>
                  <th>+4봉</th>
                  <th>+12봉</th>
                </tr>
              </thead>
              <tbody>
                {vs.eventStats.map((s) => {
                  const isBest = vsBestStat && s.threshold === vsBestStat.threshold && s.thresholdKind === vsBestStat.thresholdKind;
                  const h1 = s.horizons.find((h) => h.bars === 1);
                  const h4 = s.horizons.find((h) => h.bars === 4);
                  const h12 = s.horizons.find((h) => h.bars === 12);
                  const n = s.sampleCount;
                  const tier = trustTier(n);
                  const fmtH = (h?: VolumeShockHorizonStat) =>
                    h ? (
                      <div className={styles.cellStack}>
                        <span>
                          {(h.probRebound * 100).toFixed(0)}% / {(h.probReboundT03 * 100).toFixed(0)}% / {(h.probReboundT07 * 100).toFixed(0)}%
                        </span>
                        <span className={styles.cellSub}>평균 {fmtPct(h.meanPct)} · 중앙 {fmtPct(h.medianPct)}</span>
                        <span className={styles.cellCi}>0%초과 95%: {fmtWilsonRange(h.probRebound, n)}</span>
                      </div>
                    ) : (
                      '-'
                    );
                  return (
                    <tr key={`${s.threshold}-${s.thresholdKind}`} className={isBest ? styles.rowBest : undefined}>
                      <td style={{ fontWeight: 700, color: '#fda4af' }}>
                        {s.thresholdLabel}
                        {s.sampleLowTrust ? <span style={{ marginLeft: 6, fontSize: 9, color: '#fbbf24' }}>(표본 적음)</span> : null}
                      </td>
                      <td>
                        <div className={styles.sampleCell}>
                          <span>{s.sampleCount}</span>
                          <span className={`${styles.trustBadge} ${trustClass(styles, tier)}`} title="표본 수 기준 신뢰도">
                            {tier === 'high' ? '높음' : tier === 'medium' ? '중간' : '낮음'}
                          </span>
                        </div>
                      </td>
                      <td>{fmtH(h1)}</td>
                      <td>{fmtH(h4)}</td>
                      <td>{fmtH(h12)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
            <div className="subtle" style={{ fontSize: 10, marginTop: 6 }}>
              표에서 각 칸: 위 줄 반등 확률(0%·0.3%·0.7% 초과) · 평균·중앙 · 맨 아래는 0%초과 비율의 Wilson 95% 구간. 강조 행은 표본 수가 가장 많은 임계입니다.
            </div>
          </div>
        )}
      </div>

      <div className={`${styles.section} ${styles.sectionGreen}`}>
        <div className={`section-title ${styles.sectionTitleGreen}`}>가격+거래량 유사 패턴 예측</div>
        <div className="subtle" style={{ fontSize: 10, marginTop: 4, lineHeight: 1.45, color: '#bbf7d0' }}>
          현재 구간과 비슷한 과거 구간을 찾고, 이후 수익률 분포를 통계로 보여줍니다.
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginTop: 10 }}>
          <label className="subtle" style={{ fontSize: 11 }}>
            기준 TF
            <select className="tool-chip" style={{ marginLeft: 6, fontSize: 11, padding: '4px 8px' }} value={pfTf} onChange={(e) => setPfTf(e.target.value as '15m' | '1h' | '4h')}>
              <option value="15m">15분</option>
              <option value="1h">1시간</option>
              <option value="4h">4시간</option>
            </select>
          </label>
          <button type="button" className={`tool-chip tool-chip-button ${styles.btnGreen}`} onClick={() => void loadPatternForecast()}>
            패턴 통계 재계산
          </button>
        </div>
        {pfLoading && !pf && <div className="subtle" style={{ fontSize: 11, marginTop: 8 }}>패턴 통계 계산 중...</div>}
        {pfError && <div style={{ fontSize: 11, marginTop: 8, color: '#f87171' }}>{pfError}</div>}
        {pf && (
          <div className={`${styles.pfBody} ${pfLoading ? styles.pfBodyBusy : ''}`} style={{ marginTop: 10 }}>
            {pfLoading && (
              <div className={styles.busyOverlayGreen} aria-busy="true" aria-live="polite">
                <div className={styles.skelBlock}>
                  <div className={styles.skelBar} style={{ width: '65%' }} />
                  <div className={styles.skelBar} style={{ width: '48%' }} />
                </div>
                <span className={styles.busyLabelGreen}>갱신 중…</span>
              </div>
            )}
            <div className="subtle" style={{ fontSize: 10, marginBottom: 6 }}>
              히스토리 {pf.historyBars.toLocaleString('ko-KR')}봉 · 패턴 길이 {pf.patternBars}봉 · 매칭 {pf.matches.length.toLocaleString('ko-KR')}건(상위 {pf.topK} 후보 중)
              {(() => {
                const pt = trustTier(pf.matches.length);
                return (
                  <span style={{ marginLeft: 8 }}>
                    신뢰도{' '}
                    <span className={`${styles.trustBadge} ${trustClass(styles, pt)}`}>
                      {pt === 'high' ? '높음' : pt === 'medium' ? '중간' : '낮음'}
                    </span>
                  </span>
                );
              })()}
              {pf.historyBars < 2000 && (
                <span style={{ marginLeft: 8, color: '#fbbf24' }}>히스토리 짧으면 유사도 편향 가능</span>
              )}
            </div>
            <div className={styles.tableScroll}>
            <table className={styles.smallTable}>
              <thead>
                <tr style={{ color: '#bbf7d0' }}>
                  <th>앞으로</th>
                  <th>상승 확률</th>
                  <th>평균</th>
                  <th>중앙</th>
                  <th>25~75%</th>
                </tr>
              </thead>
              <tbody>
                {pf.horizonsStats.map((h) => {
                  const pn = pf.matches.length;
                  return (
                  <tr key={h.horizon} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <td style={{ padding: '6px', fontWeight: 700 }}>+{h.horizon}봉</td>
                    <td style={{ padding: '6px', verticalAlign: 'top' }}>
                      <div>{(h.probUp * 100).toFixed(0)}%</div>
                      <div className={styles.probBarWrap}>
                        <div className={styles.probBarFill} style={{ width: `${Math.min(100, h.probUp * 100)}%` }} />
                      </div>
                      <div className={styles.cellCi} style={{ marginTop: 4 }}>
                        Wilson 95%: {fmtWilsonRange(h.probUp, pn)}
                      </div>
                    </td>
                    <td style={{ padding: '6px' }}>{fmtPct(h.meanPct)}</td>
                    <td style={{ padding: '6px' }}>{fmtPct(h.medianPct)}</td>
                    <td style={{ padding: '6px', color: '#94a3b8' }}>{fmtPct(h.p25Pct)} ~ {fmtPct(h.p75Pct)}</td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}

export default memo(CandleCompareCardInner);
