'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Candle } from '@/types';
import type { UserSettings } from '@/lib/settings';
import {
  computeEternyMacdAdxSeries,
  evaluateEternyMacdAdxAlertAtBar,
  eternyMacdAdxLastClosedBarIndex,
  type EternyMacdAdxInputs,
} from '@/lib/eternyMacdAdxPro';

const TAIL = 200;

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export function EternyMacdAdxProPanel({
  candles,
  settings,
  apply,
}: {
  candles: Candle[];
  settings: UserSettings;
  apply: (patch: Partial<UserSettings>) => void;
}) {
  const [inputsOpen, setInputsOpen] = useState(false);
  const [alertToast, setAlertToast] = useState<{ kind: 'strongBuy' | 'strongSell'; msg: string } | null>(null);
  const lastAlertKeyRef = useRef<string | null>(null);

  const inputs: EternyMacdAdxInputs = useMemo(
    () => ({
      fastLen: Math.max(1, settings.eternyMacdAdxFastLen),
      slowLen: Math.max(1, settings.eternyMacdAdxSlowLen),
      signalLen: Math.max(1, settings.eternyMacdAdxSignalLen),
      adxLen: Math.max(1, settings.eternyMacdAdxAdxLen),
      adxSmoothing: Math.max(1, settings.eternyMacdAdxAdxSmoothing),
      adxThreshold: clamp(settings.eternyMacdAdxThreshold, 10, 99),
      mode: settings.eternyMacdAdxHistogramMode,
    }),
    [
      settings.eternyMacdAdxFastLen,
      settings.eternyMacdAdxSlowLen,
      settings.eternyMacdAdxSignalLen,
      settings.eternyMacdAdxAdxLen,
      settings.eternyMacdAdxAdxSmoothing,
      settings.eternyMacdAdxThreshold,
      settings.eternyMacdAdxHistogramMode,
    ]
  );

  const fullBars = useMemo(() => computeEternyMacdAdxSeries(candles, inputs), [candles, inputs]);

  const mainSlice = useMemo(() => {
    const t = Math.min(TAIL, fullBars.length);
    return fullBars.slice(-t);
  }, [fullBars]);

  const tail = mainSlice.length;
  const showAdx = settings.eternyMacdAdxShowAdxLine;
  const showThr = settings.eternyMacdAdxShowAdxThreshold;
  const hAdx = 28;
  const hMain = showAdx || showThr ? 78 : 96;
  const thr = clamp(settings.eternyMacdAdxThreshold, 10, 99);

  const closedIdx = eternyMacdAdxLastClosedBarIndex(candles.length);

  useEffect(() => {
    if (!settings.eternyMacdAdxAlertsEnabled || closedIdx < 1 || fullBars.length <= closedIdx) {
      return;
    }
    const kind = evaluateEternyMacdAdxAlertAtBar(fullBars, closedIdx, inputs.mode);
    if (!kind) return;
    const t = candles[closedIdx].time;
    const key = `${t}-${kind}-${inputs.mode}-${inputs.fastLen}-${inputs.slowLen}-${inputs.signalLen}-${inputs.adxLen}-${inputs.adxSmoothing}-${inputs.adxThreshold}`;
    if (lastAlertKeyRef.current === key) return;
    lastAlertKeyRef.current = key;

    const msg =
      kind === 'strongBuy' ? 'Strong Buy — MACD Bullish Cross' : 'Strong Sell — MACD Bearish Cross';
    setAlertToast({ kind, msg });

    if (
      settings.eternyMacdAdxAlertsBrowser &&
      typeof window !== 'undefined' &&
      typeof Notification !== 'undefined' &&
      Notification.permission === 'granted'
    ) {
      try {
        new Notification('Macd + Adx PRO by @ETERNYWORLD', { body: msg });
      } catch {
        /* ignore */
      }
    }

    const tid = window.setTimeout(() => setAlertToast(null), 8000);
    return () => window.clearTimeout(tid);
  }, [
    candles,
    closedIdx,
    fullBars,
    inputs.mode,
    inputs.fastLen,
    inputs.slowLen,
    inputs.signalLen,
    inputs.adxLen,
    inputs.adxSmoothing,
    inputs.adxThreshold,
    settings.eternyMacdAdxAlertsEnabled,
    settings.eternyMacdAdxAlertsBrowser,
  ]);

  const { minV, maxV, toY } = useMemo(() => {
    const vals: number[] = [];
    for (const b of mainSlice) {
      vals.push(b.hist, b.macd, b.signal);
    }
    let min = Math.min(...vals);
    let max = Math.max(...vals);
    if (!isFinite(min) || !isFinite(max)) {
      min = -0.01;
      max = 0.01;
    }
    if (min === max) {
      min -= 0.0001;
      max += 0.0001;
    }
    const pad = (max - min) * 0.1;
    min -= pad;
    max += pad;
    const toYFn = (v: number) => hMain - ((v - min) / (max - min || 1)) * hMain;
    return { minV: min, maxV: max, toY: toYFn };
  }, [mainSlice, hMain]);

  const y0 = toY(0);

  const chip = (active: boolean, label: string, onClick: () => void, title: string) => (
    <button
      type="button"
      title={title}
      className={`tool-chip tool-chip-button ${active ? 'tool-chip-active' : ''}`}
      style={{ padding: '3px 8px', fontSize: 10 }}
      onClick={onClick}
    >
      {label}
    </button>
  );

  const num = (
    label: string,
    value: number,
    min: number,
    max: number,
    onCommit: (v: number) => void
  ) => (
    <label className="eterny-macd-adx-num">
      <span className="eterny-macd-adx-num-label">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => {
          const v = parseInt(e.target.value, 10);
          if (!Number.isFinite(v)) return;
          onCommit(clamp(v, min, max));
        }}
      />
    </label>
  );

  const requestBrowserNotify = async () => {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission === 'granted') {
      apply({ eternyMacdAdxAlertsBrowser: true });
      return;
    }
    const p = await Notification.requestPermission();
    apply({ eternyMacdAdxAlertsBrowser: p === 'granted' });
  };

  return (
    <div className="indicator-panel indicator-panel--eterny-macd-adx" style={{ bottom: 48, zIndex: 6 }}>
      {alertToast && (
        <div
          className={`eterny-macd-adx-alert eterny-macd-adx-alert--${alertToast.kind === 'strongBuy' ? 'buy' : 'sell'}`}
          role="status"
        >
          {alertToast.msg}
        </div>
      )}
      <div className="eterny-macd-adx-head">
        <div className="eterny-macd-adx-title">Macd + Adx PRO by @ETERNYWORLD</div>
        <div className="eterny-macd-adx-toolbar">
          {chip(
            settings.eternyMacdAdxHistogramMode === 'sensitive',
            'Sensitive',
            () => apply({ eternyMacdAdxHistogramMode: 'sensitive' }),
            '민감 모드 (Pine mode=Sensitive)'
          )}
          {chip(
            settings.eternyMacdAdxHistogramMode === 'filtered',
            'Filtered',
            () => apply({ eternyMacdAdxHistogramMode: 'filtered' }),
            '필터 모드 (Pine mode=Filtered)'
          )}
          {chip(
            showAdx,
            'Show ADX',
            () => apply({ eternyMacdAdxShowAdxLine: !showAdx }),
            'Pine show_adx'
          )}
          {chip(
            showThr,
            'Show ADX Threshold',
            () => apply({ eternyMacdAdxShowAdxThreshold: !showThr }),
            'Pine show_adx_threshold'
          )}
          {chip(
            settings.eternyMacdAdxAlertsEnabled,
            '알림',
            () => apply({ eternyMacdAdxAlertsEnabled: !settings.eternyMacdAdxAlertsEnabled }),
            'Pine alertcondition — Strong Buy / Strong Sell (마감 봉 기준)'
          )}
          {chip(
            settings.eternyMacdAdxAlertsBrowser,
            '브라우저 알림',
            () => {
              if (settings.eternyMacdAdxAlertsBrowser) apply({ eternyMacdAdxAlertsBrowser: false });
              else void requestBrowserNotify();
            },
            '시스템 알림(허용 필요)'
          )}
          <button
            type="button"
            className="tool-chip tool-chip-button"
            style={{ padding: '3px 8px', fontSize: 10 }}
            title="Pine input: Fast/Slow/Signal, ADX Length/Smoothing/Threshold"
            onClick={() => setInputsOpen((v) => !v)}
          >
            입력 {inputsOpen ? '▲' : '▼'}
          </button>
        </div>
        {inputsOpen && (
          <div className="eterny-macd-adx-inputs-grid">
            {num('Fast Length', settings.eternyMacdAdxFastLen, 1, 200, (v) => apply({ eternyMacdAdxFastLen: v }))}
            {num('Slow Length', settings.eternyMacdAdxSlowLen, 1, 200, (v) => apply({ eternyMacdAdxSlowLen: v }))}
            {num('Signal Length', settings.eternyMacdAdxSignalLen, 1, 200, (v) => apply({ eternyMacdAdxSignalLen: v }))}
            {num('ADX Length', settings.eternyMacdAdxAdxLen, 1, 100, (v) => apply({ eternyMacdAdxAdxLen: v }))}
            {num('ADX Smoothing', settings.eternyMacdAdxAdxSmoothing, 1, 100, (v) =>
              apply({ eternyMacdAdxAdxSmoothing: v })
            )}
            {num('ADX Threshold', settings.eternyMacdAdxThreshold, 10, 99, (v) => apply({ eternyMacdAdxThreshold: v }))}
          </div>
        )}
      </div>
      <div
        className="rsi-panel-chart eterny-macd-adx-chart-wrap"
        style={{
          minHeight: hMain + (showAdx || showThr ? hAdx + 6 : 0),
          position: 'relative',
        }}
      >
        <div className="eterny-macd-adx-yaxis" aria-hidden>
          <span>{maxV.toFixed(3)}</span>
          <span>{minV <= 0 && maxV >= 0 ? '0' : ''}</span>
          <span>{minV.toFixed(3)}</span>
        </div>
        <svg width="100%" height={hMain} preserveAspectRatio="none" viewBox={`0 0 ${Math.max(1, tail)} ${hMain}`}>
          {mainSlice.map((b, i) => {
            const v = b.hist;
            const y1 = toY(v);
            const top = Math.min(y0, y1);
            const h = Math.max(Math.abs(y1 - y0), 0.25);
            return (
              <rect
                key={`h-${i}`}
                x={i - 0.41}
                y={top}
                width={0.82}
                height={h}
                fill={b.histColor}
              />
            );
          })}
          <line x1={0} y1={y0} x2={tail} y2={y0} stroke="rgba(148,163,184,0.45)" strokeWidth={0.14} />
          {mainSlice.map((b, i) => {
            if (i < 1) return null;
            const a = mainSlice[i - 1];
            return (
              <line
                key={`ml-${i}`}
                x1={i - 1}
                y1={toY(a.macd)}
                x2={i}
                y2={toY(b.macd)}
                stroke={b.macdLineColor}
                strokeWidth={1.2}
                strokeLinecap="round"
              />
            );
          })}
          {mainSlice.map((b, i) => {
            if (i < 1) return null;
            const a = mainSlice[i - 1];
            return (
              <line
                key={`sl-${i}`}
                x1={i - 1}
                y1={toY(a.signal)}
                x2={i}
                y2={toY(b.signal)}
                stroke={b.signalLineColor}
                strokeWidth={1.2}
                strokeLinecap="round"
              />
            );
          })}
        </svg>
        {(showAdx || showThr) && (
          <svg
            width="100%"
            height={hAdx}
            preserveAspectRatio="none"
            viewBox={`0 0 ${Math.max(1, tail)} ${hAdx}`}
            style={{ display: 'block', marginTop: 4 }}
          >
            {showThr && (
              <line
                x1={0}
                x2={tail}
                y1={hAdx - (thr / 100) * hAdx}
                y2={hAdx - (thr / 100) * hAdx}
                stroke="#f97316"
                strokeWidth={0.22}
              />
            )}
            {showAdx &&
              mainSlice.map((b, i) => {
                if (i < 1) return null;
                const a = mainSlice[i - 1];
                const y1 = hAdx - (a.adx / 100) * hAdx;
                const y2 = hAdx - (b.adx / 100) * hAdx;
                return (
                  <line
                    key={`adx-${i}`}
                    x1={i - 1}
                    y1={y1}
                    x2={i}
                    y2={y2}
                    stroke="rgba(246,246,247,0.45)"
                    strokeWidth={0.38}
                  />
                );
              })}
          </svg>
        )}
      </div>
      <div className="rsi-panel-legend eterny-macd-adx-legend">
        <span style={{ color: '#026D42' }}>Histogram</span>
        <span style={{ color: '#94a3b8' }}>·</span>
        <span style={{ color: '#026D42' }}>MACD</span>
        <span style={{ color: 'rgba(2,109,66,0.7)' }}>Signal</span>
        {showAdx && <span style={{ color: '#f6f6f7' }}>ADX</span>}
        {showThr && <span style={{ color: '#f97316' }}>ADX Threshold {thr}</span>}
      </div>
    </div>
  );
}
