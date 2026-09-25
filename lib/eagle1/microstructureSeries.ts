/**
 * Bitget fills / book / liquidation → OFI 10s·30s, 호가 복원, 청산 가속.
 * 캔들 몸통으로 OFI를 만들지 않는다. 시리즈가 없으면 null.
 */

export type Eagle1Fill = {
  time: number;
  qty: number;
  isBuyerMaker: boolean;
};

export type OfiBucket = {
  t: number;
  buyQty: number;
  sellQty: number;
  ofi: number;
};

export type BookSnap = {
  t: number;
  bidQty: number;
  askQty: number;
  spreadBps: number | null;
  imbalance: number | null;
};

export type LiqPoint = {
  t: number;
  side: 'long' | 'short';
  usd: number;
  price: number;
  amount: number;
};

export type ReplenishmentReport = {
  replenishBid: number | null;
  replenishAsk: number | null;
  score: number | null;
  sample: number;
  note: string;
};

export type LiqAccelReport = {
  accel: boolean | null;
  seriesPoints: number;
  lastUsd: number;
  prevUsd: number;
  note: string;
};

function toMs(t: number): number {
  return t > 1e12 ? t : t * 1000;
}

function ofiFromQty(buyQty: number, sellQty: number): number | null {
  const tot = buyQty + sellQty;
  if (!(tot > 0)) return null;
  return (buyQty - sellQty) / tot;
}

/** 체결을 bucketMs 구간 OFI로 묶는다. 빈 체결은 빈 배열 — 가짜 OFI 금지. */
export function bucketTradesToOfi(trades: Eagle1Fill[], bucketMs: number): OfiBucket[] {
  const step = Math.max(1, Math.floor(bucketMs));
  if (!trades.length) return [];
  const map = new Map<number, { buyQty: number; sellQty: number }>();
  for (const tr of trades) {
    const ts = toMs(Number(tr.time));
    const qty = Number(tr.qty);
    if (!Number.isFinite(ts) || ts <= 0 || !(qty > 0)) continue;
    const t = Math.floor(ts / step) * step;
    const row = map.get(t) ?? { buyQty: 0, sellQty: 0 };
    if (tr.isBuyerMaker) row.sellQty += qty;
    else row.buyQty += qty;
    map.set(t, row);
  }
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([t, q]) => {
      const ofi = ofiFromQty(q.buyQty, q.sellQty);
      return ofi == null
        ? null
        : { t, buyQty: q.buyQty, sellQty: q.sellQty, ofi };
    })
    .filter((x): x is OfiBucket => x != null);
}

export function lastOfi(buckets: OfiBucket[] | null | undefined): number | null {
  if (!buckets?.length) return null;
  const last = buckets[buckets.length - 1]!;
  return Number.isFinite(last.ofi) ? last.ofi : null;
}

export function ofiInWindow(buckets: OfiBucket[] | null | undefined, fromMs: number, toMs: number): number | null {
  if (!buckets?.length) return null;
  let buy = 0;
  let sell = 0;
  let n = 0;
  for (const b of buckets) {
    if (b.t >= fromMs && b.t < toMs) {
      buy += b.buyQty;
      sell += b.sellQty;
      n += 1;
    }
  }
  if (n <= 0) return null;
  return ofiFromQty(buy, sell);
}

/**
 * 호가 복원: 직전 대비 수량이 줄었다가 이후 스냅에서 회복한 비율.
 * 스냅 1개면 시리즈 아님. 소진 이벤트가 없으면 score null (가짜 복원속도 금지).
 */
export function replenishmentFromBooks(snaps: BookSnap[] | null | undefined): ReplenishmentReport {
  const rows = [...(snaps ?? [])].filter((s) => s.t > 0 && Number.isFinite(s.bidQty) && Number.isFinite(s.askQty)).sort((a, b) => a.t - b.t);
  if (rows.length < 2) {
    return {
      replenishBid: null,
      replenishAsk: null,
      score: null,
      sample: rows.length,
      note: rows.length <= 0 ? '호가 시리즈 없음' : '호가 스냅 1개 · 복원속도 시리즈 없음',
    };
  }

  const recover = (side: 'bidQty' | 'askQty'): number | null => {
    let dropped = 0;
    let recovered = 0;
    for (let i = 1; i < rows.length; i++) {
      const prev = rows[i - 1]![side];
      const cur = rows[i]![side];
      if (!(prev > 0) || !(cur >= 0)) continue;
      if (cur < prev * 0.98) {
        dropped += prev - cur;
        const floor = cur;
        const look = Math.min(rows.length - 1, i + 3);
        let peak = floor;
        for (let j = i + 1; j <= look; j++) {
          peak = Math.max(peak, rows[j]![side]);
        }
        recovered += Math.max(0, Math.min(prev, peak) - floor);
      }
    }
    if (!(dropped > 0)) return null;
    return Math.max(0, Math.min(1, recovered / dropped));
  };

  const replenishBid = recover('bidQty');
  const replenishAsk = recover('askQty');
  const parts = [replenishBid, replenishAsk].filter((n): n is number => n != null);
  const score = parts.length ? (parts.reduce((a, b) => a + b, 0) / parts.length) * 100 : null;
  return {
    replenishBid,
    replenishAsk,
    score,
    sample: rows.length,
    note:
      score == null
        ? `호가 스냅 ${rows.length} · 소진 후 복원 이벤트 없음`
        : `호가 스냅 ${rows.length} · 복원비율 실측`,
  };
}

const LIQ_WINDOW_MS = 60_000;

/** 최근 60초 vs 직전 60초 청산 명목. 과거 창이 없으면 가속 판정 안 함. */
export function liqAccelFromPoints(points: LiqPoint[] | null | undefined, nowMs?: number): LiqAccelReport {
  const rows = [...(points ?? [])].filter((p) => p.t > 0 && p.usd > 0).sort((a, b) => a.t - b.t);
  if (rows.length < 2) {
    return {
      accel: null,
      seriesPoints: rows.length,
      lastUsd: 0,
      prevUsd: 0,
      note: rows.length <= 0 ? '청산 시리즈 없음' : '청산 포인트 1개 · 시리즈 아님',
    };
  }
  const now = nowMs != null && Number.isFinite(nowMs) ? nowMs : rows[rows.length - 1]!.t;
  const lastUsd = rows.filter((p) => p.t > now - LIQ_WINDOW_MS && p.t <= now).reduce((s, p) => s + p.usd, 0);
  const prevUsd = rows.filter((p) => p.t > now - LIQ_WINDOW_MS * 2 && p.t <= now - LIQ_WINDOW_MS).reduce((s, p) => s + p.usd, 0);
  const hasPrevWindow = rows.some((p) => p.t <= now - LIQ_WINDOW_MS);
  if (!hasPrevWindow) {
    return {
      accel: null,
      seriesPoints: rows.length,
      lastUsd,
      prevUsd: 0,
      note: `청산 포인트 ${rows.length} · 비교 창 부족`,
    };
  }
  const accel = lastUsd > 0 && lastUsd > prevUsd * 1.5;
  return {
    accel,
    seriesPoints: rows.length,
    lastUsd,
    prevUsd,
    note: `청산 포인트 ${rows.length} · 최근/직전 60초`,
  };
}

export function ofiDirKo(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return '데이터 없음';
  if (Math.abs(v) < 0.04) return '중립';
  return v > 0 ? '매수우세' : '매도우세';
}

/** 15m 종가 직후 10초/30초 OFI. 해당 창 버킷이 없으면 데이터 없음. */
export function clockSubMinuteLabel(params: {
  ofi10s?: OfiBucket[] | null;
  slotCloseMs: number;
}): string {
  const buckets = params.ofi10s ?? [];
  if (!buckets.length) return '데이터 없음';
  const closeMs = params.slotCloseMs;
  const ofi10 = ofiInWindow(buckets, closeMs, closeMs + 10_000);
  const ofi30 = ofiInWindow(buckets, closeMs, closeMs + 30_000);
  if (ofi10 == null && ofi30 == null) return '데이터 없음';
  return `10초 ${ofiDirKo(ofi10)} · 30초 ${ofiDirKo(ofi30)}`;
}

export function bookSnapFromDepth(input: {
  time: number;
  bids: Array<[number, number]>;
  asks: Array<[number, number]>;
}): BookSnap | null {
  const bids = input.bids;
  const asks = input.asks;
  if (!bids.length || !asks.length) return null;
  const bidPx = Number(bids[0]?.[0]);
  const askPx = Number(asks[0]?.[0]);
  let bidQty = 0;
  let askQty = 0;
  let bidNotional = 0;
  let askNotional = 0;
  for (const row of bids.slice(0, 5)) {
    const p = Number(row[0]);
    const q = Number(row[1]);
    if (p > 0 && q > 0) {
      bidQty += q;
      bidNotional += p * q;
    }
  }
  for (const row of asks.slice(0, 5)) {
    const p = Number(row[0]);
    const q = Number(row[1]);
    if (p > 0 && q > 0) {
      askQty += q;
      askNotional += p * q;
    }
  }
  if (!(bidQty > 0) || !(askQty > 0)) return null;
  const tot = bidNotional + askNotional;
  const spreadBps =
    bidPx > 0 && askPx > bidPx ? ((askPx - bidPx) / ((askPx + bidPx) / 2)) * 10_000 : null;
  return {
    t: toMs(Number(input.time) || Date.now()),
    bidQty,
    askQty,
    spreadBps,
    imbalance: tot > 0 ? (bidNotional - askNotional) / tot : null,
  };
}
