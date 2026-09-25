'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Candle } from '@/types';
import type { PageLayoutSettings, UserSettings } from '@/lib/settings';
import { loadSettings, saveSettings } from '@/lib/settings';
import { SETTINGS_CHANGED_EVENT } from '@/lib/useSettingsChangeTick';

type Props = {
  symbol: string;
  timeframe: string;
  showMtfStrip: boolean;
  /** 분석 스냅샷 캔들 — 헤더 OHLC·전일대비 */
  fusionCandles: Candle[] | null;
  onPageLayoutPatch: (patch: Partial<PageLayoutSettings>) => void;
};

function fmtPx(n: number): string {
  const a = Math.abs(n);
  const frac = a >= 1000 ? 1 : a >= 1 ? 2 : 4;
  return n.toLocaleString(undefined, { maximumFractionDigits: frac });
}

function pill(
  active: boolean,
  label: string,
  dotColor: string,
  onClick: () => void,
  title?: string
) {
  return (
    <button
      type="button"
      className={`tool-chip tool-chip-button${active ? ' tool-chip-active' : ''}`}
      onClick={onClick}
      title={title}
      style={{
        padding: '6px 12px',
        fontSize: 11,
        fontWeight: 700,
        borderColor: active ? dotColor : 'rgba(148,163,184,0.35)',
        ...(active ? { boxShadow: `0 0 0 1px ${dotColor}44 inset`, background: `${dotColor}14` } : {}),
      }}
    >
      <span
        style={{
          display: 'inline-block',
          width: 6,
          height: 6,
          borderRadius: 999,
          background: active ? dotColor : '#475569',
          marginRight: 6,
          verticalAlign: 'middle',
        }}
      />
      {label}
    </button>
  );
}

export default function MergedAdvancedDeskChrome({
  symbol,
  timeframe,
  showMtfStrip,
  fusionCandles,
  onPageLayoutPatch,
}: Props) {
  const [settingsTick, setSettingsTick] = useState(0);
  useEffect(() => {
    const h = () => setSettingsTick((t) => t + 1);
    window.addEventListener(SETTINGS_CHANGED_EVENT, h);
    return () => window.removeEventListener(SETTINGS_CHANGED_EVENT, h);
  }, []);

  const settings = useMemo(() => loadSettings(), [settingsTick]);
  const zonesOn = !settings.chartBulkHideZones;
  const settleOn = settings.chartTfCloseSettlementLines !== false;
  const focusDeckOn = settings.chartMergedAdvancedFocusDeck !== false;
  const volOn =
    settings.chartVolumeAbsorptionMarkers !== false && settings.chartBoltVolumeConfluence !== false;

  const apply = useCallback((patch: Partial<UserSettings>) => {
    saveSettings({ ...loadSettings(), ...patch });
    setSettingsTick((t) => t + 1);
  }, []);

  const ohlcRow = useMemo(() => {
    const arr = fusionCandles;
    if (!arr?.length) return null;
    const last = arr[arr.length - 1]!;
    const prev = arr.length >= 2 ? arr[arr.length - 2]! : last;
    const o = Number(last.open);
    const h = Number(last.high);
    const l = Number(last.low);
    const c = Number(last.close);
    const pc = Number(prev.close);
    if (![o, h, l, c].every((x) => Number.isFinite(x))) return null;
    const ch = Number.isFinite(pc) && pc !== 0 ? c - pc : 0;
    const pct = Number.isFinite(pc) && pc !== 0 ? (ch / pc) * 100 : 0;
    const up = ch >= 0;
    return { o, h, l, c, ch, pct, up };
  }, [fusionCandles]);

  return (
    <div className="merged-advanced-desk-chrome merged-advanced-desk-chrome--deck">
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <div style={{ minWidth: 0, flex: '1 1 220px', paddingTop: 4 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span className="merged-advanced-desk-chrome__badge">완전판</span>
            <div
              style={{
                fontSize: 18,
                fontWeight: 900,
                color: 'var(--text)',
                letterSpacing: -0.04,
                lineHeight: 1.2,
              }}
            >
              통합 고급 · 작전 차트
            </div>
          </div>
          <div
            style={{
              fontSize: 11,
              color: 'var(--muted)',
              fontWeight: 600,
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'baseline',
              gap: '8px 16px',
            }}
          >
            <span style={{ color: 'var(--text)', fontWeight: 800, opacity: 0.92 }}>
              {symbol} · {timeframe}
            </span>
            {ohlcRow ? (
              <>
                <span
                  style={{
                    fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                    fontSize: 12,
                    fontWeight: 700,
                    color: 'var(--text)',
                    padding: '4px 8px',
                    borderRadius: 8,
                    background: 'color-mix(in srgb, var(--panel2) 88%, transparent)',
                    border: '1px solid var(--border)',
                  }}
                >
                  O {fmtPx(ohlcRow.o)} · H {fmtPx(ohlcRow.h)} · L {fmtPx(ohlcRow.l)} · C {fmtPx(ohlcRow.c)}
                </span>
                <span
                  style={{
                    fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                    fontSize: 13,
                    fontWeight: 900,
                    color: ohlcRow.up ? '#4ade80' : '#f87171',
                  }}
                >
                  {ohlcRow.ch >= 0 ? '+' : ''}
                  {fmtPx(ohlcRow.ch)} ({ohlcRow.pct >= 0 ? '+' : ''}
                  {ohlcRow.pct.toFixed(2)}%)
                </span>
              </>
            ) : (
              <span style={{ color: '#64748b' }}>OHLC · 분석 캔들 로딩 후 표시</span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', justifyContent: 'flex-end' }}>
          {pill(true, '실시간', '#22c55e', () => {}, '시세·분석 갱신')}
          {pill(
            focusDeckOn,
            '집중덱',
            '#f472b6',
            () => apply({ chartMergedAdvancedFocusDeck: !focusDeckOn }),
            focusDeckOn
              ? '밴드·합성·스윙 중심 — 고래·핫존·엔진풀 과밀 억제(기본)'
              : '최강분석급 풀 레이어 병합',
          )}
          {pill(
            settleOn,
            '종가마감',
            '#22c55e',
            () => apply({ chartTfCloseSettlementLines: !settleOn }),
            '15m·1h·4h·일·주·월 종가 마감·안착·실패 가로선',
          )}
          {pill(
            zonesOn,
            '존',
            '#a78bfa',
            () => apply({ chartBulkHideZones: !zonesOn }),
            zonesOn ? '수급·수요/공급 면 표시' : '존·면 일괄 숨김',
          )}
          {pill(
            volOn,
            '거래량',
            '#facc15',
            () =>
              apply({
                chartVolumeAbsorptionMarkers: !volOn,
                chartBoltVolumeConfluence: !volOn,
              }),
            '번개·흡수·볼륨 패널 마커',
          )}
          {pill(
            showMtfStrip,
            '상단 MTF',
            '#2dd4bf',
            () => onPageLayoutPatch({ showMtfStrip: !showMtfStrip }),
            '페이지 상단 MTF 요약 줄(우측 패널과 별도)',
          )}
        </div>
      </div>
    </div>
  );
}
