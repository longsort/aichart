'use client';

export type ChartVolBarLabelItem = {
  key: string;
  x: number;
  text: string;
  color: string;
  glyph: 'up' | 'down' | 'sq';
  /** boxed = 매도/스윕, plain = 매수/상승, chip = 짧은 봉 */
  variant?: 'boxed' | 'plain' | 'chip';
  /** 0~3 레인 — 겹침 방지 */
  lane?: 0 | 1 | 2 | 3;
  title?: string;
};

type Props = {
  /** 거래량 패널 상단 Y (차트 호스트 기준 px) */
  top: number;
  items: ChartVolBarLabelItem[];
};

/** 거래량 막대 위 — 짧은 한글 라벨만. 카드/패널 아님. */
export function ChartVolBarLabels({ top, items }: Props) {
  if (!items.length) return null;
  return (
    <div className="chart-vol-bar-labels chart-vol-bar-labels--pro" style={{ top }} aria-hidden>
      {items.map((it) => {
        const variant = it.variant ?? 'chip';
        const lane = it.lane ?? 0;
        return (
          <span
            key={it.key}
            className={
              variant === 'boxed'
                ? `chart-vol-bar-label chart-vol-bar-label--story-boxed chart-vol-bar-label--lane${lane}`
                : variant === 'plain'
                  ? `chart-vol-bar-label chart-vol-bar-label--story-plain chart-vol-bar-label--lane${lane}`
                  : `chart-vol-bar-label chart-vol-bar-label--lane${lane}`
            }
            style={{ left: it.x, color: it.color, borderColor: it.color }}
            title={it.title || it.text}
          >
            {it.text}
          </span>
        );
      })}
    </div>
  );
}

export function chartVolBarLabelGlyph(text: string): 'up' | 'down' | 'sq' {
  const t = String(text || '');
  if (
    /빅숏|예고숏|준비숏|예비숏|매도모집|매도확장|모집·매도|확장·매도|매도|스윕|폭락|약세|고점|하락|소진|슈팅|↓|이탈/.test(
      t
    )
  )
    return 'down';
  if (
    /빅롱|예고롱|준비롱|예비롱|매수모집|매수확장|모집·매수|확장·매수|매수|상승|강세|반등|파동|핀바|모집|확장|폭등|롱빔|↑|돌파/.test(
      t
    )
  )
    return 'up';
  if (/흡수|관망|현재/.test(t)) return 'sq';
  return 'sq';
}

export function chartVolBarLabelStoryVariant(text: string): 'boxed' | 'plain' | null {
  const t = String(text || '');
  if (/빅숏|예고숏|준비숏|예비숏|매도모집|매도확장|모집·매도|확장·매도|매도|스윕|폭락|약세|소진|슈팅|하락/.test(t))
    return 'boxed';
  if (
    /빅롱|예고롱|준비롱|예비롱|매수모집|매수확장|모집·매수|확장·매수|매수|상승|강세|흡수|반등|예비|모집|확장|폭등|파동|핀바/.test(
      t
    )
  )
    return 'plain';
  return null;
}

/** 대략적 한글 라벨 폭(px) — 겹침 판정용 */
export function estimateVolLabelWidthPx(text: string): number {
  const n = String(text || '').length;
  return Math.max(26, Math.round(n * 10 + 12));
}

/** 같은 계열 라벨 키 — 근처 중복 제거용 */
export function volLabelFamilyKey(text: string): string {
  const t = String(text || '');
  if (/빅숏|예비숏|예고숏|준비숏/.test(t)) return 'short';
  if (/빅롱|예비롱|예고롱|준비롱/.test(t)) return 'long';
  if (/매수모집|매도모집|모집/.test(t)) return 'acc';
  if (/매수확장|매도확장|확장/.test(t)) return 'exp';
  if (/횡보→|횡보·|횡보중|상승돌파|하락돌파/.test(t)) return 'sideways';
  if (/폭등|모집→폭등|롱빔/.test(t)) return 'surge';
  if (/폭락|스윕/.test(t)) return 'dump';
  if (/매도/.test(t)) return 'sell';
  if (/매수|상승/.test(t)) return 'buy';
  return t;
}
