/**
 * 텔레그램 전황 브리핑 — **엔진이 실제로 산출한 값만** 표시.
 * 없는 필드는 줄 자체를 생략 (창작·가짜 승률·가짜 LIVE 금지).
 * 조건부 참고 — 확정 매매·수익 보장 아님.
 */
import { escapeTelegramHtml, tgHighlight, tgPrice } from '@/lib/telegramFormatHtml';
import type { TradeConfirmDesk } from '@/lib/tradeConfirmDesk';
import type { MtfDumpZoneSpec } from '@/lib/mergedDeskMtfDumpZoneBridge';
import type { DumpSupportResistPath } from '@/lib/mergedDeskDumpSupportResistPath';
import type { WhaleBeamIntelPack } from '@/lib/whaleVolumeBeamIntel';
import {
  sanitizeTelegramPrice,
  sanitizeTelegramTradeLevels,
} from '@/lib/telegramSymbolPriceGuard';

export type RealBattleLevels = {
  entry: number | null;
  sl: number | null;
  tp1: number | null;
  tp2: number | null;
  tp3: number | null;
  inv: number | null;
  sourceKo?: string | null;
};

export type RealBattleBriefInput = {
  symbol: string;
  timeframe: string;
  price: number;
  /** 확정/무효/타점 등 — 서버가 실제로 낸 종류만 */
  kindTitleKo?: string | null;
  desk?: TradeConfirmDesk | null;
  levels?: RealBattleLevels | null;
  dumpZones?: MtfDumpZoneSpec[] | null;
  srPath?: DumpSupportResistPath | null;
  whale?: WhaleBeamIntelPack | null;
  swing?: {
    stance: string;
    side: 'LONG' | 'SHORT' | 'WAIT' | string;
    confluence?: number;
    grade?: string;
    entryLow?: number;
    entryHigh?: number;
    whereKo?: string | null;
  } | null;
  /** 기록부·분석 집계 문구가 있을 때만 (창작 금지) */
  learningLine?: string | null;
  riskLine?: string | null;
  serverAuto?: boolean;
};

type MapRow = { price: number; priceHi?: number; label: string; emoji: string };

function fmtPx(n: number): string {
  if (!(n > 0) || !Number.isFinite(n)) return '—';
  return n >= 1000 ? n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : n.toFixed(2);
}

function stanceFromDesk(p: RealBattleBriefInput): {
  emoji: string;
  title: string;
  action: string;
} {
  const phase = p.desk?.phase;
  const dir = p.desk?.direction;
  if (phase === 'invalid') {
    return { emoji: '⚠', title: '무효 이탈 · 재검토', action: '⏸ WAIT' };
  }
  if (dir === 'LONG' && (phase === 'at_entry' || phase === 'confirmed' || phase === 'confirmed_full')) {
    return {
      emoji: '🟢',
      title: `롱 · ${p.desk?.phaseKo || '관찰'}`,
      action: phase === 'at_entry' ? '▶ 타점 구간' : '⏸ 자리 대기 · 추격 확인',
    };
  }
  if (dir === 'SHORT' && (phase === 'at_entry' || phase === 'confirmed' || phase === 'confirmed_full')) {
    return {
      emoji: '🔴',
      title: `숏 · ${p.desk?.phaseKo || '관찰'}`,
      action: phase === 'at_entry' ? '▶ 타점 구간' : '⏸ 자리 대기 · 추격 확인',
    };
  }
  if (p.swing?.stance?.startsWith('ENTER')) {
    const side = p.swing.side === 'LONG' ? '롱' : p.swing.side === 'SHORT' ? '숏' : '관찰';
    return {
      emoji: p.swing.side === 'LONG' ? '🟢' : p.swing.side === 'SHORT' ? '🔴' : '⚪',
      title: `스윙중투 ${side} · ${p.swing.stance}`,
      action: '⏸ 자리 확인',
    };
  }
  return { emoji: '⚪', title: p.desk?.phaseKo || '관망', action: '⏸ WAIT' };
}

/** 실제 존·레벨만 모아 가격 내림차순 지도 */
function buildPriceMap(p: RealBattleBriefInput, anchor: number): MapRow[] {
  const rows: MapRow[] = [];
  const push = (price: number | null | undefined, label: string, emoji: string, priceHi?: number) => {
    const ok = sanitizeTelegramPrice(p.symbol, anchor, price);
    if (ok == null) return;
    const hi = priceHi != null ? sanitizeTelegramPrice(p.symbol, anchor, priceHi) : null;
    rows.push({ price: ok, priceHi: hi ?? undefined, label, emoji });
  };

  push(p.price, 'NOW', '💰');

  const lv = sanitizeTelegramTradeLevels(p.symbol, anchor, p.levels ?? undefined);
  if (lv.entry) push(lv.entry, `타점E · ${p.levels?.sourceKo || '데스크'}`, '⚔️');
  if (lv.sl) push(lv.sl, '손절·방어', '🛑');
  if (lv.inv) push(lv.inv, '무효선', '🔵');
  if (lv.tp1) push(lv.tp1, 'TP1', '🎯');
  if (lv.tp2) push(lv.tp2, 'TP2', '🎯');
  if (lv.tp3) push(lv.tp3, 'TP3', '🎯');

  if (p.swing?.entryLow && p.swing?.entryHigh) {
    const lo = Math.min(p.swing.entryLow, p.swing.entryHigh);
    const hi = Math.max(p.swing.entryLow, p.swing.entryHigh);
    push(lo, '스윙 ★타점 구간', '⚔️', hi);
  }

  for (const z of p.dumpZones ?? []) {
    if (!(z.top > 0) && !(z.bot > 0)) continue;
    const lo = Math.min(z.top, z.bot);
    const hi = Math.max(z.top, z.bot);
    const role =
      z.bandRole === 'ceiling'
        ? '저항·매도감시'
        : z.bandRole === 'floor'
          ? '지지·방어'
          : '폭락구간';
    const life = z.viewModel?.lifeKo || z.viewModel?.faceRoleKo || '';
    const sr = z.viewModel?.sr?.labelKo || '';
    const tf = z.sourceTfKo || z.sourceTf;
    const label = [tf, role, life, sr].filter(Boolean).join(' · ');
    push(lo, label.slice(0, 42), z.bandRole === 'ceiling' ? '🔴' : '🟢', hi);
  }

  if (p.srPath?.supportPrice) {
    push(p.srPath.supportPrice, `주경로 지지${p.srPath.supportFirm ? '·확실' : ''}`, '🟢');
  }
  if (p.srPath?.bounceLimitPrice) {
    push(p.srPath.bounceLimitPrice, '반등한도', '🟠');
  }
  if (p.srPath?.resistPrice) {
    push(p.srPath.resistPrice, `주경로 저항${p.srPath.resistFirm ? '·확실' : ''}`, '🔴');
  }
  if (p.srPath?.invalidationPrice) {
    push(p.srPath.invalidationPrice, '경로 무효', '🔵');
  }

  /** 고래 빔 진입·목표 — 팩에 있을 때만 */
  const live = p.whale?.live;
  if (live?.entryPrice) {
    push(live.entryPrice, `고래 ${live.beamKo} 진입참고`, live.beamKo === '숏빔' ? '🔴' : '🟢');
  }
  if (live?.targetPrice) {
    push(live.targetPrice, `고래 ${live.beamKo} 목표참고`, '🎯');
  }

  rows.sort((a, b) => b.price - a.price);
  /** 가격 근접 중복 압축 */
  const out: MapRow[] = [];
  for (const r of rows) {
    const near = out.find((x) => Math.abs(x.price - r.price) / Math.max(r.price, 1) < 0.0008);
    if (near) {
      if (!near.label.includes(r.label.slice(0, 8))) {
        near.label = `${near.label} / ${r.label}`.slice(0, 56);
      }
      continue;
    }
    out.push(r);
    if (out.length >= 10) break;
  }
  return out;
}

function formatMapRow(r: MapRow): string {
  const px =
    r.priceHi != null && Math.abs(r.priceHi - r.price) / Math.max(r.price, 1) > 0.0005
      ? `${fmtPx(Math.min(r.price, r.priceHi))}~${fmtPx(Math.max(r.price, r.priceHi))}`
      : fmtPx(r.price);
  return `${r.emoji} <code>${escapeTelegramHtml(px)}</code>  ${escapeTelegramHtml(r.label)}`;
}

function levelsOneLine(
  symbol: string,
  anchor: number,
  side: 'LONG' | 'SHORT',
  levels: RealBattleLevels | null | undefined
): string | null {
  const scrub = sanitizeTelegramTradeLevels(symbol, anchor, levels ?? undefined);
  if (!scrub.entry || !scrub.sl) return null;
  const bits = [
    `진입 ${fmtPx(scrub.entry)}`,
    `손절 ${fmtPx(scrub.sl)}`,
  ];
  if (scrub.tp1) bits.push(`목표 ${fmtPx(scrub.tp1)}`);
  if (scrub.tp2) bits.push(fmtPx(scrub.tp2));
  if (scrub.tp3) bits.push(fmtPx(scrub.tp3));
  return `${side === 'LONG' ? '🟢' : '🔴'} ${bits.join(' / ')}`;
}

/**
 * 실제 분석만 담은 HTML. 통합·폭락존 전황 카드 형식.
 * 데이터 없으면 해당 섹션 생략.
 */
export function formatTelegramRealBattleBriefHtml(p: RealBattleBriefInput): string {
  const anchor = sanitizeTelegramPrice(p.symbol, p.price, p.price) ?? p.price;
  if (!(anchor > 0)) {
    return `<i>가격 검증 실패 · 알림 생략</i>`;
  }

  const stance = stanceFromDesk(p);
  const lines: string[] = [];
  const hasDump = (p.dumpZones?.length ?? 0) > 0 || Boolean(p.srPath?.pathKo);

  lines.push(
    tgHighlight(
      `🦅 ${escapeTelegramHtml(p.symbol)} · ${escapeTelegramHtml(p.timeframe)}${p.serverAuto ? ' · 서버' : ''}`
    )
  );
  lines.push('━━━━━━━━━━━━━━━━');
  if (p.kindTitleKo) {
    lines.push(`<b>${escapeTelegramHtml(p.kindTitleKo)}</b>`);
  }
  lines.push(
    `${stance.emoji} <b>${escapeTelegramHtml(stance.title)}</b> · ${escapeTelegramHtml(stance.action)}`
  );
  lines.push(`지금 ${tgPrice(fmtPx(anchor))}`);
  lines.push('지금 시장가 금지');
  lines.push('━━━━━━━━━━━━━━━━');

  const dir = p.desk?.direction || p.swing?.side;
  const longLine = levelsOneLine(p.symbol, anchor, 'LONG', p.levels);
  const shortLine = levelsOneLine(p.symbol, anchor, 'SHORT', p.levels);
  const focus: 'LONG' | 'SHORT' | 'WAIT' =
    dir === 'LONG' || dir === 'SHORT' ? dir : 'WAIT';

  if (focus === 'WAIT') {
    lines.push('', '<b>주플랜 없음 · 대기</b>');
    lines.push('지금 시장가 금지');
    if (p.srPath?.supportPrice) {
      lines.push(escapeTelegramHtml(`롱참고 ${fmtPx(p.srPath.supportPrice)} · 진입금지`));
    }
    if (p.srPath?.resistPrice || p.srPath?.bounceLimitPrice) {
      const r = p.srPath.resistPrice ?? p.srPath.bounceLimitPrice!;
      lines.push(escapeTelegramHtml(`숏참고 ${fmtPx(r)} · 진입금지`));
    }
  } else {
    const sideKo = focus === 'LONG' ? '롱' : '숏';
    lines.push('', `<b>주플랜 ${sideKo}</b>`);
    const lv = focus === 'LONG' ? longLine : shortLine;
    if (lv) {
      lines.push(escapeTelegramHtml(lv));
    } else if (focus === 'LONG' && p.srPath?.supportPrice) {
      lines.push(
        escapeTelegramHtml(
          `${fmtPx(p.srPath.supportPrice)} 반응 확인 후 · 조건 미완성 → 진입금지`
        )
      );
    } else if (focus === 'SHORT' && (p.srPath?.resistPrice || p.srPath?.bounceLimitPrice)) {
      const r = p.srPath.resistPrice ?? p.srPath.bounceLimitPrice!;
      lines.push(
        escapeTelegramHtml(`${fmtPx(r)} 거부 확인 후 · 추격숏 금지`)
      );
    } else {
      lines.push('<i>타점 미산출 · 시장가 금지</i>');
    }
    if (p.desk?.confirmKo) {
      lines.push(escapeTelegramHtml(p.desk.confirmKo.slice(0, 80)));
    }
  }

  if (hasDump) {
    const floors = (p.dumpZones ?? []).filter((z) => z.bandRole === 'floor').slice(0, 1);
    const ceilings = (p.dumpZones ?? []).filter((z) => z.bandRole === 'ceiling').slice(0, 1);
    if (floors.length || ceilings.length) {
      lines.push('', '<b>다음</b>');
      for (const z of ceilings) {
        lines.push(
          escapeTelegramHtml(
            `${fmtPx(Math.min(z.top, z.bot))}~${fmtPx(Math.max(z.top, z.bot))} 회복 → 숏 타점`
          )
        );
      }
      for (const z of floors) {
        lines.push(
          escapeTelegramHtml(
            `${fmtPx(Math.min(z.top, z.bot))}~${fmtPx(Math.max(z.top, z.bot))} 붕괴 → 하단`
          )
        );
      }
    }
  }

  lines.push('', `할 일 → ${escapeTelegramHtml(stance.action)}`);
  lines.push('', '<i>조건부 참고 · 확정 매매·수익 보장 아님</i>');
  return lines.join('\n');
}

export function formatTelegramRealBattlePlainCaption(p: RealBattleBriefInput): string {
  return formatTelegramRealBattleBriefHtml(p)
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .slice(0, 900);
}
