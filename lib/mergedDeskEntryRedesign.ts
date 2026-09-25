/**
 * 자동매매 진입 재설계 — 늦은진입·심볼별 SL최소거리·유예·보강매트릭스.
 * 기능 삭제/숨김 없음. 확정 수익·승률 아님.
 */
import { resolveLiveOrderSlTp } from '@/lib/mergedDeskLiveSlTp';
import {
  buildSignalScoreRows,
  readSignalScorecard,
  type SignalScoreRow,
} from '@/lib/mergedDeskSignalScorecard';
import {
  getSymbolLossGuard,
  listSymbolLossGuards,
  symbolLossCooldownGate,
} from '@/lib/mergedDeskSymbolLossGuard';

export type AutoTradeCoinId = 'BTC' | 'ETH' | 'BNB' | 'XRP' | 'SOL';

export type SymbolEntryProfile = {
  id: AutoTradeCoinId | 'OTHER';
  /** 추격 금지: 신호가 대비 유리방향 이탈 비율 */
  lateEntryPct: number;
  /** SL 최소 가격거리 비율 (노이즈 안쪽 SL 거부/확장) */
  minSlPct: number;
  /** 진입 직후 SL 유예 ms (갭 관통은 즉시) */
  graceMs: number;
  /** SL까지 남은 거리 비율 ≤ 이 값이면 부분축소 */
  nearSlFrac: number;
  /** 근접 시 부분 청산 비중 */
  nearSlPartialFrac: number;
};

const PROFILES: Record<AutoTradeCoinId, SymbolEntryProfile> = {
  BTC: {
    id: 'BTC',
    lateEntryPct: 0.0015,
    minSlPct: 0.0012,
    graceMs: 8_000,
    nearSlFrac: 0.3,
    nearSlPartialFrac: 0.3,
  },
  ETH: {
    id: 'ETH',
    lateEntryPct: 0.0018,
    minSlPct: 0.0015,
    graceMs: 8_000,
    nearSlFrac: 0.3,
    nearSlPartialFrac: 0.3,
  },
  BNB: {
    id: 'BNB',
    lateEntryPct: 0.0022,
    minSlPct: 0.002,
    graceMs: 10_000,
    nearSlFrac: 0.3,
    nearSlPartialFrac: 0.3,
  },
  XRP: {
    id: 'XRP',
    lateEntryPct: 0.0025,
    minSlPct: 0.0025,
    graceMs: 10_000,
    nearSlFrac: 0.3,
    nearSlPartialFrac: 0.3,
  },
  SOL: {
    id: 'SOL',
    lateEntryPct: 0.0025,
    minSlPct: 0.0025,
    graceMs: 10_000,
    nearSlFrac: 0.3,
    nearSlPartialFrac: 0.3,
  },
};

const OTHER: SymbolEntryProfile = {
  id: 'OTHER',
  lateEntryPct: 0.002,
  minSlPct: 0.0018,
  graceMs: 8_000,
  nearSlFrac: 0.3,
  nearSlPartialFrac: 0.3,
};

export function normalizeCoinId(symbol: string): AutoTradeCoinId | 'OTHER' {
  const s = String(symbol || '')
    .toUpperCase()
    .replace(/USDT$/, '')
    .replace(/[_-]/g, '');
  if (s === 'BTC' || s === 'XBT') return 'BTC';
  if (s === 'ETH') return 'ETH';
  if (s === 'BNB') return 'BNB';
  if (s === 'XRP') return 'XRP';
  if (s === 'SOL') return 'SOL';
  return 'OTHER';
}

export function getSymbolEntryProfile(symbol: string): SymbolEntryProfile {
  const id = normalizeCoinId(symbol);
  return id === 'OTHER' ? OTHER : PROFILES[id];
}

export function listAutoTradeCoinProfiles(): SymbolEntryProfile[] {
  return [PROFILES.BTC, PROFILES.ETH, PROFILES.BNB, PROFILES.XRP, PROFILES.SOL];
}

/** 늦은 진입(추격) 금지 — 신호 기능은 유지, 자리만 거절 */
export function lateEntryGate(params: {
  symbol: string;
  direction: 'LONG' | 'SHORT';
  signalPrice: number;
  markPrice: number;
}): { allow: boolean; reasonKo: string; movedPct: number } {
  const entry = Number(params.signalPrice);
  const mark = Number(params.markPrice);
  if (!(entry > 0) || !(mark > 0)) {
    return { allow: true, reasonKo: '가격미확정 · 게이트스킵', movedPct: 0 };
  }
  const p = getSymbolEntryProfile(params.symbol);
  const movedPct = (mark - entry) / entry;
  const abs = Math.abs(movedPct);
  if (params.direction === 'LONG' && movedPct > p.lateEntryPct) {
    return {
      allow: false,
      reasonKo: `${p.id} 늦은롱 · 이미 +${(movedPct * 100).toFixed(2)}% · 재터치대기`,
      movedPct,
    };
  }
  if (params.direction === 'SHORT' && movedPct < -p.lateEntryPct) {
    return {
      allow: false,
      reasonKo: `${p.id} 늦은숏 · 이미 ${(movedPct * 100).toFixed(2)}% · 재터치대기`,
      movedPct,
    };
  }
  /** 이미 크게 역행하면 진입 거부(즉시 손절 위험) */
  if (params.direction === 'LONG' && movedPct < -p.minSlPct * 0.85) {
    return {
      allow: false,
      reasonKo: `${p.id} 롱역행 ${(movedPct * 100).toFixed(2)}% · SL근접 스킵`,
      movedPct,
    };
  }
  if (params.direction === 'SHORT' && movedPct > p.minSlPct * 0.85) {
    return {
      allow: false,
      reasonKo: `${p.id} 숏역행 +${(movedPct * 100).toFixed(2)}% · SL근접 스킵`,
      movedPct,
    };
  }
  if (abs > 0) {
    return {
      allow: true,
      reasonKo: `${p.id} 진입거리 OK · ${(movedPct * 100).toFixed(3)}%`,
      movedPct,
    };
  }
  return { allow: true, reasonKo: `${p.id} 타점정렬`, movedPct: 0 };
}

/**
 * SL을 심볼 최소거리까지 넓히되 ROE softCap(구조보호×2) 안.
 * 최소거리도 못 채우면 거부 → 손절률↓ · 신호는 재시도.
 */
export function reinforceSlMinDistance(params: {
  symbol: string;
  entry: number;
  direction: 'LONG' | 'SHORT';
  sl: number;
  leverage: number;
  slRoePct: number;
  preserveStructureSl?: boolean;
}): {
  ok: boolean;
  sl: number;
  widened: boolean;
  reasonKo: string;
  minSlPct: number;
  distPct: number;
} {
  const entry = Number(params.entry);
  const sl0 = Number(params.sl);
  const p = getSymbolEntryProfile(params.symbol);
  if (!(entry > 0) || !(sl0 > 0)) {
    return {
      ok: false,
      sl: 0,
      widened: false,
      reasonKo: 'SL/진입가 없음',
      minSlPct: p.minSlPct,
      distPct: 0,
    };
  }
  const lev = Math.max(1, Math.min(125, Number(params.leverage) || 10));
  const slRoe = Math.max(0.5, Number(params.slRoePct) || 20);
  const softMult = params.preserveStructureSl ? 2 : 1;
  const softMove = (slRoe / 100 / lev) * softMult;
  const softCap =
    params.direction === 'LONG' ? entry * (1 - softMove) : entry * (1 + softMove);

  const minDist = entry * p.minSlPct;
  let sl = sl0;
  let dist = Math.abs(entry - sl);
  let widened = false;

  if (dist < minDist) {
    const target =
      params.direction === 'LONG' ? entry - minDist : entry + minDist;
    if (params.direction === 'LONG') {
      /** softCap보다 더 멀 수는 없음(더 낮은 가격) */
      sl = Math.max(target, softCap);
    } else {
      sl = Math.min(target, softCap);
    }
    widened = Math.abs(sl - sl0) > entry * 1e-8;
    dist = Math.abs(entry - sl);
  }

  if (dist + 1e-12 < minDist * 0.98) {
    return {
      ok: false,
      sl: sl0,
      widened,
      reasonKo: `${p.id} SL너무좁음 · 최소 ${(p.minSlPct * 100).toFixed(2)}% · ROE한도로확장불가 · 재터치`,
      minSlPct: p.minSlPct,
      distPct: dist / entry,
    };
  }

  if (params.direction === 'LONG' && !(sl < entry)) {
    return {
      ok: false,
      sl: sl0,
      widened: false,
      reasonKo: '롱 SL 방향오류',
      minSlPct: p.minSlPct,
      distPct: 0,
    };
  }
  if (params.direction === 'SHORT' && !(sl > entry)) {
    return {
      ok: false,
      sl: sl0,
      widened: false,
      reasonKo: '숏 SL 방향오류',
      minSlPct: p.minSlPct,
      distPct: 0,
    };
  }

  return {
    ok: true,
    sl,
    widened,
    reasonKo: widened
      ? `${p.id} SL최소거리 확장 · ${(dist / entry * 100).toFixed(3)}%`
      : `${p.id} SL거리 OK · ${(dist / entry * 100).toFixed(3)}%`,
    minSlPct: p.minSlPct,
    distPct: dist / entry,
  };
}

/**
 * 빠른익절(ROE TP) vs 구조SL.
 * 레버 높을수록 5%ROE 가격거리가 매우 짧아 SL≤TP 비율은 사실상 전면차단됨.
 * → SL ROE 상한으로 판정 (기본 ≤12% ROE, 또는 TP ROE×3 중 큰 쪽).
 */
export function fastTpSlDistanceGate(params: {
  entry: number;
  direction: 'LONG' | 'SHORT';
  sl: number;
  tp: number;
  leverage?: number;
  /** 하위호환 · 미사용(ROE 상한 우선) */
  maxSlToTp?: number;
  /** 허용 최대 SL ROE% (기본 12) */
  maxSlRoePct?: number;
}): { allow: boolean; reasonKo: string; slDistPct: number; tpDistPct: number } {
  const entry = Number(params.entry);
  const sl = Number(params.sl);
  const tp = Number(params.tp);
  const lev = Math.max(1, Math.min(125, Number(params.leverage) || 10));
  if (!(entry > 0) || !(sl > 0) || !(tp > 0)) {
    return {
      allow: false,
      reasonKo: '거리게이트 · 가격무효',
      slDistPct: 0,
      tpDistPct: 0,
    };
  }
  if (params.direction === 'LONG' && !(sl < entry && tp > entry)) {
    return {
      allow: false,
      reasonKo: '거리게이트 · 롱 SL/TP 방향무효',
      slDistPct: 0,
      tpDistPct: 0,
    };
  }
  if (params.direction === 'SHORT' && !(sl > entry && tp < entry)) {
    return {
      allow: false,
      reasonKo: '거리게이트 · 숏 SL/TP 방향무효',
      slDistPct: 0,
      tpDistPct: 0,
    };
  }
  const slDist = Math.abs(entry - sl);
  const tpDist = Math.abs(tp - entry);
  const slDistPct = (slDist / entry) * 100;
  const tpDistPct = (tpDist / entry) * 100;
  const slRoePct = slDistPct * lev;
  const tpRoePct = tpDistPct * lev;
  const maxSlRoe = Math.max(
    8,
    Math.min(25, Number(params.maxSlRoePct) || Math.max(12, tpRoePct * 3))
  );
  if (slRoePct > maxSlRoe + 0.05) {
    return {
      allow: false,
      reasonKo: `거리불리 · SL ROE ${slRoePct.toFixed(1)}%>${maxSlRoe.toFixed(0)}% · 구조SL너무멂`,
      slDistPct,
      tpDistPct,
    };
  }
  return {
    allow: true,
    reasonKo: `거리OK · SL ROE ${slRoePct.toFixed(1)}% · TP ROE ${tpRoePct.toFixed(1)}%`,
    slDistPct,
    tpDistPct,
  };
}

/** resolveLiveOrderSlTp + 심볼 최소거리 보강 */
export function resolveReinforcedEntrySlTp(params: {
  symbol: string;
  entry: number;
  direction: 'LONG' | 'SHORT';
  leverage: number;
  signalSl?: number | null;
  userSlPrice?: number | null;
  tp1RoePct?: number;
  slRoePct?: number;
  timeframe?: string | null;
  preserveStructureSl?: boolean;
}): {
  ok: boolean;
  sl: number;
  tp: number;
  tp1RoePct: number;
  slRoePct: number;
  clampedSl: boolean;
  usedSignalSl: boolean;
  priceMoveSlPct: number;
  widened: boolean;
  reasonKo: string;
} {
  const base = resolveLiveOrderSlTp({
    entry: params.entry,
    direction: params.direction,
    leverage: params.leverage,
    signalSl: params.signalSl,
    userSlPrice: params.userSlPrice,
    tp1RoePct: params.tp1RoePct,
    slRoePct: params.slRoePct,
    timeframe: params.timeframe,
    preserveStructureSl: params.preserveStructureSl,
  });
  if (!(base.sl > 0)) {
    return {
      ok: false,
      ...base,
      widened: false,
      reasonKo: 'SL 산출 실패',
    };
  }
  const rein = reinforceSlMinDistance({
    symbol: params.symbol,
    entry: params.entry,
    direction: params.direction,
    sl: base.sl,
    leverage: params.leverage,
    slRoePct: base.slRoePct,
    preserveStructureSl: params.preserveStructureSl,
  });
  if (!rein.ok) {
    return {
      ok: false,
      ...base,
      widened: rein.widened,
      reasonKo: rein.reasonKo,
    };
  }
  return {
    ok: true,
    ...base,
    sl: rein.sl,
    clampedSl: base.clampedSl || rein.widened,
    widened: rein.widened,
    reasonKo: rein.reasonKo,
  };
}

/** 진입 유예: true면 전량손절 스킵 (갭관통 제외) */
export function shouldSkipSlForEntryGrace(params: {
  symbol: string;
  openedAt: number;
  entry: number;
  direction: 'LONG' | 'SHORT';
  sl: number;
  mark: number;
  now?: number;
}): { skip: boolean; reasonKo: string; gapThrough: boolean } {
  const p = getSymbolEntryProfile(params.symbol);
  const now = params.now ?? Date.now();
  const age = now - params.openedAt;
  if (age >= p.graceMs) {
    return { skip: false, reasonKo: '유예종료', gapThrough: false };
  }
  const minGap = params.entry * p.minSlPct * 1.5;
  const through =
    params.direction === 'LONG'
      ? params.mark <= params.sl - minGap
      : params.mark >= params.sl + minGap;
  if (through) {
    return { skip: false, reasonKo: '갭관통 · 즉시손절', gapThrough: true };
  }
  return {
    skip: true,
    reasonKo: `${p.id} 진입유예 ${Math.ceil((p.graceMs - age) / 1000)}s`,
    gapThrough: false,
  };
}

/** SL 근접 + 미실현 손실 → 부분축소 후보 */
export function nearSlPartialPlan(params: {
  symbol: string;
  entry: number;
  direction: 'LONG' | 'SHORT';
  sl: number;
  mark: number;
  alreadyDone?: boolean;
}): { doPartial: boolean; frac: number; reasonKo: string } {
  if (params.alreadyDone) {
    return { doPartial: false, frac: 0, reasonKo: '부분축소 완료' };
  }
  const p = getSymbolEntryProfile(params.symbol);
  const dist = Math.abs(params.entry - params.sl);
  if (!(dist > 0)) return { doPartial: false, frac: 0, reasonKo: 'SL거리없음' };
  const remain = Math.abs(params.mark - params.sl);
  const remainFrac = remain / dist;
  const losing =
    params.direction === 'LONG'
      ? params.mark < params.entry
      : params.mark > params.entry;
  if (losing && remainFrac <= p.nearSlFrac) {
    return {
      doPartial: true,
      frac: p.nearSlPartialFrac,
      reasonKo: `${p.id} SL근접 부분축소 ${(p.nearSlPartialFrac * 100).toFixed(0)}%`,
    };
  }
  return { doPartial: false, frac: 0, reasonKo: '근접아님' };
}

export type SymbolReinforceMatrixRow = {
  coin: AutoTradeCoinId;
  consecutiveSl: number;
  sizeMult: number;
  cooling: boolean;
  remainSec: number;
  guardKo: string;
  profile: SymbolEntryProfile;
  tradeCount: number;
  wins: number;
  losses: number;
  slExits: number;
  netPnl: number;
  failRate: number;
  slRate: number;
  signalRows: SignalScoreRow[];
  worstKo: string;
  keepCount: number;
  reinforceCount: number;
  whyKo: string;
  actionKo: string;
};

/** BTC·ETH·BNB·XRP 전부 표시(숨김 없음) */
export function buildAutoTradeSymbolMatrix(): {
  rows: SymbolReinforceMatrixRow[];
  summaryKo: string;
} {
  const score = buildSignalScoreRows();
  const { closed } = readSignalScorecard();
  const rows: SymbolReinforceMatrixRow[] = (['BTC', 'ETH', 'BNB', 'XRP', 'SOL'] as const).map(
    (coin) => {
      const guard = getSymbolLossGuard(coin);
      const cool = symbolLossCooldownGate(coin);
      const profile = PROFILES[coin];
      const coinTrades = closed.filter((t) => normalizeCoinId(t.symbol) === coin);
      let wins = 0;
      let losses = 0;
      let slExits = 0;
      let netPnl = 0;
      for (const t of coinTrades) {
        netPnl += t.pnlUsdt;
        if (t.win) wins += 1;
        else losses += 1;
        if (/손절|SL|stop|잠금/i.test(t.exitReason)) slExits += 1;
      }
      const tradeCount = coinTrades.length;
      const failRate = tradeCount > 0 ? losses / tradeCount : 0;
      const slRate = tradeCount > 0 ? slExits / tradeCount : 0;
      const signalRows = score.rows.filter(
        (r) =>
          r.signalKey.toUpperCase().includes(coin) ||
          closed.some(
            (t) => t.signalKey === r.signalKey && normalizeCoinId(t.symbol) === coin
          )
      );
      const reinforceCount = signalRows.filter((r) => r.verdict === 'reinforce').length;
      const keepCount = signalRows.filter((r) => r.verdict === 'keep').length;
      const worst = signalRows.find((r) => r.verdict === 'reinforce');

      let whyKo = `${coin} 표본 ${tradeCount} · 손절률 ${(slRate * 100).toFixed(0)}% · 손익 ${netPnl >= 0 ? '+' : ''}${netPnl.toFixed(1)}U`;
      let actionKo = `늦은진입≤${(profile.lateEntryPct * 100).toFixed(2)}% · SL최소${(profile.minSlPct * 100).toFixed(2)}% · 유예${profile.graceMs / 1000}s 적용중`;
      if (!cool.allow) {
        whyKo = `${coin} 연속손절 쿨다운 · ${whyKo}`;
        actionKo = `쿨다운 ${cool.remainSec}s · 비중×${cool.sizeMult}`;
      } else if (guard.consecutiveSl >= 1) {
        whyKo = `${coin} 최근 연속손절 ${guard.consecutiveSl} · ${whyKo}`;
        actionKo = `다음비중×${guard.sizeMult} · ${actionKo}`;
      } else if (tradeCount >= 5 && slRate >= 0.45 && netPnl < 0) {
        whyKo = `${coin} 손절·순손실 많음 · ${whyKo}`;
        actionKo = 'SL버퍼·늦은진입·비중 유지강화 · 보강기록 다운로드 권장';
      } else if (tradeCount >= 5 && failRate <= 0.4 && netPnl > 0) {
        whyKo = `${coin} 성적 양호 · ${whyKo}`;
        actionKo = '조건 유지 · 무리한 비중확대 금지';
      }
      if (worst) {
        whyKo = `${whyKo} · 신호: ${worst.whyKo}`;
        actionKo = `${actionKo} · ${worst.actionKo}`;
      }

      return {
        coin,
        consecutiveSl: guard.consecutiveSl,
        sizeMult: guard.sizeMult,
        cooling: !cool.allow,
        remainSec: cool.remainSec,
        guardKo: cool.reasonKo,
        profile,
        tradeCount,
        wins,
        losses,
        slExits,
        netPnl,
        failRate,
        slRate,
        signalRows,
        worstKo: worst ? `${worst.signalKo}` : '—',
        keepCount,
        reinforceCount,
        whyKo,
        actionKo,
      };
    }
  );
  const hot = rows.filter((r) => r.cooling || r.consecutiveSl > 0 || r.slRate >= 0.45)
    .length;
  return {
    rows,
    summaryKo: hot
      ? `4심볼 중 ${hot}개 손절/보강 주의 · 전부 표시 · 확정아님`
      : 'BTC·ETH·BNB·XRP 전부 표시 · 늦은진입·SL최소·유예 공통적용',
  };
}

export function matrixGuardsSnapshot() {
  return {
    profiles: listAutoTradeCoinProfiles(),
    guards: listSymbolLossGuards(),
    matrix: buildAutoTradeSymbolMatrix(),
  };
}

/** 보강필요 JSON + 4심볼 매트릭스 (순환참조 없이 entry 쪽에서 합침) */
export function downloadReinforceNeededWithMatrix(filenameHint?: string): void {
  if (typeof window === 'undefined') return;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const sc = require('@/lib/mergedDeskSignalScorecard') as {
    buildReinforceNeededExportPack: () => Record<string, unknown>;
  };
  const pack = {
    ...sc.buildReinforceNeededExportPack(),
    symbolMatrix: buildAutoTradeSymbolMatrix(),
    entryProfiles: listAutoTradeCoinProfiles(),
  };
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const name = filenameHint || `ailongshort-reinforce-needed-${day}.json`;
  const blob = new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
