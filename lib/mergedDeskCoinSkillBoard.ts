/**
 * 매매창 코인 스킬칩 카드 — 보유신호·연동·진입/승패/TP.
 * 실전(live)만 본문 숫자 · 가상/시드/구경로는 별도 표기(거짓 실전표기 금지).
 * 확정 승률·수익 아님.
 */
import { buildCoinScoreBoard, type CoinScoreBoardRow } from '@/lib/mergedDeskCoinScoreBoard';
import { readSignalScorecard, type ScoreClosedTrade } from '@/lib/mergedDeskSignalScorecard';
import { readVirtualSeedLedger } from '@/lib/mergedDeskVirtualSeedLedger';
import { normalizeCoinId, type AutoTradeCoinId } from '@/lib/mergedDeskEntryRedesign';
import { resolveTapointEntryTf } from '@/lib/eagle1Tapoint/symbolEntryTf';

const COINS: AutoTradeCoinId[] = ['BTC', 'ETH', 'BNB', 'XRP', 'SOL'];

const COIN_EMOJI: Record<AutoTradeCoinId, string> = {
  BTC: '₿',
  ETH: 'Ξ',
  BNB: '🔶',
  XRP: '✕',
  SOL: '◎',
};

/** 엔진이 보유한 스킬(신호군) · 성적부 signalKo/source로 매칭 */
export type CoinSkillDef = {
  id: string;
  emoji: string;
  nameKo: string;
  match: RegExp;
};

export const COIN_SKILL_DEFS: CoinSkillDef[] = [
  {
    id: 'band15Auto',
    emoji: '▣',
    nameKo: '15분밴드자동',
    match: /15분밴드자동|BAND15_AUTO|INST_BAND_15M|band15Auto/i,
  },
  { id: 'tap', emoji: '🎯', nameKo: '타점', match: /타점|eagle1-tap|실시간활동|siglive/i },
  {
    id: 'htfSweep',
    emoji: '🧭',
    nameKo: '상위스윕필터',
    match: /상위스윕|htf-sweep|HTF_SWEEP|skill:htf-sweep/i,
  },
  {
    id: 'sweepConsec',
    emoji: '🧹',
    nameKo: '3봉내연속스윕진입',
    match: /3봉내연속스윕|연속2봉|연속스윕|sweep-consec|SWEEP_CONSEC|skill:sweep-consec/i,
  },
  { id: 'sweep', emoji: '🧹', nameKo: '스윕합류', match: /스윕합류|스윕|SWEEP|합류|sweep/i },
  { id: 'rsiAdv', emoji: '📐', nameKo: 'RSI·선진', match: /RSI|선진|캔들/i },
  { id: 'volBurst', emoji: '🔥', nameKo: '볼륨폭발', match: /볼륨|BURST|폭발|vol.?roe/i },
  { id: 'failedBreak', emoji: '⚡', nameKo: '가짜돌파', match: /FAILED|가짜|돌파|BREAK/i },
  { id: 'rocket', emoji: '🚀', nameKo: '로켓', match: /로켓|rocket|btc-rocket/i },
  { id: 'scalp', emoji: '⚡', nameKo: '초단', match: /초단|rb-scalp|Fast|띠SFP|SFP/i },
  { id: 'dual', emoji: '⚔️', nameKo: 'Dual', match: /Dual|AIZONE|ai-zone/i },
];

export type CoinSkillStat = {
  id: string;
  emoji: string;
  nameKo: string;
  entries: number;
  wins: number;
  losses: number;
  tpHits: number;
  slHits: number;
  held: boolean;
};

export type CoinSkillCard = {
  coin: AutoTradeCoinId;
  symbol: `${AutoTradeCoinId}USDT`;
  emoji: string;
  tf: string;
  chipOn: boolean;
  linkOk: boolean;
  linkKo: string;
  chipLabel: string;
  posDir: 'LONG' | 'SHORT' | null;
  scanning: boolean;
  openCount: number;
  statusKo: string;
  vitality: number;
  tone: 'long' | 'short' | 'ok' | 'warn' | 'wait' | 'down';
  /** 실전만 */
  tradeCount: number;
  wins: number;
  losses: number;
  tpExits: number;
  slExits: number;
  sampleWinPct: number | null;
  netPnl: number;
  todayCount: number;
  todayPnl: number;
  avgRoePct: number;
  streak: number;
  streakKo: string;
  sizeMult: number;
  cooling: boolean;
  remainSec: number;
  skills: CoinSkillStat[];
  skillsHeldKo: string;
  spark: number[];
  topSignalKo: string | null;
  noteKo: string;
  /** 가상·시드·구경로(실전 아님) */
  paperCount: number;
  paperPnl: number;
  paperNoteKo: string;
};

export type CoinSkillBoard = {
  cards: CoinSkillCard[];
  summaryKo: string;
  linkAllOk: boolean;
};

function isSl(reason: string): boolean {
  return /손절|SL|stop|잠금/i.test(reason);
}
function isTp(reason: string): boolean {
  return /익절|TP|러너|본절/i.test(reason) && !isSl(reason);
}

function matchSkill(def: CoinSkillDef, t: ScoreClosedTrade): boolean {
  const blob = `${t.signalKo || ''} ${t.source || ''} ${t.signalKey || ''}`;
  return def.match.test(blob);
}

function computeStreak(trades: ScoreClosedTrade[]): number {
  if (!trades.length) return 0;
  const sorted = [...trades].sort((a, b) => (b.closedAt || 0) - (a.closedAt || 0));
  const first = sorted[0]!;
  const sign = first.win ? 1 : -1;
  let n = 0;
  for (const t of sorted) {
    if ((t.win ? 1 : -1) !== sign) break;
    n += 1;
  }
  return sign * n;
}

function sumClosed(trades: ScoreClosedTrade[]): {
  tradeCount: number;
  wins: number;
  losses: number;
  tpExits: number;
  slExits: number;
  netPnl: number;
  todayCount: number;
  todayPnl: number;
  avgRoePct: number;
  sampleWinPct: number | null;
} {
  const day0 = (() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  })();
  let wins = 0;
  let losses = 0;
  let tpExits = 0;
  let slExits = 0;
  let netPnl = 0;
  let todayCount = 0;
  let todayPnl = 0;
  let sumRoe = 0;
  for (const t of trades) {
    netPnl += Number(t.pnlUsdt) || 0;
    sumRoe += Number(t.roePct) || 0;
    if (t.win) wins += 1;
    else losses += 1;
    if (isTp(t.exitReason)) tpExits += 1;
    if (isSl(t.exitReason)) slExits += 1;
    if ((t.closedAt || 0) >= day0) {
      todayCount += 1;
      todayPnl += Number(t.pnlUsdt) || 0;
    }
  }
  const tradeCount = trades.length;
  const decided = wins + losses;
  return {
    tradeCount,
    wins,
    losses,
    tpExits,
    slExits,
    netPnl,
    todayCount,
    todayPnl,
    avgRoePct: tradeCount > 0 ? sumRoe / tradeCount : 0,
    sampleWinPct: decided > 0 ? (wins / decided) * 100 : null,
  };
}

function vitalityOf(
  row: CoinScoreBoardRow,
  linkOk: boolean,
  chipOn: boolean,
  liveCount: number
): { vitality: number; tone: CoinSkillCard['tone'] } {
  let v = 18;
  if (chipOn) v += 18;
  if (linkOk) v += 22;
  if (row.openCount > 0) v += 12;
  if (row.cooling || row.needReinforce) v -= 28;
  if (liveCount >= 3 && row.winRatePct != null) {
    v += Math.round((row.winRatePct - 45) * 0.55);
  }
  v = Math.max(0, Math.min(100, Math.round(v)));
  let tone: CoinSkillCard['tone'] = 'wait';
  if (!chipOn) tone = 'down';
  else if (row.cooling || row.needReinforce) tone = 'warn';
  else if (row.openCount > 0) tone = 'long';
  else if (linkOk) tone = 'ok';
  return { vitality: v, tone };
}

export type CoinSkillRuntime = {
  chipOn: boolean;
  linkOk: boolean;
  linkKo: string;
  chipLabel: string;
  posDir: 'LONG' | 'SHORT' | null;
  scanning: boolean;
};

/**
 * 코인별 스킬칩 보드 · 실전 숫자만 본문.
 */
export function buildCoinSkillBoard(
  runtime: Partial<Record<AutoTradeCoinId, CoinSkillRuntime>> = {}
): CoinSkillBoard {
  const board = buildCoinScoreBoard();
  const { closed } = readSignalScorecard();
  const seed = readVirtualSeedLedger();

  const cards: CoinSkillCard[] = COINS.map((coin) => {
    const row = board.rows.find((r) => r.coin === coin)!;
    const rt = runtime[coin] || {
      chipOn: false,
      linkOk: false,
      linkKo: '연동대기',
      chipLabel: `${coin}대기`,
      posDir: null as 'LONG' | 'SHORT' | null,
      scanning: false,
    };

    const scAll = closed.filter((t) => normalizeCoinId(t.symbol) === coin);
    const liveTrades = scAll.filter((t) => t.mode === 'live');
    const paperFromScore = scAll.filter((t) => t.mode !== 'live');
    const seedForCoin = seed.trades.filter((t) => normalizeCoinId(t.symbol) === coin);
    const paperCount = paperFromScore.length + seedForCoin.length;
    const paperPnl =
      paperFromScore.reduce((a, t) => a + (Number(t.pnlUsdt) || 0), 0) +
      seedForCoin.reduce((a, t) => a + (Number(t.pnlUsdt) || 0), 0);

    const live = sumClosed(liveTrades);

    const skills: CoinSkillStat[] = COIN_SKILL_DEFS.map((def) => {
      const hit = liveTrades.filter((t) => matchSkill(def, t));
      let wins = 0;
      let losses = 0;
      let tpHits = 0;
      let slHits = 0;
      for (const t of hit) {
        if (t.win) wins += 1;
        else losses += 1;
        if (isTp(t.exitReason)) tpHits += 1;
        if (isSl(t.exitReason)) slHits += 1;
      }
      return {
        id: def.id,
        emoji: def.emoji,
        nameKo: def.nameKo,
        entries: hit.length,
        wins,
        losses,
        tpHits,
        slHits,
        held: def.id === 'band15Auto',
      };
    });

    const held = skills.filter((s) => s.held);
    const skillsHeldKo = held.map((s) => `${s.emoji}${s.nameKo}`).join(' · ') || '15분밴드자동';

    const spark = [...liveTrades]
      .sort((a, b) => (a.closedAt || 0) - (b.closedAt || 0))
      .slice(-12)
      .map((t) => Number(t.pnlUsdt) || 0);

    const byKo = new Map<string, number>();
    for (const t of liveTrades) {
      const k = String(t.signalKo || t.source || '기타').slice(0, 40);
      byKo.set(k, (byKo.get(k) || 0) + 1);
    }
    let topSignalKo: string | null = null;
    let topN = 0;
    for (const [k, n] of byKo) {
      if (n > topN) {
        topN = n;
        topSignalKo = `${k} · ${n}회`;
      }
    }

    const streak = computeStreak(liveTrades);
    const streakKo =
      streak === 0
        ? '연속없음'
        : streak > 0
          ? `연승 ${streak}`
          : `연패 ${Math.abs(streak)}`;

    const { vitality, tone } = vitalityOf(row, rt.linkOk, rt.chipOn, live.tradeCount);
    const symbol = `${coin}USDT` as `${AutoTradeCoinId}USDT`;
    const tf = resolveTapointEntryTf(symbol) || '—';

    const paperNoteKo =
      paperCount > 0
        ? `참고·실전아님 · 가상/시드/구경로 ${paperCount}건 ${
            paperPnl >= 0 ? '+' : ''
          }${paperPnl.toFixed(1)}U (SFP·초단 등)`
        : '가상/구경로 기록없음';

    return {
      coin,
      symbol,
      emoji: COIN_EMOJI[coin],
      tf,
      chipOn: rt.chipOn,
      linkOk: rt.linkOk,
      linkKo: rt.linkKo,
      chipLabel: rt.chipLabel,
      posDir: rt.posDir,
      scanning: rt.scanning,
      openCount: row.openCount,
      statusKo: row.statusKo,
      vitality,
      tone,
      tradeCount: live.tradeCount,
      wins: live.wins,
      losses: live.losses,
      tpExits: live.tpExits,
      slExits: live.slExits,
      sampleWinPct: live.sampleWinPct,
      netPnl: live.netPnl,
      todayCount: live.todayCount,
      todayPnl: live.todayPnl,
      avgRoePct: live.avgRoePct,
      streak,
      streakKo,
      sizeMult: row.sizeMult,
      cooling: row.cooling,
      remainSec: row.remainSec,
      skills,
      skillsHeldKo,
      spark,
      topSignalKo,
      noteKo: `실전만 집계 · ${row.routeKo} · 확정아님`,
      paperCount,
      paperPnl,
      paperNoteKo,
    };
  });

  const linkAllOk = cards.every((c) => !c.chipOn || c.linkOk);
  const onN = cards.filter((c) => c.chipOn).length;
  const sumLive = cards.reduce((a, c) => a + c.tradeCount, 0);
  const sumPaper = cards.reduce((a, c) => a + c.paperCount, 0);
  const sumTp = cards.reduce((a, c) => a + c.tpExits, 0);
  return {
    cards,
    linkAllOk,
    summaryKo: `칩ON ${onN}/5 · 실진입 ${sumLive} · TP${sumTp}${
      sumPaper > 0 ? ` · 가상/구${sumPaper}(표시만)` : ''
    } · ${linkAllOk ? '연동정상' : '연동점검'} · 확정아님`,
  };
}
