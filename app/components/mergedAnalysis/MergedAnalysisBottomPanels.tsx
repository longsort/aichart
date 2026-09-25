'use client';

import { useMemo } from 'react';
import type { AnalyzeResponse } from '@/types';
import { buildUnifiedLsSignal } from '@/lib/unifiedSignalEngine';
import { buildProfileFromPanelFeatures, DEFAULT_UNIFIED_PANEL_FEATURES } from '@/lib/unifiedSignalPanelProfile';
import styles from './MergedAnalysisDesk.module.css';

type Props = {
  analysis: AnalyzeResponse | null;
  theme?: 'dark' | 'light';
};

function MiniRsiChart({ analysis }: { analysis: AnalyzeResponse }) {
  const ind = analysis.indicators;
  if (!ind) return null;
  const rsiArr = ind.rsi || [];
  const k = ind.stochK || [];
  const d = ind.stochD || [];
  const tail = Math.min(60, rsiArr.length);
  const slice = (arr: number[]) => arr.slice(-tail);
  const rs = slice(rsiArr);
  const ks = slice(k);
  const ds = slice(d);
  const max = Math.max(100, ...rs, ...ks, ...ds);
  const min = Math.min(0, ...rs, ...ks, ...ds);
  const h = 48;
  const toY = (v: number) => h - ((v - min) / (max - min || 1)) * h;
  const startIdx = Math.max(0, rsiArr.length - tail);
  const divLines =
    (analysis as { rsiDivergenceSignal?: { divergenceLines?: Array<{ type: 'bullish' | 'bearish'; index1: number; index2: number; rsi1?: number; rsi2?: number }> } })
      ?.rsiDivergenceSignal?.divergenceLines || [];

  return (
    <svg width="100%" height={h} preserveAspectRatio="none" viewBox={`0 0 ${Math.max(1, tail)} ${h}`}>
      {rs.length > 1 && (
        <polyline fill="none" stroke="#62efe0" strokeWidth="0.6" points={rs.map((v, i) => `${i},${toY(v)}`).join(' ')} />
      )}
      {ks.length > 1 && (
        <polyline fill="none" stroke="#4df2a3" strokeWidth="0.5" strokeDasharray="2 2" points={ks.map((v, i) => `${i},${toY(v)}`).join(' ')} />
      )}
      {ds.length > 1 && (
        <polyline fill="none" stroke="#ffb86b" strokeWidth="0.5" strokeDasharray="2 2" points={ds.map((v, i) => `${i},${toY(v)}`).join(' ')} />
      )}
      <line x1={0} y1={toY(30)} x2={tail} y2={toY(30)} stroke="rgba(255,255,255,0.2)" strokeWidth="0.3" />
      <line x1={0} y1={toY(70)} x2={tail} y2={toY(70)} stroke="rgba(255,255,255,0.2)" strokeWidth="0.3" />
      {divLines.map((dl, i) => {
        const r1 = dl.rsi1 ?? 50;
        const r2 = dl.rsi2 ?? 50;
        const x1 = dl.index1 - startIdx;
        const x2 = dl.index2 - startIdx;
        if (x1 < 0 || x2 < 0 || x1 >= tail || x2 >= tail) return null;
        const stroke = dl.type === 'bullish' ? '#22C55E' : '#EF4444';
        return (
          <line key={`div-${i}`} x1={x1} y1={toY(r1)} x2={x2} y2={toY(r2)} stroke={stroke} strokeWidth="0.8" strokeDasharray="2 2" />
        );
      })}
    </svg>
  );
}

function MiniMacdChart({ analysis }: { analysis: AnalyzeResponse }) {
  const ind = analysis.indicators;
  if (!ind) return null;
  const macdL = ind.macdLine || [];
  const macdS = ind.macdSignal || [];
  const macdH = ind.macdHist || [];
  const tail = Math.min(60, macdH.length || macdL.length);
  const slice = (arr: number[]) => arr.slice(-tail);
  const ml = slice(macdL);
  const ms = slice(macdS);
  const mh = slice(macdH);
  const all = [...ml, ...ms, ...mh].filter((x) => Number.isFinite(x));
  const max = Math.max(0.0001, ...all);
  const min = Math.min(-0.0001, ...all);
  const h = 48;
  const toY = (v: number) => h - ((v - min) / (max - min || 1)) * h;
  const divSig = (analysis as { rsiDivergenceSignal?: { divergence?: { bullish?: boolean; bearish?: boolean } } })
    ?.rsiDivergenceSignal?.divergence;
  const macdDivBg =
    divSig?.bullish === true ? 'rgba(34,197,94,0.12)' : divSig?.bearish === true ? 'rgba(239,68,68,0.12)' : 'transparent';

  return (
    <div className={styles.bottomChartInner} style={{ background: macdDivBg }}>
      <svg width="100%" height={h} preserveAspectRatio="none" viewBox={`0 0 ${Math.max(1, tail)} ${h}`}>
        {mh.length > 1 &&
          mh.map((v, i) => (
            <line key={i} x1={i} y1={toY(0)} x2={i} y2={toY(v)} stroke={v >= 0 ? '#62efe0' : '#ff7b7b'} strokeWidth="0.8" />
          ))}
        {ml.length > 1 && (
          <polyline fill="none" stroke="#62efe0" strokeWidth="0.5" points={ml.map((v, i) => `${i},${toY(v)}`).join(' ')} />
        )}
        {ms.length > 1 && (
          <polyline fill="none" stroke="#ffb86b" strokeWidth="0.5" strokeDasharray="2 2" points={ms.map((v, i) => `${i},${toY(v)}`).join(' ')} />
        )}
        <line x1={0} y1={toY(0)} x2={tail} y2={toY(0)} stroke="rgba(255,255,255,0.3)" strokeWidth="0.3" />
      </svg>
    </div>
  );
}

export default function MergedAnalysisBottomPanels({ analysis, theme = 'dark' }: Props) {
  const ls = useMemo(() => {
    if (!analysis) return null;
    const profile = buildProfileFromPanelFeatures(DEFAULT_UNIFIED_PANEL_FEATURES, {
      showRsiIndicators: true,
      showMacdPanel: true,
      showBbPanel: false,
    });
    return buildUnifiedLsSignal(analysis, profile);
  }, [analysis]);

  if (!analysis?.indicators) {
    return (
      <div className={styles.bottomPanels} data-theme={theme}>
        <div className={styles.bottomPanelEmpty}>분석 로딩 중 — RSI · 모멘텀</div>
      </div>
    );
  }

  const mix = ls ? Math.max(1, ls.longDisplay + ls.shortDisplay) : 1;
  const longPct = ls ? Math.round((ls.longDisplay / mix) * 100) : 50;
  const shortPct = 100 - longPct;
  const rsiLast = analysis.indicators.rsi?.[analysis.indicators.rsi.length - 1];
  const macdLast = analysis.indicators.macdHist?.[analysis.indicators.macdHist.length - 1];

  return (
    <div className={styles.bottomPanels} data-theme={theme}>
      <div className={styles.bottomPanel}>
        <div className={styles.bottomPanelHead}>
          RSI / StochRSI
          {Number.isFinite(rsiLast) && <span className={styles.bottomPanelVal}>{rsiLast!.toFixed(1)}</span>}
        </div>
        <MiniRsiChart analysis={analysis} />
        <div className={styles.bottomLegend}>
          <span style={{ color: '#62efe0' }}>RSI</span>
          <span style={{ color: '#4df2a3' }}>K</span>
          <span style={{ color: '#ffb86b' }}>D</span>
        </div>
      </div>
      <div className={styles.bottomPanel}>
        <div className={styles.bottomPanelHead}>
          MACD · 모멘텀
          {Number.isFinite(macdLast) && (
            <span className={styles.bottomPanelVal} style={{ color: macdLast! >= 0 ? '#62efe0' : '#ff7b7b' }}>
              {macdLast!.toFixed(4)}
            </span>
          )}
        </div>
        <MiniMacdChart analysis={analysis} />
        <div className={styles.bottomLegend}>
          <span style={{ color: '#62efe0' }}>MACD</span>
          <span style={{ color: '#ffb86b' }}>Signal</span>
          <span>Hist</span>
        </div>
      </div>
      {ls && (
        <div className={styles.bottomPanel}>
          <div className={styles.bottomPanelHead}>
            AI 모멘텀 · {ls.grade ? `등급 ${ls.grade}` : '합성'}
          </div>
          <div className={styles.gaugeBar} style={{ marginTop: 8 }}>
            <div className={styles.gaugeLong} style={{ width: `${longPct}%` }} />
            <div className={styles.gaugeShort} style={{ width: `${shortPct}%` }} />
          </div>
          <div className={styles.gaugePct}>
            <span style={{ color: '#22c55e' }}>L {longPct}%</span>
            <span style={{ color: '#ef4444' }}>S {shortPct}%</span>
          </div>
          <div className={styles.bottomMomentumNote}>
            {analysis.verdict ?? 'WAIT'} · conf {analysis.confidence ?? 0}%
          </div>
        </div>
      )}
    </div>
  );
}
