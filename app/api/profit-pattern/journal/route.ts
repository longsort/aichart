/**
 * 수익패턴 저널 API — 추후 보강용 서버 기록.
 * POST body = PpJournalRow · GET ?symbol=&limit=
 */
import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DIR = path.join(process.cwd(), 'data', 'eagle1', 'profit_pattern_journal');
const MAX = 5000;

function ensureDir() {
  fs.mkdirSync(DIR, { recursive: true });
}

function fileForSymbol(symbol: string) {
  const sym = String(symbol || 'UNKNOWN')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '') || 'UNKNOWN';
  return path.join(DIR, `${sym}.jsonl`);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ ok: false, error: 'bad body' }, { status: 400 });
    }
    ensureDir();
    const sym = String((body as { symbol?: string }).symbol || 'UNKNOWN');
    const file = fileForSymbol(sym);
    const line = JSON.stringify({ ...body, savedAt: Date.now() }) + '\n';
    fs.appendFileSync(file, line, 'utf8');
    /** 파일 비대화 방지 — 최근 MAX줄만 */
    try {
      const raw = fs.readFileSync(file, 'utf8');
      const lines = raw.split('\n').filter(Boolean);
      if (lines.length > MAX) {
        fs.writeFileSync(file, lines.slice(-MAX).join('\n') + '\n', 'utf8');
      }
    } catch {
      /* ignore */
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'fail' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const symbol = String(sp.get('symbol') || '');
    const limit = Math.max(1, Math.min(500, Number(sp.get('limit')) || 50));
    ensureDir();
    if (!symbol) {
      const files = fs.existsSync(DIR)
        ? fs.readdirSync(DIR).filter((f) => f.endsWith('.jsonl'))
        : [];
      return NextResponse.json({ ok: true, files, count: files.length });
    }
    const file = fileForSymbol(symbol);
    if (!fs.existsSync(file)) {
      return NextResponse.json({ ok: true, rows: [], symbol });
    }
    const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
    const rows = lines
      .slice(-limit)
      .reverse()
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    return NextResponse.json({ ok: true, symbol, rows });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'fail' },
      { status: 500 }
    );
  }
}
