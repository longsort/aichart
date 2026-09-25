/**
 * 타이롱식 종가 마감·안착·실패 — 차트 가로선 작도 (15m·1h·4h·1d·1w·1M).
 * LineSeries 전용 스펙 + analyze close-* 중복 제거용 id 목록.
 */
import type { OverlayItem } from '@/types';
import { CLOSE_TF_COLORS, CLOSE_SETTLEMENT_TF_TO_LINE_ID } from '@/lib/overlayColors';
import {
  TF_CLOSE_SETTLE_ORDER,
  chartTfToCloseSettleTf,
  closeSettleTfAxisLabel,
  type TfCloseSettleBoard,
  type TfCloseSettleRow,
  type TfCloseSettleTf,
} from '@/lib/tfCloseSettleAssessment';

/** 기존 close-* 필터·축 스트립과 호환 */
export const SETTLE_CLOSE_ID_PREFIX = 'close-settle-';

/** settle 보드가 그리는 TF — analyze 엔진 close-* 와 겹치면 엔진 선은 숨김 */
export const SETTLE_REPLACES_ENGINE_CLOSE_IDS = new Set([
  'close-15m',
  'close-1h',
  'close-4h',
  'close-daily',
  'close-weekly',
  'close-monthly',
]);

export function isSettleCloseOverlayId(id: string): boolean {
  const s = String(id || '');
  return s.startsWith(SETTLE_CLOSE_ID_PREFIX) || s.startsWith('settle-close-');
}

export type SettleClosePriceLineSpec = {
  id: string;
  price: number;
  title: string;
  color: string;
  lineWidth: number;
  dashed: boolean;
};

function tagKo(row: TfCloseSettleRow): string {
  if (row.tailongTag === '종가안착') return '안착';
  if (row.tailongTag === '꼬리실패') return '실패';
  if (row.tailongTag === '종가미갱신') return '미갱신';
  if (row.formingVerdict === '안착') return '안착';
  if (row.formingVerdict === '실패') return '실패';
  if (row.formingVerdict === '불안') return '불안';
  return '마감';
}

/** 가격축 짧은 기호 — 색으로 의미를 보완 */
function tagAxisShort(tag: string): string {
  if (tag === '안착') return '✓';
  if (tag === '실패') return '✗';
  if (tag === '불안') return '~';
  if (tag === '미갱신') return '…';
  return '·';
}

function verdictColor(row: TfCloseSettleRow, tf: TfCloseSettleTf): string {
  const tag = tagKo(row);
  if (tag === '안착') return 'rgba(34,197,94,0.95)';
  if (tag === '실패') return 'rgba(239,68,68,0.95)';
  if (tag === '미갱신' || tag === '불안') return 'rgba(251,191,36,0.95)';
  const lineId = CLOSE_SETTLEMENT_TF_TO_LINE_ID[tf];
  return lineId ? CLOSE_TF_COLORS[lineId]! : 'rgba(248,250,252,0.92)';
}

function settleOverlayId(tf: TfCloseSettleTf, kind: 'close' | 'hi' | 'lo' = 'close'): string {
  const token = tf === '1M' ? '1mo' : tf;
  if (kind === 'hi') return `${SETTLE_CLOSE_ID_PREFIX}${token}-hi`;
  if (kind === 'lo') return `${SETTLE_CLOSE_ID_PREFIX}${token}-lo`;
  return `${SETTLE_CLOSE_ID_PREFIX}${token}`;
}

/** HTML 오버레이(선택) — LineSeries와 병행 시 선이 이중이 되므로 ChartView에선 LineSeries만 권장 */
export function buildTfCloseSettleChartOverlays(
  board: TfCloseSettleBoard | null | undefined,
  opts?: { whiteLines?: boolean }
): OverlayItem[] {
  if (!board?.rows?.length) return [];
  const white = opts?.whiteLines === true;
  const out: OverlayItem[] = [];
  for (const tf of TF_CLOSE_SETTLE_ORDER) {
    const row = board.rows.find((r) => r.tf === tf);
    if (!row) continue;
    const px = Number(row.priorClose);
    if (!Number.isFinite(px) || px <= 0) continue;
    const axis = closeSettleTfAxisLabel(tf);
    const tag = tagKo(row);
    const axisTag = tagAxisShort(tag);
    const color = white ? 'rgba(248,250,252,0.94)' : verdictColor(row, tf);
    out.push({
      id: settleOverlayId(tf),
      kind: 'keyLevel',
      label: `${axis}${axisTag}`,
      x1: 0.02,
      y1: 0.5,
      x2: 0.98,
      y2: 0.5,
      price1: px,
      price2: px,
      confidence: 92,
      color,
      category: 'keyLevel',
      lineLabelColor: color,
      lineStrokeWidth: tag === '안착' || tag === '실패' ? 2.4 : 1.8,
    } as OverlayItem);
  }
  return out;
}

/** 6 TF 전봉 종가 가로선 */
export function buildTfCloseSettlePriceLineSpecs(
  board: TfCloseSettleBoard | null | undefined,
  opts?: { whiteLines?: boolean }
): SettleClosePriceLineSpec[] {
  if (!board?.rows?.length) return [];
  const white = opts?.whiteLines === true;
  const out: SettleClosePriceLineSpec[] = [];
  for (const tf of TF_CLOSE_SETTLE_ORDER) {
    const row = board.rows.find((r) => r.tf === tf);
    if (!row) continue;
    const px = Number(row.priorClose);
    if (!Number.isFinite(px) || px <= 0) continue;
    const axis = closeSettleTfAxisLabel(tf);
    const tag = tagKo(row);
    const color = white ? 'rgba(248,250,252,0.94)' : verdictColor(row, tf);
    const settled = tag === '안착';
    const failed = tag === '실패';
    out.push({
      id: settleOverlayId(tf),
      price: px,
      title: `${axis}${tagAxisShort(tag)}`,
      color,
      lineWidth: settled || failed ? 2 : 1,
      dashed: !settled,
    });
  }
  return out;
}

/**
 * 종가선(6) + 현재 차트 TF 전고·전저 점선.
 * 차트 캔들 LineSeries 작도용 단일 엔트리.
 */
export function buildTfCloseSettleAllLineSpecs(
  board: TfCloseSettleBoard | null | undefined,
  chartTf: string,
  opts?: { whiteLines?: boolean }
): SettleClosePriceLineSpec[] {
  const closes = buildTfCloseSettlePriceLineSpecs(board, opts);
  const settleTf = chartTfToCloseSettleTf(chartTf);
  if (!settleTf || !board?.rows?.length) return closes;
  const row = board.rows.find((r) => r.tf === settleTf);
  if (!row) return closes;

  const axis = closeSettleTfAxisLabel(settleTf);
  const hi = Number(row.priorHigh);
  const lo = Number(row.priorLow);
  const extra: SettleClosePriceLineSpec[] = [];
  if (Number.isFinite(hi) && hi > 0) {
    extra.push({
      id: settleOverlayId(settleTf, 'hi'),
      price: hi,
      title: `${axis}고`,
      color: 'rgba(167,139,250,0.78)',
      lineWidth: 1,
      dashed: true,
    });
  }
  if (Number.isFinite(lo) && lo > 0) {
    extra.push({
      id: settleOverlayId(settleTf, 'lo'),
      price: lo,
      title: `${axis}저`,
      color: 'rgba(129,140,248,0.78)',
      lineWidth: 1,
      dashed: true,
    });
  }
  return [...closes, ...extra];
}
