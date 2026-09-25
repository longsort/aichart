/**
 * 서버 무접속 — 전코인 15m 수익패턴 스캔·진입.
 * 기존 서버ARM(liveArmed)+거래소키+bitgetOpenLongShort 사용.
 */
import { loadBitgetFuturesChartCandles } from '@/lib/bitgetFuturesMarket';
import { bitgetOpenLongShort } from '@/lib/bitgetPrivateTrade';
import { readExchangeKeysMeta, readExchangeKeysPlain } from '@/lib/serverExchangeKeysStore';
import {
  listServerAutoTradeArmedUsers,
  markServerSignalFired,
  readServerAutoTradeArm,
  wasServerSignalFired,
  writeServerAutoTradeArm,
  writeServerPositionEntryMemo,
} from '@/lib/serverMergedDeskAutoTradeStore';
import { resolveProfitPatternAutoEntry } from '@/lib/profitPattern15m/autoEntry';
import { PP_PAPER_POLICY_KO } from '@/lib/profitPattern15m/paperPolicy';
import {
  ppServerAppendJournal,
  ppServerDayCapCanEnter,
  ppServerDayCapRecord,
  ppServerLockLevels,
  ppServerMarkFired,
  ppServerWasFired,
} from '@/lib/profitPattern15m/serverPersist';
import {
  writePpServerArm,
  readPpServerArm,
} from '@/lib/profitPattern15m/serverArm';
import {
  PROFIT_PATTERN_CORE_SYMBOLS,
  PROFIT_PATTERN_HOCHUNG,
  PROFIT_PATTERN_SKILL_ID,
} from '@/lib/profitPattern15m/skill';

export type PpServerRunRow = {
  user?: string;
  symbol: string;
  status: string;
  action: 'SKIP' | 'WAIT' | 'ENTER' | 'ERROR';
  reasonKo: string;
  orderId?: string | null;
  paper?: boolean;
};

export type PpServerRunReport = {
  ok: boolean;
  armedUsers: string[];
  policyKo: string;
  at: number;
  rows: PpServerRunRow[];
  entered: number;
  skipped: number;
  errors: number;
};

function symbolsForArm(enabled: string[] | undefined): string[] {
  const fromArm = (enabled || [])
    .map((s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, ''))
    .filter((s) => s.endsWith('USDT'));
  if (fromArm.length) return fromArm;
  return [...PROFIT_PATTERN_CORE_SYMBOLS];
}

export async function runProfitPatternServerScan(opts?: {
  dryRun?: boolean;
  user?: string;
}): Promise<PpServerRunReport> {
  const dryRun = Boolean(opts?.dryRun);
  const users = opts?.user
    ? [opts.user]
    : listServerAutoTradeArmedUsers();
  const report: PpServerRunReport = {
    ok: true,
    armedUsers: users,
    policyKo: PP_PAPER_POLICY_KO,
    at: Date.now(),
    rows: [],
    entered: 0,
    skipped: 0,
    errors: 0,
  };

  if (!users.length) {
    report.rows.push({
      symbol: '-',
      status: 'DISARMED',
      action: 'SKIP',
      reasonKo: '서버 ARM ON 사용자 없음',
    });
    report.skipped += 1;
    return report;
  }

  for (const user of users) {
    const arm = readServerAutoTradeArm(user);
    if (!arm.liveArmed) {
      report.rows.push({
        user,
        symbol: '-',
        status: 'DISARMED',
        action: 'SKIP',
        reasonKo: `${user} · ARM OFF`,
      });
      report.skipped += 1;
      continue;
    }

    /** PP ARM 미러 (모니터/상태용) */
    try {
      writePpServerArm({
        liveArmed: true,
        symbols: symbolsForArm(arm.enabledSymbols),
        leverage: Math.max(1, Number(arm.leverage) || 50),
        marginUsdt: Math.max(1, Number(arm.marginUsdt) || 10),
        paperOnly: false,
        updatedBy: user,
      });
    } catch {
      /* ignore */
    }

    const meta = readExchangeKeysMeta(user);
    const creds = readExchangeKeysPlain(user);
    const canLive =
      Boolean(creds) && meta != null && meta.lastTestOk !== false && !dryRun;

    const symbols = symbolsForArm(arm.enabledSymbols);
    for (const symbol of symbols) {
      try {
        if (!ppServerDayCapCanEnter(symbol)) {
          report.rows.push({
            user,
            symbol,
            status: 'DAY_CAP',
            action: 'SKIP',
            reasonKo: '일일캡 소진',
          });
          report.skipped += 1;
          continue;
        }

        const { candles, source } = await loadBitgetFuturesChartCandles(
          symbol,
          '15m',
          { recentOnly: true }
        );
        if ((candles?.length || 0) < 80) {
          report.rows.push({
            user,
            symbol,
            status: 'NO_DATA',
            action: 'SKIP',
            reasonKo: `캔들부족 · ${source}`,
          });
          report.skipped += 1;
          continue;
        }

        const entry = resolveProfitPatternAutoEntry({
          symbol,
          candles15m: candles,
          leverage: Math.max(1, Number(arm.leverage) || 50),
        });

        if (
          !entry.ok ||
          !entry.direction ||
          entry.entry == null ||
          entry.sl == null ||
          entry.tp == null
        ) {
          report.rows.push({
            user,
            symbol,
            status: 'WAIT',
            action: 'WAIT',
            reasonKo: entry.reasonKo || 'WAIT',
          });
          report.skipped += 1;
          continue;
        }

        const eventId =
          entry.eventId ||
          `${PROFIT_PATTERN_SKILL_ID}-${symbol}-${entry.direction}-${Math.round(entry.entry)}`;
        if (ppServerWasFired(eventId) || wasServerSignalFired(user, eventId)) {
          report.rows.push({
            user,
            symbol,
            status: 'DEDUP',
            action: 'SKIP',
            reasonKo: '이미 진입한 신호',
          });
          report.skipped += 1;
          continue;
        }

        ppServerAppendJournal({
          kind: 'SIGNAL',
          symbol,
          timeframe: '15m',
          direction: entry.direction,
          entry: entry.entry,
          sl: entry.sl,
          tp: entry.tp,
          sizeScale: entry.sizeScale,
          eventId,
          reasonKo: entry.reasonKo,
          policyKo: PP_PAPER_POLICY_KO,
          meta: { user },
        });

        const marginUsdt = Math.max(
          1,
          Math.round(
            Number(arm.marginUsdt || 10) * Math.max(0.35, entry.sizeScale || 1) * 100
          ) / 100
        );
        const lev = Math.max(1, Math.min(125, Math.round(Number(arm.leverage) || 50)));

        if (dryRun || !canLive) {
          ppServerMarkFired(eventId);
          markServerSignalFired(user, eventId);
          ppServerDayCapRecord(symbol);
          ppServerLockLevels({
            symbol,
            direction: entry.direction,
            entry: entry.entry,
            sl: entry.sl,
            tp: entry.tp,
            lockedAt: Math.floor(Date.now() / 1000),
            eventId,
            source: 'profitPattern',
            lineEntryKo: entry.lineEntryKo || '50x고정',
            lineSlKo: entry.lineSlKo || '50x고정스탑',
            lineTpKo: entry.lineTpKo || '50x고정목표',
          });
          ppServerAppendJournal({
            kind: 'ENTRY',
            symbol,
            direction: entry.direction,
            entry: entry.entry,
            sl: entry.sl,
            tp: entry.tp,
            eventId,
            reasonKo: dryRun
              ? '드라이런 · 페이퍼'
              : '키없음/미검증 · 페이퍼 기록',
            meta: { user, paper: true },
          });
          report.rows.push({
            user,
            symbol,
            status: dryRun ? 'DRY' : 'PAPER_ENTER',
            action: 'ENTER',
            reasonKo: `${PROFIT_PATTERN_HOCHUNG} · ${entry.direction} 페이퍼`,
            paper: true,
          });
          report.entered += 1;
          continue;
        }

        const placed = await bitgetOpenLongShort({
          creds: creds!,
          symbol,
          direction: entry.direction,
          marginUsdt,
          leverage: lev,
          price: entry.entry,
          marginMode: arm.marginMode || 'isolated',
          sl: entry.sl,
          tp: entry.tp,
          clientOid: eventId.replace(/[^0-9A-Za-z_-]/g, '').slice(0, 32),
          tp1RoePct: 5,
          slRoePct: 22,
          timeframe: '15m',
          userSlPrice: entry.sl,
          preserveStructureSl: true,
          lockStructurePrices: true,
        });

        if (!placed.ok) {
          report.rows.push({
            user,
            symbol,
            status: 'ORDER_FAIL',
            action: 'ERROR',
            reasonKo: placed.msg || '주문실패',
          });
          report.errors += 1;
          ppServerAppendJournal({
            kind: 'SKIP',
            symbol,
            direction: entry.direction,
            entry: entry.entry,
            sl: entry.sl,
            tp: entry.tp,
            eventId,
            reasonKo: placed.msg || '주문실패',
            meta: { user },
          });
          continue;
        }

        ppServerMarkFired(eventId);
        markServerSignalFired(user, eventId);
        ppServerDayCapRecord(symbol);
        ppServerLockLevels({
          symbol,
          direction: entry.direction,
          entry: entry.entry,
          sl: entry.sl,
          tp: entry.tp,
          lockedAt: Math.floor(Date.now() / 1000),
          eventId,
          source: 'profitPattern',
          lineEntryKo: entry.lineEntryKo || '50x고정',
          lineSlKo: entry.lineSlKo || '50x고정스탑',
          lineTpKo: entry.lineTpKo || '50x고정목표',
        });
        writeServerPositionEntryMemo(user, {
          symbol,
          direction: entry.direction,
          signalKo: `${PROFIT_PATTERN_HOCHUNG} · ${entry.lineEntryKo || entry.direction}`,
          source: PROFIT_PATTERN_SKILL_ID,
          signalId: eventId,
          timeframe: '15m',
          at: Date.now(),
        });
        writeServerAutoTradeArm(user, {
          lastStatusKo: `수익패턴 ${symbol.replace('USDT', '')}${entry.direction === 'LONG' ? '롱' : '숏'} 진입`,
          lastTickAt: Date.now(),
        });
        ppServerAppendJournal({
          kind: 'ENTRY',
          symbol,
          timeframe: '15m',
          direction: entry.direction,
          entry: entry.entry,
          sl: entry.sl,
          tp: entry.tp,
          sizeScale: entry.sizeScale,
          eventId,
          reasonKo: placed.msg || '실주문 OK',
          policyKo: PP_PAPER_POLICY_KO,
          meta: { user, paper: false, size: placed.size },
        });
        ppServerAppendJournal({
          kind: 'LOCK',
          symbol,
          direction: entry.direction,
          entry: entry.entry,
          sl: entry.sl,
          tp: entry.tp,
          eventId,
          reasonKo: '서버 무접속 · E/SL/TP 고정',
          meta: { user },
        });

        report.rows.push({
          user,
          symbol,
          status: 'LIVE_ENTER',
          action: 'ENTER',
          reasonKo: `${PROFIT_PATTERN_HOCHUNG} · 실주문 OK`,
          orderId: (placed as { orderId?: string }).orderId || null,
          paper: false,
        });
        report.entered += 1;
      } catch (e) {
        report.rows.push({
          user,
          symbol,
          status: 'ERROR',
          action: 'ERROR',
          reasonKo: e instanceof Error ? e.message : 'scan fail',
        });
        report.errors += 1;
      }
    }
  }

  return report;
}

/** 호환 */
export function getPpArmMirror() {
  return readPpServerArm();
}
