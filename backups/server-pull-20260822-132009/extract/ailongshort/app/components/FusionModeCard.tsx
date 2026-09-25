'use client';

import { useMemo } from 'react';
import type { AnalyzeResponse, Candle } from '@/types';

export default function FusionModeCard({
  analysis,
  candles,
}: {
  analysis: AnalyzeResponse;
  candles?: Candle[] | null;
}) {
  const summary = useMemo(() => {
    const list = Array.isArray(candles) ? candles : [];
    const tail = list.slice(-20);
    const closes = tail.map((c) => Number(c?.close ?? 0)).filter((n) => Number.isFinite(n));
    const highs = tail.map((c) => Number(c?.high ?? 0)).filter((n) => Number.isFinite(n));
    const lows = tail.map((c) => Number(c?.low ?? 0)).filter((n) => Number.isFinite(n));
    const first = closes[0] ?? 0;
    const last = closes[closes.length - 1] ?? 0;
    const driftPct = first > 0 ? ((last - first) / first) * 100 : 0;
    const hi = highs.length ? Math.max(...highs) : 0;
    const lo = lows.length ? Math.min(...lows) : 0;
    const rangePct = lo > 0 ? ((hi - lo) / lo) * 100 : 0;
    const bias = driftPct > 0.25 ? '상승 우위' : driftPct < -0.25 ? '하락 우위' : '횡보';
    const verdict = String((analysis as any)?.verdict || (analysis as any)?.signal || 'WATCH').toUpperCase();
    const conf = Number((analysis as any)?.confidence ?? 0);
    const fusion =
      verdict === 'LONG' && driftPct >= 0 ? '롱 정렬'
      : verdict === 'SHORT' && driftPct <= 0 ? '숏 정렬'
      : verdict === 'LONG' || verdict === 'SHORT' ? '신호-캔들 불일치'
      : '관망';
    const alignBonus =
      fusion === '롱 정렬' || fusion === '숏 정렬' ? 16
      : fusion === '신호-캔들 불일치' ? -18
      : -8;
    const trendStrength = Math.min(18, Math.abs(driftPct) * 3.2);
    const rangePenalty = rangePct > 10 ? Math.min(14, (rangePct - 10) * 0.9) : 0;
    const score = Math.max(0, Math.min(100, Math.round(conf * 0.7 + alignBonus + trendStrength - rangePenalty)));
    const entry =
      verdict === 'LONG'
        ? `최근 종가 상단 유지 시 분할진입 (${last.toLocaleString(undefined, { maximumFractionDigits: 2 })} 기준)`
        : verdict === 'SHORT'
          ? `최근 종가 하단 유지 시 분할진입 (${last.toLocaleString(undefined, { maximumFractionDigits: 2 })} 기준)`
          : '즉시 진입보다 대기';
    const invalidation =
      verdict === 'LONG'
        ? `무효: 최근 저점(${lo.toLocaleString(undefined, { maximumFractionDigits: 2 })}) 이탈`
        : verdict === 'SHORT'
          ? `무효: 최근 고점(${hi.toLocaleString(undefined, { maximumFractionDigits: 2 })}) 상향 돌파`
          : '무효: 신호 확정 전 추격 진입';
    const action =
      score >= 72
        ? '권장 액션: 계획 진입 가능 (리스크 고정)'
        : score >= 55
          ? '권장 액션: 소량 탐색 진입 + 추가 확인'
          : '권장 액션: 관망 후 재평가';
    return { driftPct, rangePct, bias, verdict, conf, fusion, score, entry, invalidation, action };
  }, [analysis, candles]);

  return (
    <div className="card panel-pad" style={{ marginBottom: 12, border: '1px solid rgba(56,189,248,0.35)' }}>
      <div className="section-title" style={{ marginTop: 0, marginBottom: 8, fontSize: 14 }}>
        융합모드 카드 (캔들 + 브리핑)
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(120px, 1fr))', gap: 8 }}>
        <div className="mini-card">
          <div className="metric-label">브리핑</div>
          <div className="mini-value">{summary.verdict} · {summary.conf.toFixed(0)}%</div>
        </div>
        <div className="mini-card">
          <div className="metric-label">캔들 흐름(20봉)</div>
          <div className="mini-value">{summary.bias} ({summary.driftPct.toFixed(2)}%)</div>
        </div>
        <div className="mini-card">
          <div className="metric-label">변동폭(20봉)</div>
          <div className="mini-value">{summary.rangePct.toFixed(2)}%</div>
        </div>
      </div>
      <div className="mini-card" style={{ marginTop: 8 }}>
        <div className="metric-label">융합 점수</div>
        <div className="mini-value">{summary.score} / 100</div>
      </div>
      <div style={{ marginTop: 8, fontSize: 12, color: '#cbd5e1' }}>
        합성 판정: <strong>{summary.fusion}</strong> · 일치할수록 실행 신뢰도를 높게 보고, 불일치면 진입 전 추가 확인.
      </div>
      <div style={{ marginTop: 6, fontSize: 12, color: '#e2e8f0' }}>
        진입: {summary.entry}
      </div>
      <div style={{ marginTop: 4, fontSize: 12, color: '#fca5a5' }}>
        무효: {summary.invalidation}
      </div>
      <div style={{ marginTop: 4, fontSize: 12, color: '#93c5fd', fontWeight: 700 }}>
        {summary.action}
      </div>
    </div>
  );
}

