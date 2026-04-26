/**
 * 고래 도구(ACP·ALR)가 켜졌는데 선이 없을 때만 표시하는 최소 안내 라벨.
 *
 * 체크리스트(표시 안 될 때):
 * - UI 모드가 **WHALE**인지(상단 모드 스위치). ALR/ACP 칩은 WHALE 툴바에만 노출되는 경우가 많음.
 * - 해당 칩 **ALR** 또는 **ACP**가 켜져 있는지.
 * - **ACP**: 작업 봉이 너무 적으면(권장 40봉+) 안내가 뜸. 봉은 충분한데도 없으면 지그재그/필터/`whaleAcpSettingsJson` 조정.
 * - **ALR**: 봉 3개 미만이면 안내. TanHef Pine 전체(테이블·시그널·Ridge 등)와 동일하지 않음.
 */
import type { Candle, OverlayItem } from '@/types';
import type { UserSettings } from '@/lib/settings';
import { resolveWhaleAcpConfig } from '@/lib/whaleTrendoscopeAcpConfig';

function lastCandleAnchor(candles: Candle[]): { time: number; price: number } | null {
  const n = candles.length;
  if (n < 1) return null;
  const c = candles[n - 1]!;
  const t = c.time as number;
  const price = Number.isFinite(c.high) ? c.high : Number.isFinite(c.close) ? c.close : NaN;
  if (!Number.isFinite(price)) return { time: t, price: 0 };
  return { time: t, price };
}

/** ACP 결과가 비었을 때 1개 라벨(없으면 null). */
export function buildWhaleAcpEmptyHintOverlay(candles: Candle[], settings: UserSettings): OverlayItem | null {
  const anchor = lastCandleAnchor(candles);
  if (!anchor) return null;
  const cfg = resolveWhaleAcpConfig(settings);
  const repaint = cfg.scanning.repaint === true;
  const work = repaint ? candles : candles.slice(0, Math.max(0, candles.length - 1));
  const n = work.length;
  const short =
    n < 40
      ? `ACP · 봉 ${n}개 — 40봉 이상에서 스캔합니다(구간 확대·하위 TF).`
      : `ACP · 조건에 맞는 패턴 없음 — 지그재그/그룹 필터·겹침 제외·JSON(다중 지그재그) 확인.`;
  const tip =
    n < 40
      ? `Auto Chart Patterns 근사: 작업 봉 수가 적으면 지그재그·패턴을 만들기 어렵습니다. 타임프레임을 낮추거나 차트에 더 많은 과거 봉이 보이게 하세요.`
      : `표시 가능한 패턴이 한 개도 없을 수 있습니다. whaleAcpSettingsJson에서 zigzag[].use, groups, patterns, scanning(겹침·바비율)을 조정해 보세요.`;

  return {
    id: 'whale-acp-hint-empty',
    kind: 'label',
    label: short,
    category: 'whaleToolkit',
    x1: 0.5,
    y1: 0.92,
    time1: anchor.time,
    price1: anchor.price,
    confidence: 30,
    color: '#fbbf24',
    labelBackgroundColor: 'rgba(30,27,19,0.92)',
    labelTextColor: '#fef3c7',
    labelTooltip: tip,
  };
}

/** ALR 결과가 비었을 때 1개 라벨(없으면 null). */
export function buildWhaleAlrEmptyHintOverlay(candles: Candle[], logScale: boolean): OverlayItem | null {
  const anchor = lastCandleAnchor(candles);
  if (!anchor) return null;
  const n = candles.length;
  const short =
    n < 3
      ? `ALR · 봉 ${n}개 — 최소 3봉 이상 필요.`
      : `ALR · 채널을 그리지 못함 — 종가 NaN·슬롯 off·앵커 길이 부족 등을 확인하세요.${logScale ? ' (로그 스케일은 양가만 유효)' : ''}`;
  const tip =
    n < 3
      ? 'Multi-Anchored LinReg: 계산에 필요한 캔들이 너무 적습니다.'
      : '기본 3슬롯은 channel 표시입니다. 여전히 비면 가격 데이터(0·NaN)·로그 스케일 호환을 확인하세요. TanHef Pine 전체 기능과는 다릅니다.';

  return {
    id: 'whale-alr-hint-empty',
    kind: 'label',
    label: short.length > 140 ? short.slice(0, 137) + '…' : short,
    category: 'whaleToolkit',
    x1: 0.5,
    y1: n < 3 ? 0.88 : 0.85,
    time1: anchor.time,
    price1: anchor.price,
    confidence: 30,
    color: '#93c5fd',
    labelBackgroundColor: 'rgba(15,23,42,0.92)',
    labelTextColor: '#e2e8f0',
    labelTooltip: tip,
  };
}

/** 도움말·툴팁용 한 줄 요약 목록 */
export const WHALE_ACP_ALR_VISIBILITY_CHECKLIST_KO: readonly string[] = [
  'UIMode = WHALE(고래)',
  '툴바에서 ALR 또는 ACP 칩 ON',
  'ACP: 봉 수·지그재그/필터·JSON(whaleAcpSettingsJson)',
  'ALR: 봉 3개+, 슬롯·데이터 NaN·로그 스케일 호환',
];

/** ALR·ACP·ALR·Log 칩 `title=` 끝에 붙이는 체크리스트(한 블록) */
export const WHALE_ACP_ALR_CHIP_TITLE_SUFFIX_KO =
  ' — 체크: ' + WHALE_ACP_ALR_VISIBILITY_CHECKLIST_KO.join(' · ');
