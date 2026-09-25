/**
 * 차트 좌측 알림 + LIVE 브리핑 — SWEEP/CHoCH 등에 롱·숏·대기 명시.
 */
import type { AnalyzeResponse } from '@/types';
import type { SqueezeRadarReport } from './squeezeRadarEngine';
import type { FalseBreakReport } from './falseBreakEngine';
import type { Eagle1HudPack } from './hudPack';
import type { Eagle1CanonicalTradeDisplay } from './canonicalTradeDisplay';
import {
  buildEagle1LiveBriefing,
  enrichChartAlertFromEvent,
  type Eagle1ChartAlertEnriched,
  type Eagle1LiveBriefing,
  type BriefVerdict,
} from './chartAlertBriefing';

export type Eagle1ChartAlert = Eagle1ChartAlertEnriched;

export { buildEagle1LiveBriefing, type Eagle1LiveBriefing, type BriefVerdict };

type CandleEv = { kind?: string; bias?: string; index?: number; labelKo?: string };

function baseAlert(
  partial: Omit<Eagle1ChartAlertEnriched, 'eventVerdict' | 'eventVerdictKo' | 'briefingKo'> & {
    eventVerdict?: BriefVerdict;
    eventVerdictKo?: string;
    briefingKo?: string;
  },
  briefing: Eagle1LiveBriefing
): Eagle1ChartAlertEnriched {
  const ev = partial.eventVerdict ?? briefing.verdict;
  return {
    ...partial,
    eventVerdict: ev,
    eventVerdictKo: partial.eventVerdictKo ?? (ev === 'LONG' ? '롱' : ev === 'SHORT' ? '숏' : '대기'),
    briefingKo: partial.briefingKo ?? briefing.headlineKo,
  };
}

export function buildEagle1ChartAlerts(params: {
  squeeze?: SqueezeRadarReport | null;
  falseBreak?: FalseBreakReport | null;
  hud?: Pick<Eagle1HudPack, 'breakRail' | 'bigLong' | 'cascadeShort' | 'events' | 'candleEvidence'> | null;
  lastClose?: number | null;
  symbol?: string | null;
  analysis?: AnalyzeResponse | null;
  canonical?: Eagle1CanonicalTradeDisplay | null;
}): Eagle1ChartAlert[] {
  const briefing = buildEagle1LiveBriefing({
    analysis: params.analysis,
    hud: params.hud as Eagle1HudPack | null,
    canonical: params.canonical,
    lastClose: params.lastClose,
  });

  const out: Eagle1ChartAlert[] = [];
  const close = params.lastClose != null && Number.isFinite(params.lastClose) ? params.lastClose : null;
  const sq = params.squeeze;
  const fb = params.falseBreak;
  const br = params.hud?.breakRail;
  const sym = String(params.symbol || 'BTCUSDT');

  if (sq?.chartTag === 'SQUEEZE' || sq?.long.state === 'SQUEEZE_ACTIVE' || sq?.short.state === 'SQUEEZE_ACTIVE') {
    const side: BriefVerdict = sq.activeSide === 'SHORT' ? 'SHORT' : 'LONG';
    out.push(
      baseAlert(
        {
          id: 'squeeze-active',
          en: `${sym} · SQUEEZE · ${side}`,
          ko: sq.summaryKo || '청산몰림 진행',
          tone: side === 'SHORT' ? 'bear' : 'bull',
          priceHint: close,
          eventVerdict: side,
          eventVerdictKo: side === 'SHORT' ? '숏' : '롱',
          briefingKo: `청산몰림 ${side === 'SHORT' ? '숏' : '롱'} · ${briefing.liveFlowKo.slice(0, 36)}`,
        },
        briefing
      )
    );
  }

  if (sq?.long.state === 'TRIGGER_READY' || sq?.short.state === 'TRIGGER_READY') {
    const side: BriefVerdict = sq.long.state === 'TRIGGER_READY' ? 'LONG' : 'SHORT';
    out.push(
      baseAlert(
        {
          id: 'trigger-ready',
          en: side === 'SHORT' ? `${sym} · SELL TRIGGER` : `${sym} · BUY TRIGGER`,
          ko: side === 'SHORT' ? '숏 트리거 대기' : '롱 트리거 대기',
          tone: side === 'SHORT' ? 'bear' : 'bull',
          priceHint: close,
          eventVerdict: side,
          eventVerdictKo: side === 'SHORT' ? '숏' : '롱',
        },
        briefing
      )
    );
  }

  if (params.hud?.cascadeShort?.active) {
    out.push(
      baseAlert(
        {
          id: 'cascade-short-cand',
          en: `${sym} · CASCADE ↓`,
          ko: '숏 연쇄 후보',
          tone: 'bear',
          priceHint: close,
          eventVerdict: 'SHORT',
          eventVerdictKo: '숏',
        },
        briefing
      )
    );
  }

  const marks = (params.hud?.candleEvidence?.marks ?? params.hud?.events ?? []) as CandleEv[];
  const priority = ['SWEEP', 'CHOCH', 'BOS', 'FAKE_BREAK', 'FAILED_BREAK', 'EXPANSION', 'ABSORPTION'];
  const seen = new Set<string>();
  for (const kind of priority) {
    const ev = [...marks].reverse().find((m) => String(m.kind || '').toUpperCase() === kind);
    if (!ev) continue;
    const k = String(ev.kind || '').toUpperCase();
    if (seen.has(k)) continue;
    seen.add(k);
    const enriched = enrichChartAlertFromEvent(ev, sym, briefing);
    out.push(
      baseAlert(
        {
          id: `candle-${k.toLowerCase()}`,
          en: `${sym} · ${k} · ${enriched.eventVerdictKo}`,
          ko: enriched.ko,
          tone: enriched.tone,
          priceHint: close,
          eventVerdict: enriched.eventVerdict,
          eventVerdictKo: enriched.eventVerdictKo,
          briefingKo: enriched.briefingKo,
        },
        briefing
      )
    );
    if (out.length >= 3) break;
  }

  void fb;
  void br;

  return out.slice(0, 4);
}
