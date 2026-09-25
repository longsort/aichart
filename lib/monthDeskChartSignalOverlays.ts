/**
 * 마감·안착 — 카드 HUD 없이 차트 zone·line·핀으로만 시그널 표시.
 */
import type { Candle, OverlayItem } from '@/types';
import type { MonthDeskCandleZoneIntel } from '@/lib/monthDeskCandleZoneIntel';
import type { MonthDeskSettleChartGuide } from '@/lib/monthDeskSettleChartGuide';
import type { MonthDeskStrikeDeskBundle } from '@/lib/monthDeskStrikeDesk';
import { MONTH_DESK_STRIKE_IDS } from '@/lib/monthDeskStrikeDesk';

function trunc(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function signalPin(
  id: string,
  label: string,
  time: number,
  price: number,
  opts: {
    color: string;
    bg: string;
    tip: string;
    textColor?: string;
  }
): OverlayItem {
  return {
    id,
    kind: 'label',
    label,
    x1: 0,
    y1: 0,
    time1: time,
    price1: price,
    confidence: 94,
    color: opts.color,
    labelBackgroundColor: opts.bg,
    labelTextColor: opts.textColor ?? '#f8fafc',
    labelTooltip: opts.tip,
    category: 'scenario',
  };
}

/** Strike·인텔·안착 가이드를 차트 핀·라벨 시그널로 (플로팅 카드 대체) */
export function buildMonthDeskChartSignalOverlays(params: {
  bundle: MonthDeskStrikeDeskBundle | null;
  candleIntel?: MonthDeskCandleZoneIntel | null;
  settleGuide?: MonthDeskSettleChartGuide | null;
  candles: Candle[];
  timeframe: string;
}): OverlayItem[] {
  const { bundle, candleIntel, settleGuide, candles } = params;
  if (candles.length < 4) return [];

  const n = candles.length;
  const tLast = Number(candles[n - 1]?.time);
  const close = Number(candles[n - 1]?.close);
  if (!Number.isFinite(tLast) || !Number.isFinite(close)) return [];

  const out: OverlayItem[] = [];
  const ai = bundle?.ai;

  if (candleIntel && candleIntel.headlineKo && candleIntel.headlineKo !== '레벨 대기 — zone·line 형성 중') {
    const biasColor =
      candleIntel.bias === 'LONG' ? '#4ade80' : candleIntel.bias === 'SHORT' ? '#f87171' : '#94a3b8';
    out.push(
      signalPin(
        'month-desk-signal-intel-candle',
        trunc(candleIntel.headlineKo, 26),
        tLast,
        close,
        {
          color: biasColor,
          bg: 'rgba(8,15,28,0.92)',
          tip: [candleIntel.headlineKo, candleIntel.sublineKo, `레벨 ${candleIntel.activeLevelKo}`, '캔들×zone 참고'].join(
            '\n'
          ),
        }
      )
    );
  }

  if (settleGuide && settleGuide.step !== 'wait') {
    const stepColor =
      settleGuide.step === 'failed' || settleGuide.step === 'fake'
        ? '#f87171'
        : settleGuide.step === 'confirm'
          ? '#4ade80'
          : '#facc15';
    const lv = settleGuide.levelPrice ?? close;
    out.push(
      signalPin(
        'month-desk-signal-settle-step',
        `${settleGuide.stepIndex > 0 ? settleGuide.stepIndex + '·' : ''}${settleGuide.stepKo}`,
        tLast,
        lv,
        {
          color: stepColor,
          bg: 'rgba(6,12,24,0.9)',
          tip: [
            settleGuide.headlineKo,
            settleGuide.sublineKo,
            settleGuide.levelKo,
            ...settleGuide.checklist.map((c) => `${c.done ? '✓' : '○'} ${c.label}`),
          ].join('\n'),
        }
      )
    );
  }

  if (bundle && ai) {
    const primaryLeg =
      bundle.primary === 'LONG' ? bundle.long : bundle.primary === 'SHORT' ? bundle.short : null;
    const primaryMeta = bundle.primary === 'LONG' ? ai.long : bundle.primary === 'SHORT' ? ai.short : null;

    if (primaryLeg && primaryMeta) {
      const isLong = primaryLeg.side === 'LONG';
      const hot = primaryMeta.phase === 'hot';
      const accent = hot ? '#fde047' : isLong ? '#4ade80' : '#f87171';
      const chainOk = primaryMeta.chain
        .filter((c) => c.ok)
        .map((c) => c.icon)
        .join('');
      const mid = (primaryLeg.zoneTop + primaryLeg.zoneBot) / 2;

      out.push(
        signalPin(
          'month-desk-signal-strike-primary',
          hot
            ? `⚡${primaryMeta.confluence} ${isLong ? '롱' : '숏'}HOT`
            : `◆${primaryMeta.confluence} ${isLong ? '롱' : '숏'}`,
          tLast,
          mid,
          {
            color: accent,
            bg: hot ? 'rgba(88,28,135,0.92)' : 'rgba(15,23,42,0.9)',
            tip: [
              ai.headlineKo,
              ai.sublineKo,
              primaryLeg.headlineKo,
              `E ${primaryLeg.entry} · SL ${primaryLeg.stopLoss}`,
              `TP ${primaryLeg.tp1} / ${primaryLeg.tp2} / ${primaryLeg.tp3}`,
              primaryMeta.chain.map((c) => `${c.ok ? '✓' : '○'} ${c.label}`).join(' · '),
              'Strike zone·line 참고',
            ].join('\n'),
          }
        )
      );

      if (chainOk) {
        out.push(
          signalPin('month-desk-signal-strike-chain', chainOk, tLast, primaryLeg.entry, {
            color: accent,
            bg: 'rgba(15,23,42,0.85)',
            tip: primaryMeta.chain.map((c) => `${c.ok ? '✓' : '○'} ${c.icon} ${c.label}`).join('\n'),
            textColor: accent,
          })
        );
      }

      const tMid = Number(candles[Math.max(0, n - 24)]?.time);
      if (Number.isFinite(tMid)) {
        out.push({
          id: isLong ? MONTH_DESK_STRIKE_IDS.longBeam : MONTH_DESK_STRIKE_IDS.shortBeam,
          kind: 'trendLine',
          label: '',
          x1: 0,
          y1: 0,
          x2: 1,
          y2: 0,
          time1: tMid,
          time2: tLast,
          price1: primaryLeg.entry,
          price2: close,
          confidence: hot ? 98 : 85,
          color: hot
            ? isLong
              ? 'rgba(253,224,71,0.65)'
              : 'rgba(251,146,60,0.65)'
            : 'rgba(148,163,184,0.4)',
          lineDash: hot ? '1 5' : '4 6',
          lineStrokeWidth: hot ? 2.5 : 1.5,
          noProject: true,
          labelTooltip: ai.headlineKo,
          overlayZoneExtraClass: hot ? 'overlay-line--strike-signal-hot' : 'overlay-line--strike-signal',
        });
      }
    }

    if (bundle.long && bundle.primary !== 'LONG') {
      const m = ai.long;
      if (m && m.phase !== 'scan') {
        out.push(
          signalPin(
            'month-desk-signal-strike-long-alt',
            trunc(m.tagKo, 14),
            tLast,
            bundle.long.zoneBot,
            {
              color: '#4ade80',
              bg: 'rgba(15,23,42,0.82)',
              tip: bundle.long.headlineKo,
              textColor: '#86efac',
            }
          )
        );
      }
    }
    if (bundle.short && bundle.primary !== 'SHORT') {
      const m = ai.short;
      if (m && m.phase !== 'scan') {
        out.push(
          signalPin(
            'month-desk-signal-strike-short-alt',
            trunc(m.tagKo, 14),
            tLast,
            bundle.short.zoneTop,
            {
              color: '#f87171',
              bg: 'rgba(15,23,42,0.82)',
              tip: bundle.short.headlineKo,
              textColor: '#fca5a5',
            }
          )
        );
      }
    }
  }

  return out;
}
