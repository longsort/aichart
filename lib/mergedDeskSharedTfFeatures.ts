/**
 * 통합·분석 — 분·시·일·주·월(1m~1M) 전 TF 공통 기능.
 * 15m 공유 분석·작도 정책(`mergedDesk4hReference` / `MERGED_DESK_SHARED_ANALYZE_TF`)과 동일 경로.
 *
 * 공통 기능 목록 (전 TF):
 * - 핵심돌파·핵심안착·핵심실패: 파랑빨강띠 레일 가로 zone (1m~1M 공동)
 * - HotZone 스윙중투: 마지막 봉 기준 **위 1(저항·숏) + 아래 1(지지·롱)** 만
 * - 하방 핵심지지 / 상방 핵심저항 투영 (캔들 근처만이 아닌 사다리)
 * - 고급작도: OB·VP·피벗S/R · 존 터치반응 · 스윕→반응→목표 · btccion 반응레일
 * - ★쪽 Hot존 E/SL/TP1/무효 → 차트 전폭 LineSeries (지표형)
 * - HQ/핵심존/스윙은 HotZone 합류 가점 · HotZone 자체는 차트 면(존) + 전폭 가격선
 * - 스윙·중투 E/SL/TP · 추세선·채널 · regime 오버레이
 * - CHoCH→OB 경로
 * - 되돌림 Fib 맵 (lookback 55)
 * - 마스터 선물 게이트
 * - Mirage LSP (4h 프리셋)
 * - VRVP / key·critical zone pivot (4h)
 * - 서버 진입존·폭락·기관밴드 텔레 (15m·1h·4h·1d·1w·1M)
 *
 * 런타임 게이트: `isMergedDeskSharedFeatureTf` — 데스크 칩 TF만 공유 경로.
 */
import {
  MERGED_DESK_CHART_TIMEFRAMES,
  isMergedDeskChartTimeframe,
  type MergedDeskChartTimeframe,
} from '@/lib/mergedDesk4hReference';

export { MERGED_DESK_CHART_TIMEFRAMES, isMergedDeskChartTimeframe };
export type { MergedDeskChartTimeframe };

/** 텔레·크론·워처 — 15m·1h·4h·1d·1w·1M (1m~5m 제외) */
export const MERGED_DESK_SHARED_TELEGRAM_TFS = new Set<string>([
  '15m',
  '1h',
  '4h',
  '1d',
  '1w',
  '1M',
]);

export function isMergedDeskSharedFeatureTf(timeframe: string): boolean {
  return isMergedDeskChartTimeframe(timeframe);
}

/** 스윙 채널·추세선 — 전 TF 기본 ON (토글이 꺼져 있어도 엔진은 작도 가능) */
export const MERGED_DESK_SWING_CHANNEL_DEFAULT_ON = true;
