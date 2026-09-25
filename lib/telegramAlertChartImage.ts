/**
 * 서버 텔레 — 캔들·E/SL/TP·MTF 폭락·기관밴드 SVG → PNG (sharp).
 * 앱(통합·분석)과 동일 오버레이 계열. 조건부 참고용.
 */
import type { Candle } from '@/types';
import { mtfBoardSvgToPngBuffer } from '@/lib/mtfBoardTelegramImage';
import type { TelegramMtfZoneBand } from '@/lib/telegramMtfAlertContext';
import {
  filterTelegramPricesToSymbolScale,
  telegramAssetPricePlausible,
  telegramPriceCompatibleWithAnchor,
} from '@/lib/telegramSymbolPriceGuard';

export type { TelegramMtfZoneBand };

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtPx(n: number): string {
  return n >= 1000 ? n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : n.toFixed(2);
}

export type TelegramAlertChartLevels = {
  entry: number | null;
  sl: number | null;
  tp1: number | null;
  tp2: number | null;
  tp3: number | null;
  inv?: number | null;
};

type MergedDeskChartParams = {
  symbol: string;
  timeframe: string;
  candles: Candle[];
  titleKo: string;
  subtitleKo?: string;
  primaryZone?: {
    top: number;
    bot: number;
    labelKo: string;
    side?: 'LONG' | 'SHORT' | 'WAIT';
  };
  mtfZones?: TelegramMtfZoneBand[];
  extraLines?: Array<{ price: number; color: string; label: string }>;
  levels?: TelegramAlertChartLevels;
  currentPrice?: number;
  volumeMarker?: { barIdx: number; side: 'LONG' | 'SHORT' };
};

const CHART_W = 720;
const CHART_H = 420;
const PAD_L = 58;
const PAD_R = 92;
const PAD_T = 48;
const PAD_B = 30;

function buildMergedDeskChartSvgCore(params: MergedDeskChartParams): string {
  const W = CHART_W;
  const H = CHART_H;
  const padL = PAD_L;
  const padR = PAD_R;
  const padT = PAD_T;
  const padB = PAD_B;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;

  const slice = params.candles.slice(-80);
  if (slice.length < 4) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#020617"/><text x="20" y="40" fill="#94a3b8" font-size="14">캔들 부족</text></svg>`;
  }

  const anchorClose = Number(slice[slice.length - 1]!.close) || 0;
  const nowPxRaw = params.currentPrice ?? anchorClose;
  const nowPx =
    telegramAssetPricePlausible(params.symbol, nowPxRaw) &&
    telegramPriceCompatibleWithAnchor(anchorClose || nowPxRaw, nowPxRaw, 1.5)
      ? nowPxRaw
      : anchorClose;

  const levelsSafe = params.levels
    ? {
        entry:
          params.levels.entry != null &&
          telegramPriceCompatibleWithAnchor(nowPx || anchorClose, params.levels.entry)
            ? params.levels.entry
            : null,
        sl:
          params.levels.sl != null &&
          telegramPriceCompatibleWithAnchor(nowPx || anchorClose, params.levels.sl)
            ? params.levels.sl
            : null,
        tp1:
          params.levels.tp1 != null &&
          telegramPriceCompatibleWithAnchor(nowPx || anchorClose, params.levels.tp1)
            ? params.levels.tp1
            : null,
        tp2:
          params.levels.tp2 != null &&
          telegramPriceCompatibleWithAnchor(nowPx || anchorClose, params.levels.tp2)
            ? params.levels.tp2
            : null,
        tp3:
          params.levels.tp3 != null &&
          telegramPriceCompatibleWithAnchor(nowPx || anchorClose, params.levels.tp3)
            ? params.levels.tp3
            : null,
        inv:
          params.levels.inv != null &&
          telegramPriceCompatibleWithAnchor(nowPx || anchorClose, params.levels.inv)
            ? params.levels.inv
            : null,
      }
    : undefined;

  const levelPrices: number[] = [];
  if (levelsSafe) {
    levelPrices.push(
      levelsSafe.entry,
      levelsSafe.sl,
      levelsSafe.tp1,
      levelsSafe.tp2,
      levelsSafe.tp3,
      levelsSafe.inv ?? null
    );
  }
  const extras = filterTelegramPricesToSymbolScale(
    params.symbol,
    nowPx || anchorClose,
    params.extraLines ?? [],
    (l) => l.price
  ).map((l) => l.price);
  const mtfZones = filterTelegramPricesToSymbolScale(
    params.symbol,
    nowPx || anchorClose,
    params.mtfZones ?? [],
    (z) => (z.top + z.bot) / 2
  );
  const primaryZone =
    params.primaryZone &&
    telegramPriceCompatibleWithAnchor(nowPx || anchorClose, (params.primaryZone.top + params.primaryZone.bot) / 2)
      ? params.primaryZone
      : undefined;
  const zonePrices = primaryZone ? [primaryZone.top, primaryZone.bot] : [];
  const mtfPrices = mtfZones.flatMap((z) => [z.top, z.bot]);

  let pMin = Math.min(
    ...slice.map((c) => c.low),
    nowPx,
    ...levelPrices.filter((n): n is number => n != null && Number.isFinite(n)),
    ...extras.filter((n) => Number.isFinite(n)),
    ...mtfPrices.filter((n) => Number.isFinite(n)),
    ...zonePrices
  );
  let pMax = Math.max(
    ...slice.map((c) => c.high),
    nowPx,
    ...levelPrices.filter((n): n is number => n != null && Number.isFinite(n)),
    ...extras.filter((n) => Number.isFinite(n)),
    ...mtfPrices.filter((n) => Number.isFinite(n)),
    ...zonePrices
  );
  const pad = (pMax - pMin) * 0.07 || pMax * 0.002;
  pMin -= pad;
  pMax += pad;

  const yOf = (p: number) => padT + ((pMax - p) / (pMax - pMin)) * chartH;
  const barW = Math.max(2, chartW / slice.length - 1);
  const sliceStart = params.candles.length - slice.length;

  const lines: string[] = [];
  lines.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">`);
  lines.push(`<rect width="100%" height="100%" fill="#020617"/>`);
  lines.push(
    `<text x="12" y="24" fill="#e2e8f0" font-size="14" font-weight="700" font-family="system-ui,sans-serif">${esc(params.titleKo)} · ${esc(params.symbol)} ${esc(params.timeframe)}</text>`
  );
  lines.push(
    `<text x="12" y="42" fill="#64748b" font-size="10" font-family="system-ui,sans-serif">${esc(params.subtitleKo || '통합·분석 · MTF 폭락·기관밴드 · 참고용')}</text>`
  );

  for (let g = 0; g <= 4; g++) {
    const gy = padT + (chartH * g) / 4;
    const gp = pMax - ((pMax - pMin) * g) / 4;
    lines.push(`<line x1="${padL}" y1="${gy}" x2="${W - padR}" y2="${gy}" stroke="#1e293b" stroke-width="1"/>`);
    lines.push(
      `<text x="${padL - 4}" y="${gy + 3}" fill="#475569" font-size="8" text-anchor="end" font-family="ui-monospace,monospace">${esc(fmtPx(gp))}</text>`
    );
  }

  /** MTF 폭락 밴드 — 캔들 뒤 */
  for (const z of mtfZones) {
    if (!(z.top > 0) || !(z.bot > 0)) continue;
    const yTop = yOf(z.top);
    const yBot = yOf(z.bot);
    const y0 = Math.min(yTop, yBot);
    const h = Math.max(2, Math.abs(yBot - yTop));
    const op = z.primary ? 0.28 : 0.18;
    lines.push(
      `<rect x="${padL}" y="${y0}" width="${chartW}" height="${h}" fill="${z.fill}" stroke="${z.stroke}" stroke-width="${z.primary ? 2 : 1.2}" opacity="${op}"/>`
    );
    lines.push(
      `<text x="${W - padR - 6}" y="${y0 + 11}" fill="${z.stroke}" font-size="8" font-weight="700" text-anchor="end" font-family="system-ui,sans-serif">${esc(z.labelKo.slice(0, 28))}</text>`
    );
    lines.push(
      `<text x="${W - padR - 6}" y="${y0 + h - 3}" fill="#fef08a" font-size="7" text-anchor="end" font-family="ui-monospace,monospace">${esc(fmtPx(z.top))}</text>`
    );
  }

  /** 주 터치 구간 */
  if (primaryZone) {
    const side = primaryZone.side;
    const zoneFill =
      side === 'LONG'
        ? 'rgba(34,211,238,0.28)'
        : side === 'SHORT'
          ? 'rgba(248,113,113,0.28)'
          : 'rgba(250,204,21,0.24)';
    const zoneStroke = side === 'LONG' ? '#22d3ee' : side === 'SHORT' ? '#f87171' : '#facc15';
    const yTop = yOf(primaryZone.top);
    const yBot = yOf(primaryZone.bot);
    lines.push(
      `<rect x="${padL}" y="${Math.min(yTop, yBot)}" width="${chartW}" height="${Math.max(2, Math.abs(yBot - yTop))}" fill="${zoneFill}" stroke="${zoneStroke}" stroke-width="2.5"/>`
    );
    lines.push(
      `<text x="${padL + 6}" y="${Math.min(yTop, yBot) + 14}" fill="${zoneStroke}" font-size="10" font-weight="700" font-family="system-ui,sans-serif">${esc(primaryZone.labelKo.slice(0, 32))}</text>`
    );
  }

  const drawHLine = (price: number | null, color: string, label: string, dash?: string, w = 1.5) => {
    if (price == null || !Number.isFinite(price)) return;
    const y = yOf(price);
    lines.push(
      `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="${color}" stroke-width="${w}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`
    );
    lines.push(
      `<text x="${W - padR - 4}" y="${y - 3}" fill="${color}" font-size="9" text-anchor="end" font-family="ui-monospace,monospace">${label} ${esc(fmtPx(price))}</text>`
    );
  };

  const safeExtraLines = filterTelegramPricesToSymbolScale(
    params.symbol,
    nowPx || anchorClose,
    params.extraLines ?? [],
    (l) => l.price
  );
  for (const el of safeExtraLines) {
    if (!(el.price > 0)) continue;
    drawHLine(el.price, el.color, el.label);
  }

  if (levelsSafe) {
    drawHLine(levelsSafe.sl, '#f87171', 'SL');
    drawHLine(
      levelsSafe.inv && levelsSafe.inv !== levelsSafe.sl ? levelsSafe.inv : null,
      '#fbbf24',
      'INV',
      '5 3'
    );
    drawHLine(levelsSafe.entry, '#22d3ee', 'E', undefined, 2);
    drawHLine(levelsSafe.tp1, '#4ade80', 'TP1', '4 3');
    drawHLine(levelsSafe.tp2, '#86efac', 'TP2', '4 3');
    drawHLine(levelsSafe.tp3, '#bbf7d0', 'TP3', '4 3');
  }

  /** 캔들 */
  slice.forEach((c, i) => {
    const x = padL + i * (chartW / slice.length);
    const bull = c.close >= c.open;
    const color = bull ? '#22c55e' : '#ef4444';
    const bodyTop = yOf(Math.max(c.open, c.close));
    const bodyBot = yOf(Math.min(c.open, c.close));
    const wickTop = yOf(c.high);
    const wickBot = yOf(c.low);
    const cx = x + barW / 2;
    lines.push(`<line x1="${cx}" y1="${wickTop}" x2="${cx}" y2="${wickBot}" stroke="${color}" stroke-width="1"/>`);
    const bh = Math.max(1, bodyBot - bodyTop);
    lines.push(`<rect x="${x}" y="${bodyTop}" width="${barW}" height="${bh}" fill="${color}" opacity="0.92"/>`);
  });

  /** 거래량 빅롱/숏 마커 */
  if (params.volumeMarker) {
    const relIdx = params.volumeMarker.barIdx - sliceStart;
    if (relIdx >= 0 && relIdx < slice.length) {
      const x = padL + relIdx * (chartW / slice.length) + barW / 2;
      const c = slice[relIdx]!;
      const y = yOf(params.volumeMarker.side === 'LONG' ? c.low : c.high);
      const dy = params.volumeMarker.side === 'LONG' ? 8 : -8;
      const fill = params.volumeMarker.side === 'LONG' ? '#22d3ee' : '#f87171';
      lines.push(
        `<polygon points="${x},${y + dy} ${x - 5},${y + dy * 2.2} ${x + 5},${y + dy * 2.2}" fill="${fill}"/>`
      );
    }
  }

  const yPx = yOf(nowPx);
  lines.push(
    `<line x1="${padL}" y1="${yPx}" x2="${W - padR}" y2="${yPx}" stroke="#38bdf8" stroke-width="1.8" stroke-dasharray="4 3"/>`
  );
  lines.push(
    `<text x="${W - padR - 4}" y="${yPx - 4}" fill="#38bdf8" font-size="9" font-weight="700" text-anchor="end" font-family="ui-monospace,monospace">NOW ${esc(fmtPx(nowPx))}</text>`
  );

  lines.push(`</svg>`);
  return lines.join('');
}

export function buildTelegramAlertChartSvg(params: {
  symbol: string;
  timeframe: string;
  candles: Candle[];
  levels: TelegramAlertChartLevels;
  direction: 'LONG' | 'SHORT' | 'WAIT';
  kindLabel: string;
  mtfZones?: TelegramMtfZoneBand[];
  extraLines?: Array<{ price: number; color: string; label: string }>;
}): string {
  const dirKo = params.direction === 'LONG' ? '롱' : params.direction === 'SHORT' ? '숏' : '—';
  return buildMergedDeskChartSvgCore({
    symbol: params.symbol,
    timeframe: params.timeframe,
    candles: params.candles,
    titleKo: params.kindLabel,
    subtitleKo: `${dirKo} · E/SL/TP · MTF 폭락 · 참고용`,
    levels: params.levels,
    mtfZones: params.mtfZones,
    extraLines: params.extraLines,
    currentPrice: params.candles[params.candles.length - 1]?.close,
  });
}

export function buildTelegramHqZoneChartSvg(params: {
  symbol: string;
  timeframe: string;
  candles: Candle[];
  zone: { side: 'LONG' | 'SHORT'; labelKo: string; top: number; bot: number; grade: string; score: number };
  currentPrice: number;
  mtfZones?: TelegramMtfZoneBand[];
  extraLines?: Array<{ price: number; color: string; label: string }>;
}): string {
  return buildMergedDeskChartSvgCore({
    symbol: params.symbol,
    timeframe: params.timeframe,
    candles: params.candles,
    titleKo: params.zone.labelKo,
    subtitleKo: `진입존 터치 · ${params.zone.grade} · 참고용`,
    primaryZone: {
      top: params.zone.top,
      bot: params.zone.bot,
      labelKo: params.zone.labelKo,
      side: params.zone.side,
    },
    currentPrice: params.currentPrice,
    mtfZones: params.mtfZones,
    extraLines: params.extraLines,
  });
}

export function buildTelegramZoneTouchChartSvg(params: {
  symbol: string;
  timeframe: string;
  candles: Candle[];
  titleKo: string;
  zone: { top: number; bot: number; labelKo: string; side?: 'LONG' | 'SHORT' | 'WAIT' };
  currentPrice: number;
  extraLines?: Array<{ price: number; color: string; label: string }>;
  mtfZones?: TelegramMtfZoneBand[];
  levels?: TelegramAlertChartLevels;
  volumeMarker?: { barIdx: number; side: 'LONG' | 'SHORT' };
  subtitleKo?: string;
}): string {
  return buildMergedDeskChartSvgCore({
    symbol: params.symbol,
    timeframe: params.timeframe,
    candles: params.candles,
    titleKo: params.titleKo,
    subtitleKo: params.subtitleKo,
    primaryZone: {
      top: params.zone.top,
      bot: params.zone.bot,
      labelKo: params.zone.labelKo,
      side: params.zone.side,
    },
    currentPrice: params.currentPrice,
    extraLines: params.extraLines,
    mtfZones: params.mtfZones,
    levels: params.levels,
    volumeMarker: params.volumeMarker,
  });
}

export async function telegramAlertChartSvgToPng(svg: string): Promise<Buffer | null> {
  return mtfBoardSvgToPngBuffer(svg);
}
