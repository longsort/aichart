/**
 * GET/POST /api/merged-desk/entry-ping
 * 실진입 게이트 서버 PING (주문 없음). next/headers는 이 라우트에만.
 */
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { APP_SITE_COOKIE, verifySiteAuthToken } from '@/lib/appSiteAuth';
import { readExchangeKeysMeta, readExchangeKeysPlain } from '@/lib/serverExchangeKeysStore';
import {
  bitgetFetchAccountSummary,
  bitgetFetchAllOpenPositions,
} from '@/lib/bitgetPrivateTrade';
import { tryAcquireLiveLock } from '@/lib/bitgetLiveInstanceLock';
import {
  filterAutoTradePositions,
  matchAutoTradeSymbolId,
  AUTO_TRADE_MAX_CONCURRENT,
} from '@/lib/mergedDeskAutoTradeConfig';
import { loadBitgetFuturesChartCandles } from '@/lib/bitgetFuturesMarket';
import {
  buildCandleLsSignal,
  listCandleLsScanTimeframes,
  voteCandleLsOnClosedBar,
  type CandleLsTfVote,
} from '@/lib/mergedDeskCandleLsSignal';
import {
  entryPingStep,
  type EntryPingStep,
} from '@/lib/mergedDeskEntryGatePingClient';

export const dynamic = 'force-dynamic';

type EntryPingResult = {
  ok: boolean;
  readyForLiveOrder: boolean;
  firstBlockKo: string | null;
  steps: EntryPingStep[];
  summaryKo: string;
  equityUsdt?: number;
  availableUsdt?: number;
  autoOpenCount?: number;
  lockMsg?: string;
};

function fail(
  steps: EntryPingStep[],
  firstBlockKo: string,
  extra?: Partial<EntryPingResult>
): EntryPingResult {
  return {
    ok: false,
    readyForLiveOrder: false,
    firstBlockKo,
    steps,
    summaryKo: `막힘 · ${firstBlockKo}`,
    ...extra,
  };
}

async function runPing(params: {
  symbol: string;
  maxConcurrent: number;
}): Promise<EntryPingResult> {
  const steps: EntryPingStep[] = [];
  const symbol = String(params.symbol || 'BTCUSDT').toUpperCase();
  const maxConc = Math.max(
    1,
    Math.min(AUTO_TRADE_MAX_CONCURRENT, Number(params.maxConcurrent) || AUTO_TRADE_MAX_CONCURRENT)
  );

  const token = cookies().get(APP_SITE_COOKIE)?.value;
  const auth = verifySiteAuthToken(token);
  if (!auth) {
    steps.push(entryPingStep('auth', false, '로그인', '사이트 로그인 필요'));
    return fail(steps, '로그인 필요');
  }
  steps.push(entryPingStep('auth', true, '로그인', `사용자 ${auth.user}`));

  const meta = readExchangeKeysMeta(auth.user);
  if (!meta) {
    steps.push(entryPingStep('keys', false, 'API키', '거래소 API 미등록'));
    return fail(steps, 'API키 미등록');
  }
  if (meta.lastTestOk === false) {
    steps.push(
      entryPingStep('keys', false, 'API키', `인증 실패 · ${meta.lastTestMsg || '재테스트 필요'}`)
    );
    return fail(steps, 'API 인증 실패');
  }
  steps.push(
    entryPingStep(
      'keys',
      true,
      'API키',
      `${meta.apiKeyMasked || '등록됨'} · 최근테스트 ${meta.lastTestOk === true ? 'OK' : '미확인'}`
    )
  );

  const creds = readExchangeKeysPlain(auth.user);
  if (!creds) {
    steps.push(entryPingStep('decrypt', false, '키복호화', '복호화 실패'));
    return fail(steps, '키 복호화 실패');
  }
  steps.push(entryPingStep('decrypt', true, '키복호화', 'OK'));

  const lockTry = tryAcquireLiveLock();
  steps.push(
    entryPingStep(
      'liveLock',
      lockTry.ok,
      '실주문락',
      lockTry.ok
        ? `${lockTry.msg} · 내인스턴스 ${lockTry.instanceId}`
        : lockTry.msg,
      true
    )
  );
  if (!lockTry.ok) {
    return fail(steps, lockTry.msg, { lockMsg: lockTry.msg });
  }

  const acct = await bitgetFetchAccountSummary(creds);
  if (!acct.ok) {
    steps.push(entryPingStep('account', false, '계좌조회', acct.msg || '실패'));
    return fail(steps, `계좌조회 실패 · ${acct.msg || ''}`, { lockMsg: lockTry.msg });
  }
  const equity = acct.equityUsdt ?? acct.availableUsdt ?? 0;
  const avail = acct.availableUsdt ?? equity;
  steps.push(
    entryPingStep(
      'account',
      equity > 0,
      '계좌잔고',
      `자산≈${equity.toFixed(2)}U · 가용≈${avail.toFixed(2)}U`,
      equity <= 0
    )
  );
  if (!(equity > 0)) {
    return fail(steps, '잔고 없음', { equityUsdt: equity, availableUsdt: avail });
  }

  const posPack = await bitgetFetchAllOpenPositions(creds);
  const autoOpen = filterAutoTradePositions(posPack.positions || []);
  const wantId = matchAutoTradeSymbolId(symbol);
  const same = wantId
    ? autoOpen.find((p) => matchAutoTradeSymbolId(p.symbol) === wantId)
    : null;
  steps.push(
    entryPingStep(
      'positions',
      true,
      '자동매매포지션',
      `BTC~XRP 보유 ${autoOpen.length}개 / 한도 ${maxConc}개` +
        (same
          ? ` · ${wantId} 이미 ${same.direction === 'LONG' ? '롱' : '숏'} → 추가진입 불가`
          : ` · ${symbol} 빈자리`),
      false
    )
  );
  if (same && Number(same.size) > 0) {
    steps.push(
      entryPingStep(
        'sameSymbol',
        false,
        '동일심볼',
        `${wantId} 기존 포지션 · 추가진입 거부`,
        true
      )
    );
  } else {
    steps.push(entryPingStep('sameSymbol', true, '동일심볼', `${symbol} 신규 진입 가능`));
  }
  if (autoOpen.length >= maxConc) {
    steps.push(
      entryPingStep('cap', false, '동시한도', `보유 ${autoOpen.length} ≥ 한도 ${maxConc}`, true)
    );
  } else {
    steps.push(entryPingStep('cap', true, '동시한도', `여유 ${maxConc - autoOpen.length}자리`));
  }

  let signalKo = '신호없음 · TF합의 대기중(정상일 수 있음)';
  let signalOk = false;
  try {
    const votes: CandleLsTfVote[] = [];
    for (const tf of listCandleLsScanTimeframes()) {
      try {
        const { candles } = await loadBitgetFuturesChartCandles(symbol, tf, {
          recentOnly: true,
        });
        const v = voteCandleLsOnClosedBar({ timeframe: tf, candles });
        if (v) votes.push(v);
      } catch {
        /* skip */
      }
    }
    const sig = buildCandleLsSignal({
      symbol,
      votes,
      leverage: 10,
      minRr: 1.2,
    });
    if (sig) {
      signalOk = true;
      signalKo = `${sig.direction} · ${sig.timeframe} · E${sig.entry} SL${sig.sl} · ${sig.noteKo}`;
    } else {
      const dirs = votes
        .filter((v) => v.direction)
        .map((v) => `${v.timeframe}:${v.direction}(${v.score})`)
        .join(' ');
      signalKo = votes.length
        ? `합의미달 · 투표 ${votes.length} · ${dirs || '중립'}`
        : '캔들 투표 0 · 데이터/조건 부족';
    }
  } catch (e) {
    signalKo = e instanceof Error ? e.message : '스캔실패';
  }
  steps.push(entryPingStep('candleLs', true, '캔들LS스캔', signalKo, false));
  steps.push(
    entryPingStep(
      'candleLsReady',
      signalOk,
      '지금진입신호',
      signalOk
        ? '합의 신호 있음 · 주문 경로만 통과하면 진입 가능'
        : '지금은 합의 신호 없음 · 대기',
      false
    )
  );

  const firstBlock = steps.find((s) => s.block);
  const ready =
    !firstBlock &&
    lockTry.ok &&
    equity > 0 &&
    !(same && Number(same.size) > 0) &&
    autoOpen.length < maxConc;

  return {
    ok: true,
    readyForLiveOrder: ready,
    firstBlockKo: firstBlock?.detailKo ?? null,
    steps,
    summaryKo: firstBlock
      ? `막힘 · ${firstBlock.labelKo} · ${firstBlock.detailKo}`
      : signalOk
        ? `서버게이트 OK · 신호있음 · 클라이언트 ARM/단타 ON이면 진입 시도`
        : `서버게이트 OK · 지금은 신호대기(합의미달) · ARM만 켜두면 신호 시 진입`,
    equityUsdt: equity,
    availableUsdt: avail,
    autoOpenCount: autoOpen.length,
    lockMsg: lockTry.msg,
  };
}

export async function GET(req: NextRequest) {
  const symbol = String(req.nextUrl.searchParams.get('symbol') || 'BTCUSDT').toUpperCase();
  const maxConcurrent = Number(req.nextUrl.searchParams.get('maxConcurrent') || 20);
  const result = await runPing({ symbol, maxConcurrent });
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const symbol = String(body.symbol || 'BTCUSDT').toUpperCase();
  const maxConcurrent = Number(body.maxConcurrent || 20);
  const result = await runPing({ symbol, maxConcurrent });
  return NextResponse.json(result);
}
