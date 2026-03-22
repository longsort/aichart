'use client';

import { memo } from 'react';
import type { AnalyzeResponse } from '@/types';
import ExecutionModeStrip from './ExecutionModeStrip';

type Props = {
  analysis: AnalyzeResponse;
  theme?: 'dark' | 'light';
  isTapMode: boolean;
  swingSeedUsdt: number;
  onSwingSeedChange: (v: number) => void;
  onSwingSeedBlur: () => void;
};

const divider = { borderTop: '1px solid rgba(255,255,255,0.08)', margin: '12px 0', paddingTop: 12 } as const;

function ExecutionBriefingCardInner({
  analysis,
  theme = 'dark',
  isTapMode,
  swingSeedUsdt,
  onSwingSeedChange,
  onSwingSeedBlur,
}: Props) {
  const stp = (analysis as any).swingTapPoint;
  const showSwing = stp && (analysis.verdict === 'LONG' || analysis.verdict === 'SHORT');
  const entryNum = parseFloat(String(analysis.entry ?? ''));
  const stopNum = parseFloat(String(analysis.stopLoss ?? ''));
  const confirmed = (analysis as any).confirmedSignal as { confirmed?: boolean; direction?: 'LONG' | 'SHORT' | null; reasons?: string[] } | undefined;
  const isConfirmed = Boolean(confirmed?.confirmed && confirmed?.direction);
  const showRisk =
    showSwing &&
    (!isTapMode || isConfirmed) &&
    !isNaN(entryNum) &&
    !isNaN(stopNum) &&
    entryNum > 0;
  const seed = Math.max(0, swingSeedUsdt);
  const riskUsdt = seed * 0.05;
  const stopDistPct = showRisk ? Math.abs(entryNum - stopNum) / entryNum * 100 : 0;
  const stopDistDecimal = stopDistPct / 100;
  const positionSize = showRisk && stopDistDecimal > 0 && riskUsdt > 0 ? riskUsdt / stopDistDecimal : 0;
  const leverage = showRisk && riskUsdt > 0 ? positionSize / riskUsdt : 0;

  const buyZones = (analysis as any).buyZones as any[] | undefined;
  const sellZones = (analysis as any).sellZones as any[] | undefined;
  const hasZones = (buyZones?.length ?? 0) > 0 || (sellZones?.length ?? 0) > 0;

  return (
    <div
      className="execution-briefing-card card panel-pad"
      style={{
        padding: '14px 16px',
        border: stp?.active ? '2px solid rgba(34,197,94,0.5)' : '1px solid rgba(255,255,255,0.12)',
        borderRadius: 14,
        background: 'rgba(8,15,25,0.92)',
      }}
    >
      <div className="section-title" style={{ fontSize: '1.05rem', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span>실행 브리핑</span>
        <span className="subtle" style={{ fontSize: '0.75rem', fontWeight: 400 }}>
          타점 · 마켓 · 종가 · Zone · 리스크
        </span>
      </div>

      {/* 결론: 롱/숏/관망 — 5요소 확정 우선 */}
      {(() => {
        const dir = isConfirmed ? (confirmed!.direction!) : (analysis.verdict === 'LONG' || analysis.verdict === 'SHORT' ? analysis.verdict : null);
        const label = dir === 'LONG' ? '롱' : dir === 'SHORT' ? '숏' : '관망';
        const cLong = '#22C55E';
        const cShort = '#EF4444';
        const cWatch = '#ffd666';
        const accent = '#62efe0';
        return (
          <div
            style={{
              padding: '14px 16px',
              marginBottom: 12,
              borderRadius: 12,
              background: dir === 'LONG' ? 'rgba(34,197,94,0.12)' : dir === 'SHORT' ? 'rgba(239,68,68,0.12)' : 'rgba(255,214,102,0.08)',
              border: `2px solid ${dir === 'LONG' ? 'rgba(34,197,94,0.5)' : dir === 'SHORT' ? 'rgba(239,68,68,0.5)' : 'rgba(255,214,102,0.35)'}`,
            }}
          >
            <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginBottom: 6 }}>결론</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span
                style={{
                  fontSize: '1.6rem',
                  fontWeight: 900,
                  color: dir === 'LONG' ? cLong : dir === 'SHORT' ? cShort : cWatch,
                  letterSpacing: '-0.02em',
                }}
              >
                {label.toUpperCase()}
              </span>
              {dir && (
                isConfirmed ? (
                  <span className="badge" style={{ padding: '4px 10px', fontSize: 11, background: 'rgba(34,197,94,0.25)', color: cLong, border: '1px solid rgba(34,197,94,0.4)' }}>
                    5요소 확정
                  </span>
                ) : (
                  <span className="badge" style={{ padding: '4px 10px', fontSize: 11, background: 'rgba(255,214,102,0.2)', color: cWatch, border: '1px solid rgba(255,214,102,0.4)' }}>
                    준비
                  </span>
                )
              )}
              <span style={{ color: '#94a3b8', fontSize: 12 }}>{analysis.symbol} {analysis.timeframe}</span>
              <span style={{ color: accent, fontWeight: 700, fontSize: 13 }}>{analysis.confidence ?? '–'}%</span>
            </div>
            {/* 핵심 요약 — 색상 강조 */}
            <div style={{ marginTop: 12, fontSize: 11, lineHeight: 1.6, color: '#c7d2e0' }}>
              {(analysis as any).summary && (
                <div style={{ marginBottom: 6 }}>
                  <span style={{ color: accent, fontWeight: 600 }}>구조 </span>
                  <span>{String((analysis as any).summary).split('|').slice(0, 2).join(' | ')}</span>
                </div>
              )}
              {(analysis as any).multiTF && ((analysis as any).multiTF.trend1M || (analysis as any).multiTF.htf || (analysis as any).multiTF.ltf) && (
                <div style={{ marginBottom: 6 }}>
                  <span style={{ color: accent, fontWeight: 600 }}>MTF </span>
                  <span>
                    {(analysis as any).multiTF.trend1M && <span className={(analysis as any).multiTF.trend1M === '상승' ? 'c-long' : (analysis as any).multiTF.trend1M === '하락' ? 'c-short' : ''}>1M {(analysis as any).multiTF.trend1M}</span>}
                    {(analysis as any).multiTF.htf && <span> · HTF {(analysis as any).multiTF.htfLabel} {(analysis as any).multiTF.htf}</span>}
                    {(analysis as any).multiTF.ltf && <span> · LTF {(analysis as any).multiTF.ltfLabel} {(analysis as any).multiTF.ltf}</span>}
                  </span>
                </div>
              )}
              {(analysis as any).rsiDivergenceSignal && (
                <div style={{ marginBottom: 6 }}>
                  <span style={{ color: accent, fontWeight: 600 }}>RSI </span>
                  <span>
                    <span className={(analysis as any).rsiDivergenceSignal.verdict === 'LONG' ? 'c-long' : (analysis as any).rsiDivergenceSignal.verdict === 'SHORT' ? 'c-short' : ''}>
                      {(analysis as any).rsiDivergenceSignal.verdict}
                    </span>
                    {' '}L {(analysis as any).rsiDivergenceSignal.longScore ?? '–'} / S {(analysis as any).rsiDivergenceSignal.shortScore ?? '–'}
                  </span>
                </div>
              )}
              {confirmed?.reasons && confirmed.reasons.length > 0 && (
                <div>
                  <span style={{ color: accent, fontWeight: 600 }}>5요소 </span>
                  <span>{confirmed.reasons.join(' · ')}</span>
                </div>
              )}
              {!confirmed?.reasons?.length && ((analysis as any).dailyState || (analysis as any).weeklyState) && (
                <div>
                  <span style={{ color: accent, fontWeight: 600 }}>종가 </span>
                  <span>
                    {(analysis as any).dailyState === 'accepted_above' && <span className="c-long">일봉 위</span>}
                    {(analysis as any).dailyState === 'accepted_below' && <span className="c-short">일봉 아래</span>}
                    {(analysis as any).weeklyState && (
                      <span> · {(analysis as any).weeklyState === 'accepted_above' ? <span className="c-long">주봉 위</span> : (analysis as any).weeklyState === 'accepted_below' ? <span className="c-short">주봉 아래</span> : '주봉 ' + (analysis as any).weeklyState}</span>
                    )}
                  </span>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {((analysis as any)?.engine1M || (analysis as any)?.multiTF?.trend1M) && (() => {
        const trend1MKo = (analysis as any).multiTF?.trend1M ?? ((e: { trend?: string }) => e?.trend === 'bullish' ? '상승' : e?.trend === 'bearish' ? '하락' : '횡보')((analysis as any).engine1M ?? {});
        return (
        <div style={divider}>
          <div className="section-title" style={{ marginBottom: 8, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>1M 캔들 분석</span>
            <span className="subtle" style={{ fontSize: '0.7rem', fontWeight: 400 }}>분·시간·일·주 봉 공통</span>
          </div>
          <div className="mini-grid" style={{ marginBottom: 4 }}>
            <div className="mini-card" style={{ border: '1px solid rgba(98,239,224,0.25)' }}>
              <div className="metric-label">1M 트렌드</div>
              <div
                className={`mini-value ${trend1MKo === '상승' ? 'c-long' : trend1MKo === '하락' ? 'c-short' : ''}`}
                style={{ fontWeight: 700, fontSize: 13 }}
              >
                {trend1MKo || '–'}
              </div>
            </div>
            <div className="mini-card">
              <div className="metric-label">BOS</div>
              <div className="metric-value" style={{ fontWeight: 600 }}>
                {Array.isArray((analysis as any).engine1M?.bos) ? (analysis as any).engine1M.bos.length : '–'}
              </div>
            </div>
            <div className="mini-card">
              <div className="metric-label">CHOCH</div>
              <div className="metric-value" style={{ fontWeight: 600 }}>
                {Array.isArray((analysis as any).engine1M?.choch) ? (analysis as any).engine1M.choch.length : '–'}
              </div>
            </div>
            <div className="mini-card">
              <div className="metric-label">FVG</div>
              <div className="metric-value" style={{ fontWeight: 600 }}>
                {Array.isArray((analysis as any).engine1M?.fvg) ? (analysis as any).engine1M.fvg.length : '–'}
              </div>
            </div>
            <div className="mini-card">
              <div className="metric-label">패턴</div>
              <div className="metric-value" style={{ fontWeight: 600 }}>
                {Array.isArray((analysis as any).engine1M?.patterns) ? (analysis as any).engine1M.patterns.length : '–'}
              </div>
            </div>
            <div className="mini-card">
              <div className="metric-label">스윕</div>
              <div className="metric-value" style={{ fontWeight: 600 }}>
                {Array.isArray((analysis as any).engine1M?.sweeps) ? (analysis as any).engine1M.sweeps.length : '–'}
              </div>
            </div>
            <div className="mini-card">
              <div className="metric-label">1M 정렬</div>
              <div
                className={`mini-value ${(() => {
                  const v = analysis.verdict;
                  if (!trend1MKo || v === 'WATCH') return '';
                  const ok = (trend1MKo === '상승' && v === 'LONG') || (trend1MKo === '하락' && v === 'SHORT');
                  return ok ? 'c-long' : 'c-short';
                })()}`}
                style={{ fontWeight: 700 }}
              >
                {(() => {
                  const v = analysis.verdict;
                  if (!trend1MKo || v === 'WATCH') return '–';
                  return (trend1MKo === '상승' && v === 'LONG') || (trend1MKo === '하락' && v === 'SHORT') ? '일치' : '불일치';
                })()}
              </div>
            </div>
          </div>
          {(analysis as any).monthlyCloseLevel != null && (
            <div className="subtle" style={{ fontSize: '0.72rem', marginTop: 4 }}>
              월봉 종가 {(typeof (analysis as any).monthlyCloseLevel === 'number' ? (analysis as any).monthlyCloseLevel.toLocaleString() : (analysis as any).monthlyCloseLevel)}
              {(analysis as any).monthlyState ? ` · ${(analysis as any).monthlyState === 'accepted_above' ? '위 안착' : (analysis as any).monthlyState === 'accepted_below' ? '아래' : (analysis as any).monthlyState === 'reclaiming' ? '재진입' : (analysis as any).monthlyState}` : ''}
            </div>
          )}
        </div>
        );
      })()}

      {showSwing && (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ fontWeight: 700, fontSize: 13 }}>스윙 90% 타점</span>
            {stp.active ? (
              <span className={stp.direction === 'LONG' ? 'c-long' : 'c-short'} style={{ fontWeight: 700 }}>
                {stp.direction === 'LONG' ? '롱' : '숏'} · 신뢰도 {stp.confidence}%
              </span>
            ) : (
              <span className="subtle" style={{ fontSize: 12 }}>미충족 (현재 {stp.confidence}%)</span>
            )}
            {isTapMode && (
              <span className={isConfirmed ? 'c-long' : 'c-watch'} style={{ fontWeight: 700 }}>
                {isConfirmed ? '5요소 확정' : '확정 대기'}
              </span>
            )}
          </div>
          <div className="mini-grid" style={{ marginBottom: 4 }}>
            <div className="mini-card">
              <div className="metric-label">방향</div>
              <div className={`mini-value ${analysis.verdict === 'LONG' ? 'c-long' : 'c-short'}`} style={{ fontWeight: 700 }}>
                {analysis.verdict === 'LONG' ? '롱' : '숏'}
              </div>
            </div>
            <div className="mini-card">
              <div className="metric-label">타점(진입)</div>
              <div className="metric-value" style={{ fontWeight: 600 }}>{analysis.entry ?? '–'}</div>
            </div>
            <div className="mini-card">
              <div className="metric-label">손절</div>
              <div className="metric-value" style={{ color: '#EF4444' }}>{analysis.stopLoss ?? '–'}</div>
            </div>
            <div className="mini-card">
              <div className="metric-label">수익(목표)</div>
              <div className="metric-value" style={{ color: '#22C55E' }}>{(analysis.targets ?? []).slice(0, 3).join(' · ') || '–'}</div>
            </div>
          </div>
          {stp.reasons?.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
              {stp.reasons.map((r: string, i: number) => (
                <span key={i} className="badge" style={{ fontSize: '0.72rem', padding: '2px 8px' }}>{r}</span>
              ))}
            </div>
          )}
          {!stp.active && stp.missing?.length > 0 && (
            <div className="subtle" style={{ fontSize: '0.78rem', marginBottom: 4 }}>부족: {stp.missing.join(' · ')}</div>
          )}
          <div className="subtle" style={{ fontSize: '0.72rem' }}>차트 우측: 진입·손절·목표 라인</div>
        </>
      )}

      <div style={divider}>
        <ExecutionModeStrip analysis={analysis} theme={theme} />
      </div>

      {showRisk && (
        <div style={divider}>
          <div className="section-title" style={{ marginBottom: 8, fontSize: '0.95rem' }}>리스크 · 레버리지</div>
          <div className="subtle" style={{ fontSize: '0.72rem', marginBottom: 8 }}>
            손절은 진입 반대 방향 리스크 구간. (0.7:1 진입 근거 + 스탑 + 목표)
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
            <label className="metric-label" style={{ margin: 0 }}>시드(USDT)</label>
            <input
              type="number"
              min={0}
              step={100}
              value={swingSeedUsdt}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (!isNaN(v) && v >= 0) onSwingSeedChange(v);
              }}
              onBlur={onSwingSeedBlur}
              style={{ width: 100, padding: '6px 8px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.2)', color: 'inherit', fontSize: '0.9rem' }}
              aria-label="시드 금액 USDT"
            />
          </div>
          <div className="mini-grid" style={{ marginBottom: 6 }}>
            <div className="mini-card">
              <div className="metric-label">리스크 (5%)</div>
              <div className="metric-value">{riskUsdt.toLocaleString(undefined, { maximumFractionDigits: 0 })} USDT</div>
            </div>
            <div className="mini-card">
              <div className="metric-label">손절 거리</div>
              <div className="metric-value">{stopDistPct.toFixed(2)}%</div>
            </div>
            <div className="mini-card">
              <div className="metric-label">포지션 규모</div>
              <div className="metric-value" style={{ fontWeight: 600 }}>{positionSize.toLocaleString(undefined, { maximumFractionDigits: 2 })} USDT</div>
            </div>
            <div className="mini-card">
              <div className="metric-label">최대 레버리지</div>
              <div className="metric-value" style={{ fontWeight: 600 }}>{leverage.toFixed(2)}x</div>
            </div>
          </div>
        </div>
      )}

      {hasZones && (
        <div style={divider}>
          <div className="section-title" style={{ marginBottom: 6, fontSize: '0.95rem' }}>Zone · 확률</div>
          <div className="subtle" style={{ fontSize: '0.72rem', marginBottom: 8 }}>호가·체결 기반 (무작위 확률 아님)</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {buyZones?.map((z, i) => (
              <div key={`b-${i}`} className="mini-card" style={{ padding: '8px 10px', border: '1px solid rgba(34,197,94,0.35)', borderRadius: 8 }}>
                <div style={{ fontWeight: 700, color: '#22C55E', fontSize: 12, marginBottom: 4 }}>
                  매수 {i + 1} · {z.low?.toLocaleString(undefined, { maximumFractionDigits: 2 })} ~ {z.high?.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </div>
                <div style={{ fontSize: 11, display: 'flex', flexWrap: 'wrap', gap: '6px 12px' }}>
                  <span>체결 매수 {(z.executedBuyUsdt ?? 0).toLocaleString()} / 매도 {(z.executedSellUsdt ?? 0).toLocaleString()} USDT</span>
                  <span>호가 {(z.bidLiquidityUsdt ?? 0).toLocaleString()} / {(z.askLiquidityUsdt ?? 0).toLocaleString()}</span>
                  {z.holdProbability != null && <span className="badge" style={{ padding: '1px 6px', fontSize: 10 }}>안착 {z.holdProbability}%</span>}
                  {z.closeSettleProbability != null && <span className="badge" style={{ padding: '1px 6px', fontSize: 10 }}>종가 {z.closeSettleProbability}%</span>}
                </div>
              </div>
            ))}
            {sellZones?.map((z, i) => (
              <div key={`s-${i}`} className="mini-card" style={{ padding: '8px 10px', border: '1px solid rgba(239,68,68,0.35)', borderRadius: 8 }}>
                <div style={{ fontWeight: 700, color: '#EF4444', fontSize: 12, marginBottom: 4 }}>
                  매도 {i + 1} · {z.low?.toLocaleString(undefined, { maximumFractionDigits: 2 })} ~ {z.high?.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </div>
                <div style={{ fontSize: 11, display: 'flex', flexWrap: 'wrap', gap: '6px 12px' }}>
                  <span>체결 매수 {(z.executedBuyUsdt ?? 0).toLocaleString()} / 매도 {(z.executedSellUsdt ?? 0).toLocaleString()} USDT</span>
                  {z.breakProbability != null && <span className="badge" style={{ padding: '1px 6px', fontSize: 10 }}>돌파 {z.breakProbability}%</span>}
                  {z.resistanceProbability != null && <span className="badge" style={{ padding: '1px 6px', fontSize: 10 }}>저항 {z.resistanceProbability}%</span>}
                  {z.closeSettleProbability != null && <span className="badge" style={{ padding: '1px 6px', fontSize: 10 }}>종가 {z.closeSettleProbability}%</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}

export default memo(ExecutionBriefingCardInner);
