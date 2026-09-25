import type { MtfSignalBoardDigest } from '@/lib/mtfSignalBoardDigest';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function cellRocket(d: MtfSignalBoardDigest): string {
  const lb = d.lastBar;
  const pb = d.prevBar;
  const p: string[] = [];
  if (lb.rocket) p.push('🚀현');
  if (pb.rocket) p.push('🚀전');
  if (p.length) return p.join(' ');
  if (d.rocket) return '🚀·';
  return '·';
}

function cellDelta(d: MtfSignalBoardDigest): string {
  const lb = d.lastBar;
  const pb = d.prevBar;
  const p: string[] = [];
  if (lb.deltaYang) p.push('△양현');
  if (lb.deltaEum) p.push('△음현');
  if (pb.deltaYang) p.push('△양전');
  if (pb.deltaEum) p.push('△음전');
  if (p.length) return p.join(' ');
  if (d.delta) return '△·';
  return '·';
}

function cellJang(d: MtfSignalBoardDigest): string {
  const lb = d.lastBar;
  const pb = d.prevBar;
  const p: string[] = [];
  if (lb.jangEum) p.push('📉현');
  if (pb.jangEum) p.push('📉전');
  if (p.length) return p.join(' ');
  if (d.jangEum) return '📉·';
  return '·';
}

function cellBand(d: MtfSignalBoardDigest): string {
  const lb = d.lastBar;
  const pb = d.prevBar;
  const p: string[] = [];
  if (lb.band) p.push('📊현');
  if (pb.band) p.push('📊전');
  if (p.length) return p.join(' ');
  if (d.band) return '📊·';
  return '·';
}

function cellClosing(d: MtfSignalBoardDigest): string {
  const lb = d.lastBar;
  if (lb.closingShort) return '⟡S현';
  if (lb.closingLong) return '⟡L현';
  if (lb.closingNeutral) return '⟡↔현';
  return '·';
}

function cellLh(d: MtfSignalBoardDigest): string {
  const lb = d.lastBar;
  const pb = d.prevBar;
  const p: string[] = [];
  if (lb.lh) p.push('⚡현');
  if (pb.lh) p.push('⚡전');
  if (p.length) return p.join(' ');
  if (d.lh) return '⚡·';
  return '·';
}

export type MtfBoardSvgRow = { tf: string; digest: MtfSignalBoardDigest };

/** 서버에서 텔레로 보낼 MTF 카드 스타일 PNG 소스(SVG) — 앱 카드와 동일 정보 */
export function buildMtfBoardSvg(params: { symbol: string; rows: MtfBoardSvgRow[] }): string {
  const sym = esc(String(params.symbol || '').toUpperCase());
  const W = 560;
  const H = 300;
  const rowH = 26;
  const startY = 54;
  const lines: string[] = [];
  lines.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">`);
  lines.push(`<rect width="100%" height="100%" fill="#020617"/>`);
  lines.push(
    `<text x="10" y="28" fill="#e2e8f0" font-size="14" font-family="system-ui,Segoe UI,sans-serif" font-weight="700">MTF 신호 (15m→1M) — ${sym}</text>`
  );
  const hdrY = 46;
  const cols = [
    { x: 10, t: 'TF', w: 44 },
    { x: 54, t: '🚀', w: 72 },
    { x: 126, t: '△', w: 92 },
    { x: 218, t: '음장', w: 72 },
    { x: 290, t: '밴드', w: 72 },
    { x: 362, t: '⟡', w: 72 },
    { x: 434, t: 'LH', w: 72 },
  ];
  for (const c of cols) {
    lines.push(
      `<text x="${c.x}" y="${hdrY}" fill="#94a3b8" font-size="10" font-family="system-ui,Segoe UI,sans-serif" font-weight="700">${c.t}</text>`
    );
  }
  lines.push(
    `<line x1="8" y1="${hdrY + 6}" x2="${W - 8}" y2="${hdrY + 6}" stroke="#334155" stroke-width="1"/>`
  );

  const dim = '#475569';
  const lit = '#e2e8f0';
  params.rows.forEach((row, i) => {
    const y = startY + i * rowH;
    const d = row.digest;
    const tf = esc(row.tf);
    lines.push(
      `<text x="10" y="${y}" fill="#cbd5e1" font-size="11" font-family="ui-monospace,Menlo,monospace" font-weight="600">${tf}</text>`
    );
    const cols = [
      { x: 54, text: cellRocket(d), hot: d.lastBar.rocket || d.prevBar.rocket },
      {
        x: 126,
        text: cellDelta(d),
        hot:
          d.lastBar.deltaYang ||
          d.lastBar.deltaEum ||
          d.prevBar.deltaYang ||
          d.prevBar.deltaEum,
      },
      { x: 218, text: cellJang(d), hot: d.lastBar.jangEum || d.prevBar.jangEum },
      { x: 290, text: cellBand(d), hot: d.lastBar.band || d.prevBar.band },
      {
        x: 362,
        text: cellClosing(d),
        hot:
          d.lastBar.closingLong ||
          d.lastBar.closingShort ||
          d.lastBar.closingNeutral,
      },
      { x: 434, text: cellLh(d), hot: d.lastBar.lh || d.prevBar.lh },
    ];
    for (const c of cols) {
      const fill = c.hot ? lit : dim;
      lines.push(
        `<text x="${c.x}" y="${y}" fill="${fill}" font-size="10" font-family="system-ui,Segoe UI,sans-serif">${esc(c.text)}</text>`
      );
    }
  });

  lines.push(
    `<text x="10" y="${H - 14}" fill="#475569" font-size="8" font-family="system-ui,Segoe UI,sans-serif">현=마지막봉 · 전=직전봉 · · =구간만 — 서버 생성 참고용</text>`
  );
  lines.push(`</svg>`);
  return lines.join('');
}

export async function mtfBoardSvgToPngBuffer(svg: string): Promise<Buffer | null> {
  try {
    const sharpMod = await import('sharp');
    const sharp = sharpMod.default;
    return await sharp(Buffer.from(svg, 'utf8')).png().toBuffer();
  } catch (e) {
    console.error('[mtfBoardSvgToPngBuffer]', e);
    return null;
  }
}
