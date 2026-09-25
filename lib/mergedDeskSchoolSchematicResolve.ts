/**
 * 학파 칩 → 교재 도식 figure/hotspot/깜빡임.
 * 확정 패턴·승률 아님.
 */
import type { Candle, OverlayItem } from '@/types';
import { buildWyckoffBlinkOverlays } from '@/lib/mergedDeskWyckoffSchematic';
import type { MergedDeskWyckoffRead } from '@/lib/mergedDeskWyckoffCycle';
import type { MergedDeskElliottRead } from '@/lib/mergedDeskElliottWave';
import type { MergedDeskSchoolSeat } from '@/lib/mergedDeskSchoolSeat';
import {
  elliottToPin,
  type ClickableSchool,
  type SchoolSchematicPin,
  wyckoffToPin,
} from '@/lib/mergedDeskSchoolSchematicCatalog';
import { formatSchematicPrice, withSchematicSeatPrices } from '@/lib/mergedDeskSchematicSeatPrice';
import type { PriceBand } from '@/lib/mergedDeskSchematicTightZone';

function lastEvt(candles: Candle[], low: boolean): { time: number; price: number } {
  const c = candles[candles.length - 1]!;
  return { time: Number(c.time), price: low ? c.low : c.high };
}

function pin(
  school: ClickableSchool,
  figureId: string,
  hotspotKey: string,
  seat: MergedDeskSchoolSeat,
  candles: Candle[],
  extra: string[] = []
): SchoolSchematicPin {
  const low = seat.tone !== 'bear';
  const ev = lastEvt(candles, low);
  return {
    school,
    figureId,
    hotspotKey,
    titleEn: seat.tagKo,
    headlineKo: seat.headlineKo,
    explainKo: [
      `도식 비교: ${seat.headlineKo}`,
      seat.detailKo,
      ...extra,
      '휴리스틱 · 확정 아님.',
    ],
    eventLow: low,
    eventTime: ev.time,
    eventPrice: ev.price,
    blinkLabel: seat.tagKo,
  };
}

const CLASSICAL_MAP: Array<[RegExp, string, string]> = [
  [/역헤드|Inverse Head/i, 'ihs', 'HEAD'],
  [/헤드앤숄더|Head and Shoulders/i, 'hs', 'HEAD'],
  [/이중천장|Double Top/i, 'dt', 'P2'],
  [/이중바닥|Double Bottom/i, 'db', 'T2'],
  [/상승삼각|Ascending Triangle/i, 'tri-asc', 'APEX'],
  [/하락삼각|Descending Triangle/i, 'tri-desc', 'APEX'],
  [/대칭삼각|Symmetrical Triangle/i, 'tri-sym', 'COIL'],
  [/상승쐐기|Rising Wedge/i, 'wedge-rise', 'END'],
  [/하락쐐기|Falling Wedge/i, 'wedge-fall', 'END'],
  [/상승깃발|Bull Flag/i, 'flag-bull', 'FLAG'],
  [/하락깃발|Bear Flag/i, 'flag-bear', 'FLAG'],
  [/컵|Cup/i, 'cup', 'HANDLE'],
  [/삼중천장|Triple Top/i, 'dt', 'P2'],
  [/삼중바닥|Triple Bottom/i, 'db', 'T2'],
  [/채널 상승|Channel Up/i, 'flag-bull', 'BRK'],
  [/채널 하락|Channel Down/i, 'flag-bear', 'BRK'],
  [/V바닥|V Bottom/i, 'db', 'T2'],
  [/V천장|V Top/i, 'dt', 'P2'],
];

const HARM_MAP: Array<[RegExp, string, string]> = [
  [/Gartley/i, 'gartley', 'D'],
  [/깊은크랩|deepCrab/i, 'crab', 'D'],
  [/Alt박쥐|altBat/i, 'bat', 'D'],
  [/박쥐|Bat/i, 'bat', 'D'],
  [/나비|Butterfly/i, 'butterfly', 'D'],
  [/크랩|Crab/i, 'crab', 'D'],
  [/Shark/i, 'shark', 'C'],
  [/Cypher/i, 'cypher', 'D'],
  [/AB=CD|ABCD/i, 'abcd', 'D'],
];

function fromSeat(seat: MergedDeskSchoolSeat, candles: Candle[]): SchoolSchematicPin | null {
  const k = seat.kind;
  if (k === 'seat') return null;
  const school = k as ClickableSchool;
  const h = `${seat.tagKo} ${seat.headlineKo}`;

  if (school === 'dow') {
    if (/123/.test(h)) {
      const brk = /전환|돌파/.test(h);
      return pin(school, 'reversal-123', brk ? 'BREAK' : '3', seat, candles, ['무효화=점 3 이탈(상방전환 시 저점).']);
    }
    if (/하락|LH/.test(h)) return pin(school, 'lh-ll', /혼조/.test(h) ? 'LH2' : 'NOW', seat, candles);
    if (/상승|HH/.test(h)) return pin(school, 'hh-hl', /혼조/.test(h) ? 'HL2' : 'NOW', seat, candles);
    return pin(school, 'hh-hl', 'HL2', seat, candles);
  }

  if (school === 'classical') {
    for (const [re, id, key] of CLASSICAL_MAP) {
      if (re.test(h) || re.test(seat.tagKo)) return pin(school, id, key, seat, candles, ['넥라인·이탈 검증 필요.']);
    }
    return pin(school, 'tri-sym', 'COIL', seat, candles);
  }

  if (school === 'harmonic') {
    for (const [re, id, key] of HARM_MAP) {
      if (re.test(h) || re.test(seat.tagKo)) return pin(school, id, key, seat, candles, ['D/C는 PRZ 후보. 채우기 아님.']);
    }
    return pin(school, 'gartley', 'D', seat, candles);
  }

  if (school === 'vsa') {
    if (/클라이맥스/.test(h)) return pin(school, 'effort', 'climax', seat, candles);
    if (/흡수/.test(h)) return pin(school, 'effort', 'absorb', seat, candles);
    if (/무수요/.test(h)) return pin(school, 'effort', 'nodemand', seat, candles);
    if (/무공급/.test(h)) return pin(school, 'effort', 'nosupply', seat, candles);
    return pin(school, 'effort', 'climax', seat, candles);
  }

  if (school === 'ichimoku') {
    if (/위/.test(h)) return pin(school, 'cloud', 'ABOVE', seat, candles);
    if (/아래/.test(h)) return pin(school, 'cloud', 'BELOW', seat, candles);
    return pin(school, 'cloud', 'INSIDE', seat, candles);
  }

  if (school === 'chan') {
    if (/중추/.test(h)) return pin(school, 'zs-123', 'ZS', seat, candles, ['3중첩 근사. 매매점 1·2·3은 중추 이후.']);
    return pin(school, 'zs-123', 'BI', seat, candles, ['필 진행. 중추 전.']);
  }

  if (school === 'smc') {
    if (/CHoCH|CHOCH/i.test(h)) return pin(school, 'map', 'CHOCH', seat, candles);
    if (/BOS/i.test(h)) return pin(school, 'map', 'BOS', seat, candles);
    if (/스윕|SSL|BSL/.test(h)) return pin(school, 'map', 'SWEEP', seat, candles);
    if (/PO3/.test(h)) return pin(school, 'map', 'PO3', seat, candles);
    return pin(school, 'map', 'BOS', seat, candles);
  }

  if (school === 'brooks') {
    if (/H2/.test(h)) return pin(school, 'pa', 'H2', seat, candles);
    if (/L2/.test(h)) return pin(school, 'pa', 'H2', seat, candles);
    if (/레인지|TR/.test(h)) return pin(school, 'pa', 'TR', seat, candles);
    if (/클라이맥스/.test(h)) return pin(school, 'pa', 'TREND', seat, candles);
    return pin(school, 'pa', 'PB', seat, candles);
  }

  if (school === 'fib') {
    if (/확장/.test(h)) return pin(school, 'extend', 'e162', seat, candles);
    if (/측정/.test(h)) return pin(school, 'extend', 'e100', seat, candles);
    if (/0\.50|50/.test(h)) return pin(school, 'retrace', 'r50', seat, candles);
    return pin(school, 'retrace', 'r618', seat, candles);
  }

  if (school === 'wolfe') return pin(school, 'wave', '5', seat, candles);
  if (school === 'pitchfork') {
    if (/상단/.test(h)) return pin(school, 'andrews', 'UP', seat, candles);
    if (/하단/.test(h)) return pin(school, 'andrews', 'LOW', seat, candles);
    return pin(school, 'andrews', 'MED', seat, candles);
  }
  if (school === 'profile') {
    if (/위/.test(h)) return pin(school, 'tpo', 'ABOVE', seat, candles);
    if (/아래/.test(h)) return pin(school, 'tpo', 'BELOW', seat, candles);
    return pin(school, 'tpo', 'POC', seat, candles);
  }
  if (school === 'pnf') {
    if (/X열|상승칸/.test(h)) return pin(school, 'xo', 'X', seat, candles);
    return pin(school, 'xo', 'O', seat, candles);
  }
  if (school === 'nison') {
    if (/망치/.test(h)) return pin(school, 'candles', 'hammer', seat, candles);
    if (/유성/.test(h)) return pin(school, 'candles', 'star', seat, candles);
    if (/장악|잉태/.test(h)) return pin(school, 'candles', 'engulf', seat, candles);
    if (/도지/.test(h)) return pin(school, 'candles', 'doji', seat, candles);
    if (/별/.test(h)) return pin(school, 'candles', 'morning', seat, candles);
    return pin(school, 'candles', 'doji', seat, candles);
  }
  if (school === 'turtle') {
    if (/상방|상단/.test(h)) return pin(school, 'donchian', /달바스/.test(h) ? 'BOX' : 'BRK', seat, candles);
    if (/하방|하단/.test(h)) return pin(school, 'donchian', /달바스/.test(h) ? 'BOX' : 'LOW', seat, candles);
    return pin(school, 'donchian', 'BOX', seat, candles);
  }
  if (school === 'macro') {
    if (/하단|과매도/.test(h)) return pin(school, 'hurst', 'BOT', seat, candles);
    if (/상단|과매수/.test(h)) return pin(school, 'hurst', 'TOP', seat, candles);
    if (/중간/.test(h)) return pin(school, 'hurst', 'MID', seat, candles);
    return pin(school, 'hurst', 'CREST', seat, candles);
  }
  return null;
}

export function buildSchoolSchematicPins(params: {
  candles: Candle[];
  seats: MergedDeskSchoolSeat[];
  wyckoff: MergedDeskWyckoffRead | null;
  elliott: MergedDeskElliottRead | null;
  buyBand?: PriceBand | null;
  sellBand?: PriceBand | null;
}): Partial<Record<ClickableSchool, SchoolSchematicPin>> {
  const out: Partial<Record<ClickableSchool, SchoolSchematicPin>> = {};
  if (params.wyckoff) out.wyckoff = wyckoffToPin(params.wyckoff);
  if (params.elliott) out.elliott = elliottToPin(params.elliott);
  for (const s of params.seats) {
    if (s.kind === 'seat') continue;
    if (s.kind === 'wyckoff') {
      if (!out.wyckoff) {
        out.wyckoff = pin('wyckoff', 'price-cycle', 'MARKUP', s, params.candles, [
          '이벤트 미검출 · 사이클 도식만.',
        ]);
      }
      continue;
    }
    if (s.kind === 'elliott') {
      if (!out.elliott) {
        out.elliott = pin('elliott', 'fig-8-1', '1', s, params.candles, ['5파 미검출 · 기본 8-1 도식.']);
      }
      continue;
    }
    const p = fromSeat(s, params.candles);
    if (p) out[p.school] = p;
  }
  const last = params.candles[params.candles.length - 1]?.close ?? 0;
  const keys = Object.keys(out) as ClickableSchool[];
  for (const k of keys) {
    const cur = out[k];
    if (!cur) continue;
    out[k] = withSchematicSeatPrices(cur, last, params.elliott, params.wyckoff, {
      candles: params.candles,
      buyBand: params.buyBand,
      sellBand: params.sellBand,
    });
  }
  return out;
}

export function buildSchoolSchematicBlinks(
  pins: Partial<Record<ClickableSchool, SchoolSchematicPin>>,
  candles: Candle[]
): OverlayItem[] {
  if (!candles.length) return [];
  const lastT = Number(candles[candles.length - 1]!.time);
  const hi = Math.max(...candles.slice(-8).map((c) => c.high));
  const lo = Math.min(...candles.slice(-8).map((c) => c.low));
  const rows: OverlayItem[] = [];
  for (const pin of Object.values(pins)) {
    if (!pin || pin.school === 'wyckoff' || pin.school === 'elliott') continue;
    rows.push(
      ...buildWyckoffBlinkOverlays([
        {
          id: `merged-desk-${pin.school}-blink-low`,
          side: 'low',
          time: pin.eventLow ? pin.eventTime : lastT,
          price: pin.eventLow ? pin.eventPrice : lo,
          label: pin.eventLow
            ? `${pin.seatKo ?? pin.blinkLabel} ${formatSchematicPrice(pin.eventPrice)}`
            : '하방',
          primary: pin.eventLow,
        },
        {
          id: `merged-desk-${pin.school}-blink-high`,
          side: 'high',
          time: pin.eventLow ? lastT : pin.eventTime,
          price: pin.eventLow ? hi : pin.eventPrice,
          label: pin.eventLow
            ? '상방'
            : `${pin.seatKo ?? pin.blinkLabel} ${formatSchematicPrice(pin.eventPrice)}`,
          primary: !pin.eventLow,
        },
      ])
    );
  }
  return rows;
}

const CLICKABLE: Record<ClickableSchool, 1> = {
  wyckoff: 1,
  elliott: 1,
  dow: 1,
  classical: 1,
  harmonic: 1,
  vsa: 1,
  ichimoku: 1,
  chan: 1,
  smc: 1,
  brooks: 1,
  fib: 1,
  wolfe: 1,
  pitchfork: 1,
  profile: 1,
  pnf: 1,
  nison: 1,
  turtle: 1,
  macro: 1,
};

export function asClickableSchool(k: string | undefined | null): ClickableSchool | null {
  if (!k || k === 'seat') return null;
  return k in CLICKABLE ? (k as ClickableSchool) : null;
}
