'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { defaultSettings, loadSettings } from '@/lib/settings';
import { SETTINGS_CHANGED_EVENT, useSettingsChangeTick } from '@/lib/useSettingsChangeTick';
import { appendZoneTouch, getZoneTouchStats, type ZoneTouchContext } from '@/lib/zoneTouchLog';

type EdgeSnap = {
  key: string;
  price: number;
  distPct: number | null;
  buyPressure: number;
  sellPressure: number;
  tradeCount: number;
  biasScore: number;
  biasLabel: string;
};

type ZoneReactionPayload = {
  ok: boolean;
  tape?: {
    buyPressure: number;
    sellPressure: number;
    tradeCount: number;
    biasScore: number;
    biasLabel: string;
  };
  atReference?: {
    buyPressure: number;
    sellPressure: number;
    tradeCount: number;
    biasScore: number;
    biasLabel: string;
  } | null;
  referencePrice?: number | null;
  proximityPct?: number;
  currentPrice?: number;
  oiState?: string;
  fundingState?: string;
  orderbookImbalance?: number;
  edgeSnaps?: EdgeSnap[];
  nearestEdge?: {
    key: string;
    distPct: number;
    price: number;
    biasLabel: string;
    biasScore: number;
  } | null;
  error?: string;
};

function dominantFromBuyPressure(bp: number): 'buy' | 'sell' | 'neutral' {
  if (bp > 0.55) return 'buy';
  if (bp < 0.45) return 'sell';
  return 'neutral';
}

function nearestKeyToContext(key: string): ZoneTouchContext | null {
  switch (key) {
    case 'inst-lower':
      return 'inst-lower';
    case 'inst-upper':
      return 'inst-upper';
    case 'cp-top':
      return 'cp-upper';
    case 'cp-bottom':
      return 'cp-lower';
    default:
      return null;
  }
}

const EDGE_LABEL: Record<string, string> = {
  'inst-lower': '기관 하단(지지)',
  'inst-upper': '기관 상단(저항)',
  'cp-top': 'CP 채널 상단',
  'cp-bottom': 'CP 채널 하단',
};

type Props = {
  symbol: string;
  timeframe: string;
  referencePrice: number | null;
  /** 기관 SuperTrend 하·상 — `getLastInstitutionalBandEdges` */
  institutionalEdges: { lower: number; upper: number } | null;
  /** Chart Prime 채널 선 가격 — 오버레이에서 추출 */
  chartPrimeEdges: { top: number; bottom: number; center: number } | null;
};

export default function ZoneReactionCard({
  symbol,
  timeframe,
  referencePrice,
  institutionalEdges,
  chartPrimeEdges,
}: Props) {
  const settingsTick = useSettingsChangeTick();
  const [enabled, setEnabled] = useState(false);
  const [data, setData] = useState<ZoneReactionPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [stats24h, setStats24h] = useState(() =>
    typeof window !== 'undefined'
      ? getZoneTouchStats(symbol, timeframe, 24 * 60 * 60 * 1000)
      : { windowMs: 0, total: 0, buyDominant: 0, sellDominant: 0, neutral: 0 }
  );

  const pct = useMemo(() => {
    if (typeof window === 'undefined') return defaultSettings.zoneReactionProximityPct;
    const v = loadSettings().zoneReactionProximityPct;
    return typeof v === 'number' && Number.isFinite(v) ? v : defaultSettings.zoneReactionProximityPct;
  }, [settingsTick]);

  const fetchData = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setErr(null);
    try {
      const params = new URLSearchParams({ symbol, timeframe, pct: String(pct) });
      if (referencePrice != null && Number.isFinite(referencePrice) && referencePrice > 0) {
        params.set('price', String(referencePrice));
      }
      if (institutionalEdges) {
        params.set('instLo', String(institutionalEdges.lower));
        params.set('instHi', String(institutionalEdges.upper));
      }
      if (chartPrimeEdges) {
        params.set('cpTop', String(chartPrimeEdges.top));
        params.set('cpBot', String(chartPrimeEdges.bottom));
      }
      const res = await fetch(`/api/zone-reaction?${params}`, { cache: 'no-store', credentials: 'same-origin' });
      const j = (await res.json()) as ZoneReactionPayload;
      if (!res.ok || !j.ok) {
        setErr(j.error || '불러오기 실패');
        setData(null);
        return;
      }
      setData(j);

      const logOn = loadSettings().zoneReactionTouchLogEnabled !== false;
      if (logOn && j.nearestEdge && j.edgeSnaps?.length) {
        const maxDist = pct * 4;
        if (j.nearestEdge.distPct <= maxDist) {
          const snap = j.edgeSnaps.find((s) => s.key === j.nearestEdge!.key);
          if (snap && snap.tradeCount > 0) {
            const ctx = nearestKeyToContext(j.nearestEdge.key);
            if (ctx) {
              appendZoneTouch({
                ts: Date.now(),
                symbol,
                timeframe,
                context: ctx,
                buyPressure: snap.buyPressure,
                dominant: dominantFromBuyPressure(snap.buyPressure),
              });
              setStats24h(getZoneTouchStats(symbol, timeframe, 24 * 60 * 60 * 1000));
            }
          }
        }
      }
    } catch {
      setErr('네트워크 오류');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [enabled, symbol, timeframe, referencePrice, pct, institutionalEdges, chartPrimeEdges]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const on = () => setEnabled(loadSettings().zoneReactionCardEnabled === true);
    on();
    window.addEventListener(SETTINGS_CHANGED_EVENT, on);
    return () => window.removeEventListener(SETTINGS_CHANGED_EVENT, on);
  }, [settingsTick]);

  useEffect(() => {
    if (!enabled) return;
    void fetchData();
    const t = window.setInterval(() => void fetchData(), 12_000);
    return () => window.clearInterval(t);
  }, [enabled, fetchData]);

  useEffect(() => {
    if (typeof window === 'undefined' || !enabled) return;
    setStats24h(getZoneTouchStats(symbol, timeframe, 24 * 60 * 60 * 1000));
  }, [enabled, symbol, timeframe, data?.nearestEdge?.key]);

  if (!enabled) return null;

  const touchLogOn = typeof window !== 'undefined' && loadSettings().zoneReactionTouchLogEnabled !== false;

  const tape = data?.tape;
  const near = data?.atReference;
  const nearest = data?.nearestEdge;
  const snaps = data?.edgeSnaps ?? [];

  return (
    <div
      className="card panel-pad"
      style={{
        marginTop: 12,
        border: '1px solid rgba(98,239,224,0.22)',
        background: 'rgba(2,6,23,0.55)',
      }}
    >
      <div className="space-between" style={{ alignItems: 'flex-start', gap: 8, marginBottom: 10 }}>
        <div>
          <div className="section-title" style={{ fontSize: 14 }}>
            존 리액션 · 체결 요약
          </div>
          <div className="subtle" style={{ marginTop: 4, fontSize: 11, lineHeight: 1.45 }}>
            종가·기관 밴드·CP 채널(분석 오버레이) 대비 거리가 가까울 때 해당 가격대 체결을 집계합니다. 참고용이며 투자 권유가 아닙니다.
          </div>
        </div>
        <button type="button" className="tool-chip tool-chip-button" style={{ fontSize: 11 }} onClick={() => void fetchData()} disabled={loading}>
          {loading ? '갱신…' : '새로고침'}
        </button>
      </div>

      {touchLogOn && (
        <div
          style={{
            marginBottom: 10,
            fontSize: 11,
            color: '#94a3b8',
            padding: '8px 10px',
            borderRadius: 8,
            background: 'rgba(15,23,42,0.75)',
            border: '1px solid rgba(148,163,184,0.2)',
          }}
        >
          <strong style={{ color: '#cbd5e1' }}>24h 근접 기록(로컬)</strong> · 총 {stats24h.total}회 — 매수우세 {stats24h.buyDominant} / 매도우세 {stats24h.sellDominant} / 중립 {stats24h.neutral}
          <span style={{ display: 'block', marginTop: 4, fontSize: 10, color: '#64748b' }}>
            가장 가까운 밴드(거리 ≤ 근접폭×4)일 때만 스냅샷 저장됩니다. 차트 설정에서 끌 수 있습니다.
          </span>
        </div>
      )}

      {err && <div style={{ fontSize: 12, color: '#fca5a5', marginBottom: 8 }}>{err}</div>}

      {!data && !err && loading && <div className="subtle" style={{ fontSize: 12 }}>불러오는 중…</div>}

      {nearest && (
        <div
          style={{
            marginBottom: 10,
            padding: '10px 12px',
            borderRadius: 8,
            background: 'rgba(98,239,224,0.08)',
            border: '1px solid rgba(98,239,224,0.35)',
            fontSize: 12,
            color: '#e2e8f0',
          }}
        >
          <span style={{ color: '#62efe0', fontWeight: 700 }}>가장 가까운 레벨</span>: {EDGE_LABEL[nearest.key] ?? nearest.key} · 거리{' '}
          {(nearest.distPct * 100).toFixed(3)}% · 체결 요약 {nearest.biasLabel} (점수 {nearest.biasScore})
        </div>
      )}

      {tape && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
          <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(15,23,42,0.9)', border: '1px solid rgba(148,163,184,0.2)' }}>
            <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 4 }}>최근 테이프(전체)</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#e2e8f0' }}>{tape.biasLabel}</div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
              점수 {tape.biasScore} · 매수 {(tape.buyPressure * 100).toFixed(0)}% / 매도 {(tape.sellPressure * 100).toFixed(0)}% · 체결 {tape.tradeCount}건
            </div>
          </div>
          {near && near.tradeCount > 0 && (
            <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(15,23,42,0.9)', border: '1px solid rgba(98,239,224,0.25)' }}>
              <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 4 }}>
                기준가(종가) ±{(pct * 100).toFixed(2)}%
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#62efe0' }}>{near.biasLabel}</div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                점수 {near.biasScore} · 매수 {(near.buyPressure * 100).toFixed(0)}% / 매도 {(near.sellPressure * 100).toFixed(0)}% · 체결 {near.tradeCount}건
              </div>
            </div>
          )}
        </div>
      )}

      {snaps.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>밴드별 체결(±{(pct * 100).toFixed(2)}%)</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {snaps.map((s) => (
              <div
                key={s.key}
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 8,
                  alignItems: 'center',
                  fontSize: 11,
                  padding: '6px 10px',
                  borderRadius: 6,
                  background: nearest?.key === s.key ? 'rgba(98,239,224,0.12)' : 'rgba(15,23,42,0.65)',
                  border: nearest?.key === s.key ? '1px solid rgba(98,239,224,0.35)' : '1px solid rgba(148,163,184,0.15)',
                }}
              >
                <span style={{ color: '#cbd5e1', minWidth: 100 }}>{EDGE_LABEL[s.key] ?? s.key}</span>
                <span style={{ color: '#64748b' }}>
                  {s.distPct != null ? `거리 ${(s.distPct * 100).toFixed(3)}%` : '—'}
                </span>
                <span style={{ color: s.tradeCount > 0 ? '#e2e8f0' : '#64748b' }}>
                  {s.biasLabel} · {s.tradeCount}건
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {data && (
        <div style={{ marginTop: 10, fontSize: 10, color: '#64748b', display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          {data.oiState != null && <span>OI: {data.oiState}</span>}
          {data.fundingState != null && <span>펀딩: {data.fundingState}</span>}
          {data.orderbookImbalance != null && Number.isFinite(data.orderbookImbalance) && (
            <span>호가 불균형: {(data.orderbookImbalance * 100).toFixed(1)}%</span>
          )}
          {data.currentPrice != null && data.currentPrice > 0 && (
            <span>참고 현재가: {data.currentPrice.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}</span>
          )}
        </div>
      )}
    </div>
  );
}
