/**
 * Phase 5 — OrderFlow 파사드. CVD/OI/LOB/OFI.
 * 없으면 데이터 없음. 가짜 CVD·날조 OFI 금지.
 */
import type { Eagle1MoneyPressureLive } from './moneyPressureBand';

export type OrderFlowChannel = {
  key: 'cvd' | 'oi' | 'lob' | 'ofi';
  available: boolean;
  stale: boolean;
  valueText: string;
  labelKo: string;
  note: string;
};

export type OrderFlowReport = {
  channels: OrderFlowChannel[];
  hasAnyLive: boolean;
  inventedForbidden: true;
  summaryKo: string;
};

function cvdChannel(live?: Eagle1MoneyPressureLive | null): OrderFlowChannel {
  const has = Boolean(live?.has_cvd);
  const vd = typeof live?.volumeDelta === 'number' && Number.isFinite(live.volumeDelta) ? live.volumeDelta : null;
  const available = has && vd != null;
  const stale = has && vd == null;
  return {
    key: 'cvd',
    available,
    stale,
    valueText: available ? (vd! > 0 ? '매수 우위' : vd! < 0 ? '매도 우위' : '중립') : '데이터 없음',
    labelKo: 'CVD',
    note: stale ? '플래그만 있고 값 없음 · stale' : available ? '실거래 델타' : '데이터 없음',
  };
}

function oiChannel(live?: Eagle1MoneyPressureLive | null): OrderFlowChannel {
  const st = live?.oiState ?? null;
  const available = st === 'increasing' || st === 'decreasing' || st === 'neutral';
  return {
    key: 'oi',
    available,
    stale: false,
    valueText: available
      ? st === 'increasing'
        ? '증가'
        : st === 'decreasing'
          ? '감소'
          : '중립'
      : '데이터 없음',
    labelKo: 'OI',
    note: available ? '미결제약정 상태' : '데이터 없음',
  };
}

function lobChannel(live?: Eagle1MoneyPressureLive | null): OrderFlowChannel {
  const has = Boolean(live?.has_orderbook);
  const imb =
    typeof live?.orderbookImbalance === 'number' && Number.isFinite(live.orderbookImbalance)
      ? live.orderbookImbalance
      : null;
  const available = has && imb != null;
  const stale = has && imb == null;
  return {
    key: 'lob',
    available,
    stale,
    valueText: available ? (imb! > 0.05 ? '매수벽' : imb! < -0.05 ? '매도벽' : '균형') : '데이터 없음',
    labelKo: '호가',
    note: stale ? '호가 플래그·값 불일치 · stale' : available ? '실시간 호가 불균형' : '데이터 없음',
  };
}

function ofiChannel(live?: Eagle1MoneyPressureLive | null): OrderFlowChannel {
  const has = Boolean(live?.has_ofi);
  const ofi = typeof live?.ofi === 'number' && Number.isFinite(live.ofi) ? live.ofi : null;
  const available = has && ofi != null;
  const stale = has && ofi == null;
  return {
    key: 'ofi',
    available,
    stale,
    valueText: available ? (ofi! > 0 ? '유입' : ofi! < 0 ? '유출' : '중립') : '데이터 없음',
    labelKo: 'OFI',
    note: stale ? 'OFI stale' : available ? '주문흐름 불균형' : '데이터 없음',
  };
}

export function runOrderFlowFacade(params: {
  live?: Eagle1MoneyPressureLive | null;
}): OrderFlowReport {
  const channels = [cvdChannel(params.live), oiChannel(params.live), lobChannel(params.live), ofiChannel(params.live)];
  const hasAnyLive = channels.some((c) => c.available);
  const staleN = channels.filter((c) => c.stale).length;
  return {
    channels,
    hasAnyLive,
    inventedForbidden: true,
    summaryKo: hasAnyLive
      ? `수급 채널 ${channels.filter((c) => c.available).length}/4${staleN ? ` · stale ${staleN}` : ''}`
      : '데이터 없음 · 가짜 CVD 없음',
  };
}
