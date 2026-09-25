/**
 * 실진입 게이트 — 클라이언트용 체크리스트 (next/headers 없음).
 * 확정 수익 아님.
 */

export type EntryPingStep = {
  id: string;
  ok: boolean;
  labelKo: string;
  detailKo: string;
  block?: boolean;
};

export function entryPingStep(
  id: string,
  ok: boolean,
  labelKo: string,
  detailKo: string,
  block = !ok
): EntryPingStep {
  return { id, ok, labelKo, detailKo, block: block && !ok };
}

/** 브라우저 localStorage 설정 게이트 */
export function pingClientAutoTradeGates(cfg: {
  enabled: boolean;
  liveArmed: boolean;
  strategyScalp: boolean;
  strategyDoksuri1?: boolean;
  enabledSymbols?: string[];
  scalpEquityPct?: number;
  equityPct?: number;
  maxConcurrent?: number;
  keysConfigured?: boolean;
  keysAuthOk?: boolean;
  symbol?: string;
}): EntryPingStep[] {
  const sym = String(cfg.symbol || 'BTCUSDT').toUpperCase();
  const chipOn =
    !cfg.enabledSymbols?.length ||
    cfg.enabledSymbols.some((s) => String(s).toUpperCase() === sym);
  const pct = cfg.scalpEquityPct ?? cfg.equityPct ?? 5;
  return [
    entryPingStep(
      'engine',
      cfg.enabled || cfg.liveArmed,
      '엔진',
      cfg.enabled || cfg.liveArmed ? 'ON' : 'OFF'
    ),
    entryPingStep('arm', cfg.liveArmed, '실전ARM', cfg.liveArmed ? 'ON' : 'OFF · 페이퍼/대기만'),
    entryPingStep(
      'scalp',
      cfg.strategyScalp,
      '단타전략',
      cfg.strategyScalp ? 'ON' : 'OFF · 캔들LS/폭락 진입 스킵'
    ),
    entryPingStep('chip', chipOn, `${sym}칩`, chipOn ? 'ON' : 'OFF'),
    entryPingStep('size', pct > 0, '비중%', `${pct}% · 주문 성공 시에만 적용`),
    entryPingStep(
      'keysClient',
      Boolean(cfg.keysConfigured && cfg.keysAuthOk !== false),
      '클라이언트키상태',
      cfg.keysConfigured
        ? cfg.keysAuthOk === false
          ? '인증실패'
          : '등록됨'
        : '미등록'
    ),
  ];
}
