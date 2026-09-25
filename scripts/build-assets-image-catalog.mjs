#!/usr/bin/env node
/**
 * assets 353 이미지 — 경로·카테고리·파일명 기반 구조 분석 + drawTemplate 생성.
 * overlays/img*.json 보강 + data/assets-image-catalog.json 출력.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const MANIFEST = path.join(ROOT, 'assets', '_manifest.json');
const OVERLAYS_DIR = path.join(ROOT, 'assets', 'overlays');
const OUT_CATALOG = path.join(ROOT, 'data', 'assets-image-catalog.json');

const CHARTABLE_CATEGORIES = new Set([
  'smc_candle',
  'tv_chart',
  'edu_forex',
  'harmonic',
  'chinese_chart',
  'screenshot',
]);

function inferFromText(text) {
  const p = String(text || '').toLowerCase();
  const tags = [];
  const f = {
    bos: false,
    choch: false,
    fvg: 0,
    ob: 0,
    sweep: false,
    eqh: false,
    eql: false,
    pattern: '',
    bias: 'neutral',
  };

  const hit = (re, tag) => {
    if (re.test(p)) tags.push(tag);
  };

  if (/bos|break of structure|구조돌파/.test(p)) {
    f.bos = true;
    hit(/bos/, 'bos');
  }
  if (/choch|ch\+|ch-|character change|구조전환/.test(p)) {
    f.choch = true;
    hit(/choch/, 'choch');
  }
  if (/fvg|fair value|이격/.test(p)) {
    f.fvg = 1;
    hit(/fvg/, 'fvg');
  }
  if (/\bob\b|order block|오더블럭|orderblock/.test(p)) {
    f.ob = 1;
    hit(/ob/, 'ob');
  }
  if (/sweep|liquidity|유동성|털/.test(p)) {
    f.sweep = true;
    hit(/sweep/, 'sweep');
  }
  if (/eqh|equal high/.test(p)) {
    f.eqh = true;
    hit(/eqh/, 'eqh');
  }
  if (/eql|equal low/.test(p)) {
    f.eql = true;
    hit(/eql/, 'eql');
  }

  if (/double top|이중천장|double-top|더블탑|m pattern/.test(p)) {
    f.pattern = 'double_top';
    f.bias = 'bearish';
    hit(/double/, 'double_top');
  } else if (/double bottom|이중바닥|double-bottom|더블바닥|w pattern/.test(p)) {
    f.pattern = 'double_bottom';
    f.bias = 'bullish';
    hit(/double/, 'double_bottom');
  } else if (/head.and.shoulder|헤드앤숄더|头肩/.test(p)) {
    f.pattern = 'head_shoulders';
    f.bias = 'bearish';
    hit(/hs/, 'head_shoulders');
  } else if (/inverse.head|역헤드/.test(p)) {
    f.pattern = 'inverse_hs';
    f.bias = 'bullish';
  } else if (/bull flag|상승깃발|bullflag/.test(p)) {
    f.pattern = 'bull_flag';
    f.bias = 'bullish';
  } else if (/bear flag|하락깃발|bearflag/.test(p)) {
    f.pattern = 'bear_flag';
    f.bias = 'bearish';
  } else if (/rising wedge|상승쐐기|risingwedge/.test(p)) {
    f.pattern = 'rising_wedge';
    f.bias = 'bearish';
  } else if (/falling wedge|하락쐐기|fallingwedge|wedge/.test(p)) {
    f.pattern = 'falling_wedge';
    f.bias = 'bullish';
    hit(/wedge/, 'wedge');
  } else if (/ascending triangle|상승삼각/.test(p)) {
    f.pattern = 'asc_triangle';
    f.bias = 'bullish';
  } else if (/descending triangle|하락삼각/.test(p)) {
    f.pattern = 'desc_triangle';
    f.bias = 'bearish';
  } else if (/symmetrical|대칭삼각|triangle|삼각/.test(p)) {
    f.pattern = 'triangle';
    hit(/triangle/, 'triangle');
  } else if (/harmonic|gartley|bat|butterfly|crab|xabcd|fib/.test(p)) {
    f.pattern = 'harmonic';
    hit(/harmonic/, 'harmonic');
  } else if (/flag|깃발/.test(p)) {
    f.pattern = 'flag';
    hit(/flag/, 'flag');
  } else if (/channel|채널/.test(p)) {
    f.pattern = 'channel';
    hit(/channel/, 'channel');
  }

  if (/long|롱|bull|상승|매수/.test(p) && f.bias === 'neutral') f.bias = 'bullish';
  if (/short|숏|bear|하락|매도/.test(p) && f.bias === 'neutral') f.bias = 'bearish';

  return { structureFeatures: f, tags: [...new Set(tags)] };
}

function categoryDefaults(category) {
  const f = {
    bos: false,
    choch: false,
    fvg: 0,
    ob: 0,
    sweep: false,
    eqh: false,
    eql: false,
    pattern: '',
    bias: 'neutral',
  };
  const tags = [category];

  switch (category) {
    case 'smc_candle':
      f.bos = true;
      f.choch = true;
      f.fvg = 1;
      f.ob = 1;
      f.sweep = true;
      tags.push('smc', 'bos', 'choch', 'fvg', 'ob');
      break;
    case 'tv_chart':
      f.bos = true;
      f.fvg = 1;
      tags.push('tv', 'btc');
      break;
    case 'edu_forex':
      f.pattern = 'pattern';
      tags.push('edu', 'pattern');
      break;
    case 'harmonic':
      f.pattern = 'harmonic';
      tags.push('harmonic', 'xabcd');
      break;
    case 'chinese_chart':
      f.bos = true;
      f.choch = true;
      f.ob = 1;
      f.fvg = 1;
      tags.push('smc', 'chinese');
      break;
    case 'screenshot':
      tags.push('screenshot');
      break;
    default:
      break;
  }
  return { structureFeatures: f, tags };
}

function buildDrawTemplate(category, structureFeatures, overlayJson) {
  const sf = structureFeatures;
  const elements = [];

  if (overlayJson?.harmonicPrzLines?.length) {
    for (const [i, line] of overlayJson.harmonicPrzLines.entries()) {
      if (line?.price != null) {
        elements.push({ type: 'hline', role: 'prz', price: line.price, label: line.label || `PRZ${i + 1}` });
      }
    }
    return { mode: 'absolute_prices', elements };
  }

  if (overlayJson?.supportLines?.length || overlayJson?.resistanceLines?.length) {
    for (const s of overlayJson.supportLines || []) {
      if (s?.price != null) elements.push({ type: 'hline', role: 'support', price: s.price, label: s.label || 'SUP' });
    }
    for (const r of overlayJson.resistanceLines || []) {
      if (r?.price != null) elements.push({ type: 'hline', role: 'resistance', price: r.price, label: r.label || 'RES' });
    }
    if (overlayJson.target != null) {
      elements.push({ type: 'hline', role: 'target', price: overlayJson.target, label: 'TP' });
    }
    if (elements.length) return { mode: 'absolute_prices', elements };
  }

  if (sf.pattern === 'double_top' || sf.pattern === 'head_shoulders') {
    elements.push(
      { type: 'zone', role: 'supply', pricePctTop: 0.12, pricePctBot: 0.22, timePctStart: 0.35, timePctEnd: 1 },
      { type: 'hline', role: 'neckline', pricePct: 0.28, label: 'Neck' }
    );
  } else if (sf.pattern === 'double_bottom' || sf.pattern === 'inverse_hs') {
    elements.push(
      { type: 'zone', role: 'demand', pricePctTop: 0.78, pricePctBot: 0.88, timePctStart: 0.35, timePctEnd: 1 },
      { type: 'hline', role: 'neckline', pricePct: 0.72, label: 'Neck' }
    );
  } else if (sf.pattern === 'bull_flag' || sf.pattern === 'bear_flag' || sf.pattern === 'flag') {
    elements.push(
      { type: 'zone', role: 'flag', pricePctTop: 0.35, pricePctBot: 0.55, timePctStart: 0.5, timePctEnd: 1 },
      { type: 'hline', role: 'breakout', pricePct: 0.32, label: 'BO' }
    );
  } else if (sf.pattern?.includes('wedge')) {
    elements.push(
      { type: 'trend', role: 'wedge_top', pricePctStart: 0.2, pricePctEnd: 0.35, timePctStart: 0.3, timePctEnd: 1 },
      { type: 'trend', role: 'wedge_bot', pricePctStart: 0.45, pricePctEnd: 0.5, timePctStart: 0.3, timePctEnd: 1 }
    );
  } else if (category === 'smc_candle' || category === 'chinese_chart') {
    elements.push(
      { type: 'zone', role: 'demand', pricePctTop: 0.62, pricePctBot: 0.72, timePctStart: 0.55, timePctEnd: 1 },
      { type: 'zone', role: 'supply', pricePctTop: 0.18, pricePctBot: 0.28, timePctStart: 0.55, timePctEnd: 1 },
      { type: 'hline', role: 'bos', pricePct: 0.45, label: 'BOS' }
    );
    if (sf.choch) elements.push({ type: 'hline', role: 'choch', pricePct: 0.52, label: 'CH' });
  } else if (category === 'tv_chart') {
    elements.push(
      { type: 'zone', role: 'demand', pricePctTop: 0.68, pricePctBot: 0.78, timePctStart: 0.6, timePctEnd: 1 },
      { type: 'hline', role: 'entry', pricePct: 0.65, label: 'Entry' },
      { type: 'hline', role: 'stop', pricePct: 0.82, label: 'SL' },
      { type: 'hline', role: 'target', pricePct: 0.42, label: 'TP' }
    );
  } else if (sf.pattern === 'harmonic') {
    elements.push(
      { type: 'zone', role: 'prz', pricePctTop: 0.48, pricePctBot: 0.54, timePctStart: 0.7, timePctEnd: 1 },
      { type: 'hline', role: 'target', pricePct: 0.35, label: 'TP' }
    );
  } else {
    elements.push(
      { type: 'zone', role: 'demand', pricePctTop: 0.65, pricePctBot: 0.75, timePctStart: 0.5, timePctEnd: 1 },
      { type: 'zone', role: 'supply', pricePctTop: 0.2, pricePctBot: 0.3, timePctStart: 0.5, timePctEnd: 1 }
    );
  }

  return { mode: 'relative', elements };
}

function titleKo(category, sf, pathStr) {
  const base = path.basename(pathStr, path.extname(pathStr));
  if (sf.pattern === 'double_top') return '이중 천장 참조';
  if (sf.pattern === 'double_bottom') return '이중 바닥 참조';
  if (sf.pattern === 'bull_flag') return '상승 깃발 참조';
  if (sf.pattern === 'bear_flag') return '하락 깃발 참조';
  if (sf.pattern?.includes('wedge')) return '쐐기 패턴 참조';
  if (sf.pattern === 'harmonic') return '하모닉 참조';
  if (category === 'smc_candle') return 'SMC 구조 참조';
  if (category === 'tv_chart') return 'TV 차트 참조';
  return `${base.slice(0, 24)} 참조`;
}

function main() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  const entries = [];
  let chartableCount = 0;

  for (const e of manifest.entries) {
    const id = e.id;
    const overlayPath = path.join(OVERLAYS_DIR, `${id}.json`);
    let overlayJson = {};
    if (fs.existsSync(overlayPath)) {
      try {
        overlayJson = JSON.parse(fs.readFileSync(overlayPath, 'utf8'));
      } catch {
        overlayJson = {};
      }
    }

    const text = `${e.path} ${e.category} ${overlayJson.source || ''}`;
    const inferred = inferFromText(text);
    const defaults = categoryDefaults(e.category);

    const structureFeatures = { ...defaults.structureFeatures };
    for (const [k, v] of Object.entries(inferred.structureFeatures)) {
      if (k === 'fvg' || k === 'ob') {
        structureFeatures[k] = Math.max(structureFeatures[k] || 0, v || 0);
      } else if (typeof v === 'boolean' && v) {
        structureFeatures[k] = true;
      } else if (typeof v === 'string' && v) {
        structureFeatures[k] = v;
      }
    }

    const tags = [...new Set([...defaults.tags, ...inferred.tags, ...(e.tags || [])])];
    const chartable = CHARTABLE_CATEGORIES.has(e.category);
    if (chartable) chartableCount += 1;

    const drawTemplate = chartable
      ? buildDrawTemplate(e.category, structureFeatures, overlayJson)
      : null;

    const catalogEntry = {
      id,
      path: e.path,
      category: e.category,
      chartable,
      titleKo: titleKo(e.category, structureFeatures, e.path),
      tags,
      structureFeatures,
      drawTemplate,
    };
    entries.push(catalogEntry);

    const enriched = {
      ...overlayJson,
      catalogId: id,
      category: e.category,
      chartable,
      titleKo: catalogEntry.titleKo,
      tags,
      structureFeatures,
      drawTemplate,
      analyzedAt: new Date().toISOString().slice(0, 10),
    };
    fs.writeFileSync(overlayPath, JSON.stringify(enriched, null, 2) + '\n', 'utf8');
  }

  const catalog = {
    version: 1,
    total: entries.length,
    chartable: chartableCount,
    generatedAt: new Date().toISOString(),
    entries,
  };

  fs.mkdirSync(path.dirname(OUT_CATALOG), { recursive: true });
  fs.writeFileSync(OUT_CATALOG, JSON.stringify(catalog, null, 2) + '\n', 'utf8');

  console.log(`Catalog: ${entries.length} images, ${chartableCount} chartable → ${OUT_CATALOG}`);
}

main();
