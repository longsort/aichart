/**
 * BTC 엣지 엔진 — 앱이 읽는 페이퍼 신호/모드 (JSON만).
 * 레버는 검증 통과값만. 50배 고정 없음. 실주문 OFF.
 */
import fs from 'fs';
import path from 'path';

export const BTC_EDGE_ENGINE_DIR = path.join(process.cwd(), 'btc_edge_engine');
export const BTC_EDGE_ACTIVE_MODE = path.join(
  BTC_EDGE_ENGINE_DIR,
  'outputs/thresholds/active_mode.json'
);
export const BTC_EDGE_LATEST_SIGNAL = path.join(
  BTC_EDGE_ENGINE_DIR,
  'outputs/reports/latest_live_signal.json'
);
export const BTC_EDGE_PAPER_M5 = path.join(
  BTC_EDGE_ENGINE_DIR,
  'outputs/thresholds/paper_survival_m5_v1.json'
);

export type BtcEdgeActiveMode = {
  promote_to_paper?: boolean;
  real_order?: boolean;
  leverage_policy?: string;
  fixed_50x?: boolean;
  leverage?: number;
  max_leverage_allowed?: number;
  threshold?: number;
  sl_pct?: number;
  tp1_pct?: number;
  hold_bars?: number;
  m5?: string;
  sessions?: number[] | null;
  regimes?: number[] | null;
  mode?: string;
  oos_net_ev?: number | null;
  oos_max_dd?: number | null;
  oos_n?: number | null;
  source?: string;
};

export type BtcEdgeLiveSignal = {
  status?: string;
  statusKo?: string;
  reasonKo?: string;
  selected_side?: string | null;
  leverage?: number;
  leverage_policy?: string;
  fixed_50x?: boolean;
  real_order?: boolean;
  paper_only?: boolean;
  cleanProbLong?: number;
  cleanProbShort?: number;
  selected_sl?: number;
  selected_tp1?: number;
  hold_bars?: number;
  sessionKo?: string | null;
  regimeKo?: string | null;
  noteKo?: string;
  updatedAt?: string;
  timestamp?: number;
  oos_net_ev?: number | null;
  oos_max_dd?: number | null;
};

function readJsonSafe<T>(file: string): T | null {
  try {
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

export function readBtcEdgeActiveMode(): BtcEdgeActiveMode | null {
  return readJsonSafe<BtcEdgeActiveMode>(BTC_EDGE_ACTIVE_MODE);
}

export function readBtcEdgeLatestSignal(): BtcEdgeLiveSignal | null {
  return readJsonSafe<BtcEdgeLiveSignal>(BTC_EDGE_LATEST_SIGNAL);
}

export function btcEdgePolicyKo(mode: BtcEdgeActiveMode | null): string {
  if (!mode?.promote_to_paper) {
    return '페이퍼 승격 설정 없음 · 신호 대기 · 실주문 OFF';
  }
  const lev = mode.leverage ?? '?';
  const parts = [
    `레버=${lev}배(검증통과만 · 50배고정없음)`,
    `손절=${((mode.sl_pct ?? 0) * 100).toFixed(2)}%`,
    `1차익절=${((mode.tp1_pct ?? 0) * 100).toFixed(2)}%`,
    `보유≈${mode.hold_bars ?? '?'}봉`,
    `5분확정=${mode.m5 ?? 'none'}`,
    '실주문 OFF',
    '확정수익 아님',
  ];
  return parts.join(' · ');
}
