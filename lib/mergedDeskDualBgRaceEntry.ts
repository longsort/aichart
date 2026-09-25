/**
 * Dual 백그라운드 레이스 진입 — 차트 TF(4h 등)와 무관.
 * 신호A·B·C 선도착 → 구조타점 존 터치 후 주문 (추격 시장가 금지).
 * 게이지 믹스 금지 · 확정 승률·수익 아님.
 */
import type { Candle } from '@/types';
import {
  isAutoTradeSymbolEnabled,
  readAutoTradeConfig,
  wasAutoTradeSignalFired,
  type MergedDeskAutoTradeConfig,
} from '@/lib/mergedDeskAutoTradeConfig';
import { isTapointTapOnly } from '@/lib/eagle1Tapoint/config';
import { recordDualRaceAsSetupHint } from '@/lib/eagle1Tapoint/setupSourceBridge';
import {
  executeUnifiedAnalysisEntry,
  resolveUnifiedTradeMode,
} from '@/lib/mergedDeskUnifiedAnalysisEntry';
import { readVirtualTradeSession } from '@/lib/mergedDeskVirtualTradeSession';
import { peekBprCandles15m, fetchBprCandles15m } from '@/lib/mergedDeskBprDualEvidence';
import {
  pickBtcSignalRaceWinner,
  runBtcSignalRace,
  type BtcRaceLaneCandidate,
} from '@/lib/mergedDeskBtcSignalRace';
import {
  BTC_ROCKET_CART_SOURCE,
  ROCKET_CART_SYMBOLS,
} from '@/lib/mergedDeskBtcRocketCartSignal';
import { STRUCTURE_S_SOURCE } from '@/lib/mergedDeskStructureSSignal';
import {
  upsertCoinTradeProgress,
  probeRbScalpProgress,
} from '@/lib/mergedDeskCoinTradeProgress';
import {
  clearDualStructurePending,
  listDualStructurePendings,
  refineDualRaceToStructureEntry,
  resolvePendingTouchOrAiZone,
  upsertDualStructurePending,
} from '@/lib/mergedDeskDualStructureEntry';

const DUAL_SYMS = [...ROCKET_CART_SYMBOLS];
const firedBg = new Set<string>();

async function fetchTfCandles(
  symbol: string,
  timeframe: string
): Promise<Candle[]> {
  try {
    const q = new URLSearchParams({
      symbol,
      timeframe,
      depth: 'recent',
    });
    const res = await fetch(`/api/market?${q}`, {
      credentials: 'same-origin',
      cache: 'no-store',
    });
    const json = (await res.json().catch(() => ({}))) as {
      candles?: Candle[];
    };
    return Array.isArray(json.candles) ? json.candles : [];
  } catch {
    return [];
  }
}

function raceSource(winSource: string): string {
  if (winSource === BTC_ROCKET_CART_SOURCE) return BTC_ROCKET_CART_SOURCE;
  if (winSource === STRUCTURE_S_SOURCE) return STRUCTURE_S_SOURCE;
  return 'rb-scalp';
}

function raceTf(slot: string, tfFast: string): string {
  if (slot === 'B') return '3m';
  if (slot === 'C') return '15m';
  return tfFast;
}

function candlesForSlot(
  slot: string,
  c1: Candle[],
  c3: Candle[],
  c15: Candle[]
): { candles: Candle[]; tf: string } {
  if (slot === 'B') return { candles: c3.length >= 40 ? c3 : c1, tf: '3m' };
  if (slot === 'C') return { candles: c15.length >= 40 ? c15 : c3, tf: '15m' };
  if (c1.length >= 36) return { candles: c1, tf: '1m' };
  return { candles: c3, tf: '3m' };
}

/** tapOnly — Dual 레이스 스캔만 · SETUP 힌트 기록 · 주문 없음 */
async function recordDualBgSetupHintsOnly(
  cfg: MergedDeskAutoTradeConfig | null
): Promise<void> {
  const conf = cfg || readAutoTradeConfig();
  for (const sym of DUAL_SYMS) {
    if (!isAutoTradeSymbolEnabled(conf, sym)) continue;
    try {
      const [c1, c3, c15] = await Promise.all([
        fetchTfCandles(sym, '1m'),
        fetchTfCandles(sym, '3m'),
        fetchTfCandles(sym, '15m'),
      ]);
      if (c1.length < 36 && c3.length < 36 && c15.length < 40) continue;
      const price =
        Number(c1[c1.length - 1]?.close) ||
        Number(c3[c3.length - 1]?.close) ||
        Number(c15[c15.length - 1]?.close) ||
        0;
      const raceOpts = {
        symbol: sym,
        candles3m: c3.length >= 40 ? c3 : null,
        candlesS: c15.length >= 40 ? c15 : null,
        leverage: conf.leverage || 20,
        minRr: conf.minRr || 1.2,
        tp1RoePct: conf.scalpTp1RoePct || 8,
        price: price > 0 ? price : null,
        candles15m: c15.length >= 12 ? c15 : null,
      };
      const pool: BtcRaceLaneCandidate[] = [];
      if (c1.length >= 36) {
        const r1 = runBtcSignalRace({
          ...raceOpts,
          candlesFast: c1,
          timeframeFast: '1m',
        });
        if (r1.signalA) pool.push(r1.signalA);
        if (r1.signalB) pool.push(r1.signalB);
        if (r1.signalC) pool.push(r1.signalC);
      }
      if (c3.length >= 36) {
        const r3 = runBtcSignalRace({
          ...raceOpts,
          candlesFast: c3,
          timeframeFast: '3m',
        });
        if (r3.signalA) pool.push(r3.signalA);
        if (r3.signalB) pool.push(r3.signalB);
        if (r3.signalC) pool.push(r3.signalC);
      }
      const seen = new Set<string>();
      for (const w of pool) {
        if (seen.has(w.signalId)) continue;
        seen.add(w.signalId);
        const src = raceSource(w.source);
        recordDualRaceAsSetupHint({
          symbol: sym,
          source: src,
          direction: w.direction,
          signalId: w.signalId,
          timeframe: raceTf(w.slot, '1m'),
          noteKo: `BG · ${w.slotKo || w.slot} · SETUP힌트 · 즉시주문아님`,
          grade: src === STRUCTURE_S_SOURCE ? 'S' : null,
        });
      }
    } catch {
      /* 심볼별 힌트 실패 무시 */
    }
  }
}

/** 칩 ON Dual 4코인 · 구조타점 터치 진입 · 차트TF 무시. */
export async function tickDualBgRaceEntries(params?: {
  cfg?: MergedDeskAutoTradeConfig | null;
}): Promise<{ tried: number; ok: number; statusKo: string }> {
  if (typeof fetch === 'undefined') {
    return { tried: 0, ok: 0, statusKo: 'BG레이스 · 비가용' };
  }
  /**
   * 타점전용 — Dual 백그라운드 주문 OFF.
   * 레이스 스캔은 SETUP 힌트만 기록(즉시주문 아님).
   */
  if (isTapointTapOnly()) {
    try {
      await recordDualBgSetupHintsOnly(params?.cfg || null);
    } catch {
      /* ignore */
    }
    return { tried: 0, ok: 0, statusKo: '타점전용 · Dual힌트만 · 주문OFF' };
  }
  const cfg = params?.cfg || readAutoTradeConfig();
  const engineOn = cfg.enabled || cfg.liveArmed;
  if (!engineOn) {
    return { tried: 0, ok: 0, statusKo: 'BG레이스 · 엔진OFF' };
  }
  const scalpMode = cfg.autoTradeScalpMode || 'FAST';
  if (scalpMode === 'S') {
    return { tried: 0, ok: 0, statusKo: 'BG레이스 · 품질레인만' };
  }

  const virt = readVirtualTradeSession();
  const mode = resolveUnifiedTradeMode(cfg, virt.active);
  if (!mode) {
    return { tried: 0, ok: 0, statusKo: 'BG레이스 · 모드없음' };
  }

  let tried = 0;
  let okN = 0;
  let lastKo = 'BG레이스 · 대기';

  for (const sym of DUAL_SYMS) {
    if (!isAutoTradeSymbolEnabled(cfg, sym)) continue;

    const [c1, c3, c15] = await Promise.all([
      fetchTfCandles(sym, '1m'),
      fetchTfCandles(sym, '3m'),
      fetchTfCandles(sym, '15m'),
    ]);
    if (c1.length < 36 && c3.length < 40 && c15.length < 40) continue;

    let c15bpr: Candle[] = c15;
    try {
      const b = await fetchBprCandles15m(sym);
      if (b.length >= 40) c15bpr = b;
    } catch {
      c15bpr = peekBprCandles15m(sym) || c15;
    }

    const price =
      Number(c1[c1.length - 1]?.close) ||
      Number(c3[c3.length - 1]?.close) ||
      Number(c15[c15.length - 1]?.close) ||
      null;

    const c15arg = c15bpr.length >= 12 ? c15bpr : null;
    const mark = Number(price) || 0;

    /** 1) 타점 대기 — 터치 또는 AIZONE≥70(보던방향) · 불일치 포기 */
    const pendings = listDualStructurePendings(sym);
    let stillWaiting = false;
    for (const pend of pendings) {
      if (wasAutoTradeSignalFired(pend.signalId) || firedBg.has(pend.signalId)) {
        clearDualStructurePending(sym, pend.signalId);
        continue;
      }
      const resolved = resolvePendingTouchOrAiZone({
        pending: pend,
        mark,
        leverage: cfg.leverage || 20,
        tp1RoePct: cfg.scalpTp1RoePct || 8,
      });
      if (resolved.mode === 'wait') {
        stillWaiting = true;
        lastKo = `BG · ${sym.replace(/USDT$/, '')} · ${resolved.reasonKo}`;
        continue;
      }
      if (resolved.mode === 'abandon') {
        clearDualStructurePending(sym, pend.signalId);
        lastKo = `BG · ${sym.replace(/USDT$/, '')} · ${resolved.reasonKo}`;
        continue;
      }

      firedBg.add(pend.signalId);
      tried += 1;
      try {
        const r = await executeUnifiedAnalysisEntry({
          mode,
          symbol: sym,
          timeframe: pend.timeframe,
          direction: pend.direction,
          price: resolved.entry,
          sl: resolved.sl,
          tp: resolved.tp,
          source: raceSource(pend.source),
          signalKo: `${pend.signalKo} · ${resolved.reasonKo}`,
          cfg,
          liveMark: resolved.entry,
          signalId: pend.signalId,
          availableUsdt: mode === 'live' ? undefined : virt.equityUsdt,
          entryScore: pend.score,
          analysisTags: [
            ...(pend.analysisTags || []),
            resolved.via === 'aizone70' ? 'aizone70타점대체' : '타점터치',
          ],
          evidenceKo: `${pend.evidenceKo} · ${resolved.reasonKo}`,
        });
        clearDualStructurePending(sym, pend.signalId);
        if (!r.ok && !/기존 .+ 포지션|추가진입|한도|보유중|헷지/.test(r.msg)) {
          firedBg.delete(pend.signalId);
        }
        if (r.ok) okN += 1;
        lastKo = r.ok
          ? `BG · ${sym.replace(/USDT$/, '')} ${resolved.via} ${pend.direction} · ${r.msg}`
          : `BG · ${sym.replace(/USDT$/, '')} · ${r.msg}`;
      } catch (e) {
        firedBg.delete(pend.signalId);
        lastKo = `BG타점실패 · ${e instanceof Error ? e.message.slice(0, 40) : 'err'}`;
      }
    }
    if (stillWaiting || listDualStructurePendings(sym).length > 0) {
      continue;
    }

    const raceOpts = {
      symbol: sym,
      candles3m: c3.length >= 40 ? c3 : null,
      candlesS: c15.length >= 40 ? c15 : c15bpr.length >= 40 ? c15bpr : null,
      leverage: cfg.leverage || 20,
      minRr: cfg.minRr || 1.2,
      tp1RoePct: cfg.scalpTp1RoePct || 8,
      price,
      candles15m: c15arg,
    };

    const pool: BtcRaceLaneCandidate[] = [];
    let reasonKo = `${sym.replace(/USDT$/, '')}레이스 · 대기`;
    let probeBWaiting = '';
    let probeCWaiting = '';

    if (c1.length >= 36) {
      const r1 = runBtcSignalRace({
        ...raceOpts,
        candlesFast: c1,
        timeframeFast: '1m',
      });
      if (r1.signalA) pool.push(r1.signalA);
      if (r1.signalB) pool.push(r1.signalB);
      if (r1.signalC) pool.push(r1.signalC);
      reasonKo = r1.reasonKo;
      probeBWaiting = r1.probeB.waitingKo;
      probeCWaiting = r1.probeC.waitingKo;
    }
    if (c3.length >= 36) {
      const r3 = runBtcSignalRace({
        ...raceOpts,
        candlesFast: c3,
        timeframeFast: '3m',
      });
      if (r3.signalA) pool.push(r3.signalA);
      if (r3.signalB) pool.push(r3.signalB);
      if (r3.signalC) pool.push(r3.signalC);
      if (c1.length < 36) {
        reasonKo = r3.reasonKo;
        probeBWaiting = r3.probeB.waitingKo;
        probeCWaiting = r3.probeC.waitingKo;
      }
    }

    const seen = new Set<string>();
    const uniq = pool.filter((w) => {
      if (seen.has(w.signalId)) return false;
      seen.add(w.signalId);
      return true;
    });
    const win = pickBtcSignalRaceWinner(uniq);

    const probeTf = c1.length >= 36 ? '1m' : '3m';
    const probeCandles = probeTf === '1m' ? c1 : c3;
    const probeF =
      probeCandles.length >= 36
        ? probeRbScalpProgress({
            symbol: sym,
            timeframe: probeTf,
            candles: probeCandles,
            leverage: cfg.leverage || 20,
            minRr: cfg.minRr || 1.2,
            tp1RoePct: cfg.scalpTp1RoePct || 8,
            price,
            candles15m: c15arg,
          })
        : null;

    let displayTf = probeTf;
    let displayProbe = probeF;
    if (win?.slot === 'A') {
      const m = /rb-scalp-[A-Z0-9]+-(1m|3m|5m)-/.exec(win.signalId);
      if (m?.[1]) displayTf = m[1];
    }
    if (displayTf === '3m' && c3.length >= 36) {
      displayProbe = probeRbScalpProgress({
        symbol: sym,
        timeframe: '3m',
        candles: c3,
        leverage: cfg.leverage || 20,
        minRr: cfg.minRr || 1.2,
        tp1RoePct: cfg.scalpTp1RoePct || 8,
        price,
        candles15m: c15arg,
      });
    }

    if (!win) {
      if (displayProbe) {
        upsertCoinTradeProgress({
          probe: {
            ...displayProbe,
            canEnter: false,
            status: displayProbe.status === '차단' ? '차단' : '대기',
            waitingKo:
              probeCWaiting && /READY|선도착|충족/.test(probeCWaiting)
                ? probeCWaiting
                : displayProbe.waitingKo,
          },
          timeframe: displayTf,
          kind: 'tick',
          reasonKo:
            reasonKo ||
            `${sym.replace(/USDT$/, '')}레이스 · A대기 · B:${probeBWaiting || '—'} · C:${probeCWaiting || '—'}`,
          price,
          writeJournal: false,
        });
      }
      lastKo = reasonKo;
      continue;
    }

    if (firedBg.has(win.signalId) || wasAutoTradeSignalFired(win.signalId)) {
      lastKo = `BG · ${sym.replace(/USDT$/, '')} · 이미주문신호`;
      continue;
    }

    const pack = candlesForSlot(
      win.slot,
      c1,
      c3,
      c15.length >= 40 ? c15 : c15bpr
    );
    const refined = refineDualRaceToStructureEntry({
      win,
      candles: pack.candles,
      timeframe: pack.tf,
      markPrice: price,
      leverage: cfg.leverage || 20,
      tp1RoePct: cfg.scalpTp1RoePct || 8,
    });

    if (refined.mode === 'reject') {
      lastKo = `BG · ${sym.replace(/USDT$/, '')} · ${refined.reasonKo}`;
      if (displayProbe) {
        upsertCoinTradeProgress({
          probe: {
            ...displayProbe,
            canEnter: false,
            status: '대기',
            waitingKo: refined.reasonKo,
            direction: win.direction,
          },
          timeframe: displayTf,
          kind: 'tick',
          reasonKo: refined.reasonKo,
          price,
          writeJournal: false,
        });
      }
      continue;
    }

    if (refined.mode === 'wait_touch') {
      upsertDualStructurePending({ ...refined.pending, symbol: sym });
      lastKo = `BG · ${sym.replace(/USDT$/, '')} · ${refined.reasonKo}`;
      if (displayProbe) {
        upsertCoinTradeProgress({
          probe: {
            ...displayProbe,
            canEnter: false,
            status: '대기',
            waitingKo: refined.reasonKo,
            direction: win.direction,
          },
          timeframe: displayTf,
          kind: 'tick',
          reasonKo: refined.pending.evidenceKo,
          price,
          writeJournal: false,
        });
      }
      continue;
    }

    firedBg.add(win.signalId);
    tried += 1;
    const orderTf = raceTf(win.slot, displayTf);
    recordDualRaceAsSetupHint({
      symbol: sym,
      source: raceSource(win.source),
      direction: win.direction,
      signalId: win.signalId,
      timeframe: orderTf,
      noteKo: `${win.slotKo} · ${win.signalKo} · SETUP힌트`,
      grade: raceSource(win.source) === STRUCTURE_S_SOURCE ? 'S' : null,
    });
    if (displayProbe) {
      upsertCoinTradeProgress({
        probe: {
          ...displayProbe,
          canEnter: true,
          status: '진입가능',
          waitingKo: `${win.slotKo} · ${refined.reasonKo}`,
          direction: win.direction,
        },
        timeframe: orderTf === '3m' || orderTf === '15m' ? displayTf : orderTf,
        kind: 'tick',
        writeJournal: false,
      });
    }

    try {
      const r = await executeUnifiedAnalysisEntry({
        mode,
        symbol: sym,
        timeframe: orderTf,
        direction: win.direction,
        price: refined.entry,
        sl: refined.sl,
        tp: refined.tp,
        source: raceSource(win.source),
        signalKo: `${win.signalKo} · ${refined.reasonKo}`,
        cfg,
        liveMark: refined.entry,
        signalId: win.signalId,
        availableUsdt: mode === 'live' ? undefined : virt.equityUsdt,
        entryScore: win.score,
        analysisTags: [...(win.analysisTags || []), '구조타점'],
        evidenceKo: `${win.evidenceKo} · ${refined.reasonKo}`,
      });
      if (!r.ok && !/기존 .+ 포지션|추가진입|한도|보유중|헷지/.test(r.msg)) {
        firedBg.delete(win.signalId);
      }
      if (r.ok) {
        okN += 1;
        if (displayProbe) {
          upsertCoinTradeProgress({
            probe: {
              ...displayProbe,
              canEnter: true,
              status: '진입가능',
              direction: win.direction,
              waitingKo: `${win.slotKo} · 타점진입완료`,
            },
            timeframe: displayTf,
            kind: 'entry',
            reasonKo: r.msg,
            price: refined.entry,
          });
        }
      } else if (displayProbe) {
        upsertCoinTradeProgress({
          probe: displayProbe,
          timeframe: displayTf,
          kind: 'skip',
          reasonKo: r.msg,
          price: refined.entry,
        });
      }
      lastKo = r.ok
        ? `BG · ${sym.replace(/USDT$/, '')} ${win.slotKo} 타점 ${win.direction} · ${r.msg}`
        : `BG · ${sym.replace(/USDT$/, '')} · ${r.msg}`;
    } catch (e) {
      firedBg.delete(win.signalId);
      lastKo = `BG레이스실패 · ${e instanceof Error ? e.message.slice(0, 40) : 'err'}`;
    }
  }

  return { tried, ok: okN, statusKo: lastKo };
}
