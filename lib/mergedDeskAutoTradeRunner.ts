/**
 * 자동매매 실주문 실행 헬퍼 (클라이언트).
 * liveArmed+API 있을 때만 Bitget. 아니면 paper 스킵.
 * 증거금: 전략별 비중% × 주문 직전 계좌자산 (단타=scalpEquityPct, 독수리=doksuriEquityPct).
 */
import {
  AUTO_TRADE_MAX_CONCURRENT,
  equityPctForSource,
  filterAutoTradePositions,
  isAutoTradeSymbolEnabled,
  markAutoTradeSignalFired,
  matchAutoTradeSymbolId,
  readAutoTradeConfig,
  wasAutoTradeSignalFired,
  writeAutoTradeConfig,
  FAST_TP1_ROE_PCT,
  FAST_SL_ROE_PCT,
  type MergedDeskAutoTradeConfig,
} from '@/lib/mergedDeskAutoTradeConfig';
import { resolveLiveOrderSlTp } from '@/lib/mergedDeskLiveSlTp';
import { postLiveOrder, fetchLivePosition } from '@/lib/mergedDeskLiveOrderClient';
import {
  equityPctToMarginUsdt,
  formatBitgetSize,
  marginToBaseSize,
} from '@/lib/bitgetPrivateTrade';
import { appendTradeJournalEvent } from '@/lib/mergedDeskTradeEventJournal';
import { bitgetErrorToKo } from '@/lib/bitgetErrorKo';
import {
  closeSignalScoreTrade,
  openSignalScoreTrade,
  readSignalScorecard,
  estimateScorePnlUsdt,
} from '@/lib/mergedDeskSignalScorecard';
import { rememberPositionEntryLabel, clearPositionEntryLabel } from '@/lib/mergedDeskPositionEntryLabel';
import {
  noteSymbolStopLoss,
  noteSymbolWinOrFlat,
  symbolLossCooldownGate,
} from '@/lib/mergedDeskSymbolLossGuard';
import { isTapointTapOnly } from '@/lib/eagle1Tapoint/config';
import {
  lateEntryGate,
  resolveReinforcedEntrySlTp,
} from '@/lib/mergedDeskEntryRedesign';

export async function maybeLiveOpen(params: {
  signalId: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  price: number;
  sl?: number | null;
  tp?: number | null;
  source: 'scalp' | 'doksuri1';
  cfg?: MergedDeskAutoTradeConfig;
  timeframe?: string | null;
  signalKo?: string | null;
  /** 근거·증거 (AIZONE·SL보강·합류 태그 등) */
  evidenceKo?: string | null;
  fourStrategyId?: string | null;
  analysisTags?: string[] | null;
  entryScore?: number | null;
  /** 연속손절·보강 비중 (0.25~1) */
  sizeMult?: number;
  /** 상위(unified)에서 이미 SL 보강했으면 중복 스킵 */
  skipSlReinforce?: boolean;
  /** 분석 원천 (wick-15m 등) — 추가매수 판별 */
  analysisSource?: string | null;
}): Promise<{
  didLive: boolean;
  msg: string;
  size?: string;
  marginUsdt?: number;
  telegramOk?: boolean;
}> {
  const cfg = params.cfg ?? readAutoTradeConfig();
  /** 실전 ARM이면 enabled 불일치여도 실주문 (기존 세팅과 동일) */
  if (!cfg.liveArmed) {
    return { didLive: false, msg: '페이퍼 · 실주문 ARM 아님' };
  }
  /** 타점전용 — Dual/로켓/초단 Fast 실주문 차단 (UI 스캔은 유지) */
  if (isTapointTapOnly()) {
    const src = String(params.analysisSource || '');
    if (src !== 'eagle1-tap-engine') {
      return {
        didLive: false,
        msg: `타점엔진 전용 · ${src || params.source || '구신호'} 실주문 OFF`,
      };
    }
  }
  /** BPR 재터치 단독 자동진입 OFF — Dual Fast·신호B·S급 레이스는 허용 */
  const bprHint = `${params.analysisSource || ''} ${params.signalId || ''} ${params.signalKo || ''} ${(params.analysisTags || []).join(' ')}`;
  const isRaceOrFast =
    /rb-scalp|LaneFast|RB-SCALP|btc-rocket-cart|btc-rkcart|BTC신호B|structure-s|신호C|S급/i.test(
      bprHint
    ) ||
    String(params.analysisSource || '') === 'rb-scalp' ||
    String(params.analysisSource || '') === 'btc-rocket-cart' ||
    String(params.analysisSource || '') === 'structure-s';
  if (!isRaceOrFast && /bpr-retest|bpr15-|BPR재터치/i.test(bprHint)) {
    return { didLive: false, msg: 'BPR재터치 자동진입 OFF' };
  }
  if (!isAutoTradeSymbolEnabled(cfg, params.symbol)) {
    return { didLive: false, msg: `${params.symbol} 칩 OFF` };
  }
  const cool = symbolLossCooldownGate(params.symbol);
  if (!cool.allow) {
    return { didLive: false, msg: cool.reasonKo };
  }
  if (!(params.sl != null && Number(params.sl) > 0)) {
    return { didLive: false, msg: 'SL 없음 · 실주문 거부' };
  }

  let orderSl = Number(params.sl);
  let orderTp = params.tp != null ? Number(params.tp) : null;
  if (!params.skipSlReinforce) {
    const late = lateEntryGate({
      symbol: params.symbol,
      direction: params.direction,
      signalPrice: params.price,
      markPrice: params.price,
    });
    if (!late.allow) {
      return { didLive: false, msg: late.reasonKo };
    }
    const rein = resolveReinforcedEntrySlTp({
      symbol: params.symbol,
      entry: params.price,
      direction: params.direction,
      leverage: cfg.leverage || 10,
      signalSl: params.sl,
      tp1RoePct: cfg.scalpTp1RoePct || FAST_TP1_ROE_PCT,
      slRoePct: cfg.scalpSlRoePct || FAST_SL_ROE_PCT,
      timeframe: params.timeframe,
      preserveStructureSl:
        params.source === 'scalp' ||
        String(params.analysisSource || '') === 'rb-scalp' ||
        String(params.analysisSource || '') === 'btc-rocket-cart' ||
        String(params.analysisSource || '') === 'structure-s',
    });
    if (!rein.ok) {
      return { didLive: false, msg: rein.reasonKo };
    }
    orderSl = rein.sl;
    if (rein.tp > 0) orderTp = rein.tp;
  }
  if (params.source === 'scalp' && !cfg.strategyScalp) {
    return { didLive: false, msg: '초단 전략 OFF' };
  }
  if (params.source === 'doksuri1' && !cfg.strategyDoksuri1) {
    return { didLive: false, msg: '독수리 전략 OFF' };
  }
  if (wasAutoTradeSignalFired(params.signalId)) {
    return { didLive: false, msg: '이미 주문된 신호' };
  }
  /** 심볼당 1개 · 앱 외 코인은 무시 · BTC~SOL 자동매매 심볼만 동시 캡 */
  const maxConc = Math.max(
    1,
    Math.min(AUTO_TRADE_MAX_CONCURRENT, Number(cfg.maxConcurrent) || AUTO_TRADE_MAX_CONCURRENT)
  );
  const targetId = matchAutoTradeSymbolId(params.symbol);
  try {
    const posPack = await fetchLivePosition(params.symbol);
    /** 거래소 전체 포지션 중 자동매매 심볼만 — DOGE 등 앱 외 롱은 카운트·차단 안 함 */
    const openList = filterAutoTradePositions(
      Array.isArray(posPack.positions) ? posPack.positions : []
    ).filter((p) => isAutoTradeSymbolEnabled(cfg, p.symbol));
    const sameSymRows = (
      targetId
        ? openList.filter((p) => matchAutoTradeSymbolId(p.symbol) === targetId)
        : []
    ).filter((p) => Number(p.size) > 0);
    if (
      !sameSymRows.length &&
      posPack.position &&
      Number(posPack.position.size) > 0 &&
      matchAutoTradeSymbolId(String(posPack.position.symbol || '')) === targetId
    ) {
      sameSymRows.push(posPack.position);
    }
    const holdSame = sameSymRows.find((p) => p.direction === params.direction);
    const holdOpp = sameSymRows.find((p) => p.direction !== params.direction);
    if (holdSame || holdOpp) {
      const sameSym = holdSame || holdOpp!;
      const sameDir = Boolean(holdSame);
      const srcHint = `${params.analysisSource || ''} ${params.signalId || ''} ${params.signalKo || ''}`;
      const dcaEligible =
        sameDir &&
        /wick-15m|dump-watch-wick|htf-dump-touch|dump-confirm|dump-zone|structure-rocket|꼬리|폭락감시|HTF폭락/i.test(srcHint);
      const entryPx = Number(sameSym.entryPrice) || params.price;
      const underwater =
        params.direction === 'LONG'
          ? params.price < entryPx * 0.998
          : params.price > entryPx * 1.002;
      if (holdSame && dcaEligible && underwater) {
        console.info(
          '[autotrade-dca]',
          params.symbol,
          `추가매수 · 진입${entryPx}→마크${params.price}`
        );
        /** 추가매수: 비중 절반 · allowDca 플래그로 서버 통과 */
        const dcaMult = Math.max(
          0.25,
          Math.min(1, (Number(params.sizeMult) || 1) * 0.5)
        );
        const pctRawDca = equityPctForSource(cfg, params.source);
        const pct = Math.round(pctRawDca * dcaMult * 10) / 10;
        const res = await postLiveOrder({
          action: 'open',
          symbol: params.symbol,
          direction: params.direction,
          leverage: cfg.leverage,
          sizeMode: cfg.sizeMode,
          equityPct: pct,
          marginUsdt: cfg.marginUsdt,
          price: params.price,
          marginMode: cfg.marginMode,
          sl: orderSl,
          tp: orderTp,
          clientOid: params.signalId.replace(/[^0-9A-Za-z_:#+\-]/g, '').slice(0, 32),
          signalId: params.signalId,
          source: params.source,
          tp1RoePct: cfg.scalpTp1RoePct || FAST_TP1_ROE_PCT,
          slRoePct: cfg.scalpSlRoePct || FAST_SL_ROE_PCT,
          timeframe: params.timeframe,
          preserveStructureSl:
        params.source === 'scalp' ||
        String(params.analysisSource || '') === 'rb-scalp' ||
        String(params.analysisSource || '') === 'btc-rocket-cart' ||
        String(params.analysisSource || '') === 'structure-s',
          signalKo: params.signalKo ?? null,
          evidenceKo: `${params.evidenceKo || ''} · 추가매수(하락·꼬리재진입)`.trim(),
          fourStrategyId: params.fourStrategyId ?? null,
          analysisTags: [...(params.analysisTags || []), 'dca-wick'],
          entryScore: params.entryScore ?? null,
          noteKo: params.signalKo ?? null,
          userSlPrice: orderSl,
          allowDca: true,
        });
        if (!res.ok) {
          return { didLive: false, msg: res.error || res.msg || '추가매수 실패' };
        }
        markAutoTradeSignalFired(params.signalId);
        return {
          didLive: true,
          msg: res.msg || `추가매수 체결 · 자산 ${pct}%`,
          size: res.size,
          marginUsdt: res.marginUsdt,
        };
      }
      /** 반대방향 보유 → 전 코인 헷지 금지 (삭제 아님 · 차단만) */
      if (!holdSame && holdOpp) {
        markAutoTradeSignalFired(params.signalId);
        return {
          didLive: false,
          msg: `${params.symbol} 보유${holdOpp.direction === 'LONG' ? '롱' : '숏'} · 헷지오픈금지 · 같은코인 롱숏 동시진입 불가`,
        };
      }
      markAutoTradeSignalFired(params.signalId);
      return {
        didLive: false,
        msg: `${params.symbol} 기존 ${sameSym.direction === 'LONG' ? '롱' : '숏'} 포지션 · 추가진입 스킵`,
      };
    }
    if (openList.length >= maxConc) {
      return {
        didLive: false,
        msg: `자동매매 보유 ${openList.length}개 · 한도 ${maxConc}개 · 추가진입 대기`,
      };
    }
  } catch {
    /* 조회 실패 시 주문 시도는 계속 (서버도 검증) */
  }
  const pctRaw = equityPctForSource(cfg, params.source);
  const sizeMult = Math.max(
    0.25,
    Math.min(1, (Number(params.sizeMult) || 1) * (cool.sizeMult || 1))
  );
  const pct = Math.round(pctRaw * sizeMult * 10) / 10;
  const res = await postLiveOrder({
    action: 'open',
    symbol: params.symbol,
    direction: params.direction,
    leverage: cfg.leverage,
    sizeMode: cfg.sizeMode,
    equityPct: pct,
    marginUsdt: cfg.marginUsdt,
    price: params.price,
    marginMode: cfg.marginMode,
    sl: orderSl,
    tp: orderTp,
    clientOid: params.signalId.replace(/[^0-9A-Za-z_:#+\-]/g, '').slice(0, 32),
    signalId: params.signalId,
    source: params.source,
    tp1RoePct: cfg.scalpTp1RoePct || FAST_TP1_ROE_PCT,
    slRoePct: cfg.scalpSlRoePct || FAST_SL_ROE_PCT,
    timeframe: params.timeframe,
    preserveStructureSl:
      params.source === 'scalp' ||
      String(params.analysisSource || '') === 'rb-scalp' ||
      String(params.analysisSource || '') === 'btc-rocket-cart' ||
      String(params.analysisSource || '') === 'structure-s',
    lockStructurePrices: (params.analysisTags || []).includes('triple-align'),
    signalKo: params.signalKo ?? null,
    evidenceKo: params.evidenceKo ?? null,
    fourStrategyId: params.fourStrategyId ?? null,
    analysisTags: params.analysisTags ?? null,
    entryScore: params.entryScore ?? null,
    noteKo: params.signalKo ?? null,
    userSlPrice: orderSl,
  });
  if (!res.ok) {
    /** 실패 시 fired 마킹 안 함 → 다음 봉/신호에서 재시도 가능 */
    const exact =
      res.error ||
      res.msg ||
      (res.blockReason
        ? `ORDER BLOCKED · STEP=${res.blockStep} · REASON=${res.blockReason}`
        : null) ||
      (res.code ? `ORDER SENT · CODE=${res.code}` : null);
    return {
      didLive: false,
      msg: exact || bitgetErrorToKo(res.error || res.msg) || '주문 거절 · 재시도대기',
    };
  }
  markAutoTradeSignalFired(params.signalId);
  const label = params.source === 'scalp' ? '단타' : '독수리';
  const fixed = resolveLiveOrderSlTp({
    entry: params.price,
    direction: params.direction,
    leverage: cfg.leverage || 10,
    signalSl: orderSl,
    userSlPrice: orderSl,
    tp1RoePct: cfg.scalpTp1RoePct || FAST_TP1_ROE_PCT,
    slRoePct: cfg.scalpSlRoePct || FAST_SL_ROE_PCT,
    timeframe: params.timeframe,
    preserveStructureSl: true,
  });
  const slHint = fixed.usedSignalSl
    ? ` · 타점SL ${fixed.sl.toFixed(0)}${fixed.clampedSl ? '(ROE한도)' : ''}`
    : ` · ROE손절 ${fixed.slRoePct}%`;
  const tfHint = params.timeframe ? ` · ${params.timeframe}` : '';
  const sizeHint =
    res.marginUsdt != null && cfg.sizeMode === 'equityPct'
      ? ` · ${label} ${pct}% → ${res.marginUsdt}U(자산 ${res.equityUsdt?.toFixed?.(0) ?? '?'})`
      : res.marginUsdt != null
        ? ` · 증거금 ${res.marginUsdt}U`
        : '';
  const tgHint =
    res.telegramOk === false
      ? ` · TG실패${res.telegramErr ? ` ${res.telegramErr}` : ''}`
      : res.telegramOk === true
        ? ' · TG OK'
        : '';
  appendTradeJournalEvent({
    symbol: params.symbol,
    chartTf: params.timeframe || 'live',
    kind: 'AUTO_SCALP_FIRE',
    direction: params.direction,
    price: params.price,
    levelPrice: fixed.sl > 0 ? fixed.sl : params.price,
    levelLabel: fixed.usedSignalSl ? '타점SL' : 'ROE손절',
    noteKo: `실주문 ${params.direction === 'LONG' ? '롱' : '숏'} · ${label}${tfHint}${slHint}${sizeHint}${
      params.entryScore != null && params.entryScore > 0
        ? ` · 점수${Math.round(params.entryScore)}`
        : ''
    }`,
    signalId: params.signalId,
    meta: {
      live: true,
      paper: false,
      source: params.source,
      orderId: res.orderId ?? null,
      size: res.size ?? null,
      marginUsdt: res.marginUsdt ?? null,
      equityUsdt: res.equityUsdt ?? null,
      usedSignalSl: fixed.usedSignalSl,
      clampedSl: fixed.clampedSl,
      sl: fixed.sl,
      tp: fixed.tp,
      timeframe: params.timeframe ?? null,
      entryScore: params.entryScore ?? null,
      leverage: cfg.leverage || null,
      fourStrategyId: params.fourStrategyId ?? null,
      tags: Array.isArray(params.analysisTags)
        ? params.analysisTags.filter(Boolean).slice(0, 12).join('|')
        : null,
      evidenceKo: params.evidenceKo ?? null,
      ledger: 'coin-trade',
      telegramOk: res.telegramOk ?? null,
    },
  });
  openSignalScoreTrade({
    tradeId: params.signalId,
    signalKo: params.signalKo || label,
    source: params.source,
    symbol: params.symbol,
    timeframe: params.timeframe || 'live',
    direction: params.direction,
    entry: params.price,
    sl: orderSl > 0 ? orderSl : fixed.sl,
    tp: orderTp != null && orderTp > 0 ? orderTp : fixed.tp,
    mode: 'live',
    fourStrategyId: params.fourStrategyId ?? null,
    analysisTags: params.analysisTags ?? null,
    size: res.size != null && Number(res.size) > 0 ? Number(res.size) : null,
    marginUsdt: res.marginUsdt != null && res.marginUsdt > 0 ? res.marginUsdt : null,
    leverage: cfg.leverage || 10,
  });
  rememberPositionEntryLabel({
    symbol: params.symbol,
    direction: params.direction,
    signalKo: params.signalKo || label,
    source: String(params.analysisSource || params.source || ''),
    signalId: params.signalId,
    timeframe: params.timeframe || null,
  });
  return {
    didLive: true,
    msg: `실주문 ${params.direction === 'LONG' ? '롱' : '숏'}${tfHint}${slHint} · 수량 ${res.size || '?'}${sizeHint}${tgHint} · ${res.orderId || res.clientOid || '완료'}`,
    size: res.size,
    marginUsdt: res.marginUsdt,
    telegramOk: res.telegramOk,
  };
}

export async function maybeLiveReduce(params: {
  signalId: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  price: number;
  /** 잔량 대비 청산 비율 0~1 */
  frac: number;
  entrySizeHint?: string;
  cfg?: MergedDeskAutoTradeConfig;
  /** TP1 후 거래소 SL 잠금가 */
  lockSl?: number | null;
  /** 청산 사유 (성적부) */
  exitReason?: string | null;
  entryPrice?: number | null;
  /** 실현손익 USDT (있으면 성적부·기록에 그대로) */
  pnlUsdt?: number | null;
  marginUsdt?: number | null;
  size?: number | null;
}): Promise<{ didLive: boolean; msg: string; lockOk?: boolean }> {
  const cfg = params.cfg ?? readAutoTradeConfig();
  /** 청산은 liveArmed만 있으면 됨 (enabled 꺼져도 열린 실포지션 보호) */
  if (!cfg.liveArmed) {
    return { didLive: false, msg: '실전 ARM 아님 · 청산 스킵' };
  }
  if (wasAutoTradeSignalFired(params.signalId)) {
    return { didLive: false, msg: '이미 처리된 청산신호' };
  }
  const pct = equityPctForSource(cfg, 'scalp');
  const frac = Math.max(0.05, Math.min(1, params.frac));
  const res = await postLiveOrder({
    action: frac >= 0.95 ? 'close' : 'reduce',
    symbol: params.symbol,
    direction: params.direction,
    leverage: cfg.leverage,
    sizeMode: cfg.sizeMode,
    equityPct: pct,
    marginUsdt: cfg.marginUsdt,
    size: params.entrySizeHint || undefined,
    frac,
    price: params.price,
    marginMode: cfg.marginMode,
    clientOid: `${params.signalId}x`.replace(/[^0-9A-Za-z_:#+\-]/g, '').slice(0, 32),
    signalId: params.signalId,
    source: 'scalp',
  });
  if (!res.ok) {
    return {
      didLive: false,
      msg: bitgetErrorToKo(res.error || res.msg) || '청산 실패 · 재시도대기',
    };
  }
  markAutoTradeSignalFired(params.signalId);

  let lockOk: boolean | undefined;
  let lockMsg = '';
  if (params.lockSl != null && params.lockSl > 0 && frac < 0.95) {
    const lockRes = await postLiveOrder({
      action: 'set-sl',
      symbol: params.symbol,
      direction: params.direction,
      leverage: cfg.leverage,
      price: params.price,
      marginMode: cfg.marginMode,
      sl: params.lockSl,
      lockPrice: params.lockSl,
      clientOid: `${params.signalId}L`.replace(/[^0-9A-Za-z_:#+\-]/g, '').slice(0, 32),
      signalId: `${params.signalId}-lock`,
      source: 'scalp',
    });
    lockOk = Boolean(lockRes.ok);
    lockMsg = lockRes.ok
      ? ` · 손절잠금 ${params.lockSl}`
      : ` · 손절잠금실패(${bitgetErrorToKo(lockRes.error || lockRes.msg) || '?'})`;
  }

  if (frac >= 0.95) {
    const sc = readSignalScorecard();
    const openRow =
      sc.open.find((o) => o.tradeId === params.signalId) ||
      sc.open.find((o) => o.symbol === String(params.symbol || '').toUpperCase()) ||
      null;
    const entry =
      Number(params.entryPrice) > 0
        ? Number(params.entryPrice)
        : openRow?.entry && openRow.entry > 0
          ? openRow.entry
          : 0;
    const size =
      Number(params.size) > 0
        ? Number(params.size)
        : openRow?.size && openRow.size > 0
          ? Number(openRow.size)
          : Number(params.entrySizeHint) > 0
            ? Number(params.entrySizeHint)
            : 0;
    const margin =
      Number(params.marginUsdt) > 0
        ? Number(params.marginUsdt)
        : openRow?.marginUsdt && openRow.marginUsdt > 0
          ? Number(openRow.marginUsdt)
          : 0;
    let pnlUsdt =
      params.pnlUsdt != null && Number.isFinite(Number(params.pnlUsdt))
        ? Number(params.pnlUsdt)
        : 0;
    if (!(Math.abs(pnlUsdt) > 0.0001) && entry > 0 && params.price > 0) {
      pnlUsdt = estimateScorePnlUsdt({
        direction: params.direction,
        entry,
        exit: params.price,
        size: size > 0 ? size : null,
        marginUsdt: margin > 0 ? margin : null,
        leverage: openRow?.leverage || cfg.leverage || 10,
      });
    }
    const exitReason = params.exitReason || '실청산';
    const closed = closeSignalScoreTrade({
      symbol: params.symbol,
      exit: params.price,
      exitReason,
      pnlUsdt,
      marginUsdt: margin > 0 ? margin : undefined,
    });
    clearPositionEntryLabel(params.symbol);
    const win = pnlUsdt > 0.01;
    appendTradeJournalEvent({
      symbol: params.symbol,
      chartTf: closed?.timeframe || 'live',
      kind: /손절|SL/i.test(exitReason)
        ? 'AUTO_SCALP_SL'
        : /익절|TP|러너/i.test(exitReason)
          ? 'AUTO_SCALP_TP2'
          : 'AUTO_SCALP_CLOSE',
      direction: params.direction,
      price: params.price,
      levelPrice: params.price,
      levelLabel: `${win ? '성공' : '실패'}·${exitReason}`,
      noteKo: `${win ? '성공' : '실패'} · ${exitReason} · ${pnlUsdt >= 0 ? '+' : ''}${pnlUsdt.toFixed(2)}U · 실전`,
      signalId: `${params.signalId}-out`,
      meta: {
        live: true,
        paper: false,
        reinforce: true,
        outcome: win ? 'SUCCESS' : 'FAIL',
        outcomeKo: win ? '성공' : '실패',
        exitReason,
        pnlUsdt,
        entry: entry || closed?.entry || null,
        exit: params.price,
      },
    });
    if (/손절|SL|stop|잠금/i.test(exitReason) || pnlUsdt < 0) {
      noteSymbolStopLoss(params.symbol, exitReason);
    } else if (pnlUsdt >= 0) {
      noteSymbolWinOrFlat(params.symbol);
    }
  }

  return {
    didLive: true,
    msg: `${res.msg || `실청산 ${res.size || ''}`}${lockMsg}`,
    lockOk,
  };
}

export type AutoTradeDryRunResult = {
  ok: boolean;
  paper: true;
  msg: string;
  detailKo: string[];
  direction: 'LONG' | 'SHORT';
  price: number;
  marginUsdt: number;
  size: string;
  equityPct: number;
  equityUsdt: number;
};

/**
 * API 없이 자동매매 경로 검증 (페이퍼만 · Bitget 호출 없음).
 * 엔진 ON + 단타 전략을 켜 두고, 가상 FIRE→사이즈→기록까지 확인.
 */
export function runAutoTradeDryRunTest(params: {
  symbol: string;
  timeframe: string;
  direction?: 'LONG' | 'SHORT';
  price: number;
  sl?: number | null;
  tp?: number | null;
  /** 가용 자산 미조회 시 가상 자산(USDT) */
  mockEquityUsdt?: number;
  availableUsdt?: number | null;
  cfg?: MergedDeskAutoTradeConfig;
  /** true면 엔진·단타 전략을 테스트용으로 ON */
  armEngine?: boolean;
}): AutoTradeDryRunResult {
  let cfg = params.cfg ?? readAutoTradeConfig();
  if (params.armEngine) {
    cfg = writeAutoTradeConfig({
      enabled: true,
      liveArmed: false,
      strategyScalp: true,
    });
  }
  const direction: 'LONG' | 'SHORT' =
    params.direction === 'SHORT' ? 'SHORT' : params.direction === 'LONG' ? 'LONG' : 'LONG';
  const price = Number(params.price);
  const detailKo: string[] = [];

  if (!(price > 0)) {
    return {
      ok: false,
      paper: true,
      msg: '테스트 실패 · 진입가 없음',
      detailKo: ['차트 플랜 진입가 또는 수동 진입가를 입력하세요'],
      direction,
      price: 0,
      marginUsdt: 0,
      size: '0',
      equityPct: 0,
      equityUsdt: 0,
    };
  }

  if (!cfg.enabled) {
    detailKo.push('엔진 OFF → 테스트용으로 ON 권장(버튼이 자동 ON)');
  }
  if (!cfg.strategyScalp) {
    detailKo.push('단타 전략 OFF → FIRE 경로 비활성');
  }

  const equityUsdt =
    typeof params.availableUsdt === 'number' && params.availableUsdt > 0
      ? params.availableUsdt
      : Math.max(100, Number(params.mockEquityUsdt) || 1000);
  const usedMock = !(typeof params.availableUsdt === 'number' && params.availableUsdt > 0);
  const pct = equityPctForSource(cfg, 'scalp');
  const marginUsdt =
    cfg.sizeMode === 'fixedUsdt'
      ? Math.max(1, cfg.marginUsdt)
      : equityPctToMarginUsdt(equityUsdt, pct);
  const size = formatBitgetSize(
    marginToBaseSize(marginUsdt, cfg.leverage, price),
    params.symbol
  );
  const sl = params.sl != null && params.sl > 0 ? params.sl : null;
  const tp = params.tp != null && params.tp > 0 ? params.tp : null;
  const sig = `paper-test-${Date.now().toString(36)}`;

  detailKo.push(
    usedMock
      ? `가상자산 ${equityUsdt}U × 단타 ${pct}% → 증거금 ${marginUsdt}U`
      : `가용 ${equityUsdt.toFixed(2)}U × 단타 ${pct}% → 증거금 ${marginUsdt}U`
  );
  detailKo.push(
    `${direction} · ${cfg.leverage}x · size ${size} · ${cfg.marginMode === 'crossed' ? '교차' : '격리'}`
  );
  if (sl != null) detailKo.push(`SL ${sl}`);
  if (tp != null) detailKo.push(`TP1 ${tp}`);
  detailKo.push('실주문 없음 · API 미호출 · 페이퍼만');

  appendTradeJournalEvent({
    symbol: params.symbol,
    chartTf: params.timeframe,
    kind: 'AUTO_SCALP_FIRE',
    direction,
    price,
    levelPrice: price,
    levelLabel: '페이퍼테스트',
    noteKo: `API前 테스트 · ${direction} · ${pct}% → ${marginUsdt}U · size ${size}`,
    signalId: sig,
    meta: {
      paper: true,
      dryRun: true,
      equityPct: pct,
      marginUsdt,
      size,
      leverage: cfg.leverage,
      mockEquity: usedMock,
    },
  });
  appendTradeJournalEvent({
    symbol: params.symbol,
    chartTf: params.timeframe,
    kind: 'NOTE',
    direction,
    price,
    levelPrice: price,
    levelLabel: '페이퍼테스트',
    noteKo: `자동매매 경로 OK · 엔진=${cfg.enabled ? 'ON' : 'OFF'} · 단타=${cfg.strategyScalp ? 'ON' : 'OFF'} · 실주문ARM=OFF`,
    signalId: `${sig}-note`,
    meta: { paper: true, dryRun: true },
  });

  const ok = cfg.enabled && cfg.strategyScalp;
  return {
    ok,
    paper: true,
    msg: ok
      ? `페이퍼 테스트 OK · ${direction} size ${size} · ${marginUsdt}U(${pct}%)`
      : `경로 확인됨 · 엔진/단타 ON 후 재테스트 (실주문 없음)`,
    detailKo,
    direction,
    price,
    marginUsdt,
    size,
    equityPct: pct,
    equityUsdt,
  };
}
