/**
 * 파랑·빨강띠 파동 LOCK / FREEZE / REBUILD.
 * 매봉 재적합 금지 — 구조 파동 안에서 레일 고정, 전환 때만 재구축.
 * 미래 연장(tDrawEnd/up2)을 마지막 봉 인덱스로 잘못 투영하면 세로 스파이크가 생기므로
 * tipUpper/tipLower(마지막 봉 레일)만으로 기울기를 잠근다.
 * 확정 수익·승률 아님.
 */
import type { Candle, OverlayItem } from '@/types';
import type {
  MergedDeskBlueRedChannelPack,
  MergedDeskChannelGeom,
  MergedDeskChannelHorizon,
} from '@/lib/mergedDeskBlueRedChannels';
import type { AtlasPulsePriceLine } from '@/lib/monthDeskAtlasPulseDesk';

/** 파랑빨강띠 — 미래 빈축 없음. 마지막 파동·실봉까지 */
function rbWaveTimeEnd(candles: Candle[], iEnd: number): number {
  const i = Math.max(0, Math.min(iEnd, candles.length - 1));
  return Number(candles[i]!.time);
}

export type RbWavePhase = 'LOCK' | 'FREEZE' | 'REBUILD' | 'LIVE';

export type MergedDeskRbWaveLockPack = {
  phase: RbWavePhase;
  horizon: MergedDeskChannelHorizon | null;
  descending: boolean;
  lockedGeom: MergedDeskChannelGeom | null;
  flipKo: string | null;
  summaryKo: string;
  priceLines: AtlasPulsePriceLine[];
};

type MemRail = {
  phase: 'LOCK' | 'FREEZE';
  horizon: MergedDeskChannelHorizon;
  descending: boolean;
  /** 인덱스 공간: price = intercept + slope * i  (마지막 실봉 기준 tip) */
  upIntercept: number;
  upSlope: number;
  loIntercept: number;
  loSlope: number;
  iStart: number;
  /** LOCK/FREEZE 공통: 파동 문닫힘 봉 인덱스 — 최신 실봉으로 열지 않음 */
  iEndAtLock: number;
  tStart: number;
  quality: number;
  lockBarTime: number;
  barsOutside: number;
  /** 이탈 카운트에 이미 반영한 봉 시각 — 같은 봉 재호출로 폭주 재구축 방지 */
  outsideBarTime: number;
  /** 마지막 REBUILD 시각(ms) — 연속 재구축 쿨다운 */
  lastRebuildAtMs: number;
  tipUpperAtLock: number;
  tipLowerAtLock: number;
};

const MEM = new Map<string, MemRail>();

function atrApprox(candles: Candle[], end = candles.length - 1): number {
  const start = Math.max(1, end - 13);
  let s = 0;
  let n = 0;
  for (let i = start; i <= end; i++) {
    const c = candles[i]!;
    const p = candles[i - 1]!.close;
    s += Math.max(c.high - c.low, Math.abs(c.high - p), Math.abs(c.low - p));
    n += 1;
  }
  return n > 0 ? s / n : Math.abs(candles[end]?.close ?? 1) * 0.01;
}

function idxOfTime(candles: Candle[], t: number): number {
  const tt = Number(t);
  if (!Number.isFinite(tt)) return -1;
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < candles.length; i++) {
    const d = Math.abs(Number(candles[i]!.time) - tt);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/**
 * 기울기는 파동 문닫힘 tip(tEnd) 기준.
 * geom.up2/lo2/tEnd 는 파동 끝 — 최신봉으로 다시 열지 않음.
 */
function railsFromGeom(
  g: MergedDeskChannelGeom,
  candles: Candle[]
): {
  upIntercept: number;
  upSlope: number;
  loIntercept: number;
  loSlope: number;
  iStart: number;
  iWaveEnd: number;
} | null {
  const iStart = idxOfTime(candles, g.tStart);
  const iLive = candles.length - 1;
  let iWaveEnd = idxOfTime(candles, g.tEnd);
  if (iWaveEnd < 0) iWaveEnd = iLive;
  iWaveEnd = Math.max(iStart + 2, Math.min(iWaveEnd, iLive));
  if (iStart < 0 || iWaveEnd <= iStart) return null;
  const span = iWaveEnd - iStart;
  if (span < 2) return null;

  const tipU = Number(g.tipUpper);
  const tipL = Number(g.tipLower);
  const up1 = Number(g.up1);
  const lo1 = Number(g.lo1);
  if (![tipU, tipL, up1, lo1].every((x) => Number.isFinite(x) && x > 0)) return null;
  if (!(tipU > tipL)) return null;

  const upSlope = (tipU - up1) / span;
  const loSlope = (tipL - lo1) / span;
  if (![upSlope, loSlope].every(Number.isFinite)) return null;

  return {
    upIntercept: up1 - upSlope * iStart,
    upSlope,
    loIntercept: lo1 - loSlope * iStart,
    loSlope,
    iStart,
    iWaveEnd,
  };
}

function saneTips(
  tipUpper: number,
  tipLower: number,
  close: number,
  atr: number
): boolean {
  if (!(tipUpper > tipLower)) return false;
  if (!(close > 0) || !(atr > 0)) return tipUpper > tipLower;
  const width = tipUpper - tipLower;
  if (width > atr * 18) return false;
  if (Math.abs(tipUpper - close) > atr * 14) return false;
  if (Math.abs(tipLower - close) > atr * 14) return false;
  return true;
}

function projectGeom(
  base: MergedDeskChannelGeom,
  mem: MemRail,
  candles: Candle[]
): MergedDeskChannelGeom | null {
  const iLive = candles.length - 1;
  /** 우측 문 = 파동 끝(iEndAtLock). 최신 실봉으로 열지 않음 */
  const iEnd = Math.max(mem.iStart + 2, Math.min(mem.iEndAtLock, iLive));
  const tLast = rbWaveTimeEnd(candles, iEnd);
  const close = Number(candles[iLive]!.close);
  const atr = atrApprox(candles, iLive);

  const up1 = mem.upIntercept + mem.upSlope * mem.iStart;
  const lo1 = mem.loIntercept + mem.loSlope * mem.iStart;
  const tipUpper = mem.upIntercept + mem.upSlope * iEnd;
  const tipLower = mem.loIntercept + mem.loSlope * iEnd;
  const up2 = tipUpper;
  const lo2 = tipLower;

  if (!saneTips(tipUpper, tipLower, close, atr)) return null;
  if (![up1, up2, lo1, lo2].every((x) => Number.isFinite(x) && x > 0)) return null;

  const tipMid = (tipUpper + tipLower) / 2;
  const width = tipUpper - tipLower;
  const posPct =
    width > 0 ? Math.max(0, Math.min(100, ((close - tipLower) / width) * 100)) : 50;
  let breakout: MergedDeskChannelGeom['breakout'] = 'none';
  if (close > tipUpper) breakout = 'up';
  else if (close < tipLower) breakout = 'down';

  return {
    ...base,
    descending: mem.descending,
    tipUpper,
    tipLower,
    tipMid,
    width,
    tStart: mem.tStart,
    tEnd: tLast,
    up1,
    up2,
    lo1,
    lo2,
    quality: mem.quality,
    posPct,
    breakout,
    primary: true,
  };
}

function shouldRebuild(
  mem: MemRail,
  fresh: MergedDeskChannelGeom,
  candles: Candle[],
  atr: number
): { rebuild: boolean; flipKo: string | null; barsOutside: number } {
  if (fresh.descending !== mem.descending) {
    return {
      rebuild: true,
      flipKo: mem.descending
        ? '하락채널→상승채널 전환 후보'
        : '상승채널→하락채널 전환 후보',
      barsOutside: 0,
    };
  }
  const iEnd = candles.length - 1;
  const tipU = mem.upIntercept + mem.upSlope * iEnd;
  const tipL = mem.loIntercept + mem.loSlope * iEnd;
  const close = Number(candles[iEnd]!.close);
  const barT = Number(candles[iEnd]!.time);
  const eps = atr * 0.35;
  let barsOutside = mem.barsOutside;
  const outside = close > tipU + eps || close < tipL - eps;
  if (outside) {
    /** 호출 횟수가 아니라 봉 시각 단위로만 +1 — 라이브 틱마다 재구축 폭주 방지 */
    if (Number.isFinite(barT) && barT !== mem.outsideBarTime) {
      barsOutside += 1;
      mem.outsideBarTime = barT;
    }
  } else {
    barsOutside = 0;
    mem.outsideBarTime = 0;
  }

  /** 잠금 tip이 신선 tip과 너무 벌어지면 강제 재구축(스파이크 방지) */
  if (
    Math.abs(tipU - fresh.tipUpper) > atr * 4 ||
    Math.abs(tipL - fresh.tipLower) > atr * 4
  ) {
    /** 같은 봉에서 연속 REBUILD 금지 */
    if (Date.now() - (mem.lastRebuildAtMs || 0) < 2500 && mem.lockBarTime === barT) {
      return { rebuild: false, flipKo: null, barsOutside };
    }
    return { rebuild: true, flipKo: '레일괴리·재구축', barsOutside };
  }

  if (barsOutside >= 3 && fresh.quality >= 55) {
    const against =
      (mem.descending && close > tipU + eps) || (!mem.descending && close < tipL - eps);
    if (against) {
      if (Date.now() - (mem.lastRebuildAtMs || 0) < 2500 && mem.lockBarTime === barT) {
        return { rebuild: false, flipKo: null, barsOutside };
      }
      return {
        rebuild: true,
        flipKo: mem.descending ? '하락채널 돌파·재구축' : '상승채널 이탈·재구축',
        barsOutside,
      };
    }
  }
  return { rebuild: false, flipKo: null, barsOutside };
}

function waveEndedFreeze(mem: MemRail, candles: Candle[], atr: number): boolean {
  const iEnd = candles.length - 1;
  const tipU = mem.upIntercept + mem.upSlope * iEnd;
  const tipL = mem.loIntercept + mem.loSlope * iEnd;
  const width = tipU - tipL;
  if (!(width > 0)) return false;
  const close = Number(candles[iEnd]!.close);
  const mid = (tipU + tipL) / 2;
  const nearMid = Math.abs(close - mid) <= atr * 0.55;
  const ageBars = Math.max(0, iEnd - mem.iStart);
  return nearMid && ageBars >= 18 && mem.phase === 'LOCK';
}

function applyLockedPricesToOverlays(
  overlays: OverlayItem[],
  geom: MergedDeskChannelGeom,
  horizon: MergedDeskChannelHorizon,
  phase: RbWavePhase
): OverlayItem[] {
  const tag =
    phase === 'LOCK'
      ? 'merged-desk-rb-wave-lock'
      : phase === 'FREEZE'
        ? 'merged-desk-rb-wave-freeze'
        : 'merged-desk-rb-wave-rebuild';
  return overlays.map((o) => {
    const id = String(o.id || '');
    const cls = String(o.overlayZoneExtraClass || '');
    const matchH =
      (horizon === 'short' && id.includes('-short-')) ||
      (horizon === 'long' && id.includes('-long-')) ||
      (horizon === 'fb' && id.includes('-fb-'));
    if (!matchH) return o;
    const nextCls = `${cls} ${tag}`.replace(/\s+/g, ' ').trim();
    if (o.kind === 'channelBand' && o.channelBand) {
      return {
        ...o,
        time1: geom.tStart,
        time2: geom.tEnd,
        price1: Math.max(geom.up1, geom.up2, geom.lo1, geom.lo2),
        price2: Math.min(geom.up1, geom.up2, geom.lo1, geom.lo2),
        channelBand: {
          ...o.channelBand,
          priceHigh1: geom.up1,
          priceHigh2: geom.up2,
          priceLow1: geom.lo1,
          priceLow2: geom.lo2,
        },
        overlayZoneExtraClass: nextCls,
        labelTooltip: [
          String(o.labelTooltip || ''),
          phase === 'LOCK'
            ? '파동 고정유지 — 레일 고정 · 매봉 재적합 안 함'
            : phase === 'FREEZE'
              ? '파동 과거고정 — 구조 종료 · 레일 유지'
              : '파동 재구축 — 구조 전환으로 재구축',
        ]
          .filter(Boolean)
          .join('\n'),
      };
    }
    if (id.endsWith('-upper')) {
      return {
        ...o,
        time1: geom.tStart,
        time2: geom.tEnd,
        price1: geom.up1,
        price2: geom.up2,
        overlayZoneExtraClass: nextCls,
      };
    }
    if (id.endsWith('-lower')) {
      return {
        ...o,
        time1: geom.tStart,
        time2: geom.tEnd,
        price1: geom.lo1,
        price2: geom.lo2,
        overlayZoneExtraClass: nextCls,
      };
    }
    if (id.endsWith('-mid')) {
      return {
        ...o,
        time1: geom.tStart,
        time2: geom.tEnd,
        price1: (geom.up1 + geom.lo1) / 2,
        price2: (geom.up2 + geom.lo2) / 2,
        overlayZoneExtraClass: nextCls,
      };
    }
    return { ...o, overlayZoneExtraClass: nextCls };
  });
}

function edgePriceLines(
  geom: MergedDeskChannelGeom,
  phase: RbWavePhase,
  candles: Candle[]
): AtlasPulsePriceLine[] {
  const close = Number(candles[candles.length - 1]?.close) || 0;
  const atr = atrApprox(candles);
  const eps = atr * 0.12;
  const lines: AtlasPulsePriceLine[] = [];
  const phaseKo =
    phase === 'LOCK'
      ? '고정유지'
      : phase === 'FREEZE'
        ? '과거고정'
        : phase === 'REBUILD'
          ? '재구축'
          : '';
  const upperRole =
    close > geom.tipUpper + eps
      ? '돌파상단'
      : close >= geom.tipUpper - eps
        ? '상단안착'
        : '저항레일';
  const lowerRole =
    close < geom.tipLower - eps
      ? '돌파하단'
      : close <= geom.tipLower + eps
        ? '하단안착'
        : '지지레일';
  lines.push({
    price: geom.tipUpper,
    title: `${upperRole}${phaseKo ? `·${phaseKo}` : ''}`.slice(0, 16),
    color: geom.descending ? 'rgba(248,113,113,0.95)' : 'rgba(74,222,128,0.9)',
    lineWidth: 1,
    lineStyle: 'dashed',
    axisLabel: true,
  });
  lines.push({
    price: geom.tipLower,
    title: `${lowerRole}${phaseKo ? `·${phaseKo}` : ''}`.slice(0, 16),
    color: geom.descending ? 'rgba(252,165,165,0.9)' : 'rgba(34,197,94,0.95)',
    lineWidth: 1,
    lineStyle: 'dashed',
    axisLabel: true,
  });
  return lines;
}

function memFromFresh(
  primary: MergedDeskChannelGeom,
  rails: NonNullable<ReturnType<typeof railsFromGeom>>,
  lastT: number,
  iEnd: number
): MemRail {
  return {
    phase: 'LOCK',
    horizon: primary.horizon,
    descending: primary.descending,
    upIntercept: rails.upIntercept,
    upSlope: rails.upSlope,
    loIntercept: rails.loIntercept,
    loSlope: rails.loSlope,
    iStart: rails.iStart,
    /** 파동 문닫힘 봉 — 최신 실봉이 아님 */
    iEndAtLock: rails.iWaveEnd ?? iEnd,
    tStart: primary.tStart,
    quality: primary.quality,
    lockBarTime: lastT,
    barsOutside: 0,
    outsideBarTime: 0,
    lastRebuildAtMs: 0,
    tipUpperAtLock: primary.tipUpper,
    tipLowerAtLock: primary.tipLower,
  };
}

export function applyMergedDeskRbWaveLock(params: {
  pack: MergedDeskBlueRedChannelPack;
  candles: Candle[];
  lockKey: string;
}): { pack: MergedDeskBlueRedChannelPack; wave: MergedDeskRbWaveLockPack } {
  const { pack, candles, lockKey } = params;
  const primary =
    pack.geoms.find((g) => g.primary) ??
    pack.geoms.find((g) => g.horizon === 'short') ??
    pack.geoms[0] ??
    null;

  const liveWave = (summaryKo: string, g: MergedDeskChannelGeom | null = primary): {
    pack: MergedDeskBlueRedChannelPack;
    wave: MergedDeskRbWaveLockPack;
  } => ({
    pack,
    wave: {
      phase: 'LIVE',
      horizon: g?.horizon ?? null,
      descending: Boolean(g?.descending),
      lockedGeom: g,
      flipKo: null,
      summaryKo,
      priceLines: g ? edgePriceLines(g, 'LIVE', candles) : [],
    },
  });

  if (!primary || candles.length < 16) {
    return liveWave('파동고정 — 채널 없음', null);
  }

  const atr = atrApprox(candles);
  const close = Number(candles[candles.length - 1]!.close);
  if (!saneTips(primary.tipUpper, primary.tipLower, close, atr)) {
    MEM.delete(lockKey);
    return liveWave('파동고정 — tip이상·실시간', primary);
  }

  const rails = railsFromGeom(primary, candles);
  if (!rails) {
    return liveWave('파동고정 — 레일투영실패·실시간', primary);
  }

  const lastT = Number(candles[candles.length - 1]!.time);
  const iLive = candles.length - 1;
  let phase: RbWavePhase = 'LIVE';
  let flipKo: string | null = null;
  let mem = MEM.get(lockKey) ?? null;
  if (mem) {
    if (!Number.isFinite(mem.outsideBarTime)) mem.outsideBarTime = 0;
    if (!Number.isFinite(mem.lastRebuildAtMs)) mem.lastRebuildAtMs = 0;
  }

  if (!mem) {
    mem = memFromFresh(primary, rails, lastT, rails.iWaveEnd);
    MEM.set(lockKey, mem);
    phase = 'LOCK';
  } else {
    const chk = shouldRebuild(mem, primary, candles, atr);
    mem.barsOutside = chk.barsOutside;
    if (chk.rebuild) {
      phase = 'REBUILD';
      flipKo = chk.flipKo;
      const prevRebuild = mem.lastRebuildAtMs || 0;
      mem = memFromFresh(primary, rails, lastT, rails.iWaveEnd);
      mem.lastRebuildAtMs = Math.max(Date.now(), prevRebuild);
      MEM.set(lockKey, mem);
    } else if (waveEndedFreeze(mem, candles, atr)) {
      mem.phase = 'FREEZE';
      /** FREEZE: 문 위치 고정(이미 파동끝). 최신봉으로 열지 않음 */
      MEM.set(lockKey, mem);
      phase = 'FREEZE';
    } else {
      phase = mem.phase;
      /**
       * LOCK: 파동이 새 스윙으로 자라면 문만 그 스윙까지 이동.
       * 최신 실봉(iLive)으로 우측을 열지 않음.
       */
      if (mem.phase === 'LOCK' && rails.iWaveEnd > mem.iEndAtLock) {
        mem.iEndAtLock = rails.iWaveEnd;
        mem.tipUpperAtLock = primary.tipUpper;
        mem.tipLowerAtLock = primary.tipLower;
      }
      MEM.set(lockKey, mem);
    }
  }

  const lockedGeom = projectGeom(primary, mem, candles);
  if (!lockedGeom) {
    MEM.delete(lockKey);
    return liveWave('파동고정 — 투영이상·실시간재설정', primary);
  }

  const geoms2 = pack.geoms.map((g) => ({
    ...(g.horizon === lockedGeom.horizon ? lockedGeom : g),
    primary: g.horizon === mem!.horizon,
  }));

  const overlays = applyLockedPricesToOverlays(
    pack.overlays,
    lockedGeom,
    mem.horizon,
    phase
  );

  const dirKo = lockedGeom.descending ? '하락' : '상승';
  const phaseKo =
    phase === 'LOCK'
      ? '고정유지'
      : phase === 'FREEZE'
        ? '과거고정'
        : phase === 'REBUILD'
          ? '재구축'
          : '실시간';
  const summaryKo = [
    `파동${phaseKo}·${dirKo}채널`,
    flipKo,
    `상${lockedGeom.tipUpper.toFixed(0)}/하${lockedGeom.tipLower.toFixed(0)}`,
  ]
    .filter(Boolean)
    .join(' · ');

  return {
    pack: {
      ...pack,
      geoms: geoms2,
      overlays,
      summaryKo: `${pack.summaryKo} · ${summaryKo}`,
    },
    wave: {
      phase,
      horizon: mem.horizon,
      descending: lockedGeom.descending,
      lockedGeom,
      flipKo,
      summaryKo,
      priceLines: edgePriceLines(lockedGeom, phase, candles),
    },
  };
}

export function clearMergedDeskRbWaveLock(lockKey?: string): void {
  if (lockKey) MEM.delete(lockKey);
  else MEM.clear();
}
