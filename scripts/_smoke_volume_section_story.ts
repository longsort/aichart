/**
 * smoke: 통합모드 거래량 구간 스토리 (흡수·다이버전스·고점소진 포함)
 * npx tsx scripts/_smoke_volume_section_story.ts
 */
import { detectVolumeSectionSpans, buildVolumeSectionStoryMarkers, proVolumeStoryDisplayKo } from '../lib/mergedDeskVolumeSectionStory';
import { buildMergedDeskAdvVolumePack, compactAdvVolBarLabelKo } from '../lib/mergedDeskAdvVolumeRead';
import type { Candle } from '../types';

function mkCandle(
  i: number,
  o: number,
  h: number,
  l: number,
  c: number,
  v: number,
  tb?: number
): Candle {
  return {
    time: 1_700_000_000 + i * 3600,
    open: o,
    high: h,
    low: l,
    close: c,
    volume: v,
    takerBuyBaseVolume: tb ?? (c >= o ? v * 0.62 : v * 0.35),
  } as Candle;
}

/** 하락+거래량증가 → 스윕 → 반등 → 상승 → 고점소진 + 중간 흡수 */
const rows: Candle[] = [];
let px = 100;
for (let i = 0; i < 90; i++) {
  if (i < 30) {
    const next = px - 0.35 - (i % 3) * 0.05;
    rows.push(mkCandle(i, px, px + 0.2, next - 0.15, next, 80 + i * 4, (80 + i * 4) * 0.32));
    px = next;
  } else if (i === 30) {
    const next = px - 1.8;
    rows.push(mkCandle(i, px, px + 0.1, next - 0.4, px - 0.2, 420, 120));
    px = px - 0.2;
  } else if (i === 38) {
    /** 흡수: 고거래량 + 작은 몸통 */
    rows.push(mkCandle(i, px, px + 0.35, px - 0.35, px + 0.02, 380, 190));
  } else if (i < 55) {
    const next = px + 0.45;
    rows.push(mkCandle(i, px, next + 0.2, px - 0.1, next, 140 + (i - 30) * 3, (140 + (i - 30) * 3) * 0.68));
    px = next;
  } else if (i < 75) {
    const next = px + 0.28;
    /** 상승 중 거래량 점점 약화(약세 다이버전스 소지) */
    const v = Math.max(60, 180 - (i - 55) * 6);
    rows.push(mkCandle(i, px, next + 0.35, px - 0.05, next, v, v * 0.55));
    px = next;
  } else if (i === 78) {
    /** 고점 소진: 고RVOL + 윗꼬리 + 매수 약화 */
    rows.push(mkCandle(i, px, px + 1.2, px - 0.1, px - 0.05, 460, 160));
  } else {
    const next = px - 0.15;
    rows.push(mkCandle(i, px, px + 0.1, next - 0.05, next, 110, 40));
    px = next;
  }
}

const spans = detectVolumeSectionSpans(rows, { lookback: 90, maxSpans: 4 });
const marks = buildVolumeSectionStoryMarkers(rows, { lookback: 90, maxSpans: 4 });
const pack = buildMergedDeskAdvVolumePack(rows, { rvolPeriod: 20 });
const storyInPack = (pack.markers || []).filter((m) =>
  ['매도우위', '스윕폭락', '매수유입', '상승지속', '흡수', '약세괴리', '강세괴리', '고점소진'].includes(
    String(m.text || '')
  )
);

console.log(
  JSON.stringify(
    {
      display: spans.map((s) => s.displayKo),
      markTexts: marks.map((m) => m.text),
      dividers: (pack.sectionDividers ?? []).map((d) => `${d.kind}:${d.labelKo}`),
      packStory: storyInPack.map((m) => String(m.text)),
      histOk: pack.sellHist.length > 0 && pack.buyHist.length > 0,
    },
    null,
    2
  )
);

if (spans.length < 2) {
  console.error('FAIL: expected >=2 section spans');
  process.exit(1);
}
if (storyInPack.length < 1) {
  console.error('FAIL: pack missing pro story markers');
  process.exit(1);
}
if (storyInPack.some((m) => String(m.text).length > 5)) {
  /** displayKo 원문은 길 수 있음 — UI는 proVolumeStoryDisplayKo로 축약 */
  const longUi = storyInPack
    .map((m) => proVolumeStoryDisplayKo(String(m.text)))
    .filter((t) => t.length > 5);
  if (longUi.length) {
    console.error('FAIL: display labels too long', longUi);
    process.exit(1);
  }
}
if (!(pack.sellHist.length > 0 && pack.buyHist.length > 0)) {
  console.error('FAIL: hist broken');
  process.exit(1);
}
console.log('OK pro volume labels (짧은 한글·겹침방지)');


