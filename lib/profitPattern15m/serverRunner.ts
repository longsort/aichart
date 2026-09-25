/**
 * 서버 무접속 — 전코인 15m 수익패턴 스캔·진입.
 * ARM ON + cron 호출 시 브라우저 없이도 동작.
 */
import { loadBitgetFuturesChartCandles } from '@/lib/bitgetFuturesMarket';
import {
  placeProfitPatternLiveOrder,
  readBitgetCredsFromEnv,
} from '@/lib/bitgetMixOrder';
import { resolveProfitPatternAutoEntry } from '@/lib/profitPattern15m/autoEntry';
import {
  PP_PAPER_POLICY_KO,
} from '@/lib/profitPattern15m/paperPolicy';
import {
  ppServerEntryReady,
  readPpServerArm,
  type PpServerArmState,
} from '@/lib/profitPattern15m/serverArm';
import {
  ppServerAppendJournal,
  ppServerDayCapCanEnter,
  ppServerDayCapRecord,
  ppServerLockLevels,
  ppServerMarkFired,
  ppServerWasFired,
} from '@/lib/profitPattern15m/serverPersist';
import {
  PROFIT_PATTERN_HOCHUNG,
  PROFIT_PATTERN_SKILL_ID,
} from '@/lib/profitPattern15m/skill';

export type PpServerRunRow = {
  symbol: string;
  status: string;
  action: 'SKIP' | 'WAIT' | 'ENTER' | 'ERROR';
  reasonKo: string;
  orderId?: string | null;
  paper?: boolean;
};

export type PpServerRunReport = {
  ok: boolean;
  armed: boolean;
  ready: boolean;
  policyKo: string;
  at: number;
  rows: PpServerRunRow[];
  entered: number;
  skipped: number;
  errors: number;
};

export async function runProfitPatternServerScan(opts?: {
  arm?: PpServerArmState;
  dryRun?: boolean;
}): Promise<PpServerRunReport> {
  const arm = opts?.arm || readPpServerArm();
  const dryRun = Boolean(opts?.dryRun);
  const report: PpServerRunReport = {
    ok: true,
    armed: arm.liveArmed,
    ready: ppServerEntryReady(arm),
    policyKo: PP_PAPER_POLICY_KO,
    at: Date.now(),
    rows: [],
    entered: 0,
    skipped: 0,
    errors: 0,
  };

  if (!arm.liveArmed) {
    report.rows.push({
      symbol: '-',
      status: 'DISARMED',
      action: 'SKIP',
      reasonKo: '서버 ARM OFF · 자동진입 안 함',
    });
    report.skipped += 1;
    return report;
  }

  const creds = arm.paperOnly || dryRun ? null : readBitgetCredsFromEnv();

  for (const symbol of arm.symbols) {
    try {
      if (!ppServerDayCapCanEnter(symbol)) {
        report.rows.push({
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
        { recentOnly: true, limit: 200 }
      );
      if (candles.length < 80) {
        report.rows.push({
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
        leverage: arm.leverage,
      });

      /** 서버 일일캡은 autoEntry의 브라우저 dayCap과 별도 — ok여도 서버캡 재확인 */
      if (!entry.ok || !entry.direction || entry.entry == null || entry.sl == null || entry.tp == null) {
        report.rows.push({
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
      if (ppServerWasFired(eventId)) {
        report.rows.push({
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
      });

      if (dryRun) {
        report.rows.push({
          symbol,
          status: 'DRY',
          action: 'SKIP',
          reasonKo: `드라이런 · ${entry.direction} @${entry.entry}`,
        });
        report.skipped += 1;
        continue;
      }

      const placed = await placeProfitPatternLiveOrder({
        symbol,
        direction: entry.direction,
        entry: entry.entry,
        sl: entry.sl,
        tp: entry.tp,
        leverage: arm.leverage,
        marginUsdt: arm.marginUsdt,
        sizeScale: entry.sizeScale,
        clientOid: eventId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 32),
      }, creds);

      if (!placed.ok) {
        report.rows.push({
          symbol,
          status: 'ORDER_FAIL',
          action: 'ERROR',
          reasonKo: placed.msg,
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
          reasonKo: placed.msg,
        });
        continue;
      }

      ppServerMarkFired(eventId);
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
        timeframe: '15m',
        direction: entry.direction,
        entry: entry.entry,
        sl: entry.sl,
        tp: entry.tp,
        sizeScale: entry.sizeScale,
        eventId,
        reasonKo: placed.msg,
        policyKo: PP_PAPER_POLICY_KO,
        meta: { paper: placed.paper, orderId: placed.orderId },
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
      });

      report.rows.push({
        symbol,
        status: placed.paper ? 'PAPER_ENTER' : 'LIVE_ENTER',
        action: 'ENTER',
        reasonKo: `${PROFIT_PATTERN_HOCHUNG} · ${placed.msg}`,
        orderId: placed.orderId,
        paper: placed.paper,
      });
      report.entered += 1;
    } catch (e) {
      report.rows.push({
        symbol,
        status: 'ERROR',
        action: 'ERROR',
        reasonKo: e instanceof Error ? e.message : 'scan fail',
      });
      report.errors += 1;
    }
  }

  return report;
}
