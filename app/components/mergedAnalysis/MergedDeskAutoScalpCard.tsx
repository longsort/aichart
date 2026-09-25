'use client';

import { useMemo } from 'react';
import FoldCard from '@/app/components/ui/FoldCard';
import styles from './MergedAnalysisDesk.module.css';
import type { AutoScalpPaperTrade } from '@/lib/mergedDeskAutoScalpEngine';
import { summarizeAutoScalpTrades } from '@/lib/mergedDeskAutoScalpEngine';
import { autoScalpExpectancyKo, readAutoScalpHistory } from '@/lib/mergedDeskAutoScalpStore';

type Props = {
  symbol: string;
  timeframe: string;
  stripKo: string;
  detailKo: string;
  trade: AutoScalpPaperTrade | null;
  forceOpen?: boolean;
  onClose?: () => void;
};

function phaseKo(p: string): string {
  const m: Record<string, string> = {
    IDLE: '대기',
    ARMED: 'Arm(폭락터치)',
    SFP_OK: 'SFP확인',
    READY: '로켓합류',
    OPEN: 'OPEN',
    TP1_HIT: 'TP1',
    BE: '본절·TP2',
    CLOSED: '종료',
  };
  return m[p] || p;
}

export default function MergedDeskAutoScalpCard({
  symbol,
  timeframe,
  stripKo,
  detailKo,
  trade,
  forceOpen,
  onClose,
}: Props) {
  const hist = useMemo(() => readAutoScalpHistory(symbol), [symbol, trade?.phase, trade?.closedAt]);
  const sum = useMemo(() => summarizeAutoScalpTrades(hist), [hist]);

  const badge = trade
    ? trade.phase === 'CLOSED'
      ? trade.closeReason || '종료'
      : phaseKo(trade.phase)
    : '대기';

  return (
    <div data-auto-scalp-card="1">
      <FoldCard
        id="merged-auto-scalp-paper"
        title="자동초단 · 페이퍼"
        subtitle="폭락터치→SFP→로켓→TP1 55%+본절→TP2 · ROE 7/10%캡 · 실주문은 자동매매 ARM"
        defaultOpen
        forceOpen={forceOpen}
        badge={badge}
        onClose={onClose}
        closeTitle="자동초단 카드 닫기"
      >
        <div className={styles.tbScanSummary} style={{ display: 'grid', gap: 8, fontSize: 12, lineHeight: 1.45 }}>
          <div
            style={{
              padding: '8px 10px',
              borderRadius: 8,
              border: '1px solid rgba(56,189,248,0.4)',
              background: 'rgba(12,74,110,0.25)',
            }}
          >
            <div style={{ fontWeight: 800 }}>{stripKo}</div>
            <div style={{ marginTop: 4, color: '#bae6fd' }}>{detailKo}</div>
            <div style={{ marginTop: 4, fontSize: 11, color: '#94a3b8' }}>
              {symbol} · {timeframe} · 확정 수익 아님
            </div>
          </div>

          {trade ? (
            <div style={{ display: 'grid', gap: 4, color: '#cbd5e1' }}>
              <div>
                단계 <b>{phaseKo(trade.phase)}</b> · {trade.direction}
              </div>
              {trade.entry != null ? (
                <div>
                  E {trade.entry.toFixed(0)} · SL {(trade.activeSl ?? trade.sl)?.toFixed(0)} · TP1{' '}
                  {trade.tp1?.toFixed(0)} · TP2 {trade.tp2?.toFixed(0)} · {trade.leverage}x
                </div>
              ) : null}
              {trade.phase === 'OPEN' || trade.phase === 'BE' || trade.phase === 'TP1_HIT' ? (
                <div style={{ fontSize: 11, color: '#94a3b8' }}>
                  잔량 {(trade.remainingFrac * 100).toFixed(0)}% · 보유 {trade.barsHeld}/{trade.maxBars}봉 · 실현ROE{' '}
                  {(trade.realizedRoePct * 100).toFixed(1)}%
                </div>
              ) : null}
              {trade.phase === 'CLOSED' ? (
                <div style={{ color: trade.realizedRoePct >= 0 ? '#34d399' : '#f87171' }}>
                  {trade.closeReason} · ROE {(trade.realizedRoePct * 100).toFixed(2)}% · {trade.noteKo}
                </div>
              ) : null}
            </div>
          ) : (
            <div style={{ color: '#94a3b8' }}>활성 페이퍼 포지션 없음 · 폭락존 터치 감시 중</div>
          )}

          <div style={{ fontSize: 11, color: '#94a3b8' }}>
            기대값(참고): {sum.expectancyKo || autoScalpExpectancyKo(symbol)}
          </div>
          {hist.slice(0, 5).map((h) => (
            <div key={h.id} style={{ fontSize: 11, color: '#64748b' }}>
              {h.direction} {h.closeReason} · ROE {(h.realizedRoePct * 100).toFixed(1)}% · {h.noteKo.slice(0, 48)}
            </div>
          ))}
        </div>
      </FoldCard>
    </div>
  );
}
