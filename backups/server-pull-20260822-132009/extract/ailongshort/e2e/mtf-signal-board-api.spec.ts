import { test, expect } from '@playwright/test';

/**
 * `/api/mtf-signal-board` 스모크 — 로그인 또는 INTERNAL_ANALYZE_SECRET 헤더 필요.
 * 전체 검증: `.env.local` 에 INTERNAL_ANALYZE_SECRET 이 있으면
 * `node --env-file=.env.local ./node_modules/@playwright/test/cli.js test e2e/mtf-signal-board-api.spec.ts`
 */
test.describe('MTF signal board API', () => {
  test('미인증 시 401 (라우트 존재·미들웨어 확인)', async ({ request }) => {
    const res = await request.get('/api/mtf-signal-board?symbol=BTCUSDT&excludeTf=15m');
    expect(res.status()).toBe(401);
    const j = await res.json().catch(() => ({}));
    expect((j as { code?: string }).code).toBe('SITE_AUTH_REQUIRED');
  });

  test('returns rows with board.lastBar shape (excludeTf skips chart TF)', async ({ request }) => {
    const secret = process.env.INTERNAL_ANALYZE_SECRET?.trim();
    test.skip(!secret, 'INTERNAL_ANALYZE_SECRET 없음 — .env.local 에 설정 후 재실행');

    const q =
      'symbol=BTCUSDT&excludeTf=15m&zoneSensitivity=1.00&majorZoneWidth=1.00&majorZoneOpacity=0.24&majorZoneTouches=2' +
      '&structureBreakout=0&trendlineLookback=3&pre3Sim=1.000&pre3Close=1&aiAvg=0.50&aiMax=0.65&aiImpR=1.12&aiImpB=0.48&aiVol=0';

    const res = await request.get(`/api/mtf-signal-board?${q}`, {
      headers: { 'x-internal-analyze-secret': secret! },
      timeout: 120_000,
    });

    expect(res.ok(), await res.text()).toBeTruthy();
    const body = (await res.json()) as {
      rows?: Array<{ tf: string; analyze: { candles?: unknown[]; verdict?: string } }>;
    };

    expect(Array.isArray(body.rows)).toBe(true);
    expect(body.rows!.length).toBe(5);

    const tfs = body.rows!.map((r) => r.tf).sort();
    expect(tfs).toEqual(['1M', '1d', '1h', '1w', '4h']);

    for (const row of body.rows!) {
      expect(row.analyze).toBeTruthy();
      expect(Array.isArray(row.analyze.candles)).toBe(true);
      expect((row.analyze.candles?.length ?? 0) >= 1).toBe(true);
    }
  });
});
