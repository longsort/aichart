/**
 * BTC 엣지 엔진 신호 API — Python이 쓴 JSON만 읽음.
 * GET: 최신 페이퍼 신호 + active_mode
 */
import { NextResponse } from 'next/server';
import {
  btcEdgePolicyKo,
  readBtcEdgeActiveMode,
  readBtcEdgeLatestSignal,
} from '@/lib/btcEdgeSignal';
import { btcEdgeExecModeKo } from '@/lib/btcEdgeExecution';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const mode = readBtcEdgeActiveMode();
    const signal = readBtcEdgeLatestSignal();
    const exec = (signal as { execution?: Record<string, unknown> } | null)?.execution || null;
    return NextResponse.json({
      ok: true,
      paperOnly: true,
      realOrder: false,
      leveragePolicy: 'validated_only',
      fixed50x: false,
      policyKo: btcEdgePolicyKo(mode),
      execModeKo: btcEdgeExecModeKo(
        String((signal as { execMode?: string } | null)?.execMode || exec?.execMode || 'WAIT')
      ),
      mode,
      signal,
      execution: exec,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'fail' },
      { status: 500 }
    );
  }
}
