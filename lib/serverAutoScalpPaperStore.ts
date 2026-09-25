/**
 * 서버 자동초단 페이퍼 이력 (JSONL). 실주문 없음.
 */
import fs from 'fs';
import path from 'path';
import type { AutoScalpPaperTrade } from '@/lib/mergedDeskAutoScalpEngine';
import { summarizeAutoScalpTrades } from '@/lib/mergedDeskAutoScalpEngine';

function dir(): string {
  return path.join(process.cwd(), 'data', 'auto-scalp-paper');
}

function fileFor(user: string, symbol: string): string {
  const safeU = String(user || 'anon').replace(/[^\w.-]/g, '_');
  const safeS = String(symbol || 'BTCUSDT').replace(/[^\w]/g, '');
  return path.join(dir(), `${safeU}_${safeS}.jsonl`);
}

export function appendServerAutoScalpTrade(user: string, trade: AutoScalpPaperTrade): void {
  if (trade.phase !== 'CLOSED') return;
  try {
    fs.mkdirSync(dir(), { recursive: true });
    fs.appendFileSync(fileFor(user, trade.symbol), JSON.stringify(trade) + '\n', 'utf8');
  } catch {
    /* ignore */
  }
}

export function readServerAutoScalpTrades(user: string, symbol: string, limit = 80): AutoScalpPaperTrade[] {
  try {
    const raw = fs.readFileSync(fileFor(user, symbol), 'utf8');
    const lines = raw.split(/\r?\n/).filter(Boolean);
    const out: AutoScalpPaperTrade[] = [];
    for (const line of lines.slice(-Math.max(1, limit))) {
      try {
        out.push(JSON.parse(line) as AutoScalpPaperTrade);
      } catch {
        /* skip */
      }
    }
    return out.reverse();
  } catch {
    return [];
  }
}

export function serverAutoScalpExpectancy(user: string, symbol: string) {
  return summarizeAutoScalpTrades(readServerAutoScalpTrades(user, symbol, 200));
}
