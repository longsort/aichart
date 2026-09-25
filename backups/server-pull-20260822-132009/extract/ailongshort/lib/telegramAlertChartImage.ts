/**
 * 서버 텔레 — 캔들·E/SL/TP SVG → PNG (sharp).
 * 조건부 참고용 차트 스냅샷.
 */
import type { Candle } from '@/types';
import { mtfBoardSvgToPngBuffer } from '@/lib/mtfBoardTelegramImage';

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

export function buildTelegramAlertChartSvg(params: {
  symbol: string;
  timeframe: string;
  candles: Candle[];
  levels: TelegramAlertChartLevels;
  direction: 'LONG' | 'SHORT' | 'WAIT';
  kindLabel: string;
}): string {
  const W = 640;
  const H = 360;
  const padL = 56;
  const padR = 12;
  const padT = 44;
  const padB = 28;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;

  const slice = params.candles.slice(-72);
  if (slice.length < 4) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#020617"/><text x="20" y="40" fill="#94a3b8" font-size="14">캔들 부족</text></svg>`;
  }

  const levelPrices = [
    params.levels.entry,
    params.levels.sl,
    params.levels.tp1,
    params.levels.tp2,
    params.levels.tp3,
    params.levels.inv,
  ].filter((n): n is number => n != null && Number.isFinite(n));

  let pMin = Math.min(...slice.map((c) => c.low), ...levelPrices);
  let pMax = Math.max(...slice.map((c) => c.high), ...levelPrices);
  const pad = (pMax - pMin) * 0.08 || pMax * 0.002;
  pMin -= pad;
  pMax += pad;

  const yOf = (p: number) => padT + ((pMax - p) / (pMax - pMin)) * chartH;
  const barW = Math.max(2, chartW / slice.length - 1);

  const lines: string[] = [];
  lines.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">`);
  lines.push(`<rect width="100%" height="100%" fill="#020617"/>`);
  lines.push(
    `<text x="12" y="22" fill="#e2e8f0" font-size="13" font-weight="700" font-family="system-ui,sans-serif">${esc(params.kindLabel)} · ${esc(params.symbol)} ${esc(params.timeframe)}</text>`
  );
  const dirKo = params.direction === 'LONG' ? '롱' : params.direction === 'SHORT' ? '숏' : '—';
  lines.push(
    `<text x="12" y="38" fill="#64748b" font-size="10" font-family="system-ui,sans-serif">${dirKo} · 서버 차트 · 참고용</text>`
  );

  for (let g = 0; g <= 4; g++) {
    const gy = padT + (chartH * g) / 4;
    lines.push(`<line x1="${padL}" y1="${gy}" x2="${W - padR}" y2="${gy}" stroke="#1e293b" stroke-width="1"/>`);
  }

  const drawHLine = (price: number | null, color: string, label: string, dash?: string) => {
    if (price == null || !Number.isFinite(price)) return;
    const y = yOf(price);
    lines.push(
      `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="${color}" stroke-width="1.5"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`
    );
    lines.push(
      `<text x="${W - padR - 4}" y="${y - 3}" fill="${color}" font-size="9" text-anchor="end" font-family="ui-monospace,monospace">${label} ${esc(fmtPx(price))}</text>`
    );
  };

  drawHLine(params.levels.sl, '#f87171', 'SL');
  drawHLine(params.levels.inv && params.levels.inv !== params.levels.sl ? params.levels.inv : null, '#fbbf24', 'INV', '5 3');
  drawHLine(params.levels.entry, '#22d3ee', 'E');
  drawHLine(params.levels.tp1, '#4ade80', 'TP1', '4 3');
  drawHLine(params.levels.tp2, '#86efac', 'TP2', '4 3');
  drawHLine(params.levels.tp3, '#bbf7d0', 'TP3', '4 3');

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
    lines.push(`<rect x="${x}" y="${bodyTop}" width="${barW}" height="${bh}" fill="${color}" opacity="0.9"/>`);
  });

  lines.push(`</svg>`);
  return lines.join('');
}

/** 고확률 롱/숏 진입 zone 터치 알림용 차트 SVG */
export function buildTelegramHqZoneChartSvg(params: {
  symbol: string;
  timeframe: string;
  candles: Candle[];
  zone: { side: 'LONG' | 'SHORT'; labelKo: string; top: number; bot: number; grade: string; score: number };
  currentPrice: number;
}): string {
  const W = 640;
  const H = 360;
  const padL = 56;
  const padR = 12;
  const padT = 44;
  const padB = 28;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;

  const slice = params.candles.slice(-72);
  if (slice.length < 4) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#020617"/><text x="20" y="40" fill="#94a3b8" font-size="14">캔들 부족</text></svg>`;
  }

  let pMin = Math.min(...slice.map((c) => c.low), params.zone.bot, params.currentPrice);
  let pMax = Math.max(...slice.map((c) => c.high), params.zone.top, params.currentPrice);
  const pad = (pMax - pMin) * 0.08 || pMax * 0.002;
  pMin -= pad;
  pMax += pad;

  const yOf = (p: number) => padT + ((pMax - p) / (pMax - pMin)) * chartH;
  const barW = Math.max(2, chartW / slice.length - 1);
  const isLong = params.zone.side === 'LONG';
  const zoneFill = isLong ? 'rgba(34,211,238,0.22)' : 'rgba(248,113,113,0.22)';
  const zoneStroke = isLong ? '#22d3ee' : '#f87171';

  const lines: string[] = [];
  lines.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">`);
  lines.push(`<rect width="100%" height="100%" fill="#020617"/>`);
  lines.push(
    `<text x="12" y="22" fill="#e2e8f0" font-size="13" font-weight="700" font-family="system-ui,sans-serif">${esc(params.zone.labelKo)} · ${esc(params.symbol)} ${esc(params.timeframe)}</text>`
  );
  lines.push(
    `<text x="12" y="38" fill="#64748b" font-size="10" font-family="system-ui,sans-serif">진입존 터치 · 서버 차트 · 참고용(승률 아님)</text>`
  );

  const yTop = yOf(params.zone.top);
  const yBot = yOf(params.zone.bot);
  lines.push(
    `<rect x="${padL}" y="${Math.min(yTop, yBot)}" width="${chartW}" height="${Math.max(2, Math.abs(yBot - yTop))}" fill="${zoneFill}" stroke="${zoneStroke}" stroke-width="1.5"/>`
  );

  for (let g = 0; g <= 4; g++) {
    const gy = padT + (chartH * g) / 4;
    lines.push(`<line x1="${padL}" y1="${gy}" x2="${W - padR}" y2="${gy}" stroke="#1e293b" stroke-width="1"/>`);
  }

  const yPx = yOf(params.currentPrice);
  lines.push(
    `<line x1="${padL}" y1="${yPx}" x2="${W - padR}" y2="${yPx}" stroke="#38bdf8" stroke-width="1.5" stroke-dasharray="4 3"/>`
  );
  lines.push(
    `<text x="${W - padR - 4}" y="${yPx - 3}" fill="#38bdf8" font-size="9" text-anchor="end" font-family="ui-monospace,monospace">NOW ${esc(fmtPx(params.currentPrice))}</text>`
  );
  lines.push(
    `<text x="${padL + 4}" y="${Math.min(yTop, yBot) + 12}" fill="${zoneStroke}" font-size="10" font-weight="700" font-family="system-ui,sans-serif">${esc(params.zone.labelKo)}</text>`
  );

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
    lines.push(`<rect x="${x}" y="${bodyTop}" width="${barW}" height="${bh}" fill="${color}" opacity="0.9"/>`);
  });

  lines.push(`</svg>`);
  return lines.join('');
}

/** 기관밴드·HotZone·안착 터치 알림용 — 구간 면 + 현재가 */
export function buildTelegramZoneTouchChartSvg(params: {
  symbol: string;
  timeframe: string;
  candles: Candle[];
  titleKo: string;
  zone: { top: number; bot: number; labelKo: string; side?: 'LONG' | 'SHORT' | 'WAIT' };
  currentPrice: number;
  extraLines?: Array<{ price: number; color: string; label: string }>;
}): string {
  const W = 640;
  const H = 360;
  const padL = 56;
  const padR = 12;
  const padT = 44;
  const padB = 28;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;

  const slice = params.candles.slice(-72);
  if (slice.length < 4) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#020617"/><text x="20" y="40" fill="#94a3b8" font-size="14">캔들 부족</text></svg>`;
  }

  const extras = (params.extraLines ?? []).map((l) => l.price).filter((n) => Number.isFinite(n));
  let pMin = Math.min(...slice.map((c) => c.low), params.zone.bot, params.currentPrice, ...extras);
  let pMax = Math.max(...slice.map((c) => c.high), params.zone.top, params.currentPrice, ...extras);
  const pad = (pMax - pMin) * 0.08 || pMax * 0.002;
  pMin -= pad;
  pMax += pad;

  const yOf = (p: number) => padT + ((pMax - p) / (pMax - pMin)) * chartH;
  const barW = Math.max(2, chartW / slice.length - 1);
  const side = params.zone.side;
  const zoneFill =
    side === 'LONG' ? 'rgba(34,211,238,0.22)' : side === 'SHORT' ? 'rgba(248,113,113,0.22)' : 'rgba(250,204,21,0.20)';
  const zoneStroke = side === 'LONG' ? '#22d3ee' : side === 'SHORT' ? '#f87171' : '#facc15';

  const lines: string[] = [];
  lines.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">`);
  lines.push(`<rect width="100%" height="100%" fill="#020617"/>`);
  lines.push(
    `<text x="12" y="22" fill="#e2e8f0" font-size="13" font-weight="700" font-family="system-ui,sans-serif">${esc(params.titleKo)} · ${esc(params.symbol)} ${esc(params.timeframe)}</text>`
  );
  lines.push(
    `<text x="12" y="38" fill="#64748b" font-size="10" font-family="system-ui,sans-serif">${esc(params.zone.labelKo)} · 서버 캡처 · 참고용(승률 아님)</text>`
  );

  const yTop = yOf(params.zone.top);
  const yBot = yOf(params.zone.bot);
  lines.push(
    `<rect x="${padL}" y="${Math.min(yTop, yBot)}" width="${chartW}" height="${Math.max(2, Math.abs(yBot - yTop))}" fill="${zoneFill}" stroke="${zoneStroke}" stroke-width="1.5"/>`
  );

  for (let g = 0; g <= 4; g++) {
    const gy = padT + (chartH * g) / 4;
    lines.push(`<line x1="${padL}" y1="${gy}" x2="${W - padR}" y2="${gy}" stroke="#1e293b" stroke-width="1"/>`);
  }

  for (const el of params.extraLines ?? []) {
    if (!(el.price > 0)) continue;
    const y = yOf(el.price);
    lines.push(
      `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="${el.color}" stroke-width="1.4"/>`
    );
    lines.push(
      `<text x="${W - padR - 4}" y="${y - 3}" fill="${el.color}" font-size="9" text-anchor="end" font-family="ui-monospace,monospace">${esc(el.label)} ${esc(fmtPx(el.price))}</text>`
    );
  }

  const yPx = yOf(params.currentPrice);
  lines.push(
    `<line x1="${padL}" y1="${yPx}" x2="${W - padR}" y2="${yPx}" stroke="#38bdf8" stroke-width="1.5" stroke-dasharray="4 3"/>`
  );
  lines.push(
    `<text x="${W - padR - 4}" y="${yPx - 3}" fill="#38bdf8" font-size="9" text-anchor="end" font-family="ui-monospace,monospace">NOW ${esc(fmtPx(params.currentPrice))}</text>`
  );

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
    lines.push(`<rect x="${x}" y="${bodyTop}" width="${barW}" height="${bh}" fill="${color}" opacity="0.9"/>`);
  });

  lines.push(`</svg>`);
  return lines.join('');
}

export async function telegramAlertChartSvgToPng(svg: string): Promise<Buffer | null> {
  return mtfBoardSvgToPngBuffer(svg);
}
