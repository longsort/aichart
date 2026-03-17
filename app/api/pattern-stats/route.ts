import { NextResponse } from 'next/server';
import { getPatternStats } from '@/lib/recall/patternStats';

export const dynamic = 'force-dynamic';

export async function GET() {
  const stats = getPatternStats();
  return NextResponse.json(stats);
}
