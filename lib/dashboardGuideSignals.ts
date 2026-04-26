/**
 * 대시보드 가이드(MA·MACD Div·OBV·AI 한 줄)와 연동할 **계산 기반** 시그널 팩.
 * 교육·참고용 — 확정 매매 신호·수익 보장 아님.
 */
import type { AnalyzeResponse } from '@/types';

export type GuideSignalLevel = 'info' | 'watch' | 'emphasis';

export type GuideSignalTag = {
  id: string;
  labelKo: string;
  level: GuideSignalLevel;
  detail?: string;
};

export type DashboardGuideSignalPack = {
  /** MACD 히스토그램 최근 봉 기준 톤(패널 배경 힌트) */
  macdHistTone: 'bull' | 'bear' | 'flat';
  /** MTF 정렬·이평 맥락 대용(서버에 골든/데드 플래그 없을 때) */
  mtfAlignmentScore: number | null;
  mtfSummaryLine: string | null;
  tags: GuideSignalTag[];
  /** 가이드의 "골든 + 상승 괴리 + 강력/눌림" 류 동시 충족 시 true */
  confluenceHighlight: boolean;
  confluenceReasons: string[];
};

function safeLower(s: string | undefined | null): string {
  return String(s || '').toLowerCase();
}

export function computeDashboardGuideSignals(analysis: AnalyzeResponse | null): DashboardGuideSignalPack | null {
  if (!analysis) return null;

  const tags: GuideSignalTag[] = [];
  const mtf = analysis.mtf;
  const al = typeof mtf?.alignmentScore === 'number' ? mtf.alignmentScore : null;
  const htf = safeLower(mtf?.htfBias);
  const ltfEntry = safeLower(mtf?.ltfEntryBias);

  if (mtf && al != null) {
    if (al >= 75 && htf.includes('bull') && (ltfEntry.includes('long') || ltfEntry.includes('bull'))) {
      tags.push({
        id: 'mtf-golden-bias',
        labelKo: 'MTF 상방 정렬 (골든 맥락)',
        level: 'watch',
        detail: `정렬 ${al}% · HTF/LTF 방향 유사`,
      });
    } else if (al >= 75 && htf.includes('bear') && (ltfEntry.includes('short') || ltfEntry.includes('bear'))) {
      tags.push({
        id: 'mtf-dead-bias',
        labelKo: 'MTF 하방 정렬 (데드 맥락)',
        level: 'watch',
        detail: `정렬 ${al}% · HTF/LTF 방향 유사`,
      });
    } else if (al != null && al <= 40) {
      tags.push({
        id: 'mtf-mixed',
        labelKo: 'MTF 정렬 낮음 (혼조 맥락)',
        level: 'info',
        detail: `정렬 ${al}%`,
      });
    }
  }

  const rsi = analysis.rsiDivergenceSignal;
  if (rsi?.divergence) {
    if (rsi.divergence.bullish) {
      tags.push({
        id: 'rsi-div-bull',
        labelKo: '강세 괴리 (RSI Div)',
        level: 'emphasis',
        detail: rsi.divergence.label || undefined,
      });
    }
    if (rsi.divergence.bearish) {
      tags.push({
        id: 'rsi-div-bear',
        labelKo: '약세 괴리 (RSI Div)',
        level: 'emphasis',
        detail: rsi.divergence.label || undefined,
      });
    }
  }

  const vf = analysis.volumeFlowSummary;
  if (vf?.label) {
    tags.push({
      id: 'vol-flow',
      labelKo: `유동·거래량: ${vf.label}`,
      level: 'info',
    });
  }

  const vw = analysis.volumeWhaleZoneConfluence;
  if (vw?.caption) {
    tags.push({
      id: 'obv-confluence',
      labelKo: `체결·존 합류: ${vw.caption.slice(0, 48)}${vw.caption.length > 48 ? '…' : ''}`,
      level: 'info',
    });
  }

  const mh = analysis.indicators?.macdHist;
  let macdHistTone: DashboardGuideSignalPack['macdHistTone'] = 'flat';
  if (mh && mh.length >= 1) {
    const last = mh[mh.length - 1];
    const prev = mh.length >= 2 ? mh[mh.length - 2] : last;
    if (last > 0 && last >= prev) macdHistTone = 'bull';
    else if (last < 0 && last <= prev) macdHistTone = 'bear';
    else if (last >= 0) macdHistTone = 'bull';
    else macdHistTone = 'bear';
  }

  const sum = analysis.summary || '';
  const strongAi = /강력|눌림|폭발|🚀|매수세|상승\s*괴리/i.test(sum);
  const divBull = rsi?.divergence?.bullish === true;
  const alignOk = al != null && al >= 62;

  const confluenceReasons: string[] = [];
  let confluenceHighlight = false;
  if (divBull && alignOk && strongAi) {
    confluenceHighlight = true;
    confluenceReasons.push('강세 괴리(RSI)');
    confluenceReasons.push(`MTF 정렬 ${al}% 이상`);
    confluenceReasons.push('요약에 강세·눌림 키워드');
  }

  return {
    macdHistTone,
    mtfAlignmentScore: al,
    mtfSummaryLine: mtf?.summary ?? null,
    tags,
    confluenceHighlight,
    confluenceReasons,
  };
}
