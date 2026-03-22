'use client';

import { memo, useState, useEffect, useCallback } from 'react';
import {
  getVirtualTrades,
  getAllOpenPositions,
  getFailedSignals,
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
  refreshTrigger,
}: Props) {
  const [trades, setTrades] = useState<VirtualTrade[]>([]);
  const [openPositions, setOpenPositions] = useState<VirtualTrade[]>([]);

  const refresh = useCallback(() => {
    const list = getVirtualTrades();
    setTrades(list.filter(t => t.status !== 'open'));
    setOpenPositions(getAllOpenPositions());
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [refresh, refreshTrigger]);

  const allClosed = trades;
  const closed = allClosed.slice(-30).reverse();
  const wins = allClosed.filter(t => (t.pnlPct ?? 0) > 0);
  const losses = allClosed.filter(t => (t.pnlPct ?? 0) <= 0);
  const totalPnl = allClosed.reduce((s, t) => s + (t.pnlPct ?? 0), 0);
  const winRate = allClosed.length ? (wins.length / allClosed.length) * 100 : 0;
  const totalPnlUsdt = allClosed.reduce((s, t) => {
    const size = t.positionSizeUsdt;
    const pct = t.pnlPct ?? 0;
    return s + (size != null && size > 0 ? size * (pct / 100) : 0);
  }, 0);
  const balance = seedUsdt + totalPnlUsdt;
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
        백그라운드에서 각 TF별 4요소 확정 신호 시 자동 진입 · 차트 무관
      </div>

      <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
          <input
            type="checkbox"
            checked={enabled}
            onChange={e => onEnabledChange(e.target.checked)}
          />
          백그라운드 자동매매
        </label>
      </div>

      <div style={{ marginBottom: 12 }}>
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

      {openPositions.length > 0 && (
        <div style={divider}>
          <div className="section-title" style={{ fontSize: '0.9rem', marginBottom: 8 }}>
            보유 중 ({openPositions.length})
          </div>
          <div style={{ maxHeight: 120, overflowY: 'auto', fontSize: 11 }}>
            {openPositions.map(pos => (
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
                  <span className={pos.direction === 'LONG' ? 'c-long' : 'c-short'}>{pos.direction}</span>{' '}
                  {pos.symbol} {pos.timeframe}
                </div>
                <div style={{ fontSize: 10, marginTop: 2 }}>
                  진입 {pos.entryPrice.toLocaleString()} · 손절 {pos.stopPrice.toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mini-grid" style={{ marginBottom: 8 }}>
        <div className="mini-card">
          <div className="metric-label">총 거래</div>
          <div className="metric-value">{allClosed.length}건</div>
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
                  {t.direction === 'LONG' ? 'L' : 'S'}
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
                  {t.status === 'hit_stop' ? '손절' : t.status === 'hit_tp1' ? 'TP1' : t.status}
                </span>
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
