/**
 * 가상·병행 기록 묶음 — 클립보드/파일로 넘겨 검증용.
 * 확정 승률·수익 아님.
 */
import { readVirtualTradeSession } from '@/lib/mergedDeskVirtualTradeSession';
import { readVirtualSeedLedger } from '@/lib/mergedDeskVirtualSeedLedger';
import { readAutoTradeConfig } from '@/lib/mergedDeskAutoTradeConfig';
import { exportTradeEventJournalJson } from '@/lib/mergedDeskTradeEventJournal';

export function buildVirtualAuditPack(symbol?: string): {
  text: string;
  summaryKo: string;
} {
  const virt = readVirtualTradeSession();
  const led = readVirtualSeedLedger();
  const cfg = readAutoTradeConfig();
  const trades = Array.isArray(led.trades) ? led.trades : [];
  const wins = trades.filter((t) => t.win === true).length;
  const losses = trades.filter((t) => t.win === false).length;
  const journal = exportTradeEventJournalJson(symbol);

  const pack = {
    schema: 'ailongshort.virtualAuditPack.v1',
    exportedAt: new Date().toISOString(),
    noteKo: '가상·병행 검증용 · 확정 수익·승률 아님',
    parallel: {
      liveArmed: cfg.liveArmed === true,
      virtActive: virt.active === true,
      enabled: cfg.enabled === true,
    },
    virtualSession: {
      active: virt.active,
      symbol: virt.symbol,
      timeframe: virt.timeframe,
      seedUsdt: virt.seedUsdt,
      equityUsdt: virt.equityUsdt,
      startedAt: virt.startedAt,
      lastMsgKo: virt.lastMsgKo,
      position: virt.position,
      reentryWatch: virt.reentryWatch,
    },
    seedLedger: {
      seedUsdt: led.seedUsdt,
      equityUsdt: led.equityUsdt,
      tradeCount: trades.length,
      wins,
      losses,
      trades: trades.slice(0, 80),
    },
    tradeEventJournalJson: journal,
  };

  const summaryKo = [
    `병행 ${cfg.liveArmed && virt.active ? 'ON' : 'OFF'}`,
    `실전ARM ${cfg.liveArmed ? 'ON' : 'OFF'}`,
    `가상 ${virt.active ? 'ON' : 'OFF'}`,
    `시드 ${led.seedUsdt} → 자산 ${Number(led.equityUsdt).toFixed(2)}`,
    `가상체결 ${trades.length} · 승 ${wins} · 패 ${losses}`,
    virt.position
      ? `보유 ${virt.position.symbol} ${virt.position.direction}`
      : '가상보유없음',
  ].join(' · ');

  return { text: JSON.stringify(pack, null, 2), summaryKo };
}

export async function copyVirtualAuditPackToClipboard(
  symbol?: string
): Promise<{ ok: boolean; summaryKo: string; error?: string }> {
  const { text, summaryKo } = buildVirtualAuditPack(symbol);
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return { ok: true, summaryKo };
    }
    return { ok: false, summaryKo, error: 'clipboard 불가' };
  } catch (e) {
    return {
      ok: false,
      summaryKo,
      error: e instanceof Error ? e.message : '복사 실패',
    };
  }
}
