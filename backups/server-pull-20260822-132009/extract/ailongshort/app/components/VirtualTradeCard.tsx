'use client';

import { memo, useState, useEffect, useCallback } from 'react';
import {
  getVirtualTrades,
  getAllOpenPositions,
  getFailedSignals,
  computePositionSizeUsdt,
  computeLeverageFromRisk,
  type VirtualTrade,
} from '@/lib/virtualTradeStore';

type Props = {
  seedUsdt: number;
  onSeedChange: (v: number) => void;
  onSeedBlur?: () => void;
  enabled: boolean;
  onEnabledChange: (v: boolean) => void;
  symbols: string[];
  onSymbolsChange: (v: string[]) => void;
  timeframes: string[];
  onTimeframesChange: (v: string[]) => void;
  targetProfitPct: number;
  onTargetProfitPctChange: (v: number) => void;
  tpSlMode: 'auto' | 'manual';
  onTpSlModeChange: (v: 'auto' | 'manual') => void;
  manualStopPct: number;
  onManualStopPctChange: (v: number) => void;
  manualTp1Pct: number;
  onManualTp1PctChange: (v: number) => void;
  manualTp2Pct: number;
  onManualTp2PctChange: (v: number) => void;
  manualTp3Pct: number;
  onManualTp3PctChange: (v: number) => void;
  refreshTrigger?: number;
};

const divider = { borderTop: '1px solid rgba(255,255,255,0.08)', margin: '12px 0', paddingTop: 12 } as const;

function VirtualTradeCardInner({
  seedUsdt,
  onSeedChange,
  onSeedBlur,
  enabled,
  onEnabledChange,
  symbols,
  onSymbolsChange,
  timeframes,
  onTimeframesChange,
  targetProfitPct,
  onTargetProfitPctChange,
  tpSlMode,
  onTpSlModeChange,
  manualStopPct,
  onManualStopPctChange,
  manualTp1Pct,
  onManualTp1PctChange,
  manualTp2Pct,
  onManualTp2PctChange,
  manualTp3Pct,
  onManualTp3PctChange,
  refreshTrigger,
}: Props) {
  const [allTrades, setAllTrades] = useState<VirtualTrade[]>([]);
  const [trades, setTrades] = useState<VirtualTrade[]>([]);
  const [openPositions, setOpenPositions] = useState<VirtualTrade[]>([]);
  const [previewStopDistPct, setPreviewStopDistPct] = useState(0.88);

  const refresh = useCallback(() => {
    const list = getVirtualTrades();
    setAllTrades(list);
    setTrades(list.filter(t => t.status !== 'open'));
    setOpenPositions(getAllOpenPositions());
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [refresh, refreshTrigger]);

  const allClosed = trades;
  const inScope = (t: VirtualTrade) => symbols.includes(t.symbol) && timeframes.includes(t.timeframe);
  const scopedClosed = allClosed.filter(inScope);
  const recentEntries = [...allTrades]
    .filter(inScope)
    .sort((a, b) => b.entryTime - a.entryTime)
    .slice(0, 12);
  const activeTfOpenPositions = openPositions.filter(p => timeframes.includes(p.timeframe));
  const otherTfOpenPositions = openPositions.filter(p => !timeframes.includes(p.timeframe));
  const closed = scopedClosed.slice(-30).reverse();
  const wins = scopedClosed.filter(t => (t.pnlPct ?? 0) > 0);
  const losses = scopedClosed.filter(t => (t.pnlPct ?? 0) <= 0);
  const totalPnl = scopedClosed.reduce((s, t) => s + (t.pnlPct ?? 0), 0);
  const winRate = scopedClosed.length ? (wins.length / scopedClosed.length) * 100 : 0;
  const totalPnlUsdt = scopedClosed.reduce((s, t) => {
    const size = t.positionSizeUsdt;
    const pct = t.pnlPct ?? 0;
    return s + (size != null && size > 0 ? size * (pct / 100) : 0);
  }, 0);
  const balance = seedUsdt + totalPnlUsdt;
  const riskAmount = seedUsdt * 0.05;
  const previewEntry = 100;
  const previewStop = previewEntry * (1 - Math.max(0.01, previewStopDistPct) / 100);
  const previewPositionSize = computePositionSizeUsdt(seedUsdt, previewEntry, previewStop);
  const previewLeverage = computeLeverageFromRisk(seedUsdt, previewEntry, previewStop);
  const pnlUsdtList = closed.map(t => {
    const size = t.positionSizeUsdt;
    const pct = t.pnlPct ?? 0;
    return size != null && size > 0 ? size * (pct / 100) : null;
  });

  const [symbolsInput, setSymbolsInput] = useState(symbols.join(', '));
  useEffect(() => {
    setSymbolsInput(symbols.join(', '));
  }, [symbols.join(',')]);
  const handleSymbolsBlur = () => {
    const parsed = symbolsInput
      .split(/[,;\s]+/)
      .map(s => s.trim().toUpperCase())
      .filter(Boolean);
    onSymbolsChange(parsed.length > 0 ? [...new Set(parsed)] : ['BTCUSDT']);
  };
  const tfOptions = ['1m', '3m', '5m', '15m', '1h', '4h', '1d', '1w', '1M'];
  const toggleTf = (tf: string) => {
    const has = timeframes.includes(tf);
    const next = has ? timeframes.filter(x => x !== tf) : [...timeframes, tf];
    onTimeframesChange(next.length > 0 ? next : ['1m']);
  };

  return (
    <div
      className="card panel-pad"
      style={{
        padding: '14px 16px',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 14,
        background: 'rgba(8,15,25,0.92)',
      }}
    >
      <div className="section-title" style={{ fontSize: '1rem', marginBottom: 10 }}>
        가상매매
      </div>
      <div className="subtle" style={{ fontSize: '0.72rem', marginBottom: 10 }}>
        백그라운드에서 선택한 TF의 L/S 다이버전스 신호대로 자동 진입
      </div>

      <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          className="tool-chip tool-chip-button"
          onClick={() => {
            onTimeframesChange(['1m']);
            onTpSlModeChange('auto');
            onEnabledChange(true);
          }}
          style={{
            padding: '6px 12px',
            border: '1px solid rgba(34,197,94,0.55)',
            color: '#22C55E',
            fontWeight: 700,
          }}
          title="1분봉 기준 자동매매 시작"
        >
          시작 (1분 기준)
        </button>
        <button
          type="button"
          className="tool-chip tool-chip-button"
          onClick={() => onEnabledChange(false)}
          style={{
            padding: '6px 12px',
            border: '1px solid rgba(239,68,68,0.55)',
            color: '#EF4444',
            fontWeight: 700,
          }}
          title="가상매매 중지"
        >
          종료
        </button>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
          <input
            type="checkbox"
            checked={enabled}
            onChange={e => onEnabledChange(e.target.checked)}
          />
          자동매매 사용
        </label>
        <span style={{ fontSize: 11, color: enabled ? '#22C55E' : '#94a3b8', fontWeight: 700 }}>
          상태: {enabled ? '실행 중' : '중지'}
        </span>
      </div>

      <div style={{ marginBottom: 12 }}>
        <div className="mini-grid" style={{ marginBottom: 8 }}>
          <div className="mini-card">
            <div className="metric-label">현재 모드</div>
            <div className="mini-value" style={{ color: enabled ? '#22C55E' : '#94a3b8' }}>{enabled ? '자동매매 실행' : '대기'}</div>
          </div>
          <div className="mini-card">
            <div className="metric-label">신호 소스</div>
            <div className="metric-value">차트 L/S 신호</div>
          </div>
          <div className="mini-card">
            <div className="metric-label">TP/SL 모드</div>
            <div className="metric-value">{tpSlMode === 'auto' ? '자동(신호)' : '수동(사용자)'}</div>
          </div>
          <div className="mini-card">
            <div className="metric-label">진입 조건</div>
            <div className="metric-value">안착확인 + L/S 신호</div>
          </div>
        </div>
        <label className="metric-label" style={{ display: 'block', marginBottom: 4 }}>
          추적 심볼 (쉼표 구분)
        </label>
        <input
          type="text"
          value={symbolsInput}
          onChange={e => setSymbolsInput(e.target.value)}
          onBlur={handleSymbolsBlur}
          placeholder="BTCUSDT, ETHUSDT"
          style={{
            width: '100%',
            padding: '8px 10px',
            borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.2)',
            background: 'rgba(0,0,0,0.3)',
            color: 'inherit',
            fontSize: 14,
          }}
        />
        <div className="subtle" style={{ fontSize: '0.68rem', marginTop: 4 }}>
          TF: {timeframes.join(', ')}
        </div>
      </div>
      <div style={{ marginBottom: 12 }}>
        <div className="subtle" style={{ fontSize: '0.68rem', marginBottom: 6 }}>
          선택된 TF에만 신규 진입합니다.
        </div>
        <label className="metric-label" style={{ display: 'block', marginBottom: 6 }}>
          매매 타임프레임 선택
        </label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {tfOptions.map(tf => {
            const active = timeframes.includes(tf);
            return (
              <button
                key={tf}
                type="button"
                className={`tool-chip tool-chip-button ${active ? 'tool-chip-active' : ''}`}
                onClick={() => toggleTf(tf)}
                style={{
                  padding: '4px 10px',
                  border: active ? '1px solid #62efe0' : '1px solid rgba(255,255,255,0.2)',
                  color: active ? '#62efe0' : '#cbd5e1',
                }}
              >
                {tf}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label className="metric-label" style={{ display: 'block', marginBottom: 6 }}>
          TP/SL 적용 방식
        </label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className={`tool-chip tool-chip-button ${tpSlMode === 'auto' ? 'tool-chip-active' : ''}`}
            onClick={() => onTpSlModeChange('auto')}
            style={{ border: tpSlMode === 'auto' ? '1px solid #62efe0' : '1px solid rgba(255,255,255,0.2)' }}
          >
            자동(신호 기준)
          </button>
          <button
            type="button"
            className={`tool-chip tool-chip-button ${tpSlMode === 'manual' ? 'tool-chip-active' : ''}`}
            onClick={() => onTpSlModeChange('manual')}
            style={{ border: tpSlMode === 'manual' ? '1px solid #62efe0' : '1px solid rgba(255,255,255,0.2)' }}
          >
            수동(사용자 지정)
          </button>
        </div>
        {tpSlMode === 'manual' && (
          <div className="mini-grid" style={{ marginTop: 8 }}>
            <div className="mini-card">
              <div className="metric-label">손절 %</div>
              <input
                type="number"
                min={0.1}
                step={0.01}
                value={manualStopPct}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (!isNaN(v)) onManualStopPctChange(Math.max(0.1, v));
                }}
                style={{ width: '100%', marginTop: 4, fontSize: 12, background: 'transparent', color: 'inherit', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 6, padding: '4px 6px' }}
              />
            </div>
            <div className="mini-card">
              <div className="metric-label">TP1 %</div>
              <input
                type="number"
                min={0.1}
                step={0.01}
                value={manualTp1Pct}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (!isNaN(v)) onManualTp1PctChange(Math.max(0.1, v));
                }}
                style={{ width: '100%', marginTop: 4, fontSize: 12, background: 'transparent', color: 'inherit', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 6, padding: '4px 6px' }}
              />
            </div>
            <div className="mini-card">
              <div className="metric-label">TP2 %</div>
              <input
                type="number"
                min={0.1}
                step={0.01}
                value={manualTp2Pct}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (!isNaN(v)) onManualTp2PctChange(Math.max(0.1, v));
                }}
                style={{ width: '100%', marginTop: 4, fontSize: 12, background: 'transparent', color: 'inherit', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 6, padding: '4px 6px' }}
              />
            </div>
            <div className="mini-card">
              <div className="metric-label">TP3 %</div>
              <input
                type="number"
                min={0.1}
                step={0.01}
                value={manualTp3Pct}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (!isNaN(v)) onManualTp3PctChange(Math.max(0.1, v));
                }}
                style={{ width: '100%', marginTop: 4, fontSize: 12, background: 'transparent', color: 'inherit', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 6, padding: '4px 6px' }}
              />
            </div>
          </div>
        )}
      </div>
      <div style={{ marginBottom: 12 }}>
        <label className="metric-label" style={{ display: 'block', marginBottom: 4 }}>
          시드 (USDT)
        </label>
        <input
          type="number"
          min={1}
          step={100}
          value={seedUsdt}
          onChange={e => {
            const v = parseFloat(e.target.value);
            if (!isNaN(v) && v > 0) onSeedChange(v);
          }}
          onBlur={onSeedBlur}
          style={{
            width: '100%',
            padding: '8px 10px',
            borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.2)',
            background: 'rgba(0,0,0,0.3)',
            color: 'inherit',
            fontSize: 14,
          }}
        />
        <div className="subtle" style={{ fontSize: '0.7rem', marginTop: 4 }}>
          현재 잔고:{' '}
          <strong
            style={{
              color: balance >= seedUsdt ? '#22C55E' : balance < seedUsdt ? '#EF4444' : '#e2e8f0',
            }}
          >
            {balance.toLocaleString(undefined, { minimumFractionDigits: 2 })} USDT
          </strong>
          {totalPnlUsdt !== 0 && (
            <span style={{ marginLeft: 6, color: totalPnlUsdt >= 0 ? '#22C55E' : '#EF4444' }}>
              ({totalPnlUsdt >= 0 ? '+' : ''}
              {totalPnlUsdt.toFixed(2)} USDT)
            </span>
          )}
        </div>
      </div>
      <div style={{ marginBottom: 12 }}>
        <label className="metric-label" style={{ display: 'block', marginBottom: 4 }}>
          계산 미리보기 - 손절폭 (%)
        </label>
        <input
          type="number"
          min={0.1}
          max={20}
          step={0.01}
          value={previewStopDistPct}
          onChange={e => {
            const v = parseFloat(e.target.value);
            if (!isNaN(v)) setPreviewStopDistPct(Math.max(0.1, Math.min(20, v)));
          }}
          style={{
            width: '100%',
            padding: '8px 10px',
            borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.2)',
            background: 'rgba(0,0,0,0.3)',
            color: 'inherit',
            fontSize: 14,
          }}
        />
        <div className="mini-grid" style={{ marginTop: 8 }}>
          <div className="mini-card">
            <div className="metric-label">리스크 금액</div>
            <div className="metric-value">{riskAmount.toFixed(2)} U</div>
          </div>
          <div className="mini-card">
            <div className="metric-label">포지션 규모</div>
            <div className="metric-value">{previewPositionSize.toFixed(2)} U</div>
          </div>
          <div className="mini-card">
            <div className="metric-label">자동 레버리지</div>
            <div className="mini-value">{previewLeverage.toFixed(2)}x</div>
          </div>
          <div className="mini-card">
            <div className="metric-label">계산식</div>
            <div className="metric-value" style={{ fontSize: 10 }}>포지션/리스크</div>
          </div>
        </div>
      </div>
      <div style={{ marginBottom: 12 }}>
        <label className="metric-label" style={{ display: 'block', marginBottom: 4 }}>
          수익권 목표 (레버리지 손익 %)
        </label>
        <input
          type="number"
          min={5}
          max={1000}
          step={1}
          value={targetProfitPct}
          onChange={e => {
            const v = parseFloat(e.target.value);
            if (!isNaN(v)) onTargetProfitPctChange(Math.max(5, Math.min(1000, v)));
          }}
          style={{
            width: '100%',
            padding: '8px 10px',
            borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.2)',
            background: 'rgba(0,0,0,0.3)',
            color: 'inherit',
            fontSize: 14,
          }}
        />
        <div className="subtle" style={{ fontSize: '0.68rem', marginTop: 4 }}>
          5% ~ 1000% 도달 시 자동 익절
        </div>
      </div>

      {activeTfOpenPositions.length > 0 && (
        <div style={divider}>
          <div className="section-title" style={{ fontSize: '0.9rem', marginBottom: 8 }}>
            보유 중 - 선택 TF ({activeTfOpenPositions.length})
          </div>
          <div style={{ maxHeight: 120, overflowY: 'auto', fontSize: 11 }}>
            {activeTfOpenPositions.map(pos => (
              <div
                key={pos.id}
                style={{
                  padding: 8,
                  borderRadius: 8,
                  marginBottom: 6,
                  background: pos.direction === 'LONG' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                  border: `1px solid ${pos.direction === 'LONG' ? 'rgba(34,197,94,0.35)' : 'rgba(239,68,68,0.35)'}`,
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 12 }}>
                  <span className={pos.direction === 'LONG' ? 'c-long' : 'c-short'}>{pos.direction === 'LONG' ? '롱' : '숏'}</span>{' '}
                  {pos.symbol} {pos.timeframe}
                </div>
                <div style={{ fontSize: 10, marginTop: 2 }}>
                  진입 {pos.entryPrice.toLocaleString()} · 손절 {pos.stopPrice.toLocaleString()}
                </div>
                <div style={{ fontSize: 10, marginTop: 2 }}>
                  TP1 {pos.targetPrices?.[0]?.toLocaleString?.() ?? '-'} · TP2 {pos.targetPrices?.[1]?.toLocaleString?.() ?? '-'} · TP3 {pos.targetPrices?.[2]?.toLocaleString?.() ?? '-'}
                </div>
                <div style={{ fontSize: 10, marginTop: 2, color: '#cbd5e1' }}>
                  손익비 {pos.rr != null ? pos.rr.toFixed(2) : '-'} · 레버리지 {pos.leverage != null ? `${pos.leverage.toFixed(2)}x` : '-'} · 리스크 {pos.riskAmountUsdt != null ? `${Math.round(pos.riskAmountUsdt)} U` : '-'}
                </div>
                {(pos.signalReasons?.length ?? 0) > 0 && (
                  <div style={{ fontSize: 10, marginTop: 2, color: '#94a3b8' }}>
                    근거: {pos.signalReasons!.slice(0, 3).join(' · ')}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {otherTfOpenPositions.length > 0 && (
        <div style={divider}>
          <div className="section-title" style={{ fontSize: '0.82rem', marginBottom: 6, color: '#94a3b8' }}>
            다른 TF 기존 포지션 ({otherTfOpenPositions.length})
          </div>
          <div className="subtle" style={{ fontSize: 10, lineHeight: 1.5 }}>
            예전 설정에서 열린 포지션입니다. 현재 선택 TF 자동매매 대상은 아닙니다.
          </div>
          <div style={{ maxHeight: 90, overflowY: 'auto', fontSize: 10, marginTop: 6 }}>
            {otherTfOpenPositions.map(pos => (
              <div key={pos.id} style={{ marginBottom: 4, color: '#94a3b8' }}>
                {pos.symbol} {pos.timeframe} · {pos.direction === 'LONG' ? '롱' : '숏'}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mini-grid" style={{ marginBottom: 8 }}>
        <div className="mini-card">
          <div className="metric-label">총 거래</div>
            <div className="metric-value">{scopedClosed.length}건</div>
        </div>
        <div className="mini-card">
          <div className="metric-label">승률</div>
          <div className="mini-value" style={{ color: winRate >= 50 ? '#22C55E' : '#EF4444' }}>
            {winRate.toFixed(1)}%
          </div>
        </div>
        <div className="mini-card">
          <div className="metric-label">승/패</div>
          <div className="metric-value">
            <span className="c-long">{wins.length}</span> / <span className="c-short">{losses.length}</span>
          </div>
        </div>
        <div className="mini-card">
          <div className="metric-label">누적 수익률</div>
          <div className="mini-value" style={{ color: totalPnl >= 0 ? '#22C55E' : '#EF4444' }}>
            {totalPnl >= 0 ? '+' : ''}
            {totalPnl.toFixed(2)}%
          </div>
        </div>
      </div>
        <div className="subtle" style={{ fontSize: 10, marginTop: -2, marginBottom: 8 }}>
          집계 기준: 선택 심볼/선택 TF
        </div>

      {closed.length > 0 && (
        <div style={divider}>
          <div className="section-title" style={{ fontSize: '0.9rem', marginBottom: 8 }}>
            최근 기록
          </div>
          <div style={{ maxHeight: 180, overflowY: 'auto', fontSize: 11 }}>
            {closed.slice(0, 15).map(t => (
              <div
                key={t.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 4,
                  padding: '6px 8px',
                  marginBottom: 4,
                  borderRadius: 6,
                  background: 'rgba(255,255,255,0.04)',
                }}
              >
                <span className={t.direction === 'LONG' ? 'c-long' : 'c-short'}>
                  {t.direction === 'LONG' ? '롱' : '숏'}
                </span>
                <span style={{ fontSize: 10, color: '#94a3b8' }}>
                  {t.symbol} {t.timeframe}
                </span>
                <span>
                  {t.entryPrice.toLocaleString()} → {t.exitPrice?.toLocaleString() ?? '–'}
                </span>
                <span
                  style={{
                    color: (t.pnlPct ?? 0) >= 0 ? '#22C55E' : '#EF4444',
                    fontWeight: 600,
                  }}
                >
                  {(t.pnlPct ?? 0) >= 0 ? '+' : ''}
                  {(t.pnlPct ?? 0).toFixed(2)}%
                  {(() => {
                    const idx = closed.indexOf(t);
                    const usdt = pnlUsdtList[idx];
                    return usdt != null ? ` (${usdt >= 0 ? '+' : ''}${usdt.toFixed(2)} U)` : null;
                  })()}
                </span>
                <span style={{ color: '#64748b', fontSize: 10 }}>
                  {t.status === 'hit_stop' ? '손절' : t.status === 'hit_tp1' ? 'TP1' : t.status === 'hit_user_tp' ? '수익권 익절' : t.status}
                </span>
                <span style={{ color: '#94a3b8', fontSize: 10 }}>
                  손익비 {t.rr != null ? t.rr.toFixed(2) : '-'} · {t.leverage != null ? `${t.leverage.toFixed(2)}x` : '-'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      {recentEntries.length > 0 && (
        <div style={divider}>
          <div className="section-title" style={{ fontSize: '0.9rem', marginBottom: 8 }}>
            최근 진입 로그
          </div>
          <div style={{ maxHeight: 150, overflowY: 'auto', fontSize: 11 }}>
            {recentEntries.map((t) => (
              <div
                key={`entry-${t.id}`}
                style={{
                  padding: '6px 8px',
                  marginBottom: 4,
                  borderRadius: 6,
                  background: 'rgba(255,255,255,0.04)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, alignItems: 'center' }}>
                  <span className={t.direction === 'LONG' ? 'c-long' : 'c-short'} style={{ fontWeight: 700 }}>
                    {t.direction === 'LONG' ? '롱' : '숏'} {t.symbol} {t.timeframe}
                  </span>
                  <span style={{ fontSize: 10, color: '#94a3b8' }}>
                    {new Date(t.entryTime * 1000).toLocaleString('ko-KR')}
                  </span>
                </div>
                <div style={{ marginTop: 2, color: '#cbd5e1' }}>
                  진입 {t.entryPrice.toLocaleString()} · 손절 {t.stopPrice.toLocaleString()} · TP1 {t.targetPrices?.[0]?.toLocaleString?.() ?? '-'}
                </div>
                <div style={{ marginTop: 2, color: '#94a3b8', fontSize: 10 }}>
                  근거: {(t.signalReasons?.length ?? 0) > 0 ? t.signalReasons!.slice(0, 3).join(' · ') : '신호 기준 진입'}
                </div>
                <div style={{ marginTop: 2, color: '#94a3b8', fontSize: 10 }}>
                  TP/SL 모드: {t.tpSlMode === 'manual' ? '수동' : '자동'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {closed.length === 0 && openPositions.length === 0 && (
        <div className="subtle" style={{ fontSize: 11 }}>
          {enabled
            ? `백그라운드에서 ${symbols.length ? symbols.join(', ') : '심볼'} × ${timeframes.length}개 TF 분석 중. 4요소 확정 시 자동 진입됩니다.`
            : '백그라운드 자동매매를 켜고 추적 심볼을 입력하세요.'}
        </div>
      )}

      {getFailedSignals().length > 0 && (
        <div style={{ ...divider, fontSize: '0.72rem', color: '#64748b' }}>
          자율학습: 손절 패턴 <strong>{getFailedSignals().length}건</strong> 저장 · 동일 조건 반복 시 진입 억제
        </div>
      )}
    </div>
  );
}

export default memo(VirtualTradeCardInner);
