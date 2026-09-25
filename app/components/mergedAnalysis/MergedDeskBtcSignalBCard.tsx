'use client';

/**
 * BTC 신호B 카드 — Dual 4게이지와 분리.
 * 로켓→장바5봉 상태 · 레이스 슬롯 · 확정 수익·승률 아님.
 */
import { useEffect, useState } from 'react';
import deskCss from './MergedAnalysisDesk.module.css';
import {
  BTC_SIGNAL_B_EVENT,
  readBtcSignalBProbe,
  writeBtcSignalBProbe,
} from '@/lib/mergedDeskBtcSignalRace';
import { buildBtcRocketCartSignal } from '@/lib/mergedDeskBtcRocketCartSignal';
import {
  isAutoTradeSymbolEnabled,
  readAutoTradeConfig,
} from '@/lib/mergedDeskAutoTradeConfig';
import type { Candle } from '@/types';

const styles: Record<string, string> = (() => {
  const m = deskCss as Record<string, string> & { default?: Record<string, string> };
  if (!m || typeof m !== 'object') return {};
  if (m.default && typeof m.default === 'object') return m.default;
  return m as Record<string, string>;
})();

function dirKo(d: string): string {
  if (d === 'LONG') return '롱';
  if (d === 'SHORT') return '숏';
  return '—';
}

export default function MergedDeskBtcSignalBCard() {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const bump = () => setTick((n) => n + 1);
    window.addEventListener(BTC_SIGNAL_B_EVENT, bump);
    const id = window.setInterval(bump, 4_000);
    return () => {
      window.removeEventListener(BTC_SIGNAL_B_EVENT, bump);
      window.clearInterval(id);
    };
  }, []);

  /** Dual 게이지와 별도 · BTC 칩 ON이면 3m 신호B만 스캔 */
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const cfg = readAutoTradeConfig();
      if (!isAutoTradeSymbolEnabled(cfg, 'BTCUSDT')) return;
      try {
        const q = new URLSearchParams({
          symbol: 'BTCUSDT',
          timeframe: '3m',
          depth: 'recent',
        });
        const res = await fetch(`/api/market?${q}`, {
          credentials: 'same-origin',
          cache: 'no-store',
        });
        const json = (await res.json().catch(() => ({}))) as {
          candles?: Candle[];
        };
        const candles = Array.isArray(json.candles) ? json.candles : [];
        if (cancelled || candles.length < 40) return;
        const built = buildBtcRocketCartSignal({
          candles,
          leverage: cfg.leverage || 40,
          minRr: cfg.minRr || 1.2,
          tp1RoePct: cfg.scalpTp1RoePct || 8,
        });
        if (!cancelled) writeBtcSignalBProbe(built.probe);
      } catch {
        /* ignore */
      }
    };
    void run();
    const id = window.setInterval(() => void run(), 20_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  void tick;
  const probe = readBtcSignalBProbe();
  if (!probe) {
    return (
      <div className={styles.btcSignalBPanel}>
        <div className={styles.btcSignalBHead}>
          <strong>BTC · 신호B</strong>
          <span>로켓→장바 · 스캔대기</span>
        </div>
      </div>
    );
  }

  const f = probe.filter;
  const tone = probe.ready ? 'ready' : !f.htfOk ? 'block' : 'wait';

  return (
    <div className={styles.btcSignalBPanel} data-tone={tone}>
      <div className={styles.btcSignalBHead}>
        <strong>BTC · 신호B · 로켓→장바</strong>
        <em data-tone={tone}>
          {probe.ready ? 'READY' : tone === 'block' ? '차단' : '대기'} ·{' '}
          {dirKo(probe.direction)}
        </em>
      </div>
      <div className={styles.btcSignalBGauge} aria-label="신호B필터">
        <div className={styles.btcSignalBSeg}>
          <i data-ok={f.seq ? '1' : '0'} />
          <span>시퀀스</span>
        </div>
        <div className={styles.btcSignalBSeg}>
          <i data-ok={f.extensionOk ? '1' : '0'} />
          <span>과연장X</span>
        </div>
        <div className={styles.btcSignalBSeg}>
          <i data-ok={f.place ? '1' : '0'} />
          <span>자리</span>
        </div>
        <div className={styles.btcSignalBSeg}>
          <i data-ok={f.htfOk ? '1' : '0'} />
          <span>HTF</span>
        </div>
        <div className={styles.btcSignalBSeg}>
          <i data-ok={f.fee ? '1' : '0'} />
          <span>수수료</span>
        </div>
      </div>
      <div className={styles.btcSignalBReason}>{probe.waitingKo}</div>
      <div className={styles.btcSignalBFoot}>
        Dual게이지와 별도 · 레이스 선도착 진입 · 추격금지 · 확정아님
      </div>
    </div>
  );
}
