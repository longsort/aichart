import { NextResponse } from 'next/server';
import { getLearnedPatterns } from '@/lib/patternData';

export const dynamic = 'force-dynamic';

export async function GET() {
  const patterns = getLearnedPatterns();
  return NextResponse.json(patterns);
}
