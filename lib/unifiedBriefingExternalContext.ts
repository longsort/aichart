/**
 * 정밀 브리핑 — 뉴스·고래·확정 시그널 히스토리 연동.
 * 조건부 참고 — 확정 수익·투자 권유 아님.
 */
import type { ConfirmedSignalRecord } from '@/lib/serverVirtualStore';
import type { WhaleMemoryZoneRow } from '@/lib/whaleMemory';

export type UnifiedBriefingNewsEvent = {
  title: string;
  timeMs: number;
  whenKo: string;
};

export type UnifiedBriefingNewsSnap = {
  level: 'LOW' | 'MID' | 'HIGH';
  headlineKo: string;
  upcoming: UnifiedBriefingNewsEvent[];
};

export type UnifiedBriefingWhaleZoneSnap = {
  label: string;
  side: 'buy' | 'sell';
  low: number;
  high: number;
  distPct: number;
  inside: boolean;
};

export type UnifiedBriefingWhaleSnap = {
  zoneCount: number;
  headlineKo: string | null;
  nearPriceKo: string | null;
  alignedWithMaster: boolean;
  zones: UnifiedBriefingWhaleZoneSnap[];
};

export type UnifiedBriefingSignalHistorySnap = {
  totalCount: number;
  symbolCount: number;
  chartTfCount: number;
  sameDirectionCount: number;
  oppositeCount: number;
  lastSignal: {
    direction: 'LONG' | 'SHORT';
    timeframe: string;
    entry: number;
    at: number;
  } | null;
  compareKo: string;
  alignedWithMaster: boolean;
};

export type UnifiedBriefingExternalContext = {
  news: UnifiedBriefingNewsSnap | null;
  whale: UnifiedBriefingWhaleSnap | null;
  signalHistory: UnifiedBriefingSignalHistorySnap | null;
};

function dirKo(d: string): string {
  if (d === 'LONG') return '롱';
  if (d === 'SHORT') return '숏';
  return '관망';
}

function fmtWhen(timeMs: number, now = Date.now()): string {
  const dtMin = Math.round((timeMs - now) / 60000);
  const abs = Math.abs(dtMin);
  if (abs < 60) return dtMin >= 0 ? `${dtMin}분 후` : `${abs}분 전`;
  const h = Math.round(abs / 60);
  return dtMin >= 0 ? `${h}시간 후` : `${h}시간 전`;
}

function symBase(symbol: string): string {
  return String(symbol ?? '')
    .toUpperCase()
    .replace(/USDT|USD|PERP|_/g, '')
    .replace(/[^A-Z0-9]/g, '');
}

export function buildNewsBriefingSnap(
  events: Array<{ title: string; timeMs: number; symbols?: string[] }>,
  symbol: string,
  now = Date.now()
): UnifiedBriefingNewsSnap | null {
  if (!events.length) return null;
  const base = symBase(symbol);
  const scoped = events
    .filter((e) => {
      if (!Number.isFinite(e.timeMs)) return false;
      const syms = e.symbols ?? [];
      if (!syms.length) return true;
      return syms.some((s) => base.startsWith(String(s).toUpperCase()) || base.includes(String(s).toUpperCase()));
    })
    .sort((a, b) => a.timeMs - b.timeMs);

  const upcoming = scoped
    .filter((e) => e.timeMs >= now - 3 * 3600_000)
    .slice(0, 4)
    .map((e) => ({
      title: e.title.slice(0, 48),
      timeMs: e.timeMs,
      whenKo: fmtWhen(e.timeMs, now),
    }));

  if (!upcoming.length) return null;

  const nearest = scoped.reduce((best, e) =>
    Math.abs(e.timeMs - now) < Math.abs(best.timeMs - now) ? e : best
  );
  const absMin = Math.abs(Math.round((nearest.timeMs - now) / 60000));
  const level: 'LOW' | 'MID' | 'HIGH' = absMin <= 90 ? 'HIGH' : absMin <= 360 ? 'MID' : 'LOW';
  const headlineKo =
    level === 'HIGH'
      ? `뉴스 리스크 높음 · ${nearest.title.slice(0, 32)} (${fmtWhen(nearest.timeMs, now)})`
      : level === 'MID'
        ? `뉴스 주의 · ${nearest.title.slice(0, 32)} (${fmtWhen(nearest.timeMs, now)})`
        : `다음 매크로 · ${nearest.title.slice(0, 28)} (${fmtWhen(nearest.timeMs, now)})`;

  return { level, headlineKo, upcoming };
}

export function buildWhaleBriefingSnap(
  rows: WhaleMemoryZoneRow[],
  currentPrice: number | null | undefined,
  masterDirection: 'LONG' | 'SHORT' | 'NEUTRAL'
): UnifiedBriefingWhaleSnap | null {
  if (!rows.length) return null;
  const price = currentPrice ?? 0;

  const zones: UnifiedBriefingWhaleZoneSnap[] = rows.slice(0, 6).map((z) => {
    const low = Math.min(z.price1, z.price2);
    const high = Math.max(z.price1, z.price2);
    const mid = (low + high) / 2;
    const side: 'buy' | 'sell' = /buy|매수|bull|long|지지/i.test(z.label) ? 'buy' : 'sell';
    const inside = price > 0 && price >= low && price <= high;
    const distPct = price > 0 ? (Math.abs(price - mid) / price) * 100 : 999;
    return {
      label: z.label.slice(0, 16),
      side,
      low,
      high,
      distPct,
      inside,
    };
  });

  zones.sort((a, b) => a.distPct - b.distPct);
  const nearest = zones[0];
  const insideZones = zones.filter((z) => z.inside);
  const buyNear = zones.filter((z) => z.side === 'buy' && z.distPct < 1.2).length;
  const sellNear = zones.filter((z) => z.side === 'sell' && z.distPct < 1.2).length;

  let alignedWithMaster = true;
  if (masterDirection === 'LONG' && sellNear > buyNear && insideZones.some((z) => z.side === 'sell')) {
    alignedWithMaster = false;
  }
  if (masterDirection === 'SHORT' && buyNear > sellNear && insideZones.some((z) => z.side === 'buy')) {
    alignedWithMaster = false;
  }

  const nearPriceKo = nearest
    ? nearest.inside
      ? `현재가 ${nearest.side === 'buy' ? '매수' : '매도'}존 내부 · ${nearest.label}`
      : `근접 ${nearest.distPct.toFixed(2)}% · ${nearest.label}`
    : null;

  const headlineKo =
    insideZones.length > 0
      ? `고래존 ${insideZones.length}개 겹침 · ${insideZones.map((z) => z.label).join(', ')}`
      : nearest
        ? `고래 메모리 ${rows.length} · 최근접 ${nearest.label}`
        : `고래 메모리 ${rows.length}구간`;

  return {
    zoneCount: rows.length,
    headlineKo,
    nearPriceKo,
    alignedWithMaster,
    zones: zones.slice(0, 4),
  };
}

export function buildSignalHistoryBriefingSnap(
  signals: ConfirmedSignalRecord[],
  symbol: string,
  chartTf: string,
  masterDirection: 'LONG' | 'SHORT' | 'NEUTRAL'
): UnifiedBriefingSignalHistorySnap | null {
  if (!signals.length) return null;

  const sym = symbol.toUpperCase();
  const symFiltered = signals.filter((s) => s.symbol.toUpperCase() === sym);
  const tfFiltered = symFiltered.filter((s) => s.timeframe === chartTf);
  const pool = tfFiltered.length >= 2 ? tfFiltered : symFiltered.length >= 2 ? symFiltered : signals.slice(-20);

  if (!pool.length) return null;

  const sameDirectionCount = pool.filter(
    (s) => masterDirection !== 'NEUTRAL' && s.direction === masterDirection
  ).length;
  const oppositeCount = pool.filter(
    (s) => masterDirection !== 'NEUTRAL' && s.direction !== masterDirection
  ).length;

  const last = [...pool].sort((a, b) => b.at - a.at)[0] ?? null;
  const alignedWithMaster =
    masterDirection === 'NEUTRAL' || !last ? true : last.direction === masterDirection;

  const scopeLabel = tfFiltered.length >= 2 ? chartTf : symFiltered.length >= 2 ? symbol : '전체';
  const compareKo =
    masterDirection === 'NEUTRAL'
      ? `확정 히스토리 ${pool.length}건 (${scopeLabel}) · 최근 ${last ? dirKo(last.direction) : '—'}`
      : alignedWithMaster
        ? `히스토리 ${sameDirectionCount}/${pool.length}건 ${dirKo(masterDirection)} 일치 (${scopeLabel})`
        : `히스토리 엇갈림 · ${dirKo(masterDirection)} vs 최근 ${last ? dirKo(last.direction) : '—'} (${scopeLabel})`;

  return {
    totalCount: signals.length,
    symbolCount: symFiltered.length,
    chartTfCount: tfFiltered.length,
    sameDirectionCount,
    oppositeCount,
    lastSignal: last
      ? {
          direction: last.direction,
          timeframe: last.timeframe,
          entry: last.entry,
          at: last.at,
        }
      : null,
    compareKo,
    alignedWithMaster,
  };
}

export function mergeExternalIntoReasons(
  reasons: string[],
  external: UnifiedBriefingExternalContext | null | undefined
): string[] {
  if (!external) return reasons;
  const extra = [
    external.news?.headlineKo,
    external.whale?.nearPriceKo,
    external.signalHistory?.compareKo,
  ].filter(Boolean) as string[];
  return [...new Set([...reasons, ...extra])].slice(0, 12);
}

export function externalContextModules(
  external: UnifiedBriefingExternalContext | null | undefined,
  masterDirection: 'LONG' | 'SHORT' | 'NEUTRAL'
): Array<{
  key: string;
  labelKo: string;
  direction: 'LONG' | 'SHORT' | 'NEUTRAL' | 'WAIT';
  detailKo: string;
  live: boolean;
  aligned: boolean;
}> {
  if (!external) return [];
  const out: ReturnType<typeof externalContextModules> = [];

  if (external.news) {
    out.push({
      key: 'news',
      labelKo: '뉴스',
      direction: external.news.level === 'HIGH' ? 'WAIT' : 'NEUTRAL',
      detailKo: external.news.upcoming[0]?.title?.slice(0, 24) ?? external.news.headlineKo.slice(0, 24),
      live: true,
      aligned: external.news.level !== 'HIGH',
    });
  }

  if (external.whale) {
    const whaleDir =
      external.whale.zones[0]?.side === 'buy'
        ? 'LONG'
        : external.whale.zones[0]?.side === 'sell'
          ? 'SHORT'
          : 'NEUTRAL';
    out.push({
      key: 'whale',
      labelKo: '고래존',
      direction: whaleDir,
      detailKo: external.whale.nearPriceKo?.slice(0, 28) ?? `${external.whale.zoneCount}구간`,
      live: true,
      aligned: external.whale.alignedWithMaster,
    });
  }

  if (external.signalHistory) {
    out.push({
      key: 'sigHist',
      labelKo: '확정히스토리',
      direction: external.signalHistory.lastSignal?.direction ?? 'WAIT',
      detailKo: external.signalHistory.compareKo.slice(0, 32),
      live: true,
      aligned: external.signalHistory.alignedWithMaster,
    });
  }

  return out;
}
