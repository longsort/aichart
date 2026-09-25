import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { APP_SITE_COOKIE, verifySiteAuthToken } from '@/lib/appSiteAuth';
import { readExchangeKeysMeta, readExchangeKeysPlain } from '@/lib/serverExchangeKeysStore';
import {
  bitgetFetchAccountSummary,
  bitgetFetchAllOpenPositions,
  bitgetFetchOpenPosition,
  bitgetOpenLongShort,
  bitgetReduceOrClose,
  bitgetSetPositionStopLoss,
  bitgetEnsurePositionSlTp,
  equityPctToMarginUsdt,
  formatBitgetSize,
  marginToBaseSize,
  positionSizeForReduce,
} from '@/lib/bitgetPrivateTrade';
import { resolveLiveOrderSlTp } from '@/lib/mergedDeskLiveSlTp';
import { tryAcquireLiveLock } from '@/lib/bitgetLiveInstanceLock';
import { notifyMergedDeskPositionEntry } from '@/lib/mergedDeskLiveEntryTelegram';
import { bitgetErrorToKo } from '@/lib/bitgetErrorKo';
import {
  logOrderBlockedBeforeBitget,
  normalizeMarginMode,
  orderTraceLog,
} from '@/lib/bitgetOrderTrace';
import { matchAutoTradeSymbolId } from '@/lib/mergedDeskAutoTradeConfig';
import { HEDGE_ENTRY_GLOBALLY_DISABLED } from '@/lib/mergedDeskHedgeEntry';
import { readServerAutoTradeArm } from '@/lib/serverMergedDeskAutoTradeStore';
import {
  markTapLifecycleExecuted,
  markTapLifecycleExit,
  markTapLifecycleManage,
} from '@/lib/eagle1Tapoint/entryLifecycleTap';

export const dynamic = 'force-dynamic';

function blockedJson(
  step: string,
  reason: string,
  status: number,
  extra?: Record<string, unknown>
) {
  logOrderBlockedBeforeBitget(step, reason);
  orderTraceLog(step, 'BLOCK', reason);
  return NextResponse.json(
    {
      ok: false,
      error: `ORDER BLOCKED · ${reason}`,
      outcome: 'ORDER_BLOCKED_BEFORE_BITGET',
      blockStep: step,
      blockReason: reason,
      paper: true,
      ...extra,
    },
    { status }
  );
}

/**
 * 실주문 게이트.
 * - open: equityPct면 주문 직전 자산×비중
 * - reduce/close: 거래소 실잔량 × frac
 * - set-sl: TP1 후 수익잠금 SL 갱신
 * 확정 수익 아님.
 */
export async function POST(req: NextRequest) {
  orderTraceLog('UI', 'PASS', 'live-order POST');

  const token = cookies().get(APP_SITE_COOKIE)?.value;
  const auth = verifySiteAuthToken(token);
  if (!auth) {
    return blockedJson('UI', 'AUTH_REQUIRED', 401);
  }
  orderTraceLog('UI', 'PASS', `user=${auth.user}`);

  const meta = readExchangeKeysMeta(auth.user);
  if (!meta) {
    return blockedJson('RiskGate', 'API_KEY_MISSING', 400);
  }
  if (meta.lastTestOk === false) {
    return blockedJson('RiskGate', 'API_AUTH_FAILED', 400);
  }
  orderTraceLog('RiskGate', 'PASS', 'API key meta ok');

  const creds = readExchangeKeysPlain(auth.user);
  if (!creds) {
    return blockedJson('RiskGate', 'API_KEY_DECRYPT_FAIL', 500);
  }

  const liveLock = tryAcquireLiveLock();
  if (!liveLock.ok) {
    return blockedJson('RiskGate', 'LIVE_INSTANCE_LOCK', 423, { liveLock });
  }
  orderTraceLog('RiskGate', 'PASS', 'LIVE_INSTANCE_LOCK');

  const body = await req.json().catch(() => ({}));
  const action = String(body.action || 'open') as
    | 'open'
    | 'reduce'
    | 'close'
    | 'set-sl'
    | 'set-tp'
    | 'ensure-sl-tp';
  const symbol = String(body.symbol || 'BTCUSDT').toUpperCase();
  const direction = body.direction === 'SHORT' ? 'SHORT' : 'LONG';
  const leverageRaw = Math.max(1, Math.min(125, Number(body.leverage) || 10));
  /** 비중창/요청 레버 그대로 (1~125) · 40 강제 금지 */
  const leverage = leverageRaw;
  const sizeMode = body.sizeMode === 'fixedUsdt' ? 'fixedUsdt' : 'equityPct';
  const equityPct = Math.max(0.5, Math.min(100, Number(body.equityPct) || 5));
  let marginUsdt = Math.max(1, Math.min(50000, Number(body.marginUsdt) || 20));
  let equityUsdt: number | undefined;

  const mmRaw = body.marginMode;
  const marginMode = normalizeMarginMode(mmRaw === 'crossed' ? 'crossed' : mmRaw || 'isolated');
  if (!marginMode) {
    return blockedJson('RiskGate', `INVALID_MARGIN_MODE · raw=${mmRaw}`, 400);
  }

  if (action === 'open' && sizeMode === 'equityPct') {
    const acct = await bitgetFetchAccountSummary(creds);
    equityUsdt = acct.equityUsdt ?? acct.availableUsdt;
    if (equityUsdt != null && equityUsdt > 0) {
      marginUsdt = equityPctToMarginUsdt(equityUsdt, equityPct);
    }
  }
  const price = Number(body.price) || 0;
  const sl = body.sl != null ? Number(body.sl) : null;
  const tp = body.tp != null ? Number(body.tp) : null;
  const clientOid = body.clientOid ? String(body.clientOid).slice(0, 32) : undefined;
  const source = String(body.source || 'manual');
  const frac = Math.max(0.05, Math.min(1, Number(body.frac) || 1));
  const tp1RoePct = Math.max(3, Math.min(20, Number(body.tp1RoePct) || 8));
  const slRoePct = Math.max(0.5, Math.min(100, Number(body.slRoePct) || 20));
  const userSlPrice =
    body.userSlPrice != null && Number(body.userSlPrice) > 0
      ? Number(body.userSlPrice)
      : null;
  const timeframe =
    body.timeframe != null && String(body.timeframe).trim()
      ? String(body.timeframe).trim()
      : null;
  const preserveStructureSl =
    body.preserveStructureSl === true || source === 'scalp';
  const lockStructurePrices =
    body.lockStructurePrices === true ||
    (Array.isArray(body.analysisTags) &&
      body.analysisTags.some((t: unknown) => String(t) === 'triple-align'));
  const signalKo =
    body.signalKo != null && String(body.signalKo).trim()
      ? String(body.signalKo).trim()
      : null;
  const evidenceKo =
    body.evidenceKo != null && String(body.evidenceKo).trim()
      ? String(body.evidenceKo).trim()
      : null;
  const noteKo =
    body.noteKo != null && String(body.noteKo).trim()
      ? String(body.noteKo).trim()
      : null;
  const fourStrategyId =
    body.fourStrategyId != null && String(body.fourStrategyId).trim()
      ? String(body.fourStrategyId).trim()
      : null;
  const analysisTags = Array.isArray(body.analysisTags)
    ? body.analysisTags.map((t: unknown) => String(t || '').trim()).filter(Boolean).slice(0, 8)
    : null;
  const entryScore =
    body.entryScore != null && Number(body.entryScore) > 0
      ? Number(body.entryScore)
      : null;

  const signalIdRaw =
    body.signalId != null && String(body.signalId).trim()
      ? String(body.signalId).trim()
      : clientOid || '';
  const sourceHint = `${source} ${signalIdRaw} ${signalKo || ''} ${(analysisTags || []).join(' ')}`;

  /**
   * 서버 ARM tapOnly — 타점엔진 주문만 허용.
   * Dual/로켓/초단/PPL signalId·문구는 실주문 거부.
   */
  if (action === 'open') {
    const arm = readServerAutoTradeArm(auth.user);
    if (arm.tapOnly !== false) {
      const hint = `${sourceHint} ${noteKo || ''}`;
      const isTap =
        /eagle1-tap-engine|타점엔진|실시간활동|15분밴드자동|BAND15_AUTO/i.test(hint) ||
        (analysisTags || []).some((t) => /eagle1-tap|tap-only|siglive|BAND15_AUTO|band15Auto|INST_BAND_15M/i.test(t));
      if (!isTap) {
        return blockedJson(
          'RiskGate',
          `TAP_ONLY · 구신호실주문차단 · ${signalIdRaw.slice(0, 48) || source}`,
          403
        );
      }
      if (
        (analysisTags || []).some((t) =>
          /QUICK_SCALP|SNIPER_SCALP|AI_AUTOPILOT|triple-align/i.test(t)
        )
      ) {
        return blockedJson('RiskGate', 'BAND15_AUTO_ONLY · 구스킬 실주문 금지', 403);
      }
      if (
        !(analysisTags || []).some((t) => /BAND15_AUTO|band15Auto|INST_BAND_15M/i.test(t))
      ) {
        return blockedJson('RiskGate', 'BAND15_AUTO_ONLY · 15분밴드자동만', 403);
      }
      return blockedJson('RiskGate', 'BAND15_AUTO_PAPER · LIVE 금지', 403);
    }
  }

  /** 사용자 요청: BPR 재터치 자동진입 OFF — 서버에서 최종 차단 */
  if (
    action === 'open' &&
    (/bpr-retest/i.test(sourceHint) ||
      /^bpr15-/i.test(signalIdRaw) ||
      /BPR재터치/i.test(sourceHint))
  ) {
    return blockedJson('RiskGate', 'BPR_RETEST_ENTRY_OFF', 200, {
      msg: 'BPR재터치 자동진입 OFF',
    });
  }

  orderTraceLog(
    'Signal',
    'PASS',
    `action=${action} ${symbol} ${direction} source=${source}`
  );

  if (action === 'set-sl') {
    const lockPx = sl != null && sl > 0 ? sl : Number(body.lockPrice) || 0;
    if (!(lockPx > 0)) {
      return blockedJson('OrderManager', 'LOCK_PRICE_REQUIRED', 400);
    }
    const posPack = await bitgetFetchOpenPosition(creds, symbol);
    if (!posPack.ok || !posPack.position || !(posPack.position.size > 0)) {
      return blockedJson('OrderManager', posPack.msg || 'NO_POSITION_FOR_SL', 200, {
        paper: false,
      });
    }
    const pos = posPack.position;
    if (pos.direction !== direction) {
      return blockedJson('OrderManager', `DIRECTION_MISMATCH · pos=${pos.direction}`, 200);
    }
    const result = await bitgetSetPositionStopLoss({
      creds,
      symbol,
      direction: pos.direction,
      stopLossPrice: lockPx,
    });
    if (result.ok) {
      const lifeId = signalIdRaw || `sl-${symbol}`;
      try {
        markTapLifecycleManage(lifeId, `live-order · SL잠금 ${lockPx}`);
      } catch {
        /* ignore */
      }
    }
    return NextResponse.json({
      ok: result.ok,
      orderId: result.orderId,
      size: formatBitgetSize(pos.size, symbol),
      msg: result.ok ? `실전 손절잠금 ${lockPx}` : bitgetErrorToKo(result.msg),
      error: result.ok ? undefined : bitgetErrorToKo(result.msg),
      source,
      paper: false,
      lockPrice: lockPx,
      outcome: result.ok ? 'ORDER_ACCEPTED' : 'ORDER_REJECTED',
    });
  }

  if (action === 'set-tp' || action === 'ensure-sl-tp') {
    const posPack = await bitgetFetchOpenPosition(creds, symbol);
    if (!posPack.ok || !posPack.position || !(posPack.position.size > 0)) {
      return blockedJson('OrderManager', posPack.msg || 'NO_POSITION_FOR_TP', 200, {
        paper: false,
      });
    }
    const pos = posPack.position;
    if (pos.direction !== direction) {
      return blockedJson('OrderManager', `DIRECTION_MISMATCH · pos=${pos.direction}`, 200);
    }
    const lev = Math.max(1, Number(pos.leverage) || leverage);
    const avg = pos.entryPrice > 0 ? pos.entryPrice : price;
    const fixed = resolveLiveOrderSlTp({
      entry: avg,
      direction: pos.direction,
      leverage: lev,
      signalSl: sl != null && sl > 0 ? sl : pos.slPrice,
      tp1RoePct,
      slRoePct,
      timeframe,
      preserveStructureSl,
    });
    const wantSl =
      action === 'ensure-sl-tp' || !(pos.slPrice != null && pos.slPrice > 0)
        ? fixed.sl
        : null;
    const wantTp = tp != null && tp > 0 ? tp : fixed.tp;
    const ens = await bitgetEnsurePositionSlTp({
      creds,
      symbol,
      direction: pos.direction,
      stopLossPrice: wantSl,
      takeProfitPrice: wantTp,
    });
    return NextResponse.json({
      ok: ens.tpOk || ens.slOk,
      msg: ens.notes.join(' · '),
      error: ens.tpOk ? undefined : ens.notes.join(' · '),
      source,
      paper: false,
      tp: wantTp,
      sl: wantSl ?? pos.slPrice,
      outcome: ens.tpOk ? 'ORDER_ACCEPTED' : 'ORDER_REJECTED',
    });
  }

  if (!(price > 0) && action === 'open') {
    return blockedJson('OrderManager', 'PRICE_REQUIRED', 400);
  }

  if (action === 'open') {
    const want = String(symbol || '').toUpperCase();
    const wantId = matchAutoTradeSymbolId(want) || want;
    const allPos = await bitgetFetchAllOpenPositions(creds);
    const sameSymRows = (allPos.positions || []).filter((p) => {
      const id = matchAutoTradeSymbolId(p.symbol) || String(p.symbol || '').toUpperCase();
      return id === wantId && Number(p.size) > 0;
    });
    const sameDirPos = sameSymRows.find((p) => p.direction === direction);
    const oppDirPos = sameSymRows.find((p) => p.direction !== direction);
    const allowDca = body.allowDca === true;

    if (sameDirPos) {
      if (!(allowDca && sameDirPos.direction === direction)) {
        return blockedJson(
          'RiskGate',
          `DUPLICATE_POSITION · ${symbol} ${sameDirPos.direction}`,
          200,
          { paper: false, position: sameDirPos }
        );
      }
      orderTraceLog(
        'RiskGate',
        'PASS',
        `DCA_ADD · ${symbol} ${direction} · 기존사이즈 ${sameDirPos.size}`
      );
    } else if (oppDirPos) {
      /** 전 코인 헷지 금지 (설정·클라이언트 allowHedge 무시) */
      return blockedJson(
        'RiskGate',
        HEDGE_ENTRY_GLOBALLY_DISABLED
          ? `HEDGE_BLOCKED · ${symbol} 보유${oppDirPos.direction} · 반대${direction} 진입금지`
          : `DUPLICATE_POSITION · ${symbol} ${oppDirPos.direction}`,
        200,
        { paper: false, position: oppDirPos }
      );
    }

    orderTraceLog('OrderManager', 'PASS', 'calling bitgetOpenLongShort');
    const result = await bitgetOpenLongShort({
      creds,
      symbol,
      direction,
      marginUsdt,
      leverage,
      price,
      marginMode,
      sl,
      tp: tp ?? undefined,
      clientOid,
      tp1RoePct,
      slRoePct,
      userSlPrice,
      timeframe,
      preserveStructureSl,
      lockStructurePrices,
      hedgeOpen: false,
    });

    /** 체결 후 평균가 기준 TP/SL 재부착 — 프리셋 누락·추가매수 대응 */
    let notifySl = result.actualSl ?? sl;
    let notifyTp = result.actualTp ?? tp;
    if (result.ok) {
      try {
        await new Promise((r) => setTimeout(r, 400));
        const posAfter = await bitgetFetchOpenPosition(creds, symbol);
        const avg =
          posAfter.ok && posAfter.position && posAfter.position.entryPrice > 0
            ? posAfter.position.entryPrice
            : price;
        if (!lockStructurePrices) {
          const fixed = resolveLiveOrderSlTp({
            entry: avg,
            direction,
            leverage,
            signalSl: notifySl,
            userSlPrice,
            tp1RoePct,
            slRoePct,
            timeframe,
            preserveStructureSl,
          });
          notifySl = fixed.sl > 0 ? fixed.sl : notifySl;
          notifyTp = fixed.tp > 0 ? fixed.tp : notifyTp;
        }
        const ens = await bitgetEnsurePositionSlTp({
          creds,
          symbol,
          direction,
          stopLossPrice: notifySl,
          takeProfitPrice: notifyTp,
        });
        orderTraceLog(
          'OrderManager',
          ens.tpOk && ens.slOk ? 'PASS' : 'BLOCK',
          `post-fill SL/TP · avg=${avg} · ${ens.notes.join(' · ')}`
        );
      } catch (e) {
        orderTraceLog(
          'OrderManager',
          'BLOCK',
          `post-fill SL/TP err · ${e instanceof Error ? e.message : 'fail'}`
        );
      }

      /** 레이스 헷지 롤백 — 같은코인 롱+숏 동시 감지 시 신규방향 청산 */
      try {
        await new Promise((r) => setTimeout(r, 350));
        const allAfter = await bitgetFetchAllOpenPositions(creds);
        const afterRows = (allAfter.positions || []).filter((p) => {
          const id = matchAutoTradeSymbolId(p.symbol) || String(p.symbol || '').toUpperCase();
          return id === wantId && Number(p.size) > 0;
        });
        const hasSame = afterRows.some((p) => p.direction === direction);
        const hasOpp = afterRows.some((p) => p.direction !== direction);
        if (hasSame && hasOpp) {
          const newRow = afterRows.find((p) => p.direction === direction);
          const closeSize =
            newRow && Number(newRow.size) > 0
              ? formatBitgetSize(Number(newRow.size), symbol)
              : result.size
                ? String(result.size)
                : '';
          if (closeSize) {
            const rb = await bitgetReduceOrClose({
              creds,
              symbol,
              direction,
              size: closeSize,
              marginMode,
              clientOid: `hedge-rb-${Date.now().toString(36).slice(-6)}`,
            });
            orderTraceLog(
              'RiskGate',
              rb.ok ? 'PASS' : 'BLOCK',
              `HEDGE_ROLLBACK · ${symbol} ${direction} · ${rb.ok ? '신규청산' : rb.msg || '청산실패'}`
            );
          }
          return blockedJson(
            'RiskGate',
            `HEDGE_ROLLBACK · ${symbol} 롱숏동시감지 · 신규${direction} 취소`,
            200,
            { paper: false, rolledBack: true }
          );
        }
      } catch (e) {
        orderTraceLog(
          'RiskGate',
          'BLOCK',
          `HEDGE_ROLLBACK err · ${e instanceof Error ? e.message : 'fail'}`
        );
      }
    }

    let telegramOk = false;
    let telegramErr: string | undefined;
    if (result.ok) {
      const lifeId =
        signalIdRaw ||
        result.clientOid ||
        result.orderId ||
        `live-${symbol}-${Date.now()}`;
      try {
        markTapLifecycleExecuted({
          signalId: lifeId,
          symbol,
          direction,
          entryPrice: price,
          paper: false,
          noteKo: `live-order · ${source}`,
        });
        markTapLifecycleManage(lifeId, 'live-order · MANAGE');
      } catch {
        /* ignore */
      }
      /** 응답 전 await — fire-and-forget 시 Next가 전송 끊김 방지 */
      const tg = await notifyMergedDeskPositionEntry({
        symbol,
        direction,
        price,
        sl: notifySl,
        tp: notifyTp,
        size: result.size,
        marginUsdt,
        equityPct: sizeMode === 'equityPct' ? equityPct : null,
        leverage,
        orderId: result.orderId || result.clientOid || null,
        source,
        signalId: body.signalId != null ? String(body.signalId) : null,
        mode: 'live',
        timeframe,
        signalKo: body.allowDca
          ? `${signalKo || '진입'} · 추가매수`
          : signalKo,
        evidenceKo:
          evidenceKo ||
          [signalKo, fourStrategyId ? `4전략 ${fourStrategyId}` : null, noteKo, result.slTpNotes]
            .filter(Boolean)
            .join(' · ') ||
          null,
        noteKo: noteKo || `Bitget 실주문 · ${direction}`,
        fourStrategyId,
        analysisTags,
        entryScore,
      });
      telegramOk = tg.ok === true;
      telegramErr = tg.error;
      if (!telegramOk) {
        orderTraceLog('Notify', 'BLOCK', `entry-telegram · ${telegramErr || 'fail'}`);
      } else {
        orderTraceLog('Notify', 'PASS', 'entry-telegram sent');
      }
    }

    const outcome = result.ok
      ? 'ORDER_ACCEPTED'
      : result.blockStep && result.blockStep !== 'Response'
        ? 'ORDER_BLOCKED_BEFORE_BITGET'
        : 'ORDER_SENT_TO_BITGET';

    const errorLine = result.ok
      ? undefined
      : result.blockReason
        ? `ORDER BLOCKED · STEP=${result.blockStep} · REASON=${result.blockReason}`
        : result.code
          ? `ORDER SENT TO BITGET · CODE=${result.code} · MSG=${result.msg}`
          : bitgetErrorToKo(result.msg);

    return NextResponse.json({
      ok: result.ok,
      orderId: result.orderId,
      clientOid: result.clientOid,
      size: result.size,
      marginUsdt,
      equityUsdt,
      equityPct: sizeMode === 'equityPct' ? equityPct : undefined,
      sizeMode,
      msg: result.ok
        ? `ORDER ACCEPTED · CODE=00000 · ORDER_ID=${result.orderId || '-'} · FILL=${result.fillStatus || '?'} · ${result.positionOpen ? 'POSITION OPEN' : 'position check'}${telegramOk ? ' · TG OK' : telegramErr ? ` · TG실패 ${telegramErr}` : ''}`
        : errorLine,
      error: errorLine,
      source,
      paper: false,
      telegramQueued: telegramOk,
      telegramOk,
      telegramErr,
      outcome,
      blockStep: result.blockStep,
      blockReason: result.blockReason,
      code: result.code,
      httpStatus: result.httpStatus,
      fillStatus: result.fillStatus,
      positionOpen: result.positionOpen,
      endpoint: result.endpoint || '/api/v2/mix/order/place-order',
      appPosMode: result.appPosMode,
      bitgetPosMode: result.bitgetPosMode,
      raw: result.raw,
    });
  }

  /** reduce / close */
  const posPack = await bitgetFetchOpenPosition(creds, symbol);
  let size = body.size ? String(body.size) : '';
  let usedLiveSize = false;
  if (posPack.ok && posPack.position && posPack.position.size > 0) {
    const pos = posPack.position;
    if (pos.direction === direction) {
      size = positionSizeForReduce(pos.size, action === 'close' ? 1 : frac, symbol);
      usedLiveSize = true;
    }
  }
  if (!size && price > 0) {
    size = formatBitgetSize(marginToBaseSize(marginUsdt, leverage, price) * frac, symbol);
  }
  if (!size) {
    return blockedJson('OrderManager', 'NO_SIZE_FOR_REDUCE', 400);
  }

  const result = await bitgetReduceOrClose({
    creds,
    symbol,
    direction,
    size,
    marginMode,
    clientOid,
  });
  if (result.ok && (action === 'close' || frac >= 0.95)) {
    const lifeId =
      signalIdRaw ||
      result.clientOid ||
      result.orderId ||
      `live-exit-${symbol}`;
    try {
      markTapLifecycleExit({
        signalId: lifeId,
        exitPrice: price > 0 ? price : 0,
        noteKo: `live-order · ${action}`,
      });
    } catch {
      /* ignore */
    }
  }
  return NextResponse.json({
    ok: result.ok,
    orderId: result.orderId,
    clientOid: result.clientOid,
    size,
    msg: result.ok
      ? `${action === 'close' || frac >= 0.95 ? '실전전량' : '실전부분'} ${size}${usedLiveSize ? ' · 실잔량기준' : ''}`
      : bitgetErrorToKo(result.msg),
    error: result.ok ? undefined : bitgetErrorToKo(result.msg),
    source,
    paper: false,
    usedLiveSize,
    frac: action === 'close' ? 1 : frac,
    outcome: result.ok ? 'ORDER_ACCEPTED' : 'ORDER_SENT_TO_BITGET',
    code: result.code,
    blockReason: result.blockReason,
  });
}
