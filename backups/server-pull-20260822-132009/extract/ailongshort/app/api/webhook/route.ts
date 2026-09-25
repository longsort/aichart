import { NextRequest, NextResponse } from 'next/server';
import {
  clientIpFromHeaders,
  consumeRouteRateLimit,
  isHttpsWebhookUrl,
  sanitizeWebhookField,
} from '@/lib/serverRouteGuard';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const ip = clientIpFromHeaders(req.headers);
  if (!consumeRouteRateLimit(`webhook:${ip}`, 8, 60_000)) {
    return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 });
  }

  const url = (process.env.WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL || '').trim();
  if (!url) {
    return NextResponse.json(
      { ok: false, error: 'WEBHOOK_URL or DISCORD_WEBHOOK_URL not configured' },
      { status: 400 }
    );
  }
  if (!isHttpsWebhookUrl(url)) {
    return NextResponse.json({ ok: false, error: 'webhook url must be https' }, { status: 400 });
  }

  try {
    const body = await req.json();
    const verdict = sanitizeWebhookField(body?.verdict, 16);
    const symbol = sanitizeWebhookField(body?.symbol, 24);
    const timeframe = sanitizeWebhookField(body?.timeframe, 12);
    const confidence = sanitizeWebhookField(body?.confidence, 8);
    const entry = sanitizeWebhookField(body?.entry, 40);
    const stopLoss = sanitizeWebhookField(body?.stopLoss, 40);
    const targets = Array.isArray(body?.targets)
      ? body.targets.map((t: unknown) => sanitizeWebhookField(t, 40)).slice(0, 6)
      : [];
    const text = `**${symbol}** ${timeframe}\n${
      verdict === 'LONG' ? '🟢 롱' : verdict === 'SHORT' ? '🔴 숏' : '🟡 관망'
    } · 신뢰도 ${confidence}%\n진입 ${entry} · 손절 ${stopLoss}\n목표 ${targets.join(', ')}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(url.includes('discord') ? { content: text } : { text }),
    });
    if (!res.ok) throw new Error(`webhook ${res.status}`);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'webhook failed' }, { status: 500 });
  }
}
