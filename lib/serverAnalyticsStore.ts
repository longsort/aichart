import { promises as fs } from 'fs';
import path from 'path';
import type { Candle } from '@/types';
import type { UnifiedMarketMetrics } from '@/types';
import {
  makeOpenSignalId,
  settleOpensForKey,
  type TrackedOpenSignal,
  type TrackedSettledSignal,
} from '@/lib/signalOutcomeTracker';

const DATA_DIR = path.join(process.cwd(), 'data');
const FILE = path.join(DATA_DIR, 'analytics-store.json');
const VERSION = 1 as const;

const MAX_SNAPSHOTS_PER_CLIENT = 900;
const MAX_OPEN_SIGNALS_PER_CLIENT = 120;
const MAX_SETTLED_PER_CLIENT = 1600;

export type SlimMarketMetrics = {
  aggregatedCvdUsd: number;
  oiDeltaPct: number | null;
  liquidationLongUsd: number;
  liquidationShortUsd: number;
  cmf20: number | null;
  collectedAtMs: number;
};

export type MarketSnapshotRow = {
  key: string;
  symbol: string;
  timeframe: string;
  barTime: number;
  close: number;
  atMs: number;
  metrics: SlimMarketMetrics | null;
};

type ClientBucket = {
  marketSnapshots: MarketSnapshotRow[];
  openSignals: TrackedOpenSignal[];
  settledSignals: TrackedSettledSignal[];
};

type Root = {
  version: typeof VERSION;
  clients: Record<string, ClientBucket>;
};

function disabled(): boolean {
  return String(process.env.ANALYTICS_PERSIST || '').trim() === '0';
}

async function ensureDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function readRoot(): Promise<Root> {
  try {
    const raw = await fs.readFile(FILE, 'utf8');
    const parsed = JSON.parse(raw) as Root;
    if (!parsed || typeof parsed !== 'object') return { version: VERSION, clients: {} };
    if (parsed.version !== VERSION) return { version: VERSION, clients: {} };
    if (!parsed.clients || typeof parsed.clients !== 'object') return { version: VERSION, clients: {} };
    return parsed;
  } catch {
    return { version: VERSION, clients: {} };
  }
}

async function writeRoot(data: Root) {
  await ensureDir();
  await fs.writeFile(FILE, JSON.stringify(data, null, 2), 'utf8');
}

function bucketFor(root: Root, clientId: string): ClientBucket {
  const k = String(clientId || '').trim() || 'default';
  let b = root.clients[k];
  if (!b) {
    b = { marketSnapshots: [], openSignals: [], settledSignals: [] };
    root.clients[k] = b;
  }
  if (!Array.isArray(b.marketSnapshots)) b.marketSnapshots = [];
  if (!Array.isArray(b.openSignals)) b.openSignals = [];
  if (!Array.isArray(b.settledSignals)) b.settledSignals = [];
  return b;
}

function slimMetrics(m: UnifiedMarketMetrics | null | undefined): SlimMarketMetrics | null {
  if (!m || typeof m !== 'object') return null;
  return {
    aggregatedCvdUsd: Number(m.aggregatedCvdUsd) || 0,
    oiDeltaPct: m.oiDeltaPct == null || !Number.isFinite(Number(m.oiDeltaPct)) ? null : Number(m.oiDeltaPct),
    liquidationLongUsd: Number(m.liquidationLongUsd) || 0,
    liquidationShortUsd: Number(m.liquidationShortUsd) || 0,
    cmf20: m.cmf20 == null || !Number.isFinite(Number(m.cmf20)) ? null : Number(m.cmf20),
    collectedAtMs: Number(m.collectedAtMs) || Date.now(),
  };
}

function lastBar(candles: Candle[]): { time: number; close: number } | null {
  if (!candles.length) return null;
  const c = candles[candles.length - 1];
  const t = Number(c.time);
  if (!Number.isFinite(t)) return null;
  return { time: t, close: Number(c.close) || 0 };
}

export type GatedPlanInput = {
  signalBarTime: number;
  direction: 'LONG' | 'SHORT';
  entry: number;
  stopLoss: number;
  targets: [number, number, number];
} | null;

/**
 * collect=1 시 봉당 1회 마이크로 스냅샷 append, 매 요청 시 해당 심볼·TF 오픈 시그널 정산 시도, 게이트 통과 방향 시그널 기록.
 */
export async function persistAnalyzeAnalytics(args: {
  clientId: string;
  useCollect: boolean;
  symbol: string;
  timeframe: string;
  candles: Candle[];
  unifiedMarketMetrics: UnifiedMarketMetrics | null | undefined;
  gatedVerdict: string;
  gatedPlan: GatedPlanInput;
}): Promise<void> {
  if (disabled()) return;
  const clientId = String(args.clientId || '').trim() || 'default';
  const symbol = String(args.symbol || '').toUpperCase();
  const timeframe = String(args.timeframe || '4h');
  const candles = Array.isArray(args.candles) ? args.candles : [];
  if (!candles.length) return;

  const root = await readRoot();
  const b = bucketFor(root, clientId);
  const now = Date.now();

  const { remaining: afterOthers, settled } = settleOpensForKey(b.openSignals, candles, symbol, timeframe, now);
  b.openSignals = afterOthers;
  if (settled.length) {
    b.settledSignals.push(...settled);
    if (b.settledSignals.length > MAX_SETTLED_PER_CLIENT) {
      b.settledSignals = b.settledSignals.slice(-MAX_SETTLED_PER_CLIENT);
    }
  }

  if (args.useCollect && args.unifiedMarketMetrics) {
    const lb = lastBar(candles);
    if (lb) {
      const snapKey = `${symbol}|${timeframe}`;
      const dup = b.marketSnapshots.some(
        (r) => r.key === snapKey && r.symbol === symbol && r.timeframe === timeframe && r.barTime === lb.time
      );
      if (!dup) {
        b.marketSnapshots.push({
          key: snapKey,
          symbol,
          timeframe,
          barTime: lb.time,
          close: lb.close,
          atMs: now,
          metrics: slimMetrics(args.unifiedMarketMetrics),
        });
        if (b.marketSnapshots.length > MAX_SNAPSHOTS_PER_CLIENT) {
          b.marketSnapshots = b.marketSnapshots.slice(-MAX_SNAPSHOTS_PER_CLIENT);
        }
      }
    }
  }

  if (
    args.gatedVerdict === 'LONG' ||
    args.gatedVerdict === 'SHORT'
  ) {
    const plan = args.gatedPlan;
    if (
      plan &&
      plan.direction === args.gatedVerdict &&
      Number.isFinite(plan.entry) &&
      Number.isFinite(plan.stopLoss) &&
      Number.isFinite(plan.targets[0])
    ) {
      const id = makeOpenSignalId(symbol, timeframe, plan.signalBarTime, plan.direction);
      const exists = b.openSignals.some((o) => o.id === id) || b.settledSignals.some((o) => o.id === id);
      if (!exists) {
        const row: TrackedOpenSignal = {
          id,
          clientId,
          symbol,
          timeframe,
          direction: plan.direction,
          signalBarTime: plan.signalBarTime,
          entry: plan.entry,
          stopLoss: plan.stopLoss,
          tp1: plan.targets[0],
          tp2: Number.isFinite(plan.targets[1]) ? plan.targets[1] : plan.targets[0],
          tp3: Number.isFinite(plan.targets[2]) ? plan.targets[2] : plan.targets[0],
          createdAtMs: now,
        };
        b.openSignals.push(row);
        if (b.openSignals.length > MAX_OPEN_SIGNALS_PER_CLIENT) {
          b.openSignals = b.openSignals.slice(-MAX_OPEN_SIGNALS_PER_CLIENT);
        }
      }
    }
  }

  await writeRoot(root);
}
