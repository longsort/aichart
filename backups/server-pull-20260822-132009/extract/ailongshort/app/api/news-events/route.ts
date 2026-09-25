import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

type NewsEventOut = {
  title: string;
  timeMs: number;
  symbols: string[];
  source: 'ff';
};

function asNum(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number.parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : null;
}

function rowToEpochMs(row: any): number | null {
  const direct =
    asNum(row?.timestamp) ??
    asNum(row?.date) ??
    asNum(row?.time) ??
    asNum(row?.event_time) ??
    asNum(row?.eventTime);
  if (direct != null) {
    if (direct > 1e12) return Math.round(direct);
    if (direct > 1e9) return Math.round(direct * 1000);
  }
  const dateStr = String(row?.date ?? row?.event_date ?? '').trim();
  const timeStr = String(row?.time ?? row?.event_time ?? '').trim();
  if (!dateStr) return null;
  const merged = `${dateStr} ${timeStr}`.trim();
  const ms = Date.parse(merged);
  return Number.isFinite(ms) ? ms : null;
}

function isHighImpact(row: any): boolean {
  const impact = String(row?.impact ?? row?.importance ?? '').toLowerCase();
  const stars = String(row?.impact_stars ?? row?.stars ?? '');
  if (impact.includes('high') || impact.includes('red')) return true;
  const n = asNum(stars);
  return n != null && n >= 3;
}

function keepByKeyword(title: string): boolean {
  return /fomc|fed|rate|interest|cpi|ppi|nfp|payroll|inflation|employment|pce|powell|gdp/i.test(
    title
  );
}

export async function GET() {
  try {
    const url = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) {
      return NextResponse.json({ events: [], source: 'ff', error: `upstream ${res.status}` }, { status: 200 });
    }
    const json = await res.json();
    const rows = Array.isArray(json) ? json : [];
    const out: NewsEventOut[] = [];
    for (const row of rows) {
      const title = String(row?.title ?? row?.event ?? '').trim();
      if (!title || !keepByKeyword(title) || !isHighImpact(row)) continue;
      const currency = String(row?.currency ?? row?.country ?? '').toUpperCase();
      if (currency && !['USD', 'EUR', 'GBP', 'JPY', 'CNY'].includes(currency)) continue;
      const timeMs = rowToEpochMs(row);
      if (timeMs == null) continue;
      out.push({
        title,
        timeMs,
        symbols: ['BTC', 'ETH'],
        source: 'ff',
      });
    }
    out.sort((a, b) => a.timeMs - b.timeMs);
    const deduped = out.filter((e, i) => i === 0 || !(e.title === out[i - 1]!.title && e.timeMs === out[i - 1]!.timeMs));
    return NextResponse.json({ events: deduped, source: 'ff', fetchedAtMs: Date.now() });
  } catch (err: any) {
    return NextResponse.json(
      { events: [], source: 'ff', error: String(err?.message || err || 'unknown') },
      { status: 200 }
    );
  }
}

