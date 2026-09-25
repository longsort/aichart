'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { AnalyzeResponse, Candle } from '@/types';
import type { TfCloseSettleBoard } from '@/lib/tfCloseSettleAssessment';
import { buildMonthDeskBoardMetrics } from '@/lib/monthDeskBoardMetrics';
import { buildMonthDeskCoreLevels } from '@/lib/monthDeskCoreLevels';
import { useMonthDeskWhaleSnapshot } from './MonthDeskWhalePanel';
import { getTelegramSignalAuthHeaders } from '@/lib/telegramSignalAuthClient';

type Props = {
  symbol: string;
  timeframe: string;
  analysis: AnalyzeResponse | null;
  candles: Candle[];
  board: TfCloseSettleBoard | null;
  rightOffset?: number;
  priceToY?: (price: number | null) => number | null;
};

export default function MonthDeskRealtimeAlertPins({
  symbol,
  timeframe,
  analysis,
  candles,
  board,
  rightOffset = 12,
  priceToY,
}: Props) {
  const m = useMemo(
    () => buildMonthDeskBoardMetrics({ analysis, candles, board, timeframe }),
    [analysis, candles, board, timeframe]
  );
  const levels = useMemo(
    () => buildMonthDeskCoreLevels(analysis, m.ucm, m.closePrice),
    [analysis, m.ucm, m.closePrice]
  );
  const whale = useMonthDeskWhaleSnapshot(analysis, candles, symbol, timeframe);

  const pin = useMemo(() => {
    const close = levels.close;
    const targetRef =
      levels.targets[0] ??
      (m.verdict === 'LONG'
        ? (levels.resistance ?? null)
        : m.verdict === 'SHORT'
          ? (levels.support ?? null)
          : null);
    const invalidationRef = levels.invalidation ?? null;
    let rr: number | null = null;
    if (close != null && targetRef != null && invalidationRef != null) {
      if (m.verdict === 'LONG') {
        const reward = targetRef - close;
        const risk = close - invalidationRef;
        if (reward > 0 && risk > 0) rr = reward / risk;
      } else if (m.verdict === 'SHORT') {
        const reward = close - targetRef;
        const risk = invalidationRef - close;
        if (reward > 0 && risk > 0) rr = reward / risk;
      }
    }
    const rrPass = rr != null && rr >= 1.6;
    const strongSide =
      m.longPct >= 66 && (m.confidence ?? 0) >= 70
        ? 'LONG+'
        : m.shortPct >= 66 && (m.confidence ?? 0) >= 70
          ? 'SHORT+'
          : m.verdict === 'LONG'
            ? 'LONG'
            : m.verdict === 'SHORT'
              ? 'SHORT'
              : 'WAIT';
    const priority =
      strongSide === 'LONG+' || strongSide === 'SHORT+'
        ? rrPass
          ? '즉시 후보'
          : '대기'
        : m.verdict === 'WAIT'
          ? '차단'
          : m.gatesPassCount >= 4
            ? '준비'
            : '대기';
    const whaleHot =
      whale.phase === 'buy_incoming' ||
      whale.phase === 'sell_incoming' ||
      whale.phase === 'defend_long' ||
      whale.phase === 'defend_short';
    const flowBias = whale.buyPressure - whale.sellPressure;
    const alertText =
      priority === '즉시 후보'
        ? strongSide.includes('LONG')
          ? 'LONG 실시간 진입 후보'
          : 'SHORT 실시간 진입 후보'
        : whaleHot
          ? flowBias >= 0
            ? '고래 매수 유입 감지'
            : '고래 매도 유입 감지'
          : '신호 대기';
    return { rr, strongSide, priority, alertText, whaleHot };
  }, [levels, m, whale]);

  const mainColor =
    pin.priority === '즉시 후보'
      ? '#4ade80'
      : pin.priority === '차단'
        ? '#f87171'
        : '#fcd34d';

  const defendY = priceToY ? priceToY(whale.defendPrice ?? null) : null;
  const attackY = priceToY ? priceToY(whale.attackPrice ?? null) : null;
  const close = levels.close ?? null;
  const defendState = (() => {
    if (close == null || whale.defendPrice == null) return '확인중';
    const longDef = whale.phase === 'defend_long' || whale.phase === 'buy_incoming' || whale.phase === 'buy_done';
    const shortDef = whale.phase === 'defend_short' || whale.phase === 'sell_incoming' || whale.phase === 'sell_done';
    if (longDef) {
      if (close < whale.defendPrice) return '롱 방어 붕괴 위험';
      if (close >= whale.defendPrice * 1.001) return '롱 방어 재탈환';
      return '롱 방어 유지';
    }
    if (shortDef) {
      if (close > whale.defendPrice) return '숏 방어 붕괴 위험';
      if (close <= whale.defendPrice * 0.999) return '숏 방어 재탈환';
      return '숏 방어 유지';
    }
    return '확인중';
  })();
  const defendColor = /붕괴/.test(defendState)
    ? '#f87171'
    : /재탈환/.test(defendState)
      ? '#22d3ee'
      : '#5eead4';
  const [flashAlert, setFlashAlert] = useState<{ text: string; color: string } | null>(null);
  const prevDefendStateRef = useRef<string>(defendState);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sentFlashTelegramRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const prev = prevDefendStateRef.current;
    if (prev !== defendState && /붕괴|재탈환/.test(defendState)) {
      const color = /붕괴/.test(defendState) ? '#f87171' : '#22d3ee';
      setFlashAlert({ text: defendState, color });
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
      flashTimerRef.current = setTimeout(() => {
        setFlashAlert(null);
        flashTimerRef.current = null;
      }, 1800);

      const eventKey = [
        symbol,
        timeframe,
        defendState,
        String(whale.defendPrice ?? '-'),
        String(whale.attackPrice ?? '-'),
        String(m.closePrice ?? '-'),
      ].join('|');
      if (!sentFlashTelegramRef.current.has(eventKey)) {
        sentFlashTelegramRef.current.add(eventKey);
        if (sentFlashTelegramRef.current.size > 120) {
          const arr = [...sentFlashTelegramRef.current];
          sentFlashTelegramRef.current = new Set(arr.slice(-60));
        }
        void (async () => {
          try {
            const authH = await getTelegramSignalAuthHeaders();
            await fetch('/api/telegram/realtime-alert', {
              method: 'POST',
              credentials: 'same-origin',
              headers: { 'Content-Type': 'application/json', ...authH },
              body: JSON.stringify({
                eventKey,
                symbol,
                timeframe,
                alertText: pin.alertText,
                defendState,
                strongSide: pin.strongSide,
                priority: pin.priority,
                rr: pin.rr,
                defendPrice: whale.defendPrice,
                attackPrice: whale.attackPrice,
                buyPressure: whale.buyPressure,
                sellPressure: whale.sellPressure,
              }),
            });
          } catch {
            /* ignore */
          }
        })();
      }
    }
    prevDefendStateRef.current = defendState;
  }, [defendState, symbol, timeframe, whale, pin, m.closePrice]);

  useEffect(() => {
    return () => {
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    };
  }, []);

  return (
    <>
      {flashAlert && (
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: 92,
            transform: 'translateX(-50%)',
            zIndex: 52,
            pointerEvents: 'none',
            borderRadius: 999,
            border: `1px solid ${flashAlert.color}aa`,
            background: 'rgba(10,16,26,0.95)',
            color: flashAlert.color,
            fontSize: 11,
            fontWeight: 900,
            padding: '6px 14px',
            boxShadow: `0 0 22px ${flashAlert.color}88`,
            animation: 'mdWhaleZoneBannerPulse 0.9s ease-in-out 2',
            whiteSpace: 'nowrap',
          }}
        >
          ⚠ {flashAlert.text}
        </div>
      )}
      <div
        style={{
          position: 'absolute',
          right: rightOffset,
          top: 104,
          zIndex: 49,
          width: 226,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          pointerEvents: 'none',
        }}
      >
      <div
        style={{
          borderRadius: 10,
          border: `1px solid ${mainColor}88`,
          background: 'rgba(10,16,26,0.82)',
          boxShadow: pin.priority === '즉시 후보' ? `0 0 22px ${mainColor}66` : '0 4px 12px rgba(0,0,0,0.35)',
          padding: '7px 9px',
        }}
      >
        <div style={{ fontSize: 9, fontWeight: 900, color: mainColor, marginBottom: 3 }}>
          실시간 경보 핀
        </div>
        <div style={{ fontSize: 12, fontWeight: 900, color: '#f8fafc', lineHeight: 1.2 }}>
          {pin.alertText}
        </div>
        <div style={{ marginTop: 4, fontSize: 10, color: '#94a3b8', fontWeight: 700 }}>
          {pin.strongSide} · {pin.priority} · RR {pin.rr != null ? pin.rr.toFixed(2) : '–'}
        </div>
        <div
          style={{
            marginTop: 4,
            fontSize: 9,
            fontWeight: 900,
            color: defendColor,
            textShadow: /붕괴|재탈환/.test(defendState) ? `0 0 10px ${defendColor}99` : undefined,
          }}
        >
          {defendState}
        </div>
      </div>

      <div
        style={{
          borderRadius: 10,
          border: '1px dashed rgba(94,234,212,0.55)',
          background: 'rgba(10,16,26,0.72)',
          padding: '6px 9px',
        }}
      >
        <div style={{ fontSize: 9, fontWeight: 900, color: '#5eead4', marginBottom: 3 }}>세력 가격 라인</div>
        <div style={{ fontSize: 10, fontWeight: 800, color: '#5eead4' }}>
          방어 {whale.defendPrice != null ? whale.defendPrice.toLocaleString() : '–'}
        </div>
        <div style={{ fontSize: 10, fontWeight: 800, color: '#fda4af', marginTop: 2 }}>
          공격 {whale.attackPrice != null ? whale.attackPrice.toLocaleString() : '–'}
        </div>
      </div>
      </div>
      {defendY != null && (
        <div
          style={{
            position: 'absolute',
            right: rightOffset + 236,
            top: Math.max(22, defendY - 9),
            zIndex: 50,
            pointerEvents: 'none',
            fontSize: 9,
            fontWeight: 900,
            color: '#5eead4',
            border: '1px solid rgba(94,234,212,0.7)',
            background: 'rgba(10,16,26,0.92)',
            borderRadius: 999,
            padding: '3px 8px',
            boxShadow: `0 0 14px rgba(94,234,212,0.45)`,
          }}
        >
          🛡 방어 {whale.defendPrice != null ? whale.defendPrice.toLocaleString() : '–'}
        </div>
      )}
      {attackY != null && (
        <div
          style={{
            position: 'absolute',
            right: rightOffset + 236,
            top: Math.max(22, attackY - 9),
            zIndex: 50,
            pointerEvents: 'none',
            fontSize: 9,
            fontWeight: 900,
            color: '#fda4af',
            border: '1px solid rgba(251,113,133,0.7)',
            background: 'rgba(10,16,26,0.92)',
            borderRadius: 999,
            padding: '3px 8px',
            boxShadow: `0 0 14px rgba(251,113,133,0.42)`,
          }}
        >
          ▽ 공격 {whale.attackPrice != null ? whale.attackPrice.toLocaleString() : '–'}
        </div>
      )}
    </>
  );
}
