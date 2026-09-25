/**
 * 통합분석 패널 — 시드·레버리지·진입가 기준 SL/TP 손익 계산.
 * 조건부 참고 — 실제 체결·수수료·슬리피지와 다를 수 있음.
 */

export type IntegratedTradePnLDirection = 'LONG' | 'SHORT';

export type IntegratedTradePnLLevelResult = {
  key: string;
  labelKo: string;
  price: number;
  movePct: number;
  pnlUsdt: number;
  roePct: number;
  kind: 'entry' | 'sl' | 'tp';
};

export type IntegratedTradePnLResult = {
  direction: IntegratedTradePnLDirection;
  seedUsdt: number;
  leverage: number;
  adjustPct: number;
  marginUsdt: number;
  notionalUsdt: number;
  qty: number;
  entry: number;
  levels: IntegratedTradePnLLevelResult[];
  headlineKo: string;
};

const FEE_ROUND_TRIP = 0.001;

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function resolveIntegratedTradeDirection(
  master: 'LONG' | 'SHORT' | 'NEUTRAL',
  entry: number,
  stopLoss: number,
  tp1: number
): IntegratedTradePnLDirection {
  if (master === 'LONG' || master === 'SHORT') return master;
  if (entry > 0 && stopLoss > 0 && stopLoss !== entry) {
    return stopLoss < entry ? 'LONG' : 'SHORT';
  }
  if (entry > 0 && tp1 > 0 && tp1 !== entry) {
    return tp1 > entry ? 'LONG' : 'SHORT';
  }
  return 'LONG';
}

export function computeIntegratedTradePnL(params: {
  seedUsdt: number;
  leverage: number;
  adjustPct: number;
  entry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  direction: IntegratedTradePnLDirection;
  includeFee?: boolean;
}): IntegratedTradePnLResult | null {
  const seedUsdt = Math.max(0, params.seedUsdt);
  const leverage = Math.max(1, params.leverage);
  const adjustPct = clamp(params.adjustPct, 1, 100);
  const entry = params.entry;

  if (!Number.isFinite(entry) || entry <= 0 || seedUsdt <= 0) return null;

  const marginUsdt = seedUsdt * (adjustPct / 100);
  const notionalUsdt = marginUsdt * leverage;
  const qty = notionalUsdt / entry;
  const dir = params.direction;

  const calcLevel = (
    key: string,
    labelKo: string,
    price: number,
    kind: IntegratedTradePnLLevelResult['kind']
  ): IntegratedTradePnLLevelResult | null => {
    if (!Number.isFinite(price) || price <= 0) return null;
    const rawMove =
      dir === 'LONG' ? (price - entry) / entry : (entry - price) / entry;
    const movePct = rawMove * 100;
    let pnlUsdt = notionalUsdt * rawMove;
    if (params.includeFee !== false && kind !== 'entry') {
      pnlUsdt -= notionalUsdt * FEE_ROUND_TRIP;
    }
    const roePct = marginUsdt > 0 ? (pnlUsdt / marginUsdt) * 100 : 0;
    return { key, labelKo, price, movePct, pnlUsdt, roePct, kind };
  };

  const levels: IntegratedTradePnLLevelResult[] = [];
  const entryLv = calcLevel('entry', '진입 E', entry, 'entry');
  if (entryLv) levels.push(entryLv);

  const sl = calcLevel('sl', '손절 SL', params.stopLoss, 'sl');
  if (sl) levels.push(sl);

  for (const [key, label, price] of [
    ['tp1', 'TP1', params.tp1],
    ['tp2', 'TP2', params.tp2],
    ['tp3', 'TP3', params.tp3],
  ] as const) {
    const lv = calcLevel(key, label, price, 'tp');
    if (lv) levels.push(lv);
  }

  const slLv = levels.find((l) => l.kind === 'sl');
  const tp1Lv = levels.find((l) => l.key === 'tp1');
  const headlineKo = [
    `${dir === 'LONG' ? '롱' : '숏'} · 증거금 ${marginUsdt.toFixed(0)}U · ${leverage}x`,
    slLv ? `SL ${slLv.pnlUsdt >= 0 ? '+' : ''}${slLv.pnlUsdt.toFixed(1)}U` : null,
    tp1Lv ? `TP1 ${tp1Lv.pnlUsdt >= 0 ? '+' : ''}${tp1Lv.pnlUsdt.toFixed(1)}U` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return {
    direction: dir,
    seedUsdt,
    leverage,
    adjustPct,
    marginUsdt,
    notionalUsdt,
    qty,
    entry,
    levels,
    headlineKo,
  };
}

export type IntegratedTradePnLStoredInputs = {
  seedUsdt: number;
  leverage: number;
  adjustPct: number;
  entryOverride: number | null;
};

const STORAGE_KEY = 'ailongshort-integrated-pnl-calc';

export function readIntegratedTradePnLInputs(): IntegratedTradePnLStoredInputs {
  if (typeof window === 'undefined') {
    return { seedUsdt: 1000, leverage: 10, adjustPct: 100, entryOverride: null };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { seedUsdt: 1000, leverage: 10, adjustPct: 100, entryOverride: null };
    const j = JSON.parse(raw) as Partial<IntegratedTradePnLStoredInputs>;
    return {
      seedUsdt: Number(j.seedUsdt) > 0 ? Number(j.seedUsdt) : 1000,
      leverage: Number(j.leverage) >= 1 ? Number(j.leverage) : 10,
      adjustPct: clamp(Number(j.adjustPct) || 100, 1, 100),
      entryOverride: j.entryOverride != null && Number(j.entryOverride) > 0 ? Number(j.entryOverride) : null,
    };
  } catch {
    return { seedUsdt: 1000, leverage: 10, adjustPct: 100, entryOverride: null };
  }
}

export function writeIntegratedTradePnLInputs(inputs: IntegratedTradePnLStoredInputs): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(inputs));
  } catch {
    /* ignore */
  }
}
