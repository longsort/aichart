/**
 * 통합·분석 차트 상단 한 줄 — MTF·무효·WAIT·파생·다음 뉴스.
 * 조건부 참고. 확정 수익·승률 아님.
 */
import type { AnalyzeResponse } from '@/types';
import type { MtfZoneBattlePack } from '@/lib/assets353SmcZoneBattleMtf';

export type MergedDeskVerdictStripTone = 'wait' | 'long' | 'short' | 'neutral';

export type MergedDeskNewsHint = {
  title: string;
  timeMs: number;
};

export type MergedDeskVerdictStrip = {
  lineKo: string;
  tone: MergedDeskVerdictStripTone;
  detailKo: string;
};

function fmtPx(p: number): string {
  if (!(p > 0) || !Number.isFinite(p)) return '—';
  if (p >= 1000) return p.toFixed(0);
  if (p >= 1) return p.toFixed(1);
  return p.toFixed(3);
}

function parseStop(analysis: AnalyzeResponse | null): number | null {
  const n = Number(String(analysis?.stopLoss ?? '').replace(/[^0-9.+-]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function tfDom(pack: MtfZoneBattlePack | null, tf: string): 'LONG' | 'SHORT' | 'NEUTRAL' | null {
  const row = pack?.rows.find((r) => r.tf === tf);
  return row?.dominant ?? null;
}

function arrow(d: 'LONG' | 'SHORT' | 'NEUTRAL' | null): string {
  if (d === 'LONG') return '↑';
  if (d === 'SHORT') return '↓';
  if (d === 'NEUTRAL') return '↔';
  return '·';
}

function newsInKo(timeMs: number, now = Date.now()): string {
  const d = timeMs - now;
  if (!Number.isFinite(d)) return '';
  if (d <= 0 && d > -3_600_000) return '진행';
  if (d <= 0) return '지남';
  const m = Math.round(d / 60_000);
  if (m < 60) return `${m}분`;
  const h = Math.round(m / 60);
  if (h < 36) return `${h}시간`;
  return `${Math.round(h / 24)}일`;
}

function shortNewsTitle(title: string): string {
  const t = title.replace(/\s+/g, ' ').trim();
  if (/cpi/i.test(t)) return 'CPI';
  if (/pce/i.test(t)) return 'PCE';
  if (/nfp|payroll|nonfarm/i.test(t)) return 'NFP';
  if (/fomc|fed funds|rate decision/i.test(t)) return 'FOMC';
  if (/ppi/i.test(t)) return 'PPI';
  if (/gdp/i.test(t)) return 'GDP';
  return t.slice(0, 10);
}

export function buildMergedDeskVerdictStrip(params: {
  analysis: AnalyzeResponse | null;
  mtfAligned: boolean | null;
  mtfAlignKo?: string | null;
  mtfBattle?: MtfZoneBattlePack | null;
  moneyWait?: boolean;
  nextNews?: MergedDeskNewsHint | null;
}): MergedDeskVerdictStrip {
  const { analysis, mtfBattle } = params;
  const d1 = tfDom(mtfBattle ?? null, '1d');
  const w1 = tfDom(mtfBattle ?? null, '1w');
  const htfSplit = d1 && w1 && d1 !== 'NEUTRAL' && w1 !== 'NEUTRAL' && d1 !== w1;
  const wait =
    params.moneyWait === true ||
    params.mtfAligned === false ||
    htfSplit ||
    analysis?.verdict === 'WATCH';

  const v = analysis?.verdict;
  let tone: MergedDeskVerdictStripTone = 'neutral';
  if (wait) tone = 'wait';
  else if (v === 'LONG') tone = 'long';
  else if (v === 'SHORT') tone = 'short';

  const stance = wait
    ? 'WAIT'
    : v === 'LONG'
      ? '롱참고'
      : v === 'SHORT'
        ? '숏참고'
        : '관망';

  const mtfBit = `1D${arrow(d1)} 1W${arrow(w1)}`;
  const inv = parseStop(analysis);
  const invBit = inv ? `무효 ${fmtPx(inv)}` : null;

  const fund =
    analysis?.fundingState === 'positive'
      ? '펀딩+'
      : analysis?.fundingState === 'negative'
        ? '펀딩−'
        : null;
  const oi =
    analysis?.oiState === 'increasing' ? 'OI↑' : analysis?.oiState === 'decreasing' ? 'OI↓' : null;

  const um = analysis?.unifiedMarketMetrics;
  const longUsd = Number(um?.liquidationLongUsd) || 0;
  const shortUsd = Number(um?.liquidationShortUsd) || 0;
  let liq: string | null = null;
  if (longUsd + shortUsd > 0) {
    if (longUsd > shortUsd * 1.25) liq = '롱청산우세';
    else if (shortUsd > longUsd * 1.25) liq = '숏청산우세';
    else liq = '청산균형';
  }

  const news = params.nextNews;
  const newsBit = news
    ? `${shortNewsTitle(news.title)} ${newsInKo(news.timeMs)}`
    : null;

  const parts = [stance, mtfBit, invBit, fund, oi, liq, newsBit].filter(Boolean);
  const lineKo = parts.join(' · ');

  const detailBits = [
    params.mtfAlignKo || null,
    htfSplit ? '일·주 역방향 — 되돌림·대기' : null,
    inv ? `종가 ${fmtPx(inv)} 이탈 시 시나리오 무효(조건부)` : null,
    '확정 수익·승률 아님 · 검증 필요',
  ].filter(Boolean);

  return { lineKo, tone, detailKo: detailBits.join(' · ') };
}

export function pickNextNewsHint(
  events: MergedDeskNewsHint[] | null | undefined,
  now = Date.now()
): MergedDeskNewsHint | null {
  if (!events?.length) return null;
  const upcoming = events
    .filter((e) => Number.isFinite(e.timeMs) && e.timeMs >= now - 30 * 60_000)
    .sort((a, b) => a.timeMs - b.timeMs);
  return upcoming[0] ?? events[events.length - 1] ?? null;
}
