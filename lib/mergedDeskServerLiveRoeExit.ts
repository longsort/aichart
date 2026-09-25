/**
 * 서버 실전 ROE 익절 — 브라우저/폰 앱 없어도 동작.
 * ROE ≥ TP1%(기본 5) → 시장가 전량 청산 (지정가 대기 아님).
 * 확정 수익 아님.
 */
import fs from 'fs';
import path from 'path';
import {
  bitgetEnsurePositionSlTp,
  bitgetFetchAllOpenPositions,
  bitgetReduceOrClose,
  type BitgetCreds,
} from '@/lib/bitgetPrivateTrade';
import { filterAutoTradePositions, matchAutoTradeSymbolId, FAST_TP1_ROE_PCT, FAST_SL_ROE_PCT } from '@/lib/mergedDeskAutoTradeConfig';
import { markServerSignalFired, wasServerSignalFired, readServerPositionEntryMemos } from '@/lib/serverMergedDeskAutoTradeStore';
import { resolveLiveOrderSlTp } from '@/lib/mergedDeskLiveSlTp';
import { MIN_SL_PRICE_FRAC } from '@/lib/mergedDeskDirectionSlGuard';
import { nextInstBandProfitLockSl } from '@/lib/eagle1Tapoint/instBandProfitLock';

export type ServerLiveExitOpts = {
  user: string;
  creds: BitgetCreds;
  /** 기본 5 */
  tp1RoePct?: number;
  /** 손절 ROE% 기본 30 */
  slRoePct?: number;
  marginMode?: 'isolated' | 'crossed';
};

function phaseDir(): string {
  return path.join(process.cwd(), 'data', 'auto-trade-arm');
}

function phaseFile(user: string): string {
  const safe = String(user || 'anon').replace(/[^\w.-]/g, '_');
  return path.join(phaseDir(), `${safe}.exit-phase.json`);
}

type PhaseMap = Record<
  string,
  { tp1Done?: boolean; updatedAt: number }
>;

function loadPhase(user: string): PhaseMap {
  try {
    return JSON.parse(fs.readFileSync(phaseFile(user), 'utf8')) as PhaseMap;
  } catch {
    return {};
  }
}

function savePhase(user: string, m: PhaseMap): void {
  if (!fs.existsSync(phaseDir())) fs.mkdirSync(phaseDir(), { recursive: true });
  fs.writeFileSync(phaseFile(user), JSON.stringify(m, null, 2), 'utf8');
}

function entryKey(entry: number): string {
  return String(Math.round(entry * 10000));
}

/**
 * 열린 BTC/ETH/BNB/XRP 포지션 ROE ≥ tp1 → 시장가 전량 청산.
 */
export async function runServerLiveRoeExits(
  opts: ServerLiveExitOpts
): Promise<{ closed: number; notes: string[]; healed: number }> {
  /** 사용자 익절 ROE% (서버 ARM / 익절탭) · 미설정만 기본 8 */
  const tp1RoePct = Math.max(
    1,
    Math.min(50, Number(opts.tp1RoePct) || FAST_TP1_ROE_PCT)
  );
  const slRoePct = Math.max(0.5, Math.min(100, Number(opts.slRoePct) || FAST_SL_ROE_PCT));
  const notes: string[] = [];
  let closed = 0;
  let healed = 0;

  const posPack = await bitgetFetchAllOpenPositions(opts.creds);
  if (!posPack.ok) {
    return { closed: 0, healed: 0, notes: [`포지션조회실패 · ${posPack.msg}`] };
  }

  const autos = filterAutoTradePositions(posPack.positions || []);
  const phases = loadPhase(opts.user);
  const liveKeys = new Set<string>();
  const memos = readServerPositionEntryMemos(opts.user);

  for (const pos of autos) {
    if (!(pos.size > 0) || !(pos.entryPrice > 0)) continue;
    const symbol =
      matchAutoTradeSymbolId(pos.symbol) || String(pos.symbol || '').toUpperCase();
    if (!symbol) continue;
    const mark = Number(pos.markPrice) > 0 ? Number(pos.markPrice) : 0;
    if (!(mark > 0)) continue;

    const lev = Math.max(1, Number(pos.leverage) || 10);
    const key = `${symbol}:${entryKey(pos.entryPrice)}`;
    liveKeys.add(key);

    const memo = memos[symbol] || memos[String(pos.symbol || '').toUpperCase()];
    const bandTrade = String(memo?.signalId || '').startsWith('ib-align-');
    if (bandTrade) {
      const lock = nextInstBandProfitLockSl({
        entry: pos.entryPrice,
        direction: pos.direction,
        leverage: lev,
        tp: pos.tpPrice,
        currentSl: pos.slPrice,
        mark,
      });
      if (lock) {
        const ens = await bitgetEnsurePositionSlTp({
          creds: opts.creds,
          symbol,
          direction: pos.direction,
          stopLossPrice: lock.sl,
          size: String(pos.size),
        });
        notes.push(
          ens.slOk
            ? `${symbol} 손절 ${lock.lockRoePct.toFixed(1)}% · 수수료 후 ${lock.netRoePct.toFixed(1)}%`
            : `${symbol} 수익잠금 실패 · ${ens.notes.join(' · ')}`
        );
      }
      continue;
    }

    /**
     * 치유: 타점 SL이 한도 안이면 유지 · 없거나 ROE 한도보다 멀 때만 ROE로 보정.
     * TP는 없거나 사용자 ROE보다 너무 가까운(조기) 경우만 ROE TP로 맞춤.
     */
    const fixed = resolveLiveOrderSlTp({
      entry: pos.entryPrice,
      direction: pos.direction,
      leverage: lev,
      signalSl: pos.slPrice,
      tp1RoePct,
      slRoePct,
    });
    const needSl =
      !(pos.slPrice != null && pos.slPrice > 0) ||
      (pos.direction === 'LONG' &&
        (pos.slPrice >= pos.entryPrice ||
          pos.slPrice < fixed.sl * 0.9999 ||
          (pos.entryPrice - pos.slPrice) / pos.entryPrice < MIN_SL_PRICE_FRAC * 0.9)) ||
      (pos.direction === 'SHORT' &&
        (pos.slPrice <= pos.entryPrice ||
          pos.slPrice > fixed.sl * 1.0001 ||
          (pos.slPrice - pos.entryPrice) / pos.entryPrice < MIN_SL_PRICE_FRAC * 0.9));
    const needTp =
      !(pos.tpPrice != null && pos.tpPrice > 0) ||
      (pos.direction === 'LONG' &&
        pos.tpPrice != null &&
        pos.tpPrice > 0 &&
        pos.tpPrice < fixed.tp * 0.999) ||
      (pos.direction === 'SHORT' &&
        pos.tpPrice != null &&
        pos.tpPrice > 0 &&
        pos.tpPrice > fixed.tp * 1.001);
    if (needSl || needTp) {
      const healId = `srv-heal-sltp-${symbol}-${entryKey(pos.entryPrice)}-${Math.round(fixed.sl)}-${Math.round(fixed.tp)}`;
      if (!wasServerSignalFired(opts.user, healId)) {
        const ens = await bitgetEnsurePositionSlTp({
          creds: opts.creds,
          symbol,
          direction: pos.direction,
          stopLossPrice: needSl ? fixed.sl : null,
          takeProfitPrice: needTp ? fixed.tp : null,
          size: String(pos.size),
        });
        if (ens.slOk || ens.tpOk) {
          healed += 1;
          markServerSignalFired(opts.user, healId);
          notes.push(
            `${symbol} SL/TP치유 · ${fixed.usedSignalSl ? '타점SL' : 'ROE SL'} · TP ${fixed.tp1RoePct}%ROE · ${ens.notes.join(' · ')}`
          );
        } else {
          notes.push(`${symbol} SL/TP치유실패 · ${ens.notes.join(' · ')}`);
        }
      }
    }

    const roe =
      pos.roePct != null && Number.isFinite(pos.roePct) ? Number(pos.roePct) : null;
    const tp1Px = fixed.tp;
    const pxHit =
      pos.direction === 'LONG' ? mark >= tp1Px : mark <= tp1Px;
    const roeHit = roe != null && roe >= tp1RoePct - 0.1;
    /** 가격 이동이 TP1의 85% 미만이면 조기 시장가익절 금지 */
    const minDist = Math.abs(tp1Px - pos.entryPrice) * 0.85;
    const moved = Math.abs(mark - pos.entryPrice);
    if (moved < minDist - 1e-12) continue;

    if (!pxHit && !roeHit) continue;

    const signalId = `srv-exit-tp1-${symbol}-${entryKey(pos.entryPrice)}`;
    if (wasServerSignalFired(opts.user, signalId)) {
      notes.push(`${symbol} 이미익절마킹`);
      continue;
    }

    const size = String(pos.size);
    const result = await bitgetReduceOrClose({
      creds: opts.creds,
      symbol,
      direction: pos.direction,
      size,
      marginMode: opts.marginMode || pos.marginMode || 'isolated',
      clientOid: signalId.replace(/[^0-9A-Za-z]/g, '').slice(0, 32),
    });

    if (result.ok) {
      markServerSignalFired(opts.user, signalId);
      closed += 1;
      phases[key] = { tp1Done: true, updatedAt: Date.now() };
      notes.push(
        `${symbol} ROE익절 시장가전량 · ROE≈${roe != null ? roe.toFixed(1) : tp1RoePct}% · ${result.orderId || result.msg || 'ok'}`
      );
      console.info('[live-roe-exit]', opts.user, notes[notes.length - 1]);
    } else {
      notes.push(
        `${symbol} 익절실패 · CODE=${result.code || '?'} · ${result.msg || result.blockReason || '?'}`
      );
      console.warn('[live-roe-exit]', opts.user, notes[notes.length - 1]);
    }
  }

  for (const k of Object.keys(phases)) {
    if (!liveKeys.has(k)) delete phases[k];
  }
  savePhase(opts.user, phases);
  return { closed, healed, notes };
}
