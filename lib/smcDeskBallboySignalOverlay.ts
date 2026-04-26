/**
 * SMC 데스크 — **차트 라벨** 볼배 시그널(종합·합류·MTF·확정게이트 요약).
 * 카드/HUD 아님. 참고용·확정 매매 아님.
 */
import type { AnalyzeResponse, Candle, OverlayItem } from '@/types';

const CAT: OverlayItem['category'] = 'smcDesk';

export function buildSmcDeskBallboySignalOverlay(params: {
  analysis: AnalyzeResponse | null | undefined;
  candles: Candle[];
}): OverlayItem[] {
  const { analysis, candles } = params;
  if (!analysis || candles.length < 2) return [];

  const last = candles[candles.length - 1];
  const lastTime = last.time as number;
  const lastClose = last.close;
  const v = analysis.verdict;

  const vk =
    v === 'LONG' ? '롱' : v === 'SHORT' ? '숏' : v === 'WATCH' ? '관망' : '–';
  const tag = v === 'LONG' ? 'L' : v === 'SHORT' ? 'S' : '·';

  const smc = analysis.smcDeskConfluenceLs;
  const mtfPct =
    typeof analysis.mtf?.alignmentScore === 'number' && Number.isFinite(analysis.mtf.alignmentScore)
      ? `${Math.round(analysis.mtf.alignmentScore)}%`
      : '–';
  const conf =
    typeof analysis.confidence === 'number' && Number.isFinite(analysis.confidence)
      ? Math.round(analysis.confidence)
      : null;

  let conflict = false;
  if (smc && (v === 'LONG' || v === 'SHORT') && smc.side !== v) conflict = true;

  const smcLine = smc
    ? `SMC합류 ${smc.side === 'LONG' ? '롱' : '숏'} (${smc.longScore}/3·${smc.shortScore}/3)${smc.differsFromVerdict ? ' · 종합과 불일치' : ''}`
    : 'SMC합류 조건 미충족';

  const cs = analysis.confirmedSignal;
  const gateLine =
    cs && (cs.direction === 'LONG' || cs.direction === 'SHORT')
      ? `확정게이트 ${cs.direction === 'LONG' ? '롱' : '숏'}${cs.confirmed ? '' : ' (미충족)'}`
      : null;

  const tipParts = [
    `〔볼배〕 종합 ${vk}${conf != null ? ` · 신뢰 ${conf}%` : ''} · MTF정렬 ${mtfPct}`,
    smcLine,
    gateLine,
    conflict ? '※ 종합 방향과 SMC합류 참고방향이 다를 수 있음.' : null,
  ].filter(Boolean) as string[];

  /** 합류·L/S 라벨과 겹침 완화: 롱은 캔들 상단 근처, 숏은 하단 근처 */
  const eps = Math.max(lastClose * 1.2e-4, 1e-8);
  const price1 =
    v === 'LONG' ? last.high + eps : v === 'SHORT' ? last.low - eps : lastClose;

  const labelMain = conflict ? `볼배·${tag}⚠` : `볼배·${tag}`;

  return [
    {
      id: 'smc-desk-ballboy-signal',
      kind: 'label',
      label: labelMain,
      x1: 0,
      y1: 0,
      time1: lastTime,
      price1,
      confidence: 55,
      color: v === 'SHORT' ? '#F87171' : v === 'LONG' ? '#22C55E' : '#EAB308',
      lineLabelColor: v === 'SHORT' ? '#FEE2E2' : v === 'LONG' ? '#DCFCE7' : '#FEF9C3',
      labelBackgroundColor: v === 'SHORT'
        ? 'rgba(185,28,28,0.9)'
        : v === 'LONG'
          ? 'rgba(21,128,61,0.92)'
          : 'rgba(161,98,7,0.88)',
      labelTextColor: v === 'SHORT' ? '#FEF2F2' : v === 'LONG' ? '#F0FDF4' : '#FFFBEB',
      category: CAT,
      labelTooltip: tipParts.join(' · '),
    },
  ];
}
