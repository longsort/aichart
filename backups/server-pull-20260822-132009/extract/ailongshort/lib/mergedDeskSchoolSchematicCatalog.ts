/**
 * 통합·분석 — 학파 교재 도식 카탈로그 + 핫스팟.
 * 와이코프·엘리엇은 기존 PNG/SVG 모듈을 재사용.
 */
import type { SchoolSeatKind } from '@/lib/mergedDeskSchoolSeat';
import {
  ELLIOTT_FIGURES,
  elliottHotspotKey,
  elliottSchematicHotspot,
  elliottSchematicSrc,
  listElliottHotspots,
} from '@/lib/mergedDeskElliottSchematic';
import type { MergedDeskElliottRead } from '@/lib/mergedDeskElliottWave';
import {
  listWyckoffHotspots,
  resolveWyckoffHotspotKey,
  resolveWyckoffSchematicId,
  wyckoffSchematicHotspot,
  wyckoffSchematicSrc,
  type WyckoffSchematicId,
} from '@/lib/mergedDeskWyckoffSchematic';
import type { MergedDeskWyckoffRead } from '@/lib/mergedDeskWyckoffCycle';

export type ClickableSchool = Exclude<SchoolSeatKind, 'seat'>;

export type SchoolFigureDef = {
  id: string;
  tabKo: string;
  captionKo: string;
  src: string;
};

export type SchoolSchematicPin = {
  school: ClickableSchool;
  figureId: string;
  hotspotKey: string;
  titleEn: string;
  headlineKo: string;
  explainKo: string[];
  eventLow: boolean;
  eventTime: number;
  eventPrice: number;
  blinkLabel: string;
  lastPrice?: number;
  seatSide?: 'long' | 'short' | 'wait';
  seatRole?: 'pullback-long' | 'rally-short' | 'run-up' | 'run-down' | 'wait';
  seatKo?: string;
  invalKo?: string;
  zoneLow?: number;
  zoneHigh?: number;
  bounceTo?: number;
  dumpTo?: number;
  bounceKo?: string;
};

const WYCKOFF_FIGS: SchoolFigureDef[] = [
  { id: 'accumulation-1', tabKo: '축적1', captionKo: '와이코프 축적(스프링 형). PS–SC–AR–ST–Spring–LPS–SOS.', src: wyckoffSchematicSrc('accumulation-1') },
  { id: 'accumulation-2', tabKo: '축적2', captionKo: '와이코프 축적(스프링 약). ST 후 LPS–SOS.', src: wyckoffSchematicSrc('accumulation-2') },
  { id: 'distribution-1', tabKo: '분배1', captionKo: '와이코프 분배(UTAD 형). PSY–BC–AR–ST–UTAD–LPSY–SOW.', src: wyckoffSchematicSrc('distribution-1') },
  { id: 'distribution-2', tabKo: '분배2', captionKo: '와이코프 분배(UTAD 약).', src: wyckoffSchematicSrc('distribution-2') },
  { id: 'price-cycle', tabKo: '사이클', captionKo: '축적→마크업→분배→마크다운.', src: wyckoffSchematicSrc('price-cycle') },
];

function fig(school: string, id: string, tabKo: string, captionKo: string): SchoolFigureDef {
  return { id, tabKo, captionKo, src: `/schematics/${school}/${id}.svg` };
}

export const SCHOOL_FIGURES: Record<ClickableSchool, SchoolFigureDef[]> = {
  wyckoff: WYCKOFF_FIGS,
  elliott: ELLIOTT_FIGURES.map((f) => ({
    id: f.id,
    tabKo: f.tabKo,
    captionKo: f.captionKo,
    src: elliottSchematicSrc(f.id),
  })),
  dow: [
    fig('dow', 'hh-hl', 'HH·HL', '다우 상승: 고점·저점 갱신. 2차 조정은 하위 TF.'),
    fig('dow', 'lh-ll', 'LH·LL', '다우 하락: 고점·저점 낮아짐.'),
    fig('dow', 'reversal-123', '123전환', '1=극점 2=반동 3=고저 후 2 돌파. 무효화=3 이탈.'),
  ],
  classical: [
    fig('classical', 'hs', 'H&S', '헤드앤숄더. 넥라인 이탈이 완성 조건.'),
    fig('classical', 'ihs', '역H&S', '역헤드앤숄더. 넥라인 상향 이탈.'),
    fig('classical', 'dt', '이중천장', '이중천장. 중간 저점 이탈.'),
    fig('classical', 'db', '이중바닥', '이중바닥. 중간 고점 이탈.'),
    fig('classical', 'tri-asc', '상승삼각', '수평 저항 + 상승 저점. 양방향 이탈 가능.'),
    fig('classical', 'tri-desc', '하락삼각', '수평 지지 + 하락 고점.'),
    fig('classical', 'tri-sym', '대칭삼각', '수축 코일. 방향=이탈.'),
    fig('classical', 'wedge-rise', '상승쐐기', '둘 다 상승·폭 축소. 상단 소진 후보.'),
    fig('classical', 'wedge-fall', '하락쐐기', '둘 다 하락·폭 축소. 하단 소진 후보.'),
    fig('classical', 'flag-bull', '상승깃발', '폴+얕은 깃발. 지속 후보.'),
    fig('classical', 'flag-bear', '하락깃발', '급락 폴+얕은 반등 깃발.'),
    fig('classical', 'cup', '컵핸들', 'U자 컵+작은 핸들. 림 돌파.'),
  ],
  harmonic: [
    fig('harmonic', 'gartley', 'Gartley', 'AD≈0.786 XA. D는 PRZ.'),
    fig('harmonic', 'bat', '박쥐', 'AD≈0.886 XA.'),
    fig('harmonic', 'butterfly', '나비', 'D가 X 너머 1.27–1.618.'),
    fig('harmonic', 'crab', '크랩', 'AD≈1.618 XA.'),
    fig('harmonic', 'shark', 'Shark', '0-X-A-B-C. C가 PRZ.'),
    fig('harmonic', 'cypher', 'Cypher', 'CD≈0.786 XC.'),
    fig('harmonic', 'abcd', 'AB=CD', '등변 측정이동.'),
  ],
  vsa: [fig('vsa', 'effort', '노력vs결과', '클라이맥스·무수요·무공급·흡수. 1봉은 힌트.')],
  ichimoku: [fig('ichimoku', 'cloud', '구름', '구름 위/안/아래 + 전환·기준. 후행스팬은 별도.')],
  chan: [fig('chan', 'zs-123', '중추·123', '분형→필→중추. 1·2·3 매매점 근사. CZSC 아님.')],
  smc: [fig('smc', 'map', 'BOS·스윕', 'BOS/CHoCH/FVG/OB/스윕/PO3. 확정 마크 아님.')],
  brooks: [fig('brooks', 'pa', 'H1·H2·TR', '추세·눌림·H2·타이트레인지. 클라이맥스 실패 가능.')],
  fib: [
    fig('fib', 'retrace', '되돌림', '0.382·0.50·0.618·0.786. GP 구간 반응 흔함.'),
    fig('fib', 'extend', '확장', '1.0·1.272·1.618 측정. 목표일 뿐.'),
  ],
  wolfe: [fig('wolfe', 'wave', 'Wolfe 1–5', '1-3-5 / 2-4 수렴. 5=추정 진입대. EPA는 선.')],
  pitchfork: [fig('pitchfork', 'andrews', '피치포크', 'P0-P1-P2. 중앙선 자석·통과 모두 가능.')],
  profile: [fig('profile', 'tpo', 'VA·POC', 'VAH/POC/VAL. 전체 TPO 문자판 아님.')],
  pnf: [fig('pnf', 'xo', 'X/O', '3칸 반전. 와이코프 카운트용 근사.')],
  nison: [fig('nison', 'candles', '봉패턴', '망치·유성·장악·도지·샛별. 위치>모양.')],
  turtle: [fig('turtle', 'donchian', '터틀·달바스', '20봉 채널 돌파 + 박스. 가짜돌파 흔함.')],
  macro: [fig('macro', 'hurst', '사이클위치', '윈도 상대 고저. Hurst FLD·명목주기 아님.')],
};

const HOT: Record<string, Record<string, { left: number; top: number }>> = {
  'dow/hh-hl': { HH2: { left: 40, top: 27 }, HL2: { left: 49, top: 48 }, HH3: { left: 72, top: 15 }, NOW: { left: 92, top: 12 } },
  'dow/lh-ll': { LH2: { left: 40, top: 63 }, LL2: { left: 49, top: 46 }, LH3: { left: 72, top: 83 }, NOW: { left: 92, top: 90 } },
  'dow/reversal-123': { '1': { left: 22, top: 75 }, '2': { left: 38, top: 42 }, '3': { left: 56, top: 63 }, BREAK: { left: 78, top: 20 } },
  'classical/hs': { LS: { left: 16, top: 33 }, HEAD: { left: 40, top: 17 }, RS: { left: 64, top: 35 }, NECK: { left: 50, top: 63 } },
  'classical/ihs': { LS: { left: 16, top: 63 }, HEAD: { left: 40, top: 83 }, RS: { left: 64, top: 60 }, NECK: { left: 50, top: 35 } },
  'classical/dt': { P1: { left: 22, top: 19 }, P2: { left: 56, top: 19 }, NECK: { left: 45, top: 58 } },
  'classical/db': { T1: { left: 22, top: 79 }, T2: { left: 56, top: 79 }, NECK: { left: 45, top: 38 } },
  'classical/tri-asc': { RES: { left: 50, top: 25 }, LOW: { left: 32, top: 58 }, APEX: { left: 78, top: 30 } },
  'classical/tri-desc': { SUP: { left: 50, top: 79 }, HIGH: { left: 22, top: 29 }, APEX: { left: 78, top: 72 } },
  'classical/tri-sym': { COIL: { left: 50, top: 48 }, APEX: { left: 76, top: 50 } },
  'classical/wedge-rise': { END: { left: 70, top: 23 } },
  'classical/wedge-fall': { END: { left: 70, top: 71 } },
  'classical/flag-bull': { POLE: { left: 18, top: 54 }, FLAG: { left: 48, top: 23 }, BRK: { left: 88, top: 10 } },
  'classical/flag-bear': { POLE: { left: 18, top: 42 }, FLAG: { left: 48, top: 70 }, BRK: { left: 88, top: 90 } },
  'classical/cup': { CUP: { left: 40, top: 79 }, HANDLE: { left: 78, top: 38 }, RIM: { left: 50, top: 25 } },
  'harmonic/gartley': { X: { left: 8, top: 25 }, A: { left: 28, top: 79 }, B: { left: 48, top: 42 }, C: { left: 64, top: 67 }, D: { left: 86, top: 33 } },
  'harmonic/bat': { X: { left: 8, top: 21 }, A: { left: 30, top: 81 }, B: { left: 46, top: 48 }, C: { left: 62, top: 71 }, D: { left: 88, top: 29 } },
  'harmonic/butterfly': { X: { left: 12, top: 42 }, A: { left: 30, top: 83 }, B: { left: 48, top: 46 }, C: { left: 64, top: 71 }, D: { left: 90, top: 17 } },
  'harmonic/crab': { X: { left: 10, top: 46 }, A: { left: 30, top: 81 }, B: { left: 47, top: 52 }, C: { left: 62, top: 69 }, D: { left: 92, top: 15 } },
  'harmonic/shark': { '0': { left: 8, top: 63 }, X: { left: 26, top: 25 }, A: { left: 48, top: 75 }, B: { left: 70, top: 17 }, C: { left: 90, top: 58 } },
  'harmonic/cypher': { X: { left: 8, top: 42 }, A: { left: 28, top: 79 }, B: { left: 46, top: 50 }, C: { left: 70, top: 17 }, D: { left: 90, top: 54 } },
  'harmonic/abcd': { A: { left: 8, top: 75 }, B: { left: 30, top: 17 }, C: { left: 50, top: 63 }, D: { left: 82, top: 19 } },
  'vsa/effort': { climax: { left: 10, top: 40 }, nodemand: { left: 23, top: 55 }, nosupply: { left: 36, top: 62 }, absorb: { left: 50, top: 40 } },
  'ichimoku/cloud': { ABOVE: { left: 30, top: 21 }, INSIDE: { left: 48, top: 48 }, BELOW: { left: 70, top: 63 }, TK: { left: 72, top: 28 } },
  'chan/zs-123': { BI: { left: 10, top: 52 }, ZS: { left: 38, top: 38 }, '1': { left: 20, top: 67 }, '2': { left: 46, top: 17 }, '3': { left: 76, top: 54 } },
  'smc/map': { BOS: { left: 32, top: 14 }, CHOCH: { left: 48, top: 10 }, FVG: { left: 22, top: 22 }, OB: { left: 32, top: 22 }, SWEEP: { left: 64, top: 63 }, PO3: { left: 76, top: 23 } },
  'brooks/pa': { TREND: { left: 14, top: 40 }, PB: { left: 20, top: 58 }, H1: { left: 28, top: 23 }, H2: { left: 42, top: 15 }, TR: { left: 64, top: 35 } },
  'fib/retrace': { r382: { left: 50, top: 42 }, r50: { left: 50, top: 50 }, r618: { left: 50, top: 58 }, r786: { left: 50, top: 69 } },
  'fib/extend': { e100: { left: 50, top: 29 }, e127: { left: 50, top: 19 }, e162: { left: 50, top: 8 } },
  'wolfe/wave': { '1': { left: 8, top: 63 }, '2': { left: 22, top: 17 }, '3': { left: 36, top: 75 }, '4': { left: 56, top: 8 }, '5': { left: 78, top: 58 } },
  'pitchfork/andrews': { P0: { left: 8, top: 75 }, P1: { left: 26, top: 17 }, P2: { left: 42, top: 63 }, MED: { left: 70, top: 31 }, UP: { left: 70, top: 15 }, LOW: { left: 70, top: 48 } },
  'profile/tpo': { VAH: { left: 36, top: 29 }, POC: { left: 36, top: 48 }, VAL: { left: 36, top: 71 }, ABOVE: { left: 70, top: 20 }, INSIDE: { left: 70, top: 42 }, BELOW: { left: 70, top: 62 } },
  'pnf/xo': { X: { left: 18, top: 23 }, O: { left: 13, top: 42 }, BRK: { left: 42, top: 16 } },
  'nison/candles': { hammer: { left: 9, top: 48 }, star: { left: 19, top: 25 }, engulf: { left: 31, top: 40 }, doji: { left: 43, top: 42 }, morning: { left: 58, top: 40 } },
  'turtle/donchian': { HIGH: { left: 20, top: 21 }, LOW: { left: 20, top: 75 }, BOX: { left: 53, top: 42 }, BRK: { left: 76, top: 17 } },
  'macro/hurst': { CREST: { left: 16, top: 17 }, TROUGH: { left: 28, top: 54 }, MID: { left: 68, top: 17 }, TOP: { left: 52, top: 17 }, BOT: { left: 40, top: 80 } },
};

export function schoolFigures(school: ClickableSchool): SchoolFigureDef[] {
  return SCHOOL_FIGURES[school] ?? [];
}

const WYCKOFF_FALLBACK_KEYS = [
  'ST_B',
  'ST_A',
  'SPRING',
  'UTAD',
  'SOS',
  'SOW',
  'E',
  'MARKUP',
  'MARKDOWN',
  'ACC',
  'DIST',
  'PS',
  'SC',
  'AR',
];

export function listSchoolHotspots(
  school: ClickableSchool,
  figureId: string
): Array<{ key: string; left: number; top: number; lx?: number; ly?: number }> {
  if (school === 'wyckoff') return listWyckoffHotspots(figureId as WyckoffSchematicId);
  if (school === 'elliott') {
    return listElliottHotspots(figureId as Parameters<typeof listElliottHotspots>[0]);
  }
  const map = HOT[`${school}/${figureId}`];
  if (!map) return [];
  return Object.entries(map).map(([key, v]) => ({ key, left: v.left, top: v.top }));
}

export function schoolSchematicHotspot(
  school: ClickableSchool,
  figureId: string,
  key: string
): { left: number; top: number } | null {
  if (school === 'wyckoff') {
    const hit = wyckoffSchematicHotspot(figureId as WyckoffSchematicId, key);
    if (hit) return hit;
    for (const k of WYCKOFF_FALLBACK_KEYS) {
      const alt = wyckoffSchematicHotspot(figureId as WyckoffSchematicId, k);
      if (alt) return alt;
    }
    return null;
  }
  if (school === 'elliott') {
    const id = figureId as Parameters<typeof elliottSchematicHotspot>[0];
    return (
      elliottSchematicHotspot(id, key) ??
      elliottSchematicHotspot(id, '5') ??
      elliottSchematicHotspot(id, '1') ??
      elliottSchematicHotspot(id, 'C')
    );
  }
  const map = HOT[`${school}/${figureId}`];
  if (!map) return null;
  if (map[key]) return map[key]!;
  const first = Object.values(map)[0];
  return first ?? null;
}

export function schoolHint(school: ClickableSchool): string {
  if (school === 'wyckoff') return '교재 도식 위 깜빡임 = 현재 이벤트 근사. 차트 하방 초록 · 상방 빨강. 확정 아님.';
  if (school === 'elliott') return '프렉터식 5+3 · 충격 3규칙 · 피보 관측. 카운트는 추정 · 확정 아님.';
  return '교재 도식과 현재 자리 비교. 휴리스틱 · 확정 카운트·승률 아님.';
}

export function wyckoffToPin(read: MergedDeskWyckoffRead): SchoolSchematicPin {
  const sid = resolveWyckoffSchematicId(read);
  const low =
    read.event === 'ST' ||
    read.event === 'SC' ||
    read.event === 'Spring' ||
    read.event === 'LPS' ||
    read.event === 'SOW' ||
    read.event === 'PS';
  return {
    school: 'wyckoff',
    figureId: sid,
    hotspotKey: resolveWyckoffHotspotKey(read),
    titleEn: read.eventEn || read.eventKo || read.headlineKo,
    headlineKo: read.headlineKo,
    explainKo: [read.detailKo, '국면 A–E는 TR 휴리스틱. 확정 아님.'],
    eventLow: low,
    eventTime: read.eventTime,
    eventPrice: read.eventPrice,
    blinkLabel: read.eventEn || read.eventKo || 'Wyckoff',
  };
}

export function elliottToPin(read: MergedDeskElliottRead): SchoolSchematicPin {
  return {
    school: 'elliott',
    figureId: read.schematicId,
    hotspotKey: elliottHotspotKey(read),
    titleEn: read.waveEn,
    headlineKo: read.headlineKo,
    explainKo: read.explainKo,
    eventLow: read.eventLow,
    eventTime: read.eventTime,
    eventPrice: read.eventPrice,
    blinkLabel: read.waveEn,
  };
}
