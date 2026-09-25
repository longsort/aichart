/**
 * 실전 포지션 ROE/TP1·TP2 감시 → 자동 부분/전량 익절.
 * 가상(maybeVirtualTp1Half)과 대칭. Bitget 프리셋만 믿지 않음.
 * 확정 수익 아님.
 */
import {
  readAutoTradeConfig,
  FAST_TP1_ROE_PCT,
  FAST_SL_ROE_PCT,
  type MergedDeskAutoTradeConfig,
} from '@/lib/mergedDeskAutoTradeConfig';
import { roeTargetPrice } from '@/lib/mergedDeskAutoScalpEngine';
import type { LivePosition } from '@/lib/mergedDeskLiveOrderClient';
import { postLiveOrder } from '@/lib/mergedDeskLiveOrderClient';
import { maybeLiveReduce } from '@/lib/mergedDeskAutoTradeRunner';

const PHASE_KEY = 'ailongshort.liveRoeExit.v1';

type LiveExitPhase = {
  /** entry 반올림 키 */
  entryKey: string;
  tp1Done: boolean;
  runnerTp: number | null;
  lockSl: number | null;
  updatedAt: number;
  /** TP 누락 치유 1회 */
  tpHealed?: boolean;
};

type PhaseMap = Record<string, LiveExitPhase>;

function loadPhases(): PhaseMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(PHASE_KEY);
    if (!raw) return {};
    const j = JSON.parse(raw) as PhaseMap;
    return j && typeof j === 'object' ? j : {};
  } catch {
    return {};
  }
}

function savePhases(m: PhaseMap): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(PHASE_KEY, JSON.stringify(m));
  } catch {
    /* ignore */
  }
}

function entryKey(entry: number): string {
  return String(Math.round(entry * 100));
}

function posKey(symbol: string, entry: number): string {
  return `${String(symbol).toUpperCase()}:${entryKey(entry)}`;
}

function hitTp(direction: 'LONG' | 'SHORT', mark: number, tp: number): boolean {
  return direction === 'LONG' ? mark >= tp : mark <= tp;
}

function hitSl(direction: 'LONG' | 'SHORT', mark: number, sl: number): boolean {
  return direction === 'LONG' ? mark <= sl : mark >= sl;
}

/**
 * 열린 실포지션마다 TP1(설정 ROE%, 기본 5) / TP2 / 잠금SL 검사 후 청산.
 * 포지션 폴링마다 호출. 중복은 maybeLiveReduce signalId로 차단.
 */
export async function tickLiveRoeExits(params: {
  positions: LivePosition[];
  cfg?: MergedDeskAutoTradeConfig;
}): Promise<{ msgs: string[]; acted: boolean }> {
  const cfg = params.cfg ?? readAutoTradeConfig();
  const msgs: string[] = [];
  if (!cfg.liveArmed) {
    return { msgs: ['실전 ARM 아님 · ROE익절 대기'], acted: false };
  }

  /** 전 코인 무조건 ROE 8% 전량 컷 → 재스캔 */
  const tp1RoePct = Math.max(
    1,
    Math.min(50, Number(cfg.scalpTp1RoePct) || FAST_TP1_ROE_PCT)
  );
  const tp2RoePct = Math.max(tp1RoePct + 0.5, Math.min(40, Number(cfg.scalpTp2RoePct) || 12));
  const lockRoePct = Math.max(0.5, Math.min(10, Number(cfg.scalpLockRoePct) || 2));
  /** 실전: ROE 8%에서 시장가 전량 익절. 러너/반익 없음. */
  const tp1Frac = 1;

  const phases = loadPhases();
  let acted = false;
  const liveKeys = new Set<string>();

  for (const pos of params.positions) {
    if (!pos || !(pos.size > 0) || !(pos.entryPrice > 0)) continue;
    const symbol = String(pos.symbol || '').toUpperCase();
    if (!symbol) continue;
    const mark = Number(pos.markPrice) > 0 ? Number(pos.markPrice) : 0;
    if (!(mark > 0)) continue;

    const lev = Math.max(1, Number(pos.leverage) || cfg.leverage || 10);
    const key = posKey(symbol, pos.entryPrice);
    liveKeys.add(key);
    let phase = phases[key];
    if (!phase || phase.entryKey !== entryKey(pos.entryPrice)) {
      phase = {
        entryKey: entryKey(pos.entryPrice),
        tp1Done: false,
        runnerTp: null,
        lockSl: null,
        updatedAt: Date.now(),
        tpHealed: false,
      };
      phases[key] = phase;
    }

    /** TP 없으면 1회 ensure-sl-tp */
    if (!(pos.tpPrice != null && Number(pos.tpPrice) > 0) && !phase.tpHealed) {
      try {
        const hr = await postLiveOrder({
          action: 'ensure-sl-tp',
          symbol,
          direction: pos.direction,
          leverage: lev,
          price: pos.entryPrice,
          sl: pos.slPrice,
          source: 'scalp',
          tp1RoePct,
          slRoePct: FAST_SL_ROE_PCT,
        });
        phase.tpHealed = true;
        phase.updatedAt = Date.now();
        savePhases(phases);
        if (hr.ok) {
          msgs.push(`${symbol} TP치유 · ${hr.msg}`);
          acted = true;
        } else {
          msgs.push(`${symbol} TP치유실패 · ${hr.error || hr.msg}`);
        }
      } catch (e) {
        phase.tpHealed = true;
        savePhases(phases);
        msgs.push(
          `${symbol} TP치유오류 · ${e instanceof Error ? e.message : 'fail'}`
        );
      }
    }

    const computedTp1 = roeTargetPrice(pos.entryPrice, pos.direction, lev, tp1RoePct / 100);
    /** 거래소 프리셋 TP 무시 — 사용자 익절 ROE%만 (존/짧은 TP로 조기 청산 금지) */
    const tp1Px = computedTp1;

    const roe = pos.roePct != null && Number.isFinite(pos.roePct) ? Number(pos.roePct) : null;
    const roeHitTp1 = roe != null && roe >= tp1RoePct - 0.15;
    const pxHitTp1 = hitTp(pos.direction, mark, tp1Px);
    /** 가격이 TP1 거리의 85% 미만이면 조기청산 금지 (마진오판·틱TP 방지) */
    const minDist = Math.abs(tp1Px - pos.entryPrice) * 0.85;
    const moved = Math.abs(mark - pos.entryPrice);
    const distOk = moved >= minDist - 1e-12;

    /** 잔량 단계: 잠금 SL / 러너 TP2 */
    if (phase.tp1Done) {
      const lockSl =
        phase.lockSl != null && phase.lockSl > 0
          ? phase.lockSl
          : pos.slPrice != null && pos.slPrice > 0
            ? pos.slPrice
            : roeTargetPrice(pos.entryPrice, pos.direction, lev, lockRoePct / 100);
      const runnerTp =
        phase.runnerTp != null && phase.runnerTp > 0
          ? phase.runnerTp
          : roeTargetPrice(pos.entryPrice, pos.direction, lev, tp2RoePct / 100);

      if (hitSl(pos.direction, mark, lockSl)) {
        const r = await maybeLiveReduce({
          signalId: `live-lock-${symbol}-${phase.entryKey}`,
          symbol,
          direction: pos.direction,
          price: mark,
          frac: 1,
          cfg,
          exitReason: '잠금손절',
          entryPrice: pos.entryPrice,
        });
        if (r.didLive) {
          acted = true;
          msgs.push(`${symbol} 잠금SL 전량 · ${r.msg}`);
          delete phases[key];
        } else if (r.msg) msgs.push(`${symbol} 잠금SL · ${r.msg}`);
        continue;
      }

      if (hitTp(pos.direction, mark, runnerTp) || (roe != null && roe >= tp2RoePct - 0.15)) {
        const r = await maybeLiveReduce({
          signalId: `live-tp2-${symbol}-${phase.entryKey}`,
          symbol,
          direction: pos.direction,
          price: mark,
          frac: 1,
          cfg,
          exitReason: '러너익절',
          entryPrice: pos.entryPrice,
          pnlUsdt: pos.unrealizedPnl,
          size: pos.size,
        });
        if (r.didLive) {
          acted = true;
          msgs.push(`${symbol} TP2/러너 전량 · ${r.msg}`);
          delete phases[key];
        } else if (r.msg) msgs.push(`${symbol} TP2 · ${r.msg}`);
        continue;
      }
      continue;
    }

    /** OPEN → TP1 · 거리 미달이면 스킵 */
    if (!distOk) continue;
    if (!pxHitTp1 && !roeHitTp1) continue;

    const lockSl = roeTargetPrice(pos.entryPrice, pos.direction, lev, lockRoePct / 100);
    const runnerTp = roeTargetPrice(pos.entryPrice, pos.direction, lev, tp2RoePct / 100);

    const r = await maybeLiveReduce({
      signalId: `live-tp1-${symbol}-${phase.entryKey}`,
      symbol,
      direction: pos.direction,
      price: mark,
      frac: tp1Frac,
      cfg,
      lockSl: tp1Frac < 0.95 ? lockSl : null,
      exitReason: tp1Frac >= 0.95 ? '익절' : '부분익절',
      entryPrice: pos.entryPrice,
      pnlUsdt: pos.unrealizedPnl,
      size: pos.size,
    });

    if (r.didLive) {
      acted = true;
      if (tp1Frac >= 0.95) {
        msgs.push(
          `${symbol} TP1컷 전량 · ROE≈${roe != null ? roe.toFixed(1) : tp1RoePct}% · ${r.msg}`
        );
        delete phases[key];
      } else {
        phase.tp1Done = true;
        phase.lockSl = lockSl;
        phase.runnerTp = runnerTp;
        phase.updatedAt = Date.now();
        phases[key] = phase;
        msgs.push(
          `${symbol} TP1 반익(~${(tp1Frac * 100).toFixed(0)}%) · ROE≈${
            roe != null ? roe.toFixed(1) : tp1RoePct
          }% · 잔량→TP2 ${runnerTp.toFixed(0)} · ${r.msg}`
        );
      }
    } else if (r.msg && !/이미 처리/.test(r.msg)) {
      msgs.push(`${symbol} TP1 시도 · ${r.msg}`);
    }
  }

  /** 포지션 없는 키 정리 */
  for (const k of Object.keys(phases)) {
    if (!liveKeys.has(k) && Date.now() - (phases[k]?.updatedAt || 0) > 60_000) {
      delete phases[k];
    }
  }
  savePhases(phases);
  return { msgs, acted };
}
