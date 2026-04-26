'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ZoneExecBound } from '@/lib/zoneExecutionBounds';
import { zoneExecutionWindowLabelKo } from '@/lib/zoneExecutionWindow';

export type ZoneExecSnapshot = {
  takerBuyUsd: number;
  takerSellUsd: number;
  tradeCount: number;
  dominancePct: number;
  bias: 'buy' | 'sell' | 'neutral';
  label: string;
  totalTakerUsd: number;
  windowLabel: string;
  captionBuy: string;
  captionSell: string;
};

const THROTTLE_MS = 400;
const MIN_USD_FOR_BIAS_LABEL = 220;
const MIN_USD_ANY = 35;
const MAX_ZONES = 40;
const INITIAL_BACKOFF_MS = 1800;
const MAX_BACKOFF_MS = 25_000;

const MIN_WINDOW_MS = 60_000;
const MAX_WINDOW_MS = 366 * 24 * 60 * 60 * 1000;
const MAX_TRADES_PER_ZONE = 120_000;
const MAX_BACKFILL_AGG_ROWS = 28_000;
const MAX_BACKFILL_PAGES = 48;

function clampWindowMs(ms: number): number {
  if (!Number.isFinite(ms) || ms <= 0) return 3_600_000;
  return Math.min(MAX_WINDOW_MS, Math.max(MIN_WINDOW_MS, ms));
}

function fmtUsd(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(3)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return n.toFixed(0);
}

type ZoneExecMeta = Pick<
  ZoneExecSnapshot,
  'label' | 'dominancePct' | 'bias' | 'windowLabel' | 'captionBuy' | 'captionSell'
>;

function buildLabel(buy: number, sell: number, tradeCount: number, windowMs: number): ZoneExecMeta {
  const wl = zoneExecutionWindowLabelKo(windowMs);
  const t = buy + sell;
  const bPct = t > 0 ? (buy / t) * 100 : 0;
  const sPct = t > 0 ? (sell / t) * 100 : 0;
  const dominance = Math.max(bPct, sPct);
  const bias: ZoneExecSnapshot['bias'] =
    bPct >= sPct + 10 ? 'buy' : sPct >= bPct + 10 ? 'sell' : 'neutral';

  const captionBuy =
    tradeCount < 1 || t < MIN_USD_ANY ? '' : `매수 ${fmtUsd(buy)} (${bPct.toFixed(0)}%)`;
  const captionSell =
    tradeCount < 1 || t < MIN_USD_ANY ? '' : `매도 ${fmtUsd(sell)} (${sPct.toFixed(0)}%)`;

  if (tradeCount < 1 || t < MIN_USD_ANY) {
    return {
      label: '',
      dominancePct: 0,
      bias: 'neutral',
      windowLabel: wl,
      captionBuy: '',
      captionSell: '',
    };
  }
  if (t < MIN_USD_FOR_BIAS_LABEL) {
    return {
      label: `${wl} 체결 ${fmtUsd(t)}`,
      dominancePct: dominance,
      bias: 'neutral',
      windowLabel: wl,
      captionBuy,
      captionSell,
    };
  }
  if (bias === 'neutral') {
    return {
      label: `${wl} 체결 균형 · ${fmtUsd(t)}`,
      dominancePct: dominance,
      bias,
      windowLabel: wl,
      captionBuy,
      captionSell,
    };
  }
  if (bias === 'buy') {
    return {
      label: `${wl} 매수우세 ${bPct.toFixed(0)}% · ${fmtUsd(t)}`,
      dominancePct: dominance,
      bias,
      windowLabel: wl,
      captionBuy,
      captionSell,
    };
  }
  return {
    label: `${wl} 매도우세 ${sPct.toFixed(0)}% · ${fmtUsd(t)}`,
    dominancePct: dominance,
    bias,
    windowLabel: wl,
    captionBuy,
    captionSell,
  };
}

export type ZoneExecutionUsdmLiveResult = {
  snapshots: Record<string, ZoneExecSnapshot>;
  streamOpen: boolean;
  historyBackfillCapped: boolean;
};

export function useZoneExecutionUsdmLive(
  enabled: boolean,
  symbol: string,
  zones: ZoneExecBound[],
  barWindowMs: number
): ZoneExecutionUsdmLiveResult {
  const zonesRef = useRef(zones);
  zonesRef.current = zones;

  const [snap, setSnap] = useState<Record<string, ZoneExecSnapshot>>({});
  const [streamOpen, setStreamOpen] = useState(false);
  const [historyBackfillCapped, setHistoryBackfillCapped] = useState(false);

  const zoneSig = useMemo(() => {
    const z = zones.slice(0, MAX_ZONES);
    if (!z.length) return '';
    return z.map((x) => `${x.id}:${x.low}:${x.high}`).join('|');
  }, [zones]);

  useEffect(() => {
    setStreamOpen(false);
    setHistoryBackfillCapped(false);
    if (!enabled || !symbol.trim().toUpperCase().endsWith('USDT')) {
      setSnap({});
      return;
    }

    const zlist = zonesRef.current.slice(0, MAX_ZONES);
    if (!zlist.length) {
      setSnap({});
      return;
    }

    const windowMs = clampWindowMs(barWindowMs);
    const streamSym = symbol.trim().toLowerCase();
    const url = `wss://fstream.binance.com/ws/${streamSym}@aggTrade`;
    const buffers = new Map<string, Array<{ t: number; buy: number; sell: number }>>();
    for (const z of zlist) {
      buffers.set(z.id, []);
    }

    const seenAggTradeIds = new Set<number>();

    const pushTradeToZones = (price: number, takerBuy: number, takerSell: number, ts: number) => {
      for (const z of zonesRef.current.slice(0, MAX_ZONES)) {
        if (price < z.low || price > z.high) continue;
        const arr = buffers.get(z.id) ?? [];
        arr.push({ t: ts, buy: takerBuy, sell: takerSell });
        while (arr.length > MAX_TRADES_PER_ZONE) arr.shift();
        buffers.set(z.id, arr);
      }
    };

    const tryConsumeAggTrade = (
      aggId: number | undefined,
      ts: number,
      price: number,
      qty: number,
      isBuyerMaker: boolean
    ): boolean => {
      if (!Number.isFinite(price) || !Number.isFinite(qty) || qty <= 0) return false;
      const usd = price * qty;
      const takerBuy = isBuyerMaker ? 0 : usd;
      const takerSell = isBuyerMaker ? usd : 0;
      if (aggId !== undefined && Number.isFinite(aggId)) {
        if (seenAggTradeIds.has(aggId)) return false;
        seenAggTradeIds.add(aggId);
      }
      pushTradeToZones(price, takerBuy, takerSell, ts);
      return true;
    };

    let throttleTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;
    let backoffMs = INITIAL_BACKOFF_MS;
    let ws: WebSocket | null = null;

    const flush = () => {
      const now = Date.now();
      const cut = now - windowMs;
      const next: Record<string, ZoneExecSnapshot> = {};
      const currentZones = zonesRef.current.slice(0, MAX_ZONES);
      for (const z of currentZones) {
        if (!buffers.has(z.id)) buffers.set(z.id, []);
        let arr = buffers.get(z.id) ?? [];
        arr = arr.filter((x) => x.t >= cut);
        while (arr.length > MAX_TRADES_PER_ZONE) arr.shift();
        buffers.set(z.id, arr);
        let buy = 0;
        let sell = 0;
        for (const x of arr) {
          buy += x.buy;
          sell += x.sell;
        }
        const trCount = arr.length;
        const meta = buildLabel(buy, sell, trCount, windowMs);
        next[z.id] = {
          takerBuyUsd: buy,
          takerSellUsd: sell,
          tradeCount: trCount,
          dominancePct: meta.dominancePct,
          bias: meta.bias,
          label: meta.label,
          totalTakerUsd: buy + sell,
          windowLabel: meta.windowLabel,
          captionBuy: meta.captionBuy,
          captionSell: meta.captionSell,
        };
      }
      if (!disposed) setSnap(next);
    };

    const scheduleFlush = () => {
      if (throttleTimer != null) return;
      throttleTimer = setTimeout(() => {
        throttleTimer = null;
        flush();
      }, THROTTLE_MS);
    };

    const clearReconnect = () => {
      if (reconnectTimer != null) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const scheduleReconnect = () => {
      if (disposed) return;
      clearReconnect();
      const delay = backoffMs;
      backoffMs = Math.min(MAX_BACKOFF_MS, Math.round(backoffMs * 1.65));
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        if (!disposed) openSocket();
      }, delay);
    };

    const onMessage = (ev: MessageEvent) => {
      try {
        const raw = JSON.parse(ev.data as string);
        const msg = raw?.data && raw?.stream ? raw.data : raw;
        if (msg?.e !== 'aggTrade') return;
        const price = parseFloat(String(msg.p));
        const qty = parseFloat(String(msg.q));
        const tsRaw = Number(msg.T);
        const ts = Number.isFinite(tsRaw) ? tsRaw : Date.now();
        const aggId = Number(msg.a);
        const isBuyerMaker = msg.m === true;
        const ok = tryConsumeAggTrade(
          Number.isFinite(aggId) ? aggId : undefined,
          ts,
          price,
          qty,
          isBuyerMaker
        );
        if (ok) scheduleFlush();
      } catch {
        /* ignore */
      }
    };

    function openSocket() {
      if (disposed) return;
      try {
        ws = new WebSocket(url);
      } catch {
        if (!disposed) {
          setStreamOpen(false);
          scheduleReconnect();
        }
        return;
      }

      ws.onerror = () => {
        if (!disposed) setStreamOpen(false);
      };

      ws.onmessage = onMessage;

      ws.onopen = () => {
        if (disposed) return;
        backoffMs = INITIAL_BACKOFF_MS;
        setStreamOpen(true);
        flush();
      };

      ws.onclose = () => {
        if (disposed) return;
        setStreamOpen(false);
        scheduleReconnect();
      };
    }

    openSocket();

    const flushInterval = Math.min(60_000, Math.max(2_000, Math.floor(windowMs / 4)));
    const iv = setInterval(flush, flushInterval);

    const symUpper = symbol.trim().toUpperCase();
    const endT = Date.now();
    const startT = endT - windowMs;

    void (async () => {
      let rowsInWindow = 0;
      let capped = false;
      let fromId: number | undefined;
      try {
        for (let page = 0; page < MAX_BACKFILL_PAGES && !disposed; page++) {
          if (rowsInWindow >= MAX_BACKFILL_AGG_ROWS) {
            capped = true;
            break;
          }
          const remaining = MAX_BACKFILL_AGG_ROWS - rowsInWindow;
          const limit = Math.min(1000, remaining);
          const params = new URLSearchParams({ symbol: symUpper, limit: String(limit) });
          if (fromId != null) {
            params.set('fromId', String(fromId));
          } else {
            params.set('startTime', String(startT));
            params.set('endTime', String(endT));
          }
          const res = await fetch(`https://fapi.binance.com/fapi/v1/aggTrades?${params.toString()}`);
          if (!res.ok) break;
          const batch = (await res.json()) as Array<{
            a: number;
            T: number;
            p: string;
            q: string;
            m: boolean;
          }>;
          if (!Array.isArray(batch) || batch.length === 0) break;

          let pageTouched = false;
          for (const row of batch) {
            if (disposed) return;
            const tMs = Number(row.T);
            const aid = Number(row.a);
            if (!Number.isFinite(tMs) || tMs < startT || tMs > endT) continue;
            rowsInWindow++;
            const ok = tryConsumeAggTrade(
              Number.isFinite(aid) ? aid : undefined,
              tMs,
              parseFloat(String(row.p)),
              parseFloat(String(row.q)),
              row.m === true
            );
            if (ok) pageTouched = true;
            if (rowsInWindow >= MAX_BACKFILL_AGG_ROWS) {
              capped = true;
              break;
            }
          }
          if (pageTouched && !disposed) flush();

          const last = batch[batch.length - 1];
          fromId = last.a + 1;
          if (batch.length < limit) break;
          if (last.T >= endT) break;
          await new Promise<void>((r) => setTimeout(r, 0));
        }
      } catch {
        /* REST 실패 시 WS만 */
      } finally {
        if (!disposed) {
          setHistoryBackfillCapped(capped);
          flush();
        }
      }
    })();

    return () => {
      disposed = true;
      clearReconnect();
      if (throttleTimer) clearTimeout(throttleTimer);
      clearInterval(iv);
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
      ws = null;
      setStreamOpen(false);
    };
  }, [enabled, symbol, zoneSig, barWindowMs]);

  return { snapshots: snap, streamOpen, historyBackfillCapped };
}
