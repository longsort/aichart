import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const url = process.env.WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL || '';
  if (!url) {
    return NextResponse.json({ ok: false, error: 'WEBHOOK_URL or DISCORD_WEBHOOK_URL not configured' }, { status: 400 });
  }
  try {
    const body = await req.json();
    const { verdict, symbol, timeframe, confidence, entry, stopLoss, targets } = body;
    const text = `**${symbol}** ${timeframe}\n${verdict === 'LONG' ? '🟢 롱' : verdict === 'SHORT' ? '🔴 숏' : '🟡 관망'} · 신뢰도 ${confidence}%\n진입 ${entry} · 손절 ${stopLoss}\n목표 ${(targets || []).join(', ')}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        url.includes('discord') ? { content: text } : { text }
      ),
    });
    if (!res.ok) throw new Error(`webhook ${res.status}`);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'webhook failed' }, { status: 500 });
  }
}
