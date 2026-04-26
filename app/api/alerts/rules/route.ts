import { NextRequest, NextResponse } from 'next/server';
import { readAlertRules, writeAlertRules, type AlertRuleRecord } from '@/lib/serverVirtualStore';

export const dynamic = 'force-dynamic';

function getClientId(req: NextRequest): string {
  const header = req.headers.get('x-client-id');
  if (header && header.length >= 4) return header;
  const q = new URL(req.url).searchParams.get('clientId');
  if (q && q.length >= 4) return q;
  return 'default';
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function normalizeRule(input: Partial<AlertRuleRecord> & { symbol?: string; timeframe?: string }): AlertRuleRecord {
  const now = Date.now();
  return {
    id: String(input.id || `rule-${now}-${Math.floor(Math.random() * 10000)}`),
    symbol: String(input.symbol || '*').toUpperCase(),
    timeframe: String(input.timeframe || '*'),
    minTotalScore: clamp(Number(input.minTotalScore ?? 75), 0, 100),
    minProbabilityEdge: clamp(Number(input.minProbabilityEdge ?? 20), -100, 100),
    minConditionsMet: clamp(Math.floor(Number(input.minConditionsMet ?? 5)), 0, 20),
    enabled: input.enabled !== false,
    createdAt: Number(input.createdAt || now),
    updatedAt: now,
  };
}

function makeDefaultRule(): AlertRuleRecord {
  const now = Date.now();
  return {
    id: 'eagle1-default',
    symbol: '*',
    timeframe: '*',
    minTotalScore: 80,
    minProbabilityEdge: 20,
    minConditionsMet: 5,
    enabled: true,
    createdAt: now,
    updatedAt: now,
  };
}

export async function GET(req: NextRequest) {
  const clientId = getClientId(req);
  let rules = readAlertRules(clientId);
  if (!rules.length) {
    rules = [makeDefaultRule()];
    writeAlertRules(clientId, rules);
  }
  return NextResponse.json({ ok: true, rules });
}

export async function POST(req: NextRequest) {
  try {
    const clientId = getClientId(req);
    const body = await req.json();
    const incoming = Array.isArray(body?.rules) ? body.rules : [body];
    const existing = readAlertRules(clientId);
    const byId = new Map(existing.map((r) => [r.id, r]));
    for (const raw of incoming) {
      const normalized = normalizeRule(raw || {});
      const prev = byId.get(normalized.id);
      byId.set(normalized.id, prev ? { ...prev, ...normalized, createdAt: prev.createdAt } : normalized);
    }
    const merged = Array.from(byId.values())
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 400);
    const ok = writeAlertRules(clientId, merged);
    return NextResponse.json({ ok, rules: merged });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'invalid body' }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const clientId = getClientId(req);
  const ruleId = new URL(req.url).searchParams.get('id');
  if (!ruleId) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 });
  const next = readAlertRules(clientId).filter((r) => r.id !== ruleId);
  const ok = writeAlertRules(clientId, next);
  return NextResponse.json({ ok, rules: next });
}

