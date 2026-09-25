/**
 * 차트 우측 알림 콜아웃 — 엔진 상태만 표시. 목업 문구 날조 금지.
 * 좌측 목업: SELL TRIGGER / RETEST FAIL / SQUEEZE ACTIVE / CASCADE
 */
import type { SqueezeRadarReport } from './squeezeRadarEngine';
import type { FalseBreakReport } from './falseBreakEngine';
import type { Eagle1HudPack } from './hudPack';

export type Eagle1ChartAlert = {
  id: string;
  en: string;
  ko: string;
  tone: 'bear' | 'bull' | 'warn' | 'info';
  /** 가격선 힌트 — 있으면 점선 연결용 */
  priceHint: number | null;
};

export function buildEagle1ChartAlerts(params: {
  squeeze?: SqueezeRadarReport | null;
  falseBreak?: FalseBreakReport | null;
  hud?: Pick<Eagle1HudPack, 'breakRail' | 'bigLong' | 'cascadeShort'> | null;
  lastClose?: number | null;
}): Eagle1ChartAlert[] {
  const out: Eagle1ChartAlert[] = [];
  const close = params.lastClose != null && Number.isFinite(params.lastClose) ? params.lastClose : null;
  const sq = params.squeeze;
  const fb = params.falseBreak;
  const br = params.hud?.breakRail;

  if (sq?.chartTag === 'SQUEEZE' || sq?.long.state === 'SQUEEZE_ACTIVE' || sq?.short.state === 'SQUEEZE_ACTIVE') {
    out.push({
      id: 'squeeze-active',
      en: 'SQUEEZE ACTIVE',
      ko: sq.summaryKo || '청산몰림 진행',
      tone: sq.activeSide === 'SHORT' ? 'bear' : 'bull',
      priceHint: close,
    });
  }
  if (sq?.chartTag === 'CASCADE' || sq?.long.state === 'CASCADE' || sq?.short.state === 'CASCADE') {
    out.push({
      id: 'cascade',
      en: 'CASCADE',
      ko: '연쇄 청산 구간',
      tone: 'bear',
      priceHint: close,
    });
  }
  if (sq?.chartTag === 'BUILDUP' || sq?.long.state === 'BUILDUP' || sq?.short.state === 'BUILDUP') {
    out.push({
      id: 'buildup',
      en: 'BUILDUP',
      ko: '축적 구간',
      tone: 'warn',
      priceHint: close,
    });
  }
  if (sq?.long.state === 'TRIGGER_READY' || sq?.short.state === 'TRIGGER_READY') {
    const side = sq.long.state === 'TRIGGER_READY' ? 'LONG' : 'SHORT';
    out.push({
      id: 'trigger-ready',
      en: side === 'SHORT' ? 'SELL TRIGGER' : 'BUY TRIGGER',
      ko: side === 'SHORT' ? '숏 트리거 대기' : '롱 트리거 대기',
      tone: side === 'SHORT' ? 'bear' : 'bull',
      priceHint: close,
    });
  }

  if (fb?.kind === 'FAKE_BREAKOUT' || fb?.kind === 'FAKE_BREAKDOWN') {
    out.push({
      id: 'fake-break',
      en: fb.kind === 'FAKE_BREAKOUT' ? 'FAKE BREAKOUT' : 'FAKE BREAKDOWN',
      ko: fb.labelKo || '가짜돌파/이탈',
      tone: 'warn',
      priceHint: close,
    });
  }

  const fail = String(br?.fail || '').trim();
  if (fail) {
    out.push({
      id: 'retest-fail',
      en: /FAKE|가짜/i.test(fail) ? 'FAKE BREAKOUT' : 'RETEST FAIL',
      ko: fail,
      tone: 'bear',
      priceHint: close,
    });
  }

  if (params.hud?.cascadeShort?.active) {
    if (!out.some((a) => a.id === 'cascade')) {
      out.push({
        id: 'cascade-short-cand',
        en: 'CASCADE ↓',
        ko: '숏 연쇄 후보',
        tone: 'bear',
        priceHint: close,
      });
    }
  }

  /** 최대 4개 — 목업 밀도 */
  return out.slice(0, 4);
}
