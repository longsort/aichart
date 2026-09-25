'use client';

/**
 * 거래소형 차트 위 매매카드 — 드래그·숨김·닫기.
 * 자동매매 설정·초단·매매기록 유지. 확정 수익·투자 권유 아님.
 * (로컬 우선 · 서버 배포는 사용자 지시 시)
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import deskCss from './MergedAnalysisDesk.module.css';

/** Turbopack CSS module: default / namespace interop · HMR로 styles 미정의 방지 */
const styles: Record<string, string> = (() => {
  const m = deskCss as Record<string, string> & { default?: Record<string, string> };
  if (!m || typeof m !== 'object') return {};
  if (m.default && typeof m.default === 'object') return m.default;
  return m as Record<string, string>;
})();
import {
  readAutoTradeConfig,
  writeAutoTradeConfig,
  toggleAutoTradeSymbol,
  isAutoTradeSymbolEnabled,
  ensureAutoTradeSymbolEnabled,
  AUTO_TRADE_SYMBOL_OPTIONS,
  DEFAULT_ENABLED_AUTO_TRADE_SYMBOLS,
  AUTO_TRADE_MAX_CONCURRENT,
  AUTO_TRADE_SCALP_MODE_KO,
  AUTO_TRADE_CFG_EVENT,
  autoTradeSymbolChipKo,
  FAST_TP1_ROE_PCT,
  FAST_SL_ROE_PCT,
  type MergedDeskAutoTradeConfig,
  type AutoTradeSymbolId,
  type AutoTradeScalpMode,
} from '@/lib/mergedDeskAutoTradeConfig';
import { fetchServerArmHealth, syncServerArm } from '@/lib/mergedDeskServerArmClient';
import {
  BAND15_AUTO_CALLSIGN,
  BAND15_AUTO_HOCHUNG,
  BAND15_AUTO_TF,
} from '@/lib/eagle1Tapoint/band15AutoSkill';
import {
  isTapointTapOnly,
  tapOnlyStatusKo,
} from '@/lib/eagle1Tapoint/config';
import {
  resolveTapointEntryTf,
  tapointEntryTfLabelKo,
} from '@/lib/eagle1Tapoint/symbolEntryTf';
import {
  resolveTapointSlRoePct,
  tapointSlRoeLabelKo,
} from '@/lib/eagle1Tapoint/slRoeByTf';
import {
  fetchExchangeKeysStatus,
  fetchLivePosition,
  postLiveOrder,
  type ExchangeKeysStatus,
  type LivePosition,
} from '@/lib/mergedDeskLiveOrderClient';
import { runAutoTradeDryRunTest } from '@/lib/mergedDeskAutoTradeRunner';
import { tickLiveRoeExits } from '@/lib/mergedDeskLiveRoeExit';
import { pingClientAutoTradeGates } from '@/lib/mergedDeskEntryGatePingClient';
import {
  runFullTradeHealthCheck,
  persistHealthReport,
  type TradeHealthReport,
} from '@/lib/mergedDeskTradeHealthCheck';
import {
  aiZoneEntryGate,
  AIZONE_PCT_MIN_NORMAL,
  AIZONE_PCT_MIN_VOLUME,
} from '@/lib/mergedDeskAiZoneEntryGate';
import { readAiZoneEntrySnapshot, AI_ZONE_SNAP_EVENT } from '@/lib/mergedDeskAiZoneSnapshot';
import { aiZoneEvidenceGate } from '@/lib/mergedDeskAiZoneEvidenceGate';
import { aiZoneFeeRrGate } from '@/lib/mergedDeskAiZoneFeeGate';
import {
  readVirtualTradeSession,
  startVirtualTradeSession,
  stopVirtualTradeSession,
  virtualUnrealizedPnl,
  maybeVirtualTp1Half,
  maybeVirtualRunnerOrBeClose,
  maybeVirtualSlBeforeTp1,
  touchVirtualReentryExtreme,
  isVirtualPostFlatCooldown,
  VIRTUAL_TRADE_EVENT,
  type VirtualTradeSession,
} from '@/lib/mergedDeskVirtualTradeSession';
import {
  downloadReinforcementPack,
  readVirtualSeedLedger,
  setVirtualSeedUsdt,
  resetVirtualSeedLedger,
  summarizeVirtualSeed,
  buildLiveReinforceBoard,
  virtualRiskMarginUsdt,
  VIRTUAL_SEED_RISK_PCT,
  VIRTUAL_SEED_EVENT,
  type VirtualSeedTradeRecord,
} from '@/lib/mergedDeskVirtualSeedLedger';
import { copyVirtualAuditPackToClipboard } from '@/lib/mergedDeskVirtualAuditPack';
import {
  SIGNAL_SCORECARD_EVENT,
  buildSignalScoreRows,
  hydrateScorecardFromSeedTrades,
  listOpenScoreTrades,
  recentClosedScoreTrades,
  repairZeroPnlClosedTrades,
  reconcileLiveScoreOpens,
} from '@/lib/mergedDeskSignalScorecard';
import {
  clearPositionEntryLabel,
  formatPositionEntrySignalKo,
  readPositionEntryLabel,
} from '@/lib/mergedDeskPositionEntryLabel';
import {
  buildExitFromStats,
  type AutoTradeCoinKey,
} from '@/lib/mergedDeskCoinExitProfile';
import {
  ensureProfileFromYearPack,
  hydrateCoinStatsFromServer,
  writeCoinExitProfilePersistent,
  writeYearReplayPackPersistent,
} from '@/lib/mergedDeskCoinStatsPersistClient';
import { hydrateTapointAccumFromServer } from '@/lib/tapointAccumClient';
import type { CachedYearPack } from '@/lib/mergedDeskYearReplayCache';
import {
  buildCoinScoreBoard,
  buildDualLaneTradeStats,
  buildTodayTradeBoard,
  downloadCoinScorePack,
} from '@/lib/mergedDeskCoinScoreBoard';
import { buildCoinSkillBoard, type CoinSkillCard } from '@/lib/mergedDeskCoinSkillBoard';
import {
  coinSkillRiskLabelKo,
  defaultCoinSkillRisk,
  getCoinSkillRisk,
  mergeCoinSkillRiskFromServer,
  readCoinSkillRiskMap,
  writeCoinSkillRisk,
  type CoinSkillRisk,
  type CoinSkillRiskMap,
} from '@/lib/mergedDeskCoinSkillRisk';
import {
  defaultExclusiveState,
  getCoinExclusiveSkills,
  listTradeWindowExclusiveSkills,
  mergeExclusiveFromServer,
  readCoinExclusiveSkillMap,
  writeCoinExclusiveSkill,
  type CoinExclusiveSkillMap,
  type CoinExclusiveSkillState,
} from '@/lib/mergedDeskCoinExclusiveSkills';
import {
  DEFAULT_SKILL_COLORS,
  readSkillColors,
  skillColorsToCssVars,
  SKILL_COLOR_FIELDS,
  writeSkillColors,
  type SkillColorPack,
} from '@/lib/mergedDeskSkillColors';
import MergedDeskCoinTradeProgressStrip from './MergedDeskCoinTradeProgressStrip';
import MergedDeskBtcSignalBCard from './MergedDeskBtcSignalBCard';
import {
  buildAutoTradeSymbolMatrix,
  downloadReinforceNeededWithMatrix,
  type AutoTradeCoinId,
} from '@/lib/mergedDeskEntryRedesign';
import { entrySourceKo } from '@/lib/mergedDeskVirtualTradeSession';
import { FOUR_STRATEGY_KO } from '@/lib/doksuri1/fourStrategyTypes';
import type { FourStrategyStatus } from '@/lib/doksuri1/fourStrategyTypes';
import { estimateScalpNetRoe } from '@/lib/mergedDeskScalpNetRoe';
import {
  resolveUltraScalpRoeCaps,
  resolveUltraTradingMode,
  type UltraStrategySpeed,
  type UltraTradingMode,
} from '@/lib/doksuri1/ultraScalpEngine';
import type { AutoScalpPaperTrade } from '@/lib/mergedDeskAutoScalpEngine';
import { summarizeAutoScalpTrades } from '@/lib/mergedDeskAutoScalpEngine';
import { autoScalpExpectancyKo, readAutoScalpHistory } from '@/lib/mergedDeskAutoScalpStore';
import type { FourStrategyCardView } from '@/lib/doksuri1/fourStrategyTypes';
import {
  downloadTradeEventJournal,
  pullTradeEventJournalFromServer,
  readTradeEventJournal,
  syncTradeEventJournalToServer,
  type TradeJournalEvent,
  type TradeJournalEventKind,
} from '@/lib/mergedDeskTradeEventJournal';
import { setVisibleInterval } from '@/lib/visibleInterval';

type TabId =
  | 'desk'
  | 'stats'
  | 'skill'
  | 'tp'
  | 'sl'
  | 'size'
  | 'pos'
  | 'setup'
  | 'scalp'
  | 'journal'
  | 'live'
  | 'guide';

type JournalSubTab = 'open' | 'score' | 'reinforce' | 'log';

type StatsCoinFilter = 'ALL' | AutoTradeCoinId;

type CoinYearUiPack = {
  summaryKo: string;
  hintKo: string;
  routeKo?: string;
  tradeCount: number;
  wins: number;
  losses: number;
  winRate: number | null;
  longCount: number;
  shortCount: number;
  tpHits: number;
  slHits: number;
  timeExits: number;
  avgMfePct: number;
  avgMaePct: number;
  avgWinMovePct: number;
  avgLossMovePct: number;
  medianSlDistPct: number;
  suggestSlPricePct: number;
  suggestTpPricePct: number;
  bestLeverage: number;
  bestLevKo: string;
  preferTfs?: string[];
  skipTfs?: string[];
  lev30: {
    suggestTpRoePct: number;
    suggestSlRoePct: number;
    feeRoundTripMarginPct: number;
    fundingHalfHourMarginPct: number;
    netTpRoeAfterFeePct: number;
    detailKo: string[];
  };
  leverageTable: Array<{
    leverage: number;
    suggestTpRoePct: number;
    suggestSlRoePct: number;
    roundTripFeeMarginPct: number;
    netEvRoePct: number;
    feeShareOfWinPct: number;
    okKo: string;
  }>;
  byTf: Array<{
    timeframe: string;
    tradeCount: number;
    winRate: number | null;
    tpHits: number;
    slHits: number;
    noteKo: string;
  }>;
  sources?: Record<string, string>;
  errors?: Array<{ tf: string; msg: string }>;
};

function saveYearPackAsExitProfile(coin: AutoTradeCoinKey, pack: CoinYearUiPack, leverage: number) {
  const lev = pack.bestLeverage || leverage || 30;
  const prefer =
    Array.isArray(pack.preferTfs) && pack.preferTfs.length
      ? pack.preferTfs
      : coin === 'BTC'
        ? ['3m', '5m']
        : ['3m', '5m'];
  const profile = buildExitFromStats({
    coin,
    leverage: lev,
    avgMfePct: pack.avgMfePct,
    avgMaePct: pack.avgMaePct,
    medianSlDistPct: pack.medianSlDistPct || pack.suggestSlPricePct,
    targetTpRoePct: pack.lev30.suggestTpRoePct,
    sampleTrades: pack.tradeCount,
    winRate: pack.winRate,
    preferTfs: prefer,
    skipTfs: pack.skipTfs,
    noteKo: pack.summaryKo,
  });
  /** 통계 화면 권장 가격%를 우선 */
  profile.slPricePct = pack.suggestSlPricePct || profile.slPricePct;
  profile.tpPricePct = pack.suggestTpPricePct || profile.tpPricePct;
  profile.tpRoePct = pack.lev30.suggestTpRoePct;
  profile.slRoePct = pack.lev30.suggestSlRoePct;
  writeCoinExitProfilePersistent(profile);
  writeYearReplayPackPersistent(coin, { ...pack, preferTfs: prefer } as unknown as CachedYearPack);
  return profile;
}

/** 1년 통계 성공 시 로컬+서버 영속 · 다음 접속 재다운 불필요 */
function persistYearStatsResult(
  coin: AutoTradeCoinKey,
  pack: Record<string, unknown>,
  leverage: number
) {
  writeYearReplayPackPersistent(coin, pack as CachedYearPack);
  if (
    typeof pack.tradeCount === 'number' &&
    pack.lev30 &&
    typeof (pack.lev30 as { suggestTpRoePct?: number }).suggestTpRoePct === 'number'
  ) {
    saveYearPackAsExitProfile(coin, pack as unknown as CoinYearUiPack, leverage);
    return;
  }
  ensureProfileFromYearPack(coin, pack as CachedYearPack, leverage);
}

/** 숫자 칸: 비우기·직접입력 가능 · blur/Enter 시 확정 · ▲▼ 스텝 */
function NumStepperBox({
  value,
  min,
  max,
  step = 1,
  suffix,
  title,
  onCommit,
  inputStyle,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  title?: string;
  onCommit: (n: number) => void;
  inputStyle?: CSSProperties;
}) {
  const [draft, setDraft] = useState(String(value));
  const focusedRef = useRef(false);

  useEffect(() => {
    if (!focusedRef.current) setDraft(String(value));
  }, [value]);

  const snap = (n: number) => {
    const snapped = Math.round(n / step) * step;
    const fixed = Number(snapped.toFixed(6));
    return Math.min(max, Math.max(min, fixed));
  };

  const commit = (raw: string) => {
    const trimmed = raw.trim();
    if (trimmed === '' || trimmed === '-' || trimmed === '.' || trimmed === '-.') {
      setDraft(String(value));
      return;
    }
    const n = Number(trimmed);
    if (!Number.isFinite(n)) {
      setDraft(String(value));
      return;
    }
    const next = snap(n);
    setDraft(String(next));
    if (next !== value) onCommit(next);
  };

  const bump = (dir: 1 | -1) => {
    const parsed = Number(draft);
    const cur = Number.isFinite(parsed) ? parsed : value;
    const next = snap(cur + dir * step);
    setDraft(String(next));
    if (next !== value) onCommit(next);
  };

  return (
    <div className={styles.tradeNumStepper} title={title}>
      <input
        type="text"
        inputMode="decimal"
        value={draft}
        onFocus={() => {
          focusedRef.current = true;
        }}
        onBlur={() => {
          focusedRef.current = false;
          commit(draft);
        }}
        onChange={(e) => {
          const raw = e.target.value.replace(/[^\d.\-]/g, '');
          setDraft(raw);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            bump(1);
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            bump(-1);
          }
        }}
        style={inputStyle}
        aria-label={title}
      />
      <div className={styles.tradeNumSpin}>
        <button type="button" tabIndex={-1} aria-label="증가" onClick={() => bump(1)}>
          ▲
        </button>
        <button type="button" tabIndex={-1} aria-label="감소" onClick={() => bump(-1)}>
          ▼
        </button>
      </div>
      {suffix ? <span className={styles.tradeNumSuffix}>{suffix}</span> : null}
    </div>
  );
}

type Props = {
  symbol: string;
  timeframe: string;
  onClose?: () => void;
  /** 매매창 UI 표시 여부 — false여도 가상/실전 ARM·틱은 유지 */
  uiVisible?: boolean;
  /** 숨김(연결유지) 칩 클릭 시 창 다시 열기 */
  onOpenUi?: () => void;
  onConfigChange?: (cfg: MergedDeskAutoTradeConfig) => void;
  /** 페이퍼 테스트 결과 → 데스크 상태줄 */
  onStatusKo?: (msg: string) => void;
  /** 주문진단·진입PING 상세 결과 */
  onPaperTestResult?: (r: { ok: boolean; msg: string; detailKo: string[] }) => void;
  liveStatusKo?: string;
  scalpStripKo?: string;
  scalpDetailKo?: string;
  scalpTrade?: AutoScalpPaperTrade | null;
  fourStrategyCards?: FourStrategyCardView[];
  fourStrategyStripKo?: string;
  virtAnalysisStripKo?: string;
  /** 가상매매 시작 시 데스크에서 초단 엔진·자동매매 ON */
  onVirtualSessionStart?: () => void;
  onVirtualSessionStop?: () => void;
  livePrice?: number | null;
  /** 차트 플랜에서 채운 가격 (표시·참고) */
  planDirection?: 'LONG' | 'SHORT' | 'NEUTRAL' | null;
  planEntry?: number | null;
  planSl?: number | null;
  planTp1?: number | null;
  /** 타점엔진 전용 모드 (구 Dual/AIZONE 자동주문 OFF) */
  tapOnly?: boolean;
};

const EQUITY_CHIPS = [5, 10, 25, 50, 100] as const;
const LEV_CHIPS = [10, 20, 25, 40, 50] as const;

const AUTO_TRADE_JOURNAL_KINDS: TradeJournalEventKind[] = [
  'AUTO_SCALP_ARM',
  'AUTO_SCALP_SFP',
  'AUTO_SCALP_ROCKET',
  'AUTO_SCALP_FIRE',
  'AUTO_SCALP_TP1',
  'AUTO_SCALP_BE',
  'AUTO_SCALP_TP2',
  'AUTO_SCALP_SL',
  'AUTO_SCALP_TIME',
  'AUTO_SCALP_CLOSE',
  'SCALP200_ARMED',
  'SCALP200_FIRE',
  'SCALP200_MISSED',
  'SCALP200_INVALID',
  'TOUCH_ENTRY',
  'TOUCH_SL',
  'TOUCH_TP1',
  'TOUCH_TP2',
  'REALIZED_TP1',
  'REALIZED_SL',
  'PLAN_LOCK',
];

function phaseKo(p: string): string {
  const m: Record<string, string> = {
    IDLE: '대기',
    ARMED: '폭락터치대기',
    SFP_OK: '스윕확인',
    READY: '로켓합류',
    OPEN: '보유중',
    TP1_HIT: '1차익절',
    BE: '본절·2차목표',
    CLOSED: '종료',
  };
  return m[p] || p;
}

/** 가상·초단 청산 단계 한줄 설명 */
function exitStageKo(params: {
  tp1Done?: boolean;
  runnerTp?: number | null;
  tp?: number | null;
  sl?: number | null;
  remainingFrac?: number | null;
  phase?: string | null;
}): { title: string; body: string; next: string } {
  const rem =
    params.remainingFrac != null && params.remainingFrac > 0 && params.remainingFrac < 1
      ? Math.round(params.remainingFrac * 100)
      : null;
  if (params.phase === 'CLOSED') {
    return {
      title: '포지션 종료',
      body: '전량 청산 완료 · 연속 분석 재개',
      next: '새 Setup 나올 때만 다음 진입',
    };
  }
  if (params.tp1Done || params.phase === 'TP1_HIT' || params.phase === 'BE') {
    return {
      title: rem != null ? `1차익절 완료 · 잔량 ${rem}%` : '1차익절 완료 · 잔량 보유',
      body: '절반(약 50~55%)은 이미 익절 · 손절은 진입가(본절)로 이동',
      next:
        params.runnerTp != null && params.runnerTp > 0
          ? `전량 종료: 러너 ${params.runnerTp.toFixed(0)} 도달 또는 본절 터치`
          : '전량 종료: 익절2(TP2) 도달 · 본절 터치 · 시간손절 중 하나',
    };
  }
  return {
    title: '보유중 · 아직 전량 아님',
    body: '익절1(TP1)에서 약 50~55%만 부분익절 · 나머지는 계속 보유',
    next:
      params.tp != null && params.tp > 0
        ? `다음: 익절1 ${params.tp.toFixed(0)} 또는 손절 ${params.sl != null ? params.sl.toFixed(0) : '—'}`
        : '다음: 익절1 또는 손절',
  };
}

function statusKo(s: FourStrategyStatus | string): string {
  const m: Record<string, string> = {
    LEARNING: '학습중',
    ACTIVE: '활성',
    CAUTION: '주의',
    DISABLED: '중지',
    RECOVERY: '회복중',
  };
  return m[s] || s;
}

function modeKo(m: UltraTradingMode | string): string {
  const map: Record<string, string> = {
    OFF: '끔',
    SIGNAL_ONLY: '신호만',
    PAPER: '가상',
    SHADOW: '그림자',
    LIVE: '실거래',
  };
  return map[m] || m;
}

function speedKo(s: UltraStrategySpeed | string): string {
  const map: Record<string, string> = {
    NORMAL: '일반',
    SCALP: '단타',
    ULTRA_SCALP: '초단타',
  };
  return map[s] || s;
}

function dirKo(d: string): string {
  if (d === 'LONG') return '롱';
  if (d === 'SHORT') return '숏';
  return '중립';
}

function journalKindKo(kind: string): string {
  const m: Record<string, string> = {
    AUTO_SCALP_ARM: '초단·폭락터치',
    AUTO_SCALP_SFP: '초단·스윕',
    AUTO_SCALP_ROCKET: '초단·로켓',
    AUTO_SCALP_FIRE: '초단·진입',
    AUTO_SCALP_TP1: '초단·1차익절',
    AUTO_SCALP_BE: '초단·본절',
    AUTO_SCALP_TP2: '초단·2차익절',
    AUTO_SCALP_SL: '초단·손절',
    AUTO_SCALP_TIME: '초단·시간청산',
    AUTO_SCALP_CLOSE: '초단·종료',
    NOTE: '메모',
    TOUCH_ENTRY: '분석터치·진입',
    TOUCH_SL: '분석터치·손절',
    TOUCH_TP1: '분석터치·익절1',
    TOUCH_TP2: '분석터치·익절2',
  };
  return m[kind] || kind;
}

function fmtTime(at: number): string {
  try {
    return new Date(at).toLocaleString('ko-KR', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return '';
  }
}

function fmtHoldMs(ms: number): string {
  const t = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  if (h > 0) return `${h}시간 ${m}분 ${s}초`;
  if (m > 0) return `${m}분 ${s}초`;
  return `${s}초`;
}

/** 차트 TF → 기록용 한글 (5m → 5분봉) */
function tfEntryKo(tf: string | null | undefined): string {
  const t = String(tf || '').trim();
  if (!t) return '—';
  const m = t.match(/^(\d+)m$/i);
  if (m) return `${m[1]}분봉`;
  const h = t.match(/^(\d+)h$/i);
  if (h) return `${h[1]}시간봉`;
  if (/^1d$/i.test(t)) return '일봉';
  if (/^1w$/i.test(t)) return '주봉';
  if (/^1M$/i.test(t) || /^1mo$/i.test(t)) return '월봉';
  return t;
}

function fmtPx(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n <= 0) return '—';
  return n >= 1000 ? n.toLocaleString('en-US', { maximumFractionDigits: 1 }) : n.toFixed(4);
}

function fmtPnl(n: number | null | undefined, digits = 4): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(digits)}`;
}

function fmtPct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}%`;
}

function baseAsset(sym: string): string {
  const s = String(sym || '').toUpperCase();
  if (s.endsWith('USDT')) return s.slice(0, -4) || 'BTC';
  return s || 'BTC';
}

function pnlTone(n: number | null | undefined): 'up' | 'down' | 'flat' {
  if (n == null || !Number.isFinite(n) || n === 0) return 'flat';
  return n > 0 ? 'up' : 'down';
}

function Sig({ on, label, title }: { on: boolean; label: string; title?: string }) {
  return (
    <span
      className={styles.tradeSigChip}
      data-on={on ? '1' : '0'}
      title={title || (on ? `${label} 켜짐` : `${label} 꺼짐`)}
    >
      <i className={styles.tradeSigDot} aria-hidden />
      {label}
    </span>
  );
}

function sparkHeights(spark: number[]): number[] {
  if (!spark.length) return [];
  const max = Math.max(...spark.map((n) => Math.abs(n)), 0.01);
  return spark.map((n) => Math.max(12, Math.round((Math.abs(n) / max) * 100)));
}

function SkillCardView({
  card,
  risk,
  onSaveRisk,
  saveBusy,
  exclusive,
  onToggleExclusive,
  exclusiveBusy,
}: {
  card: CoinSkillCard;
  risk: CoinSkillRisk;
  onSaveRisk: (next: CoinSkillRisk) => void | Promise<void>;
  saveBusy?: boolean;
  exclusive: CoinExclusiveSkillState;
  onToggleExclusive: (skillId: string, on: boolean) => void | Promise<void>;
  exclusiveBusy?: boolean;
}) {
  const heights = sparkHeights(card.spark);
  const wr =
    card.sampleWinPct != null && card.wins + card.losses > 0
      ? `${Math.round(card.sampleWinPct)}%`
      : '—';
  const [draft, setDraft] = useState({
    leverage: String(risk.leverage),
    equityPct: String(risk.equityPct),
    tp1RoePct: String(risk.tp1RoePct),
    slRoePct: String(risk.slRoePct),
  });
  const [savedKo, setSavedKo] = useState('');

  useEffect(() => {
    setDraft({
      leverage: String(risk.leverage),
      equityPct: String(risk.equityPct),
      tp1RoePct: String(risk.tp1RoePct),
      slRoePct: String(risk.slRoePct),
    });
  }, [risk.coin, risk.leverage, risk.equityPct, risk.tp1RoePct, risk.slRoePct, risk.updatedAt]);

  const dirty =
    Number(draft.leverage) !== risk.leverage ||
    Number(draft.equityPct) !== risk.equityPct ||
    Number(draft.tp1RoePct) !== risk.tp1RoePct ||
    Number(draft.slRoePct) !== risk.slRoePct;

  return (
    <div
      className={styles.skillCard}
      data-tone={card.tone}
      style={{ ['--skill-pct' as string]: `${card.vitality}%` }}
      title={card.noteKo}
    >
      <div className={styles.skillCardTop}>
        <span className={styles.skillEmoji} aria-hidden>
          {card.emoji}
        </span>
        <div className={styles.skillMeta}>
          <strong>
            {card.coin} · {card.chipLabel}
          </strong>
          <small>
            {card.tf} · {card.linkOk ? '🔗 연동정상' : '⚠️ 연동점검'} · {card.statusKo}
            {card.openCount > 0 ? ` · 진행${card.openCount}` : ''}
            {card.cooling ? ` · CD${card.remainSec}s` : ''}
          </small>
          <div className={styles.skillHeld} title={card.skillsHeldKo}>
            보유 {card.skillsHeldKo}
          </div>
        </div>
        <div className={styles.skillRing} title={`활력 ${card.vitality}`}>
          <span>{card.vitality}</span>
        </div>
      </div>
      <div className={styles.skillStats}>
        <div className={styles.skillStat}>
          <b>{card.tradeCount}</b>
          <span>진입</span>
        </div>
        <div className={styles.skillStat}>
          <b>
            {card.wins}/{card.losses}
          </b>
          <span>승·패</span>
        </div>
        <div className={styles.skillStat}>
          <b>{wr}</b>
          <span>표본승률</span>
        </div>
        <div className={styles.skillStat}>
          <b>
            {card.tpExits}/{card.slExits}
          </b>
          <span>TP·SL</span>
        </div>
      </div>
      <div className={styles.skillStats} style={{ marginTop: 4 }}>
        <div className={styles.skillStat}>
          <b data-tone={pnlTone(card.netPnl)}>
            {card.netPnl >= 0 ? '+' : ''}
            {card.netPnl.toFixed(1)}
          </b>
          <span>누적U</span>
        </div>
        <div className={styles.skillStat}>
          <b data-tone={pnlTone(card.todayPnl)}>
            {card.todayPnl >= 0 ? '+' : ''}
            {card.todayPnl.toFixed(1)}
          </b>
          <span>오늘{card.todayCount}회</span>
        </div>
        <div className={styles.skillStat}>
          <b>{card.avgRoePct.toFixed(1)}%</b>
          <span>평균ROE</span>
        </div>
        <div className={styles.skillStat}>
          <b>{card.streakKo}</b>
          <span>×{card.sizeMult}</span>
        </div>
      </div>
      <div className={styles.skillRisk} aria-label={`${card.coin} 리스크세팅`}>
        <div className={styles.skillRiskHead}>
          <b>자동매매 세팅</b>
          <span>{coinSkillRiskLabelKo(risk)}</span>
        </div>
        <div className={styles.skillRiskGrid}>
          <label>
            <span>레버</span>
            <input
              type="number"
              min={1}
              max={125}
              step={1}
              value={draft.leverage}
              onChange={(e) => setDraft((d) => ({ ...d, leverage: e.target.value }))}
            />
          </label>
          <label>
            <span>비중%</span>
            <input
              type="number"
              min={0.5}
              max={100}
              step={0.5}
              value={draft.equityPct}
              onChange={(e) => setDraft((d) => ({ ...d, equityPct: e.target.value }))}
            />
          </label>
          <label>
            <span>TP%ROE</span>
            <input
              type="number"
              min={0.5}
              max={80}
              step={0.5}
              value={draft.tp1RoePct}
              onChange={(e) => setDraft((d) => ({ ...d, tp1RoePct: e.target.value }))}
            />
          </label>
          <label>
            <span>SL%ROE</span>
            <input
              type="number"
              min={0.5}
              max={80}
              step={0.5}
              value={draft.slRoePct}
              onChange={(e) => setDraft((d) => ({ ...d, slRoePct: e.target.value }))}
            />
          </label>
        </div>
        <div className={styles.skillRiskActions}>
          <button
            type="button"
            className="tool-chip tool-chip-button"
            disabled={saveBusy || !dirty}
            onClick={() => {
              const next = {
                coin: card.coin,
                leverage: Number(draft.leverage),
                equityPct: Number(draft.equityPct),
                tp1RoePct: Number(draft.tp1RoePct),
                slRoePct: Number(draft.slRoePct),
                updatedAt: Date.now(),
              };
              void Promise.resolve(onSaveRisk(next)).then(() => {
                setSavedKo('저장됨 · 자동매매 적용');
                window.setTimeout(() => setSavedKo(''), 2200);
              });
            }}
          >
            {saveBusy ? '저장중…' : dirty ? '저장' : '저장됨'}
          </button>
          <button
            type="button"
            className="tool-chip tool-chip-button"
            disabled={saveBusy}
            title="코드 기본값으로"
            onClick={() => {
              const d = defaultCoinSkillRisk(card.coin);
              setDraft({
                leverage: String(d.leverage),
                equityPct: String(d.equityPct),
                tp1RoePct: String(d.tp1RoePct),
                slRoePct: String(d.slRoePct),
              });
            }}
          >
            기본
          </button>
          {savedKo ? <small>{savedKo}</small> : null}
        </div>
      </div>
      <div className={styles.skillExclusive} aria-label={`${card.coin} 전용스킬`}>
        <div className={styles.skillRiskHead}>
          <b>사용 스킬</b>
          <span>15분밴드자동만 · 구스킬 숨김</span>
        </div>
        <div className={styles.skillExclusiveRow}>
          {listTradeWindowExclusiveSkills(card.coin).map((def) => {
            const on = exclusive[def.id] !== false;
            return (
              <button
                key={def.id}
                type="button"
                className={styles.skillExChip}
                data-on={on ? '1' : '0'}
                disabled={exclusiveBusy}
                title={`${def.nameKo} · ${on ? 'ON' : 'OFF'}`}
                onClick={() => void onToggleExclusive(def.id, !on)}
              >
                {def.emoji}
                {def.nameKo}
                <i>{on ? 'ON' : 'OFF'}</i>
              </button>
            );
          })}
        </div>
      </div>
      <div className={styles.skillBar}>
        <i style={{ width: `${card.vitality}%` }} />
      </div>
      {heights.length > 0 ? (
        <div className={styles.skillSpark} aria-hidden>
          {card.spark.map((n, i) => (
            <i
              key={i}
              data-up={n >= 0 ? '1' : '0'}
              style={{ height: `${heights[i]}%` }}
              title={`${n >= 0 ? '+' : ''}${n.toFixed(2)}U`}
            />
          ))}
        </div>
      ) : (
        <div className={styles.skillFoot}>최근 청산 스파크 없음 · 진입 후 표시</div>
      )}
      <div className={styles.skillPills}>
        {card.skills
          .filter((s) => s.held)
          .slice(0, 6)
          .map((s) => (
            <span
              key={s.id}
              className={styles.skillPill}
              data-on="1"
              data-hot={s.entries > 0 ? '1' : '0'}
              title={`${s.nameKo} · 진입${s.entries} · 승${s.wins}/패${s.losses} · TP${s.tpHits}`}
            >
              {s.emoji}
              {s.nameKo}
              {s.entries > 0 ? ` ${s.entries}` : ''}
            </span>
          ))}
      </div>
      <div className={styles.skillFoot}>
        {card.topSignalKo
          ? `실전최다 · ${card.topSignalKo}`
          : '실전 진입 이력 없음 · 확정 수익 아님'}
      </div>
      {card.paperCount > 0 ? (
        <div
          className={styles.skillFoot}
          style={{ color: '#fbbf24', whiteSpace: 'normal' }}
          title={card.paperNoteKo}
        >
          ⚠️ {card.paperNoteKo}
        </div>
      ) : null}
    </div>
  );
}

function symTradeLabel(
  shortKo: string,
  enabled: boolean,
  posDir: 'LONG' | 'SHORT' | null,
  scanning: boolean
): { on: boolean; label: string; title: string } {
  if (!enabled) {
    return { on: false, label: `${shortKo}끔`, title: `${shortKo} 칩 OFF` };
  }
  if (posDir === 'LONG' || posDir === 'SHORT') {
    const dir = posDir === 'LONG' ? '롱' : '숏';
    return {
      on: true,
      label: `${shortKo}${dir}`,
      title: `${shortKo} 매매 진행 · ${dir} 포지션`,
    };
  }
  if (scanning) {
    return {
      on: true,
      label: `${shortKo}스캔`,
      title: `${shortKo} 매매 스캔·신호 대기 중`,
    };
  }
  return { on: false, label: `${shortKo}대기`, title: `${shortKo} 대기` };
}

export default function MergedDeskAutoTradePanel({
  symbol,
  timeframe,
  onClose,
  uiVisible = true,
  onOpenUi,
  onConfigChange,
  onStatusKo,
  onPaperTestResult,
  liveStatusKo,
  scalpStripKo = '자동초단 · 대기',
  scalpDetailKo = '폭락존 터치 → SFP → 로켓 · 페이퍼만',
  scalpTrade = null,
  fourStrategyCards = [],
  fourStrategyStripKo = '4전략 · 대기',
  virtAnalysisStripKo = '분석스캔 · 대기',
  livePrice = null,
  onVirtualSessionStart,
  onVirtualSessionStop,
  planDirection = null,
  planEntry = null,
  planSl = null,
  planTp1 = null,
  tapOnly: tapOnlyProp,
}: Props) {
  const tapOnly = tapOnlyProp ?? isTapointTapOnly();
  const [cfg, setCfg] = useState<MergedDeskAutoTradeConfig>(() => readAutoTradeConfig());
  const [keys, setKeys] = useState<ExchangeKeysStatus | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [probeLines, setProbeLines] = useState<string[]>([]);
  const [probeFailClass, setProbeFailClass] = useState<string | null>(null);
  const [tgTestBusy, setTgTestBusy] = useState<string | null>(null);
  const [tgTestMsg, setTgTestMsg] = useState('');
  const [tgEnvKo, setTgEnvKo] = useState('');
  const [tab, setTab] = useState<TabId>('desk');
  useEffect(() => {
    if (!tapOnly) return;
    if (tab === 'scalp' || tab === 'stats' || tab === 'guide') setTab('desk');
  }, [tapOnly, tab]);
  const [minimized, setMinimized] = useState(false);
  const [journalTick, setJournalTick] = useState(0);
  const [journalSub, setJournalSub] = useState<JournalSubTab>('open');
  const [statsCoin, setStatsCoin] = useState<StatsCoinFilter>('ALL');
  const [xrpReplayBusy, setXrpReplayBusy] = useState(false);
  const [xrpReplay, setXrpReplay] = useState<{
    summaryKo: string;
    hintKo: string;
    overall: Array<{
      strategyId: string;
      labelKo: string;
      tradeCount: number;
      wins: number;
      losses: number;
      winRate: number | null;
      tpHits: number;
      slHits: number;
      timeExits: number;
      avgWinPct: number;
      avgLossPct: number;
      avgMfePct: number;
      avgMaePct: number;
      medianSlDistPct: number;
      medianTpDistPct: number;
      longCount: number;
      shortCount: number;
      noteKo: string;
    }>;
    tfs: Array<{
      timeframe: string;
      summaryKo: string;
      candleCount: number;
      daysCovered: number;
      tradeCountFull?: number;
      byStrategy: Array<{
        labelKo: string;
        tradeCount: number;
        winRate: number | null;
        tpHits: number;
        slHits: number;
        medianSlDistPct: number;
        medianTpDistPct: number;
        noteKo: string;
      }>;
    }>;
    sources?: Record<string, string>;
    errors?: Array<{ tf: string; msg: string }>;
  } | null>(null);
  const [btcRocketBusy, setBtcRocketBusy] = useState(false);
  const [btcRocketReplay, setBtcRocketReplay] = useState<{
    summaryKo: string;
    hintKo: string;
    source?: string;
    daysCovered: number;
    candleCount: number;
    rocketLong: number;
    rocketShort: number;
    tradeCount: number;
    wins: number;
    losses: number;
    winRate: number | null;
    tpHits: number;
    slHits: number;
    timeExits: number;
    avgMfePct: number;
    avgMaePct: number;
    avgWinMovePct: number;
    avgLossMovePct: number;
    medianSlDistPct: number;
    suggestSlPricePct: number;
    suggestTpPricePct: number;
    bestLeverage: number;
    bestLevKo: string;
    lev30: {
      suggestTpRoePct: number;
      suggestSlRoePct: number;
      feeRoundTripMarginPct: number;
      fundingHalfHourMarginPct: number;
      netTpRoeAfterFeePct: number;
      detailKo: string[];
    };
    leverageTable: Array<{
      leverage: number;
      suggestTpRoePct: number;
      suggestSlRoePct: number;
      roundTripFeeMarginPct: number;
      avgWinNetRoePct: number;
      avgLossNetRoePct: number;
      netEvRoePct: number;
      feeShareOfWinPct: number;
      okKo: string;
    }>;
    equityCurve: Array<{ i: number; cumMovePct: number; cumRoe30: number }>;
  } | null>(null);
  const [ethDumpBusy, setEthDumpBusy] = useState(false);
  const [ethDumpReplay, setEthDumpReplay] = useState<CoinYearUiPack | null>(null);
  const [bnbSfpBusy, setBnbSfpBusy] = useState(false);
  const [bnbSfpReplay, setBnbSfpReplay] = useState<CoinYearUiPack | null>(null);
  const [scoreTick, setScoreTick] = useState(0);
  const [skillRiskMap, setSkillRiskMap] = useState<CoinSkillRiskMap>(() =>
    typeof window !== 'undefined' ? readCoinSkillRiskMap() : {}
  );
  const [skillRiskBusyCoin, setSkillRiskBusyCoin] = useState<string | null>(null);
  const [exclusiveMap, setExclusiveMap] = useState<CoinExclusiveSkillMap>(() =>
    typeof window !== 'undefined' ? readCoinExclusiveSkillMap() : {}
  );
  const [exclusiveBusyCoin, setExclusiveBusyCoin] = useState<string | null>(null);
  const [skillColors, setSkillColors] = useState<SkillColorPack>(() =>
    typeof window !== 'undefined' ? readSkillColors() : DEFAULT_SKILL_COLORS
  );
  const [livePos, setLivePos] = useState<LivePosition | null>(null);
  const [livePosBtc, setLivePosBtc] = useState<LivePosition | null>(null);
  const [livePosEth, setLivePosEth] = useState<LivePosition | null>(null);
  const [livePosBnb, setLivePosBnb] = useState<LivePosition | null>(null);
  const [livePosXrp, setLivePosXrp] = useState<LivePosition | null>(null);
  const [livePosSol, setLivePosSol] = useState<LivePosition | null>(null);
  const [posAvailUsdt, setPosAvailUsdt] = useState<number | null>(null);
  const [posMsg, setPosMsg] = useState('');
  const [posBusy, setPosBusy] = useState(false);
  const [testDetail, setTestDetail] = useState<string[]>([]);
  const [healthReport, setHealthReport] = useState<TradeHealthReport | null>(null);
  const [testBusy, setTestBusy] = useState(false);
  const [virtSession, setVirtSession] = useState<VirtualTradeSession>(() =>
    readVirtualTradeSession()
  );
  const [seedStr, setSeedStr] = useState(() => {
    const led = typeof window !== 'undefined' ? readVirtualSeedLedger() : { seedUsdt: 1000 };
    return String(led.seedUsdt || 1000);
  });
  const [seedTick, setSeedTick] = useState(0);
  const [clockTick, setClockTick] = useState(0);
  const [side, setSide] = useState<'LONG' | 'SHORT'>(() =>
    planDirection === 'SHORT' ? 'SHORT' : 'LONG'
  );
  const [entryStr, setEntryStr] = useState('');
  const [slStr, setSlStr] = useState('');
  const [tp1Str, setTp1Str] = useState('');
  const [pos, setPos] = useState({ x: 24, y: 72 });
  const dragRef = useRef<{ ox: number; oy: number; px: number; py: number } | null>(null);
  const planSigRef = useRef('');
  /** 심볼별 마지막 마크·미실현 — 거래소 청산 직후 성적부 손익 복원용 */
  const lastLiveMarkPnlRef = useRef<Record<string, { mark: number; pnl: number }>>({});

  const refreshKeys = useCallback(async () => {
    const st = await fetchExchangeKeysStatus();
    setKeys(st);
  }, []);

  const refreshPosition = useCallback(async () => {
    const chartSym = (symbol || 'BTCUSDT').toUpperCase();
    /** 1회 조회로 BTC+ETH+BNB+XRP+SOL(+차트) 전부 — 수동 진입도 감지 */
    const pack = await fetchLivePosition(chartSym);
    if (!pack.configured) {
      if (pack.error) setPosMsg(pack.error);
      return;
    }
    setLivePos(pack.position);
    if (typeof pack.availableUsdt === 'number') setPosAvailUsdt(pack.availableUsdt);
    if (!pack.ok && pack.error) setPosMsg(pack.error);
    else setPosMsg('');

    const fromList = (id: 'BTCUSDT' | 'ETHUSDT' | 'BNBUSDT' | 'XRPUSDT' | 'SOLUSDT') =>
      pack.positions?.find((p) => String(p.symbol || '').toUpperCase() === id) ?? null;

    setLivePosBtc(
      pack.btcPosition ??
        fromList('BTCUSDT') ??
        (chartSym === 'BTCUSDT' || chartSym.startsWith('BTCUSDT') ? pack.position : null)
    );
    setLivePosEth(
      pack.ethPosition ??
        fromList('ETHUSDT') ??
        (chartSym === 'ETHUSDT' || chartSym.startsWith('ETHUSDT') ? pack.position : null)
    );
    setLivePosBnb(
      pack.bnbPosition ??
        fromList('BNBUSDT') ??
        (chartSym === 'BNBUSDT' || chartSym.startsWith('BNBUSDT') ? pack.position : null)
    );
    setLivePosXrp(
      pack.xrpPosition ??
        fromList('XRPUSDT') ??
        (chartSym === 'XRPUSDT' || chartSym.startsWith('XRPUSDT') ? pack.position : null)
    );
    setLivePosSol(
      pack.solPosition ??
        fromList('SOLUSDT') ??
        (chartSym === 'SOLUSDT' || chartSym.startsWith('SOLUSDT') ? pack.position : null)
    );

    /** 거래소에서 이미 사라진 실전 오픈 → 성적부 청산(손익 반영) */
    try {
      const liveList = [
        pack.btcPosition,
        pack.ethPosition,
        pack.bnbPosition,
        pack.xrpPosition,
        pack.solPosition,
        ...(Array.isArray(pack.positions) ? pack.positions : []),
        pack.position,
      ].filter((p): p is NonNullable<typeof p> => Boolean(p && Number(p.size) > 0));
      const liveSymbols = new Set(
        liveList.map((p) => String(p.symbol || '').toUpperCase()).filter(Boolean)
      );
      const lastMarkBySymbol: Record<string, number> = {};
      const lastPnlBySymbol: Record<string, number> = {};
      for (const p of liveList) {
        const id = String(p.symbol || '').toUpperCase();
        if (!id) continue;
        const mark = Number(p.markPrice) > 0 ? Number(p.markPrice) : Number(p.entryPrice) || 0;
        const pnl = Number.isFinite(Number(p.unrealizedPnl)) ? Number(p.unrealizedPnl) : 0;
        if (mark > 0) lastMarkBySymbol[id] = mark;
        lastPnlBySymbol[id] = pnl;
        lastLiveMarkPnlRef.current[id] = { mark: mark || lastLiveMarkPnlRef.current[id]?.mark || 0, pnl };
      }
      /** 사라진 심볼은 직전 캐시 사용 */
      for (const [id, cached] of Object.entries(lastLiveMarkPnlRef.current)) {
        if (liveSymbols.has(id)) continue;
        if (!(id in lastMarkBySymbol) && cached.mark > 0) lastMarkBySymbol[id] = cached.mark;
        if (!(id in lastPnlBySymbol) && Number.isFinite(cached.pnl)) {
          lastPnlBySymbol[id] = cached.pnl;
        }
      }
      const closedNow = reconcileLiveScoreOpens({
        liveSymbols,
        lastMarkBySymbol,
        lastPnlBySymbol,
      });
      if (closedNow.length) setScoreTick((v) => v + 1);
      /** 청산된 심볼 진입신호 라벨 제거 */
      for (const id of Object.keys(lastLiveMarkPnlRef.current)) {
        if (!liveSymbols.has(id)) clearPositionEntryLabel(id);
      }
    } catch {
      /* ignore */
    }

    /** 서버 진입메모 → 포지션 카드 신호 한 줄 */
    try {
      const snap = await fetchServerArmHealth();
      if (snap.ok && snap.entryMemos && Object.keys(snap.entryMemos).length > 0) {
        setScoreTick((v) => v + 1);
      }
    } catch {
      /* ignore */
    }
  }, [symbol]);

  useEffect(() => {
    void refreshKeys();
    const t = window.setInterval(() => void refreshKeys(), 60_000);
    return () => window.clearInterval(t);
  }, [refreshKeys]);

  /** 서버·로컬 통계 복구 — 1회 실행분 유지 · 재다운 불필요 */
  useEffect(() => {
    let cancelled = false;
    void hydrateCoinStatsFromServer().then((h) => {
      if (cancelled) return;
      const packs = h.packs;
      const profiles = h.profiles;
      const asBtc = packs.BTC as typeof btcRocketReplay | undefined;
      if (asBtc?.summaryKo && typeof asBtc.tradeCount === 'number') {
        setBtcRocketReplay({
          ...asBtc,
          equityCurve: Array.isArray(asBtc.equityCurve) ? asBtc.equityCurve : [],
          leverageTable: Array.isArray(asBtc.leverageTable) ? asBtc.leverageTable : [],
        });
      } else if (profiles.BTC && profiles.BTC.sampleTrades > 0) {
        const p = profiles.BTC;
        setBtcRocketReplay({
          summaryKo: p.noteKo || `BTC 프로파일 복구 · 거래${p.sampleTrades}`,
          hintKo: '서버 프로파일 유지 · 재다운 불필요 · 곡선은 재실행 시 표시',
          daysCovered: 0,
          candleCount: 0,
          rocketLong: 0,
          rocketShort: 0,
          tradeCount: p.sampleTrades,
          wins: 0,
          losses: 0,
          winRate: p.winRate,
          tpHits: 0,
          slHits: 0,
          timeExits: 0,
          avgMfePct: p.avgMfePct,
          avgMaePct: p.avgMaePct,
          avgWinMovePct: 0,
          avgLossMovePct: 0,
          medianSlDistPct: p.slPricePct,
          suggestSlPricePct: p.slPricePct,
          suggestTpPricePct: p.tpPricePct,
          bestLeverage: p.leverage,
          bestLevKo: `${p.leverage}x · 서버복구`,
          lev30: {
            suggestTpRoePct: p.tpRoePct,
            suggestSlRoePct: p.slRoePct,
            feeRoundTripMarginPct: 0,
            fundingHalfHourMarginPct: 0,
            netTpRoeAfterFeePct: p.tpRoePct,
            detailKo: ['서버 프로파일 복구'],
          },
          leverageTable: [],
          equityCurve: [],
        });
      }
      const asEth = packs.ETH as CoinYearUiPack | undefined;
      if (asEth?.summaryKo && typeof asEth.tradeCount === 'number') {
        setEthDumpReplay(asEth);
      } else if (profiles.ETH && profiles.ETH.sampleTrades > 0) {
        const p = profiles.ETH;
        setEthDumpReplay({
          summaryKo: p.noteKo || `ETH 프로파일 복구 · 거래${p.sampleTrades}`,
          hintKo: '서버 프로파일 유지 · 재다운 불필요',
          tradeCount: p.sampleTrades,
          wins: 0,
          losses: 0,
          winRate: p.winRate,
          longCount: 0,
          shortCount: 0,
          tpHits: 0,
          slHits: 0,
          timeExits: 0,
          avgMfePct: p.avgMfePct,
          avgMaePct: p.avgMaePct,
          avgWinMovePct: 0,
          avgLossMovePct: 0,
          medianSlDistPct: p.slPricePct,
          suggestSlPricePct: p.slPricePct,
          suggestTpPricePct: p.tpPricePct,
          bestLeverage: p.leverage,
          bestLevKo: `${p.leverage}x · 서버복구`,
          preferTfs: p.preferTfs,
          skipTfs: p.skipTfs,
          lev30: {
            suggestTpRoePct: p.tpRoePct,
            suggestSlRoePct: p.slRoePct,
            feeRoundTripMarginPct: 0,
            fundingHalfHourMarginPct: 0,
            netTpRoeAfterFeePct: p.tpRoePct,
            detailKo: ['서버 프로파일 복구'],
          },
          leverageTable: [],
          byTf: [],
        });
      }
      const asBnb = packs.BNB as CoinYearUiPack | undefined;
      if (asBnb?.summaryKo && typeof asBnb.tradeCount === 'number') {
        setBnbSfpReplay(asBnb);
      } else if (profiles.BNB && profiles.BNB.sampleTrades > 0) {
        const p = profiles.BNB;
        setBnbSfpReplay({
          summaryKo: p.noteKo || `BNB 프로파일 복구 · 거래${p.sampleTrades}`,
          hintKo: '서버 프로파일 유지 · 재다운 불필요',
          tradeCount: p.sampleTrades,
          wins: 0,
          losses: 0,
          winRate: p.winRate,
          longCount: 0,
          shortCount: 0,
          tpHits: 0,
          slHits: 0,
          timeExits: 0,
          avgMfePct: p.avgMfePct,
          avgMaePct: p.avgMaePct,
          avgWinMovePct: 0,
          avgLossMovePct: 0,
          medianSlDistPct: p.slPricePct,
          suggestSlPricePct: p.slPricePct,
          suggestTpPricePct: p.tpPricePct,
          bestLeverage: p.leverage,
          bestLevKo: `${p.leverage}x · 서버복구`,
          preferTfs: p.preferTfs,
          skipTfs: p.skipTfs,
          lev30: {
            suggestTpRoePct: p.tpRoePct,
            suggestSlRoePct: p.slRoePct,
            feeRoundTripMarginPct: 0,
            fundingHalfHourMarginPct: 0,
            netTpRoeAfterFeePct: p.tpRoePct,
            detailKo: ['서버 프로파일 복구'],
          },
          leverageTable: [],
          byTf: [],
        });
      }
      const asXrp = packs.XRP as typeof xrpReplay | undefined;
      if (asXrp?.summaryKo && Array.isArray(asXrp.overall)) {
        setXrpReplay(asXrp);
      } else if (asXrp?.summaryKo && typeof (asXrp as { tradeCount?: number }).tradeCount === 'number') {
        /** slim 팩(요약형) — overall UI 없어도 요약 복구 */
        const p = asXrp as unknown as {
          summaryKo: string;
          hintKo?: string;
          tradeCount: number;
          wins?: number;
          losses?: number;
          winRate?: number | null;
          preferTfs?: string[];
          sources?: Record<string, string>;
        };
        setXrpReplay({
          summaryKo: p.summaryKo,
          hintKo: p.hintKo || '서버복구 · 재다운 불필요',
          overall: [
            {
              strategyId: 'restored',
              labelKo: '복구요약',
              tradeCount: p.tradeCount,
              wins: p.wins || 0,
              losses: p.losses || 0,
              winRate: p.winRate ?? null,
              tpHits: 0,
              slHits: 0,
              timeExits: 0,
              avgWinPct: 0,
              avgLossPct: 0,
              avgMfePct: 0,
              avgMaePct: 0,
              medianSlDistPct: 0,
              medianTpDistPct: 0,
              longCount: 0,
              shortCount: 0,
              noteKo: `선호TF ${(p.preferTfs || []).join(',') || '—'} · 프로파일 유지`,
            },
          ],
          tfs: [],
          sources: p.sources,
        });
      }
      const restoredN = Object.keys(profiles).length;
      if (h.restoredKo) {
        setMsg(
          restoredN > 0
            ? `${h.restoredKo} · 프로파일 ${restoredN}코인 유지`
            : h.restoredKo
        );
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once
  }, []);

  /** 타점 누적(성적·거절·저널·시드·진입라벨) 서버 머지 · 패치 후에도 유지 */
  useEffect(() => {
    let cancelled = false;
    void hydrateTapointAccumFromServer().then((h) => {
      if (cancelled) return;
      if (h.ok) {
        setScoreTick((v) => v + 1);
        setJournalTick((v) => v + 1);
        setMsg((prev) => (prev ? prev : h.restoredKo));
      }
    });
    void refreshTelegramEnv();
    void hydrateSkillRisk();
    void hydrateExclusiveSkills();
    return () => {
      cancelled = true;
    };
  }, []);

  /** 차트 BTC↔ETH 전환 시 실전·API 유지 · 심볼칩 OFF는 유지(강제 재ON 금지) */
  useEffect(() => {
    const before = readAutoTradeConfig();
    let healed = ensureAutoTradeSymbolEnabled(before, symbol);
    /** 동시한도만 보정 · enabledSymbols는 사용자 칩 선택 유지 */
    if (healed.liveArmed && Number(healed.maxConcurrent) < AUTO_TRADE_MAX_CONCURRENT) {
      healed = writeAutoTradeConfig({
        maxConcurrent: AUTO_TRADE_MAX_CONCURRENT,
        enabled: true,
        liveArmed: true,
        tradingMode: 'LIVE',
      });
    }
    setCfg(healed);
    if (healed.updatedAt !== before.updatedAt) onConfigChange?.(healed);
    void refreshKeys();
    void refreshPosition();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 심볼 전환만
  }, [symbol]);

  /** VMAX 칩·주문설정과 양방향 동기화 */
  useEffect(() => {
    const bump = () => setCfg(readAutoTradeConfig());
    window.addEventListener(AUTO_TRADE_CFG_EVENT, bump);
    return () => window.removeEventListener(AUTO_TRADE_CFG_EVENT, bump);
  }, []);

  useEffect(() => {
    /** 실전 ARM이면 키 상태와 무관하게 포지션 폴링 시도 (수동 ETH 숏 감지) */
    if (!keys?.configured && !cfg.liveArmed) return;
    void refreshPosition();
    const ms = tab === 'pos' || cfg.liveArmed ? 8_000 : 16_000;
    const clear = setVisibleInterval(() => void refreshPosition(), ms);
    return () => clear();
  }, [keys?.configured, tab, cfg.liveArmed, refreshPosition]);

  /**
   * 실전: ROE≥TP1(기본 8%)이면 자동 익절.
   * 가상 maybeVirtualTp1Half와 대칭 — 초단 페이퍼 이벤트 없어도 동작.
   */
  useEffect(() => {
    if (!cfg.liveArmed || !keys?.configured) return;
    const list = [livePosBtc, livePosEth, livePosBnb, livePosXrp, livePosSol, livePos].filter(
      (p): p is LivePosition => Boolean(p && p.size > 0)
    );
    /** 심볼 중복 제거 */
    const uniq = new Map<string, LivePosition>();
    for (const p of list) {
      const k = String(p.symbol || '').toUpperCase();
      if (k && !uniq.has(k)) uniq.set(k, p);
    }
    const positions = [...uniq.values()];
    if (!positions.length) return;

    let cancelled = false;
    void tickLiveRoeExits({ positions, cfg }).then((r) => {
      if (cancelled || !r.acted) return;
      const line = r.msgs.join(' · ') || '실전 ROE익절';
      setMsg(line);
      setPosMsg(line);
      onStatusKo?.(line);
      void refreshPosition();
    });
    return () => {
      cancelled = true;
    };
  }, [
    cfg.liveArmed,
    cfg.scalpTp1RoePct,
    cfg.scalpTp2RoePct,
    cfg.scalpLockRoePct,
    cfg.scalpExitMode,
    keys?.configured,
    livePosBtc?.roePct,
    livePosBtc?.markPrice,
    livePosBtc?.size,
    livePosEth?.roePct,
    livePosEth?.markPrice,
    livePosEth?.size,
    livePosBnb?.roePct,
    livePosBnb?.markPrice,
    livePosBnb?.size,
    livePosXrp?.roePct,
    livePosXrp?.markPrice,
    livePosXrp?.size,
    livePosSol?.roePct,
    livePosSol?.markPrice,
    livePosSol?.size,
    livePos?.roePct,
    livePos?.markPrice,
    livePos?.size,
    refreshPosition,
    onStatusKo,
  ]);

  useEffect(() => {
    if (!cfg.liveArmed) return;
    void syncServerArm(cfg);
  }, [
    cfg.liveArmed,
    cfg.leverage,
    cfg.marginMode,
    cfg.maxConcurrent,
    cfg.scalpSlRoePct,
    cfg.scalpTp1RoePct,
    // 칩 ON/OFF 문자열로 감지 · 서버 ARM 즉시 반영
    (cfg.enabledSymbols || []).join(','),
  ]);

  useEffect(() => {
    const sig = `${planEntry ?? ''}|${planSl ?? ''}|${planTp1 ?? ''}`;
    if (sig === planSigRef.current) return;
    planSigRef.current = sig;
    if (planEntry != null && planEntry > 0) setEntryStr(String(planEntry));
    if (planSl != null && planSl > 0) setSlStr(String(planSl));
    if (planTp1 != null && planTp1 > 0) setTp1Str(String(planTp1));
  }, [planEntry, planSl, planTp1]);

  useEffect(() => {
    if (tab !== 'journal') return;
    const clear = setVisibleInterval(() => setJournalTick((v) => v + 1), 12_000);
    return () => clear();
  }, [tab]);

  useEffect(() => {
    if (!virtSession.position) return;
    const clear = setVisibleInterval(() => setClockTick((v) => v + 1), 2500);
    return () => clear();
  }, [virtSession.position?.id]);

  /** AIZONE 3칸 — 스냅 게시·주기 갱신 */
  useEffect(() => {
    const bump = () => setClockTick((v) => v + 1);
    const onSnap = () => bump();
    window.addEventListener(AI_ZONE_SNAP_EVENT, onSnap);
    const clear = setVisibleInterval(bump, 3000);
    return () => {
      window.removeEventListener(AI_ZONE_SNAP_EVENT, onSnap);
      clear();
    };
  }, []);

  const patch = (p: Partial<MergedDeskAutoTradeConfig>) => {
    const next = writeAutoTradeConfig(p);
    setCfg(next);
    onConfigChange?.(next);
    if (p.liveArmed != null || next.liveArmed) {
      void syncServerArm(next);
    }
  };

  const formatProbeFromJson = (j: Record<string, unknown>): string => {
    const steps = Array.isArray(j.steps) ? (j.steps as Array<{ ok?: boolean; labelKo?: string; detailKo?: string; code?: string }>) : [];
    const lines: string[] = [];
    lines.push('Bitget Credential Check');

    const cred = (j.credential || {}) as {
      apiKeyMasked?: string;
      credentialId?: string;
      apiKeyLength?: number | { original?: number; decrypted?: number; match?: boolean };
      secretKeyLength?: number | { original?: number; decrypted?: number; match?: boolean };
      passphraseLength?: number | { original?: number; decrypted?: number; match?: boolean };
    };
    if (cred.apiKeyMasked) {
      lines.push(`Bitget Credential: ${cred.apiKeyMasked}`);
      lines.push('(Bitget API 관리 화면 Key 앞4·뒤4와 같은지 확인)');
    }
    if (cred.credentialId) lines.push(`credentialId · ${cred.credentialId}`);

    const rt = (j.roundtrip || null) as {
      ok?: boolean;
      apiKeyHashMatch?: boolean;
      secretHashMatch?: boolean;
      passphraseHashMatch?: boolean;
      apiKeyLength?: { original: number; decrypted: number; match: boolean };
      secretKeyLength?: { original: number; decrypted: number; match: boolean };
      passphraseLength?: { original: number; decrypted: number; match: boolean };
      apiKeyHashPrefix?: string;
      secretHashPrefix?: string;
      passphraseHashPrefix?: string;
      issuesKo?: string[];
    } | null;

    if (rt) {
      lines.push(
        `${rt.ok ? 'PASS' : 'FAIL'} · Credential decrypt · hash/length ${
          rt.ok ? '동일' : '불일치'
        }`
      );
      if (rt.apiKeyLength) {
        lines.push(
          `API Key length · in ${rt.apiKeyLength.original} / out ${rt.apiKeyLength.decrypted} · ${
            rt.apiKeyLength.match && rt.apiKeyHashMatch ? 'PASS' : 'FAIL'
          }`
        );
      }
      if (rt.secretKeyLength) {
        lines.push(
          `Secret length · in ${rt.secretKeyLength.original} / out ${rt.secretKeyLength.decrypted} · ${
            rt.secretKeyLength.match && rt.secretHashMatch ? 'PASS' : 'FAIL'
          }`
        );
      }
      if (rt.passphraseLength) {
        lines.push(
          `Passphrase length · in ${rt.passphraseLength.original} / out ${rt.passphraseLength.decrypted} · ${
            rt.passphraseLength.match && rt.passphraseHashMatch ? 'PASS' : 'FAIL'
          }`
        );
      }
      if (rt.apiKeyHashPrefix) {
        lines.push(
          `SHA256 prefix · Key ${rt.apiKeyHashPrefix} · Secret ${rt.secretHashPrefix} · Pass ${rt.passphraseHashPrefix}`
        );
      }
      if (rt.issuesKo?.length) {
        for (const iss of rt.issuesKo) lines.push(`무결성 · ${iss}`);
      }
    } else if (typeof cred.apiKeyLength === 'number') {
      lines.push(
        `길이 · Key ${cred.apiKeyLength} / Secret ${cred.secretKeyLength ?? '?'} / Pass ${cred.passphraseLength ?? '?'}`
      );
    }

    const san = (j.sanitize || null) as {
      fieldIssues?: Array<{ field: string; issues: string[] }>;
      apiKeyLength?: number;
      secretKeyLength?: number;
      passphraseLength?: number;
    } | null;
    if (san?.fieldIssues?.length) {
      for (const fi of san.fieldIssues) {
        lines.push(`입력오염 · ${fi.field}: ${fi.issues.join(', ')} (저장 전 제거됨)`);
      }
    }

    if (j.integrityOk === false) {
      lines.push('FAILED STEP · CREDENTIAL_DECRYPT');
      setProbeLines(lines);
      setProbeFailClass('CREDENTIAL_DECRYPT');
      return String(j.msg || 'Credential decrypt FAIL');
    }

    if (steps.length) {
      lines.push('— Bitget API Test —');
      for (const s of steps) {
        lines.push(`${s.ok ? 'PASS' : 'FAIL'} · ${s.labelKo || '?'} · ${s.detailKo || ''}`);
      }
    }

    const diag = (j.diag || {}) as {
      outboundIp?: string;
      timeDiffMs?: number;
      failClass?: string;
      shapeHints?: string[];
      headerCheck?: Record<string, string>;
    };
    if (diag.outboundIp) lines.push(`Outbound IP · ${diag.outboundIp}`);
    if (diag.timeDiffMs != null) lines.push(`timeDiff · ${diag.timeDiffMs}ms`);
    if (diag.headerCheck) {
      lines.push('Header · ACCESS-KEY=apiKey · ACCESS-PASSPHRASE=passphrase · SIGN=secret만');
    }
    if (diag.shapeHints?.length) {
      for (const h of diag.shapeHints) lines.push(`진단 · ${h}`);
    }
    const attempts = (diag as { passphraseAttempts?: Array<{ mode: string; code: string }> }).passphraseAttempts;
    if (attempts?.length) {
      lines.push(
        `Passphrase header 시도 · ${attempts.map((a) => `${a.mode}=${a.code || '?'}`).join(' / ')}`
      );
    }

    const codeClass = (j.bitgetCodeClass || null) as { classId?: string; meaningKo?: string } | null;
    if (j.failClass) lines.push(`ERROR CLASS · ${String(j.failClass)}`);
    if (codeClass?.classId) lines.push(`CODE MAP · ${codeClass.classId} · ${codeClass.meaningKo || ''}`);

    if (!j.ok && typeof j.msg === 'string') {
      const failStep = steps.find((s) => !s.ok);
      if (failStep?.code) lines.push(`ERROR CODE · ${failStep.code}`);
      lines.push(`FAILED STEP · ${failStep?.labelKo || 'AUTH'}`);
      if (failStep?.code === '40012' || codeClass?.classId === 'CREDENTIAL_MISMATCH') {
        lines.push('→ 40012 = Credential mismatch (Key/Passphrase)');
        lines.push('→ 저장·복호화가 PASS면 Bitget에 등록된 Key/Passphrase와 UI 입력 불일치');
        lines.push(`→ 화면에 표시된 Key ${cred.apiKeyMasked || '?'} 를 Bitget 관리화면과 대조`);
        lines.push('→ HMAC 코드 수정 대상 아님');
      } else if (failStep?.code === '40009') {
        lines.push('→ 40009 = Signature 오류 · Secret/서명 경로 점검');
      } else if (failStep?.code === '40008') {
        lines.push('→ 40008 = Timestamp');
      } else if (failStep?.code === '40014') {
        lines.push('→ 40014 = Permission');
      }
    }

    const hint =
      j.readyForPaper === true
        ? 'READY FOR PAPER'
        : j.ok
          ? 'AUTH PASS'
          : String(j.msg || j.error || '인증 실패');
    setProbeLines(lines);
    setProbeFailClass(j.ok ? null : String(j.failClass || codeClass?.classId || diag.failClass || ''));
    return hint;
  };

  const saveKeys = async () => {
    const k = apiKey.trim();
    const s = apiSecret.trim();
    const p = passphrase.trim();
    if (!k || !s || !p) {
      setMsg('저장·인증: API Key / Secret / Passphrase 세 칸 모두 입력하세요');
      setProbeLines(['Bitget Credential Check', 'FAIL · 입력 누락 · 세 값 모두 필요']);
      return;
    }
    setBusy(true);
    setMsg('저장·인증 중… (Bitget 응답 대기 · IP·키 확인 수 초~수십 초)');
    setProbeLines(['Bitget Credential Check', '요청 중…']);
    setProbeFailClass(null);
    try {
      const res = await fetch('/api/merged-desk/exchange-keys', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: k,
          apiSecret: s,
          passphrase: p,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (res.status === 401 || j.code === 'SITE_AUTH_REQUIRED') {
        setMsg('저장·인증 실패 · 사이트 로그인이 필요합니다 (새로고침 후 로그인)');
        setProbeLines(['Bitget Credential Check', 'FAIL · 로그인 필요 · 401']);
        setProbeFailClass('SITE_AUTH_REQUIRED');
        return;
      }
      if (res.status === 503 || j.code === 'SITE_AUTH_MISCONFIGURED') {
        setMsg('서버 인증 시크릿 미설정 · 관리자 APP_SESSION_SECRET 확인');
        setProbeLines(['Bitget Credential Check', 'FAIL · SITE_AUTH_MISCONFIGURED']);
        setProbeFailClass('SITE_AUTH_MISCONFIGURED');
        return;
      }
      let line = formatProbeFromJson(j);
      if (!j.ok && typeof j.error === 'string' && !j.msg) {
        line = String(j.error);
      }
      if (!j.ok && j.diag) {
        const d = j.diag as {
          keyLen?: number;
          secretLen?: number;
          passLen?: number;
          keyPrefix?: string;
          looksRsa?: boolean;
        };
        line += ` · Key${d.keyLen ?? '?'}자(${d.keyPrefix || '?'}…) Secret${d.secretLen ?? '?'}자 Pass${d.passLen ?? '?'}자${
          d.looksRsa ? ' ·RSA감지' : ''
        }`;
      }
      setMsg(line || (j.ok ? '저장·인증 OK' : '저장·인증 실패'));
      /** 인증 성공 시에만 시크릿 칸 비움 · 실패면 다시 고치기 쉽게 유지 */
      if (j.ok) {
        setApiSecret('');
        setPassphrase('');
      }
      await refreshKeys();
      if (!j.ok) patch({ liveArmed: false });
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'network');
      setProbeLines(['Bitget Credential Check', `FAIL · ${e instanceof Error ? e.message : 'network'}`]);
    } finally {
      setBusy(false);
    }
  };

  const testKeys = async () => {
    setBusy(true);
    setMsg('');
    setProbeLines([]);
    setProbeFailClass(null);
    try {
      const res = await fetch('/api/merged-desk/bitget-probe', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(apiKey && apiSecret && passphrase ? { apiKey, apiSecret, passphrase } : {}),
        }),
      });
      const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      const hint = formatProbeFromJson(j);
      setMsg(
        j.ok
          ? `${hint}${j.availableUsdt != null ? ` · 가용≈${Number(j.availableUsdt).toFixed(2)} USDT` : ''}`
          : hint
      );
      await refreshKeys();
      if (!j.ok) patch({ liveArmed: false });
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'network');
    } finally {
      setBusy(false);
    }
  };

  const clearKeys = async () => {
    setBusy(true);
    try {
      await fetch('/api/merged-desk/exchange-keys', {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      patch({ liveArmed: false });
      setLivePos(null);
      setLivePosBtc(null);
      setLivePosEth(null);
      setLivePosBnb(null);
      setLivePosXrp(null);
      setMsg('API 키 삭제됨 · 페이퍼만');
      await refreshKeys();
    } finally {
      setBusy(false);
    }
  };

  const closeLivePosition = async (pos: LivePosition) => {
    if (!window.confirm(`${pos.symbol} ${pos.direction} 전량 청산할까요?`)) return;
    setPosBusy(true);
    setPosMsg('');
    try {
      const r = await postLiveOrder({
        action: 'close',
        symbol: pos.symbol,
        direction: pos.direction,
        leverage: pos.leverage,
        size: String(pos.size),
        price: pos.markPrice || pos.entryPrice,
        marginMode: pos.marginMode,
        source: 'manual',
      });
      setPosMsg(r.ok ? `${pos.symbol} 청산 요청됨` : r.error || r.msg || '청산 실패');
      await refreshPosition();
    } finally {
      setPosBusy(false);
    }
  };

  const reverseLivePosition = async (pos: LivePosition) => {
    const nextDir = pos.direction === 'LONG' ? 'SHORT' : 'LONG';
    if (
      !window.confirm(
        `${pos.symbol} ${pos.direction} → ${nextDir} 반전 (청산 후 시장가 진입)`
      )
    ) {
      return;
    }
    setPosBusy(true);
    setPosMsg('');
    try {
      const closeR = await postLiveOrder({
        action: 'close',
        symbol: pos.symbol,
        direction: pos.direction,
        leverage: pos.leverage,
        size: String(pos.size),
        price: pos.markPrice || pos.entryPrice,
        marginMode: pos.marginMode,
        source: 'manual',
      });
      if (!closeR.ok) {
        setPosMsg(closeR.error || closeR.msg || '청산 실패');
        return;
      }
      const openR = await postLiveOrder({
        action: 'open',
        symbol: pos.symbol,
        direction: nextDir,
        leverage: pos.leverage,
        sizeMode: 'fixedUsdt',
        marginUsdt: Math.max(1, pos.marginUsdt),
        price: pos.markPrice || pos.entryPrice,
        marginMode: pos.marginMode,
        source: 'manual',
      });
      setPosMsg(openR.ok ? `${pos.symbol} 반전 ${nextDir}` : openR.error || openR.msg || '반전 진입 실패');
      await refreshPosition();
    } finally {
      setPosBusy(false);
    }
  };

  useEffect(() => {
    const sync = () => setVirtSession(readVirtualTradeSession());
    sync();
    window.addEventListener(VIRTUAL_TRADE_EVENT, sync);
    const seedSync = () => setSeedTick((v) => v + 1);
    window.addEventListener(VIRTUAL_SEED_EVENT, seedSync);
    const scoreSync = () => setScoreTick((v) => v + 1);
    window.addEventListener(SIGNAL_SCORECARD_EVENT, scoreSync);
    try {
      const led = readVirtualSeedLedger();
      if (hydrateScorecardFromSeedTrades(led.trades)) setScoreTick((v) => v + 1);
    } catch {
      /* ignore */
    }
    try {
      /** 기존 실전 청산 pnl=0 건 → entry/exit로 손익·승률 복구 */
      const repaired = repairZeroPnlClosedTrades({
        defaultLeverage: readAutoTradeConfig().leverage || 30,
        defaultMarginUsdt: 8,
      });
      if (repaired > 0) setScoreTick((v) => v + 1);
    } catch {
      /* ignore */
    }
    return () => {
      window.removeEventListener(VIRTUAL_TRADE_EVENT, sync);
      window.removeEventListener(VIRTUAL_SEED_EVENT, seedSync);
      window.removeEventListener(SIGNAL_SCORECARD_EVENT, scoreSync);
    };
  }, []);

  /** 가상 포지션 · 손절 → TP1 50% → 러너/본절 청산 → 재진입 대기 */
  useEffect(() => {
    if (!virtSession.active) return;
    if (!(livePrice != null && livePrice > 0)) return;
    let next = virtSession;
    if (virtSession.position) {
      next = maybeVirtualSlBeforeTp1(livePrice);
      next = maybeVirtualTp1Half(livePrice, 0.5);
      next = maybeVirtualRunnerOrBeClose(livePrice);
    } else if (virtSession.reentryWatch) {
      next = touchVirtualReentryExtreme(livePrice);
    }
    if (next.lastMsgKo !== virtSession.lastMsgKo || next.position !== virtSession.position || next.equityUsdt !== virtSession.equityUsdt) {
      setVirtSession(next);
      setSeedTick((v) => v + 1);
      onStatusKo?.(next.lastMsgKo);
    }
  }, [
    livePrice,
    virtSession.active,
    virtSession.position?.id,
    virtSession.position?.tp1Done,
    virtSession.reentryWatch?.exitAt,
    virtSession.lastMsgKo,
    virtSession.equityUsdt,
    onStatusKo,
  ]);

  /** 주문 진단 — 실제 주문 없이 AUTH/모드/사이즈/락 점검 */
  const runOrderDiag = async () => {
    setTestBusy(true);
    setMsg('');
    try {
      const res = await fetch('/api/merged-desk/order-diag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          symbol,
          equityPct: cfg.scalpEquityPct ?? cfg.equityPct,
          leverage: cfg.leverage ?? 10,
          price: livePos?.markPrice || livePos?.entryPrice || 0,
          marginMode: cfg.marginMode === 'crossed' ? 'crossed' : 'isolated',
        }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        lines?: string[];
        summaryKo?: string;
      };
      const lines = Array.isArray(j.lines) ? j.lines : [`HTTP ${res.status}`];
      setTestDetail(lines);
      const head = `주문진단 · ${j.ok ? '완료' : '일부실패'} (주문 없음)`;
      setMsg(head);
      onStatusKo?.(head);
      onPaperTestResult?.({ ok: Boolean(j.ok), msg: head, detailKo: lines });
    } catch (e) {
      const err = e instanceof Error ? e.message : '진단 실패';
      setMsg(`주문진단 오류 · ${err}`);
      setTestDetail([err]);
      onStatusKo?.(`주문진단 오류 · ${err}`);
    } finally {
      setTestBusy(false);
    }
  };

  /**
   * 코인별 텔레그램 테스트 전송 — 주문 없음 · 진입알림과 동일 경로.
   */
  const runTelegramCoinTest = async (sym: string | 'ALL') => {
    const key = sym === 'ALL' ? 'ALL' : String(sym).toUpperCase();
    setTgTestBusy(key);
    setTgTestMsg('');
    try {
      const res = await fetch('/api/merged-desk/telegram-test', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          sym === 'ALL'
            ? { all: true, direction: 'LONG' }
            : { symbol: key, direction: 'LONG' }
        ),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        hintKo?: string;
        okN?: number;
        failN?: number;
        results?: Array<{ symbol: string; ok: boolean; error?: string; tf?: string }>;
      };
      if (!res.ok || !j.ok) {
        const failDetail =
          j.results
            ?.filter((r) => !r.ok)
            .map((r) => `${r.symbol}:${r.error || 'fail'}`)
            .join(' · ') || '';
        const err =
          j.error || j.hintKo || failDetail || `HTTP ${res.status}`;
        setTgTestMsg(`TG실패 · ${err}`);
        setMsg(`텔레그램 실패 · ${err}`);
        onStatusKo?.(`텔레그램 실패 · ${err}`);
        return;
      }
      const detail =
        j.results
          ?.map((r) => `${r.symbol.replace('USDT', '')}${r.ok ? '✓' : '✗'}`)
          .join(' ') || '';
      const okMsg = j.hintKo || `TG OK · ${j.okN || 0}건 · 단톡확인`;
      setTgTestMsg(`${okMsg}${detail ? ` · ${detail}` : ''}`);
      setMsg(okMsg);
      onStatusKo?.(okMsg);
    } catch (e) {
      const err = e instanceof Error ? e.message : 'TG오류';
      setTgTestMsg(`TG오류 · ${err}`);
      setMsg(`텔레그램 오류 · ${err}`);
    } finally {
      setTgTestBusy(null);
    }
  };

  const refreshTelegramEnv = async () => {
    try {
      const res = await fetch('/api/merged-desk/telegram-test', {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        configured?: boolean;
        hintKo?: string;
        chatId?: string | null;
        error?: string;
      };
      if (!res.ok || !j.ok) {
        setTgEnvKo(j.error || `TG상태 HTTP ${res.status}`);
        return;
      }
      setTgEnvKo(
        j.configured
          ? `TG연동OK · chat ${j.chatId || '—'}`
          : j.hintKo || 'TG env 미설정'
      );
    } catch (e) {
      setTgEnvKo(e instanceof Error ? e.message : 'TG상태실패');
    }
  };

  const hydrateSkillRisk = useCallback(async () => {
    try {
      const res = await fetch('/api/merged-desk/coin-skill-risk', {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        risks?: CoinSkillRiskMap;
      };
      if (res.ok && j.ok && j.risks) {
        const merged = mergeCoinSkillRiskFromServer(j.risks);
        setSkillRiskMap({ ...merged });
        return;
      }
    } catch {
      /* local only */
    }
    setSkillRiskMap(readCoinSkillRiskMap());
  }, []);

  const hydrateExclusiveSkills = useCallback(async () => {
    try {
      const res = await fetch('/api/merged-desk/coin-exclusive-skills', {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        skills?: CoinExclusiveSkillMap;
      };
      if (res.ok && j.ok && j.skills) {
        const merged = mergeExclusiveFromServer(j.skills);
        setExclusiveMap({ ...merged });
        return;
      }
    } catch {
      /* local */
    }
    setExclusiveMap(readCoinExclusiveSkillMap());
  }, []);

  const saveSkillRisk = useCallback(async (next: CoinSkillRisk) => {
    setSkillRiskBusyCoin(next.coin);
    try {
      const saved = writeCoinSkillRisk(next);
      setSkillRiskMap((prev) => ({ ...prev, [saved.coin]: saved }));
      const res = await fetch('/api/merged-desk/coin-skill-risk', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ risk: saved }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        risk?: CoinSkillRisk;
        hintKo?: string;
        error?: string;
      };
      if (res.ok && j.ok && j.risk) {
        writeCoinSkillRisk(j.risk);
        setSkillRiskMap((prev) => ({ ...prev, [j.risk!.coin]: j.risk! }));
        setMsg(j.hintKo || `${j.risk.coin} 리스크 저장`);
        onStatusKo?.(j.hintKo || `${j.risk.coin} 스킬세팅 저장`);
      } else {
        setMsg(j.error || '서버저장 실패 · 로컬만 반영');
      }
    } finally {
      setSkillRiskBusyCoin(null);
    }
  }, [onStatusKo]);

  const toggleExclusiveSkill = useCallback(
    async (coin: AutoTradeCoinKey, skillId: string, on: boolean) => {
      setExclusiveBusyCoin(coin);
      try {
        const next = writeCoinExclusiveSkill(coin, skillId, on);
        setExclusiveMap((prev) => ({ ...prev, [coin]: next }));
        await fetch('/api/merged-desk/coin-exclusive-skills', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ coin, state: next }),
        });
        setMsg(`${coin} ${skillId} ${on ? 'ON' : 'OFF'}`);
      } finally {
        setExclusiveBusyCoin(null);
      }
    },
    []
  );

  useEffect(() => {
    if (tab === 'skill') {
      void hydrateSkillRisk();
      void hydrateExclusiveSkills();
      setSkillColors(readSkillColors());
    }
  }, [tab, hydrateSkillRisk, hydrateExclusiveSkills]);

  /**
   * 매매·거래소 연동 점검 — 로컬게이트 + 스캔API + (키 있으면) Bitget 인증/포지션.
   * 실제 주문 없음. 기능 삭제 없음 · UI만 재연결.
   */
  const runTradeLinkHealth = async () => {
    setTestBusy(true);
    setMsg('');
    setHealthReport(null);
    try {
      await refreshKeys();
      const keysSnap = await fetchExchangeKeysStatus().catch(() => null);
      const configured = Boolean(keysSnap?.configured ?? keys?.configured);
      const authOk = (keysSnap?.meta?.lastTestOk ?? keys?.meta?.lastTestOk) !== false;

      const report = await runFullTradeHealthCheck({
        cfg,
        keysConfigured: configured,
        keysAuthOk: authOk,
        virtActive: readVirtualTradeSession().active,
      });

      const lines: string[] = [
        `${report.titleKo} · ${report.summaryKo}`,
        `시각 ${new Date(report.checkedAt).toLocaleTimeString('ko-KR')}`,
      ];

      /** 거래소 실연동 — 키 있으면 프로브 + 포지션 조회 */
      if (configured) {
        try {
          const probeRes = await fetch('/api/merged-desk/bitget-probe', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
          });
          const pj = (await probeRes.json().catch(() => ({}))) as Record<string, unknown>;
          const pokeOk = Boolean(pj.ok);
          lines.push(
            pokeOk
              ? `Bitget인증 OK${pj.availableUsdt != null ? ` · 가용≈${Number(pj.availableUsdt).toFixed(2)}U` : ''}`
              : `Bitget인증 FAIL · ${String(pj.error || pj.msg || pj.code || probeRes.status)}`
          );
          report.rows.push({
            id: 'bitget-probe',
            ok: pokeOk,
            tone: pokeOk ? 'up' : 'down',
            titleKo: 'Bitget 거래소인증',
            detailKo: pokeOk
              ? `가용≈${pj.availableUsdt != null ? Number(pj.availableUsdt).toFixed(2) : '?'}U`
              : String(pj.error || pj.msg || '인증실패'),
            blockEntry: cfg.liveArmed && !pokeOk,
          });
        } catch (e) {
          const err = e instanceof Error ? e.message : '프로브오류';
          lines.push(`Bitget인증 오류 · ${err}`);
          report.rows.push({
            id: 'bitget-probe',
            ok: false,
            tone: 'down',
            titleKo: 'Bitget 거래소인증',
            detailKo: err,
            blockEntry: cfg.liveArmed,
          });
        }

        try {
          const pos = await fetchLivePosition(symbol || 'BTCUSDT');
          const list = Array.isArray(pos?.positions)
            ? pos.positions
            : pos?.position
              ? [pos.position]
              : [];
          const n = list.length;
          const posOk = Boolean(pos?.ok);
          lines.push(
            posOk
              ? `포지션조회 OK · ${n}건${pos.availableUsdt != null ? ` · 가용≈${Number(pos.availableUsdt).toFixed(2)}U` : ''}`
              : `포지션조회 실패 · ${pos?.error || pos?.msg || '?'}`
          );
          report.rows.push({
            id: 'bitget-pos',
            ok: posOk,
            tone: posOk ? 'up' : 'down',
            titleKo: 'Bitget 포지션조회',
            detailKo: posOk
              ? `조회OK · ${n}건`
              : String(pos?.error || pos?.msg || '실패'),
            blockEntry: false,
          });
        } catch (e) {
          const err = e instanceof Error ? e.message : '포지션오류';
          lines.push(`포지션조회 오류 · ${err}`);
        }
      } else {
        lines.push('API키 미등록 · 가상경로만 점검 (실거래소 스킵)');
      }

      /** 진입 텔레그램 경로 — 점검 메시지 1건 실제 전송 */
      try {
        const tgRes = await fetch('/api/merged-desk/entry-telegram', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            symbol: symbol || 'BTCUSDT',
            direction: 'LONG',
            price: livePrice && livePrice > 0 ? livePrice : 1,
            sl: null,
            tp: null,
            mode: 'virtual',
            source: 'health-check',
            signalKo: '연동점검 · 진입텔레그램 테스트',
            evidenceKo:
              '신호→진입→텔레그램 경로 점검 · 주문없음 · 확정아님',
            noteKo: '연동점검 테스트 메시지',
            timeframe: timeframe || '15m',
          }),
        });
        const tj = (await tgRes.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
        };
        const tgOk = Boolean(tj.ok) && tgRes.ok;
        lines.push(
          tgOk
            ? '텔레그램 OK · 단톡 테스트메시지 전송됨'
            : `텔레그램 FAIL · ${tj.error || `HTTP ${tgRes.status}`}`
        );
        report.rows.push({
          id: 'telegram-entry',
          ok: tgOk,
          tone: tgOk ? 'up' : 'down',
          titleKo: '진입텔레그램',
          detailKo: tgOk
            ? '가상/실전 진입 시 동일 API로 단톡 전송'
            : String(tj.error || '전송실패 · BOT/CHAT env 확인'),
          blockEntry: false,
        });
      } catch (e) {
        const err = e instanceof Error ? e.message : '텔레그램오류';
        lines.push(`텔레그램 오류 · ${err}`);
        report.rows.push({
          id: 'telegram-entry',
          ok: false,
          tone: 'down',
          titleKo: '진입텔레그램',
          detailKo: err,
          blockEntry: false,
        });
      }

      report.rows.push({
        id: 'entry-path-4coin',
        ok: true,
        tone: 'up',
        titleKo: '4코인 진입→TG 경로',
        detailKo:
          'BTC로켓/꼬리 · ETH폭락 · BNB캔들+PPL · XRP4패턴 → unified진입 → 가상=entry-telegram · 실전=live-order/서버notify',
        blockEntry: false,
      });

      for (const r of report.rows) {
        lines.push(`${r.ok ? 'OK' : r.blockEntry ? '차단' : '주의'} · ${r.titleKo} · ${r.detailKo}`);
      }

      const blockers = report.rows.filter((r) => r.blockEntry && !r.ok);
      const okEntry = blockers.length === 0 && report.okEntry;
      const finalReport: TradeHealthReport = {
        ...report,
        okEntry,
        tone: !okEntry ? 'down' : report.rows.some((r) => !r.ok) ? 'flat' : 'up',
        titleKo: !okEntry
          ? '점검 · 진입/연동 불가'
          : report.rows.some((r) => !r.ok)
            ? '점검 · 매매가능(주의)'
            : '점검 · 매매·거래소 연동 정상',
        summaryKo: lines[0] || report.summaryKo,
      };
      persistHealthReport(finalReport);
      setHealthReport(finalReport);
      setTestDetail(lines);
      const head = finalReport.titleKo;
      setMsg(head);
      onStatusKo?.(head);
      onPaperTestResult?.({ ok: finalReport.okEntry, msg: head, detailKo: lines });
    } catch (e) {
      const err = e instanceof Error ? e.message : '연동점검 실패';
      setMsg(`연동점검 오류 · ${err}`);
      setTestDetail([err]);
      onStatusKo?.(`연동점검 오류 · ${err}`);
    } finally {
      setTestBusy(false);
    }
  };

  /** 실진입이 어디서 막히는지 서버+클라 게이트 PING (주문 없음) */
  const runEntryGatePing = async () => {
    setTestBusy(true);
    setMsg('');
    try {
      await refreshKeys();
      const clientSteps = pingClientAutoTradeGates({
        enabled: cfg.enabled,
        liveArmed: cfg.liveArmed,
        strategyScalp: cfg.strategyScalp,
        strategyDoksuri1: cfg.strategyDoksuri1,
        enabledSymbols: cfg.enabledSymbols,
        scalpEquityPct: cfg.scalpEquityPct,
        equityPct: cfg.equityPct,
        maxConcurrent: cfg.maxConcurrent,
        keysConfigured: Boolean(keys?.configured),
        keysAuthOk: keys?.meta?.lastTestOk !== false,
        symbol,
      });

      const res = await fetch('/api/merged-desk/entry-ping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          symbol,
          maxConcurrent: cfg.maxConcurrent,
          enabledSymbols: cfg.enabledSymbols,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        readyForLiveOrder?: boolean;
        firstBlockKo?: string | null;
        summaryKo?: string;
        steps?: Array<{ ok: boolean; labelKo: string; detailKo: string; block?: boolean }>;
        equityUsdt?: number;
        availableUsdt?: number;
      };

      const lines: string[] = [];
      lines.push('—— 클라이언트 게이트 ——');
      for (const s of clientSteps) {
        lines.push(`${s.ok ? 'OK' : '막힘'} · ${s.labelKo} · ${s.detailKo}`);
      }
      const clientBlock = clientSteps.find((s) => s.block);
      lines.push('—— 서버 게이트 ——');
      if (Array.isArray(j.steps)) {
        for (const s of j.steps) {
          lines.push(`${s.ok ? 'OK' : '막힘'} · ${s.labelKo} · ${s.detailKo}`);
        }
      } else {
        lines.push(`서버PING 실패 · HTTP ${res.status}`);
      }

      const first =
        clientBlock?.detailKo ||
        j.firstBlockKo ||
        (j.readyForLiveOrder && !clientBlock
          ? null
          : j.summaryKo || '원인 미확인');

      setTestDetail(lines);
      const head = first
        ? `진입PING · 막힘: ${first}`
        : `진입PING · ${j.summaryKo || '게이트 통과 · 신호 대기 가능'}`;
      setMsg(head);
      onStatusKo?.(head);
      onPaperTestResult?.({
        ok: !first && Boolean(j.readyForLiveOrder || j.ok),
        msg: head,
        detailKo: lines,
      });
    } catch (e) {
      const err = e instanceof Error ? e.message : 'PING 실패';
      setMsg(`진입PING 오류 · ${err}`);
      setTestDetail([err]);
      onStatusKo?.(`진입PING 오류 · ${err}`);
    } finally {
      setTestBusy(false);
    }
  };

  /** 실차트 가격·(가능하면) 계좌잔고로 페이퍼 FIRE 경로 검증 · Bitget 주문 없음 */
  const runPaperTradeTest = async () => {
    setTestBusy(true);
    setMsg('');
    try {
      await refreshKeys();
      await refreshPosition();
      const pack = await fetchLivePosition(symbol);
      const realAvail =
        typeof pack.availableUsdt === 'number' && pack.availableUsdt > 0
          ? pack.availableUsdt
          : typeof pack.equityUsdt === 'number' && pack.equityUsdt > 0
            ? pack.equityUsdt
            : null;
      if (realAvail != null) setPosAvailUsdt(realAvail);

      const px =
        Number(entryStr) ||
        (livePrice != null && livePrice > 0 ? livePrice : 0) ||
        (planEntry != null && planEntry > 0 ? planEntry : 0) ||
        (scalpTrade?.entry != null && scalpTrade.entry > 0 ? scalpTrade.entry : 0);
      const sl =
        Number(slStr) ||
        (planSl != null && planSl > 0 ? planSl : null) ||
        (scalpTrade?.activeSl ?? scalpTrade?.sl ?? null);
      const tp =
        Number(tp1Str) ||
        (planTp1 != null && planTp1 > 0 ? planTp1 : null) ||
        (scalpTrade?.tp1 ?? null);
      const dir: 'LONG' | 'SHORT' =
        side === 'SHORT' || planDirection === 'SHORT' ? 'SHORT' : 'LONG';
      const nextCfg = writeAutoTradeConfig({
        enabled: true,
        liveArmed: false,
        strategyScalp: true,
      });
      setCfg(nextCfg);
      onConfigChange?.(nextCfg);

      const priceSrc =
        Number(entryStr) > 0
          ? '수동진입가'
          : livePrice != null && livePrice > 0
            ? '차트실가격'
            : planEntry != null && planEntry > 0
              ? '플랜진입가'
              : '초단진입가';

      const equityHint =
        realAvail ??
        posAvailUsdt ??
        (typeof keys?.meta?.availableUsdt === 'number' ? keys.meta.availableUsdt : null);
      const armedNow = nextCfg.enabled && nextCfg.liveArmed && Boolean(keys?.configured);

      const r = runAutoTradeDryRunTest({
        symbol,
        timeframe,
        direction: dir,
        price: px,
        sl,
        tp,
        availableUsdt: equityHint,
        mockEquityUsdt: 1000,
        cfg: nextCfg,
        armEngine: false,
      });
      const extra = [
        `가격출처 ${priceSrc} · ${px > 0 ? px.toLocaleString('en-US') : '—'}`,
        pack.configured
          ? pack.ok
            ? `API 조회 OK · 가용≈${realAvail != null ? realAvail.toFixed(2) : '?'}U`
            : `API 등록됨 · 조회실패 ${pack.error || pack.msg || ''}`
          : 'API 미등록 · 가상자산으로 사이즈 산정',
        armedNow ? '주의: 실주문 ARM ON이면 실신호는 실주문' : '실주문 ARM OFF · 이번 테스트는 페이퍼만',
      ];
      setTestDetail([...extra, ...r.detailKo]);
      const head = r.ok
        ? `실데이터 페이퍼 OK · ${dir} · ${priceSrc}`
        : r.msg;
      setMsg(head);
      onStatusKo?.(head);
      setJournalTick((v) => v + 1);
      setTab('journal');
    } finally {
      setTestBusy(false);
    }
  };

  /** 클릭 = 시드 확인 후 신호 대기 시작 (즉시 진입 금지) · 실전 ARM과 병행 가능 */
  const toggleVirtualTrade = async () => {
    setTestBusy(true);
    setMsg('');
    try {
      if (virtSession.active) {
        const stopped = stopVirtualTradeSession('가상매매 중지', markPx > 0 ? markPx : undefined);
        setVirtSession(stopped);
        setTestDetail([
          '가상매매 세션 종료',
          cfg.liveArmed ? '실전 ARM은 유지' : '대기/포지션 해제 · 시드·거래기록은 유지',
        ]);
        setMsg(cfg.liveArmed ? '가상매매 중지 · 실전은 계속' : '가상매매 중지');
        onStatusKo?.(cfg.liveArmed ? '가상OFF · 실전ON' : '가상매매 중지');
        onVirtualSessionStop?.();
        setSeedTick((v) => v + 1);
        return;
      }

      const seed = Math.max(10, Number(seedStr) || 0);
      if (!(seed >= 10)) {
        setMsg('시드를 먼저 입력하세요 (최소 10 USDT)');
        setTestDetail(['시드 미설정', '시드 입력 후 「가상매매 시작」']);
        return;
      }
      setVirtualSeedUsdt(seed, true);

      const pxWatch =
        Number(entryStr) ||
        (planEntry != null && planEntry > 0 ? planEntry : 0) ||
        null;
      const sl =
        Number(slStr) ||
        (planSl != null && planSl > 0 ? planSl : null) ||
        (scalpTrade?.activeSl ?? scalpTrade?.sl ?? null);
      const tp =
        Number(tp1Str) ||
        (planTp1 != null && planTp1 > 0 ? planTp1 : null) ||
        (scalpTrade?.tp1 ?? null);
      const dir: 'LONG' | 'SHORT' =
        side === 'SHORT' || planDirection === 'SHORT' ? 'SHORT' : 'LONG';

      /** 실전 ARM 유지 · enabled만 켜고 가상 병행 */
      const nextCfg = writeAutoTradeConfig({
        enabled: true,
        strategyScalp: true,
        strategyDoksuri1: true,
        strategySpeed: 'ULTRA_SCALP',
        ultraScalpOnlyLtf: false,
        sizeMode: 'equityPct',
        scalpEquityPct: VIRTUAL_SEED_RISK_PCT,
        equityPct: VIRTUAL_SEED_RISK_PCT,
        doksuriEquityPct: VIRTUAL_SEED_RISK_PCT,
        ...(cfg.liveArmed
          ? {}
          : { liveArmed: false, tradingMode: 'PAPER' as const }),
      });
      setCfg(nextCfg);
      onConfigChange?.(nextCfg);

      const r = startVirtualTradeSession({
        symbol,
        timeframe,
        preferDirection: dir,
        watchEntry: pxWatch && pxWatch > 0 ? pxWatch : null,
        watchSl: sl,
        watchTp: tp,
        seedUsdt: seed,
        cfg: nextCfg,
      });
      setVirtSession(r.session);
      setTestDetail([
        ...r.detailKo,
        cfg.liveArmed || nextCfg.liveArmed
          ? '실전·가상 병행 · 같은 신호에 둘 다 진입'
          : '가상만 · 실전은 「실전매매」로 추가 가능',
      ]);
      setMsg(
        r.ok && (cfg.liveArmed || nextCfg.liveArmed)
          ? `${r.msg} · 실전병행`
          : r.msg
      );
      onStatusKo?.(
        r.ok && (cfg.liveArmed || nextCfg.liveArmed) ? '가상+실전 병행' : r.msg
      );
      setSeedTick((v) => v + 1);
      if (r.ok) {
        onVirtualSessionStart?.();
        setJournalTick((v) => v + 1);
      }
    } finally {
      setTestBusy(false);
    }
  };

  /** 실전 ARM 해제 (가상 시작과 분리) */
  const stopLiveTradeArm = () => {
    patch({ liveArmed: false, tradingMode: 'PAPER' });
    setMsg('실전매매 OFF · 신규주문·자동익절 중지 (포지션은 거래소에 유지)');
    onStatusKo?.('실전매매 OFF');
  };

  const hist = useMemo(
    () => readAutoScalpHistory(symbol),
    [symbol, scalpTrade?.phase, scalpTrade?.closedAt, journalTick]
  );
  const sum = useMemo(() => summarizeAutoScalpTrades(hist), [hist]);
  const seedLedger = useMemo(() => {
    void seedTick;
    void virtSession.equityUsdt;
    return readVirtualSeedLedger();
  }, [seedTick, virtSession.equityUsdt, virtSession.active]);
  const seedSum = useMemo(() => summarizeVirtualSeed(seedLedger), [seedLedger]);
  const seedTrades: VirtualSeedTradeRecord[] = seedLedger.trades;
  const reinforceBoard = useMemo(() => {
    void seedTick;
    return buildLiveReinforceBoard(3);
  }, [seedTick, seedLedger.trades.length, seedLedger.updatedAt]);

  const signalScore = useMemo(() => {
    void scoreTick;
    void seedTick;
    return buildSignalScoreRows();
  }, [scoreTick, seedTick]);

  const symbolMatrix = useMemo(() => {
    void scoreTick;
    void seedTick;
    return buildAutoTradeSymbolMatrix();
  }, [scoreTick, seedTick]);

  const coinBoard = useMemo(() => {
    void scoreTick;
    void seedTick;
    return buildCoinScoreBoard();
  }, [scoreTick, seedTick]);

  const dualLaneStats = useMemo(() => {
    void scoreTick;
    void seedTick;
    return buildDualLaneTradeStats();
  }, [scoreTick, seedTick]);

  const todayBoard = useMemo(() => {
    void scoreTick;
    void seedTick;
    return buildTodayTradeBoard();
  }, [scoreTick, seedTick]);

  const openScoreTrades = useMemo(() => {
    void scoreTick;
    void virtSession.position?.id;
    return listOpenScoreTrades();
  }, [scoreTick, virtSession.position?.id, virtSession.active]);

  const recentScoreClosed = useMemo(() => {
    void scoreTick;
    return recentClosedScoreTrades(12);
  }, [scoreTick]);

  const journalRows = useMemo(() => {
    void journalTick;
    const sym = symbol.toUpperCase();
    const liveOnly = cfg.liveArmed;
    return readTradeEventJournal()
      .filter((e) => {
        if (liveOnly) {
          /** 실전창: 가상/페이퍼 제외 · BTC·ETH 실주문·실전 신호만 */
          if (e.meta?.paper === true || e.meta?.virtual === true || e.meta?.dryRun === true) {
            return false;
          }
          const symOk =
            e.symbol.toUpperCase() === 'BTCUSDT' ||
            e.symbol.toUpperCase() === 'ETHUSDT' ||
            e.symbol.toUpperCase() === 'BNBUSDT' ||
            e.symbol.toUpperCase() === 'XRPUSDT' ||
            e.symbol.toUpperCase() === 'SOLUSDT' ||
            e.symbol.toUpperCase() === sym;
          if (!symOk) return false;
          if (e.meta?.live === true) return true;
          if (AUTO_TRADE_JOURNAL_KINDS.includes(e.kind)) return true;
          if (e.kind.startsWith('AUTO_SCALP') || e.kind.startsWith('SCALP200')) return true;
          return false;
        }
        if (e.symbol.toUpperCase() !== sym) return false;
        if (AUTO_TRADE_JOURNAL_KINDS.includes(e.kind)) return true;
        if (e.kind.startsWith('AUTO_SCALP') || e.kind.startsWith('SCALP200')) return true;
        if (e.meta?.reinforce === true) return true;
        if (typeof e.meta?.outcomeKo === 'string') return true;
        return false;
      })
      .slice(0, 120);
  }, [symbol, journalTick, cfg.liveArmed]);

  const keysOk = Boolean(keys?.configured && keys?.meta?.lastTestOk !== false);
  const apiConfigured = Boolean(keys?.configured);
  const apiAuthOk = Boolean(keys?.configured && keys?.meta?.lastTestOk === true);
  const apiAuthFail = Boolean(keys?.configured && keys?.meta?.lastTestOk === false);
  const liveReady = Boolean(cfg.liveArmed && keysOk);
  const liveMode = Boolean(cfg.liveArmed && apiConfigured);
  const badge = liveReady ? '실주문준비' : !cfg.enabled ? '끔' : '가상';
  const availUsdt =
    posAvailUsdt != null
      ? posAvailUsdt
      : typeof keys?.meta?.availableUsdt === 'number'
        ? keys.meta.availableUsdt
        : null;
  const scalpPct = cfg.scalpEquityPct ?? cfg.equityPct;
  const dokPct = cfg.doksuriEquityPct ?? cfg.equityPct;
  const estScalpMargin =
    availUsdt != null && cfg.sizeMode === 'equityPct'
      ? Math.max(1, Math.round(((availUsdt * scalpPct) / 100) * 100) / 100)
      : null;
  /** 목표 ROE → 수수료·펀비 후 순ROE (초단 가정 0.5h) · 설정 TP1/TP2 연동 */
  const tp1RoeCfg = cfg.scalpTp1RoePct ?? 5;
  const tp2RoeCfg = cfg.scalpTp2RoePct ?? 10;
  const ultraRoeCaps = useMemo(
    () =>
      resolveUltraScalpRoeCaps({
        leverage: cfg.leverage || 10,
        tp1RoePct: tp1RoeCfg,
        tp2RoePct: tp2RoeCfg,
      }),
    [cfg.leverage, tp1RoeCfg, tp2RoeCfg]
  );
  const netRoe5 = useMemo(
    () =>
      estimateScalpNetRoe({
        grossRoePct: tp1RoeCfg,
        leverage: cfg.leverage || 10,
        holdHours: 0.5,
      }),
    [cfg.leverage, tp1RoeCfg]
  );
  const chartPxOn = livePrice != null && livePrice > 0;
  const planOn = planEntry != null && planEntry > 0;

  /** AIZONE 매매카드 3칸: 점수 / 근거OK / 정렬축 */
  const aizoneTriple = useMemo(() => {
    void clockTick;
    const dir: 'LONG' | 'SHORT' =
      side === 'SHORT' || planDirection === 'SHORT' ? 'SHORT' : 'LONG';
    const snap = readAiZoneEntrySnapshot(symbol || 'BTCUSDT');
    const px =
      (livePrice != null && livePrice > 0 ? livePrice : 0) ||
      (snap?.price && snap.price > 0 ? snap.price : 0);
    if (!(px > 0)) {
      return {
        dir,
        scoreKo: '—',
        scoreTone: 'flat' as const,
        evidenceOk: false,
        evidenceKo: '가격없음',
        alignedN: 0,
        alignedDetailKo: '면·기관·로켓 —',
        pctMin: AIZONE_PCT_MIN_NORMAL,
        gateAllow: false,
        gateKo: '가격없음',
        faceKo: '—',
        feeKo: '—',
      };
    }
    const gate = aiZoneEntryGate({
      symbol: symbol || 'BTCUSDT',
      direction: dir,
      price: px,
      leverage: cfg.leverage || 30,
      snap,
    });
    const score =
      dir === 'LONG'
        ? snap?.longPct
        : snap?.shortPct;
    const pctMin =
      gate.pctMinUsed ??
      (snap?.volumeHeavy ? AIZONE_PCT_MIN_VOLUME : AIZONE_PCT_MIN_NORMAL);
    const scoreOk = score == null || score >= pctMin;
    const ev =
      snap != null
        ? aiZoneEvidenceGate({ direction: dir, price: px, snap })
        : null;
    const evidenceOk = gate.evidenceOk ?? ev?.ok ?? false;
    const alignedN = gate.evidenceAlignedN ?? ev?.alignedN ?? 0;
    const faceKo = snap?.htfFace?.labelKo || snap?.chartFace?.labelKo || '면—';
    const axes = [
      snap?.htfFace ? `면${snap.htfFace.bias === 'up' ? '↑' : '↓'}` : null,
      snap?.institutionalBias ? `기관${snap.institutionalBias === 'LONG' ? 'L' : 'S'}` : null,
      snap?.rocketDir ? `로켓${snap.rocketDir === 'LONG' ? 'L' : 'S'}` : null,
      dir === 'SHORT' && snap?.dumpDeclineNear ? '폭락' : null,
    ].filter(Boolean);
    return {
      dir,
      scoreKo: score != null ? `${Math.round(score)}%` : '—',
      scoreTone: (scoreOk ? 'up' : 'down') as 'up' | 'down' | 'flat',
      evidenceOk,
      evidenceKo: gate.evidenceKo || ev?.summaryKo || '근거—',
      alignedN,
      alignedDetailKo: axes.length ? axes.join('·') : '축 soft',
      pctMin,
      gateAllow: gate.allow && evidenceOk && alignedN >= 1,
      gateKo: gate.reasonKo,
      faceKo,
      feeKo: (() => {
        const sl = gate.suggestSl;
        const tp = gate.suggestTp;
        if (!(sl != null && sl > 0) || !(tp != null && tp > 0)) return 'E/SL/TP—';
        const fee = aiZoneFeeRrGate({
          entry: px,
          sl,
          tp,
          direction: dir,
          leverage: cfg.leverage || 30,
          minRr: cfg.minRr || 1.2,
        });
        return fee.ok
          ? `순ROE ${fee.netRoePct.toFixed(1)}% · RR ${fee.rr.toFixed(2)} · SL${Math.round(sl)} TP${Math.round(tp)}`
          : fee.reasonKo;
      })(),
    };
  }, [symbol, side, planDirection, livePrice, cfg.leverage, cfg.minRr, clockTick]);

  const virtOn = virtSession.active;
  const virtPos = virtSession.position;
  const btcEnabled = isAutoTradeSymbolEnabled(cfg, 'BTCUSDT');
  const ethEnabled = isAutoTradeSymbolEnabled(cfg, 'ETHUSDT');
  const bnbEnabled = isAutoTradeSymbolEnabled(cfg, 'BNBUSDT');
  const xrpEnabled = isAutoTradeSymbolEnabled(cfg, 'XRPUSDT');
  const solEnabled = isAutoTradeSymbolEnabled(cfg, 'SOLUSDT');
  const virtSym = String(virtSession.symbol || '').toUpperCase();
  const posDirOf = (
    live: LivePosition | null | undefined,
    needle: string
  ): 'LONG' | 'SHORT' | null => {
    if (liveReady) {
      if (live?.direction === 'LONG' || live?.direction === 'SHORT') return live.direction;
      return null;
    }
    if (virtOn && virtPos && virtSym.includes(needle)) return virtPos.direction;
    return null;
  };
  const btcPosDir = posDirOf(livePosBtc, 'BTC');
  const ethPosDir = posDirOf(livePosEth, 'ETH');
  const bnbPosDir = posDirOf(livePosBnb, 'BNB');
  const xrpPosDir = posDirOf(livePosXrp, 'XRP');
  const solPosDir = posDirOf(livePosSol, 'SOL');
  const scanningOf = (enabled: boolean, posDir: 'LONG' | 'SHORT' | null, needle: string) =>
    enabled &&
    !posDir &&
    ((liveReady && cfg.enabled) || (!liveReady && virtOn && virtSym.includes(needle)));
  const btcScanning = scanningOf(btcEnabled, btcPosDir, 'BTC');
  const ethScanning = scanningOf(ethEnabled, ethPosDir, 'ETH');
  const bnbScanning = scanningOf(bnbEnabled, bnbPosDir, 'BNB');
  const xrpScanning = scanningOf(xrpEnabled, xrpPosDir, 'XRP');
  const solScanning = scanningOf(solEnabled, solPosDir, 'SOL');
  const btcSig = symTradeLabel('BTC', btcEnabled, btcPosDir, btcScanning);
  const ethSig = symTradeLabel('ETH', ethEnabled, ethPosDir, ethScanning);
  const bnbSig = symTradeLabel('BNB', bnbEnabled, bnbPosDir, bnbScanning);
  const xrpSig = symTradeLabel('XRP', xrpEnabled, xrpPosDir, xrpScanning);
  const solSig = symTradeLabel('SOL', solEnabled, solPosDir, solScanning);
  const symSigLine = `${btcSig.label} · ${ethSig.label} · ${bnbSig.label} · ${xrpSig.label} · ${solSig.label}`;

  const skillBoard = useMemo(() => {
    void scoreTick;
    const linkBaseOk = Boolean(apiAuthOk) || virtOn;
    const mk = (
      enabled: boolean,
      sig: { on: boolean; label: string },
      posDir: 'LONG' | 'SHORT' | null,
      scanning: boolean
    ) => ({
      chipOn: enabled,
      linkOk: enabled && linkBaseOk,
      linkKo: !enabled
        ? '칩OFF'
        : !linkBaseOk
          ? liveReady
            ? 'API점검'
            : '가상/키대기'
          : '연동정상',
      chipLabel: sig.label,
      posDir,
      scanning,
    });
    return buildCoinSkillBoard({
      BTC: mk(btcEnabled, btcSig, btcPosDir, btcScanning),
      ETH: mk(ethEnabled, ethSig, ethPosDir, ethScanning),
      BNB: mk(bnbEnabled, bnbSig, bnbPosDir, bnbScanning),
      XRP: mk(xrpEnabled, xrpSig, xrpPosDir, xrpScanning),
      SOL: mk(solEnabled, solSig, solPosDir, solScanning),
    });
  }, [
    scoreTick,
    apiAuthOk,
    virtOn,
    liveReady,
    btcEnabled,
    ethEnabled,
    bnbEnabled,
    xrpEnabled,
    solEnabled,
    btcSig,
    ethSig,
    bnbSig,
    xrpSig,
    solSig,
    btcPosDir,
    ethPosDir,
    bnbPosDir,
    xrpPosDir,
    solPosDir,
    btcScanning,
    ethScanning,
    bnbScanning,
    xrpScanning,
    solScanning,
  ]);

  const markPx =
    livePrice != null && livePrice > 0
      ? livePrice
      : livePos?.markPrice || livePos?.entryPrice || virtPos?.entry || 0;
  void clockTick;
  const virtHoldMs = virtPos?.openedAt ? Date.now() - virtPos.openedAt : 0;
  const virtPnl =
    virtPos && markPx > 0 ? virtualUnrealizedPnl(virtPos, markPx) : null;
  const flatCd = isVirtualPostFlatCooldown(virtSession);
  const reWatch = virtSession.reentryWatch;
  const reentryKo = (() => {
    if (liveReady && livePos) return '실전 포지션 보유 · Bitget 동기화';
    if (liveReady) return '실전 연속분석 · Bitget 실주문 대기';
    if (virtPos) return '포지션 보유중 · 익절/손절 후 연속분석';
    if (flatCd.cooling) return `청산 쿨다운 ${flatCd.remainSec}초 · 연속탐색중`;
    if (!reWatch) return '전방향 연속분석 · 진입자리 탐색';
    if (reWatch.expiresAt != null && Date.now() >= reWatch.expiresAt) {
      return '재진입 만료 · 전방향 재스캔';
    }
    const left = Math.max(0, Math.ceil(((reWatch.expiresAt || 0) - Date.now()) / 1000));
    const cd = Math.max(0, Math.ceil((reWatch.cooldownUntil - Date.now()) / 1000));
    return `같은방향(${reWatch.direction === 'LONG' ? '롱' : '숏'}) 눌림재진입 · 남은 ${Math.floor(left / 60)}분${left % 60}초${cd > 0 ? ` · 쿨다운${cd}초` : ''}`;
  })();
  /** 실전 우선: 가상세션이 켜져 있어도 liveArmed면 실전 배너/히어로 */
  const linkKo = liveReady
    ? livePos
      ? `실전 연동 · 단타 ${scalpPct}% · Bitget 포지션`
      : `실전 연동 · 단타 ${scalpPct}% · 연속분석 ON`
    : virtOn
      ? virtPos
        ? `가상 연동 · 단타 ${scalpPct}% · 포지션보유`
        : `가상 연동 · 단타 ${scalpPct}% · 연속분석 ${flatCd.cooling ? '쿨다운' : 'ON'}`
      : !cfg.enabled
        ? '엔진 끔 · 자동매매 대기'
        : liveMode && !apiAuthOk
          ? '실전 선택 · API 인증 필요'
          : `가상 연동 · 단타 ${scalpPct}% · 연속분석 대기`;

  const liveRiskUsdt =
    availUsdt != null && availUsdt > 0
      ? Math.max(1, Math.round(((availUsdt * scalpPct) / 100) * 100) / 100)
      : null;

  /** BTC+ETH+BNB+XRP+SOL(+차트) 오픈 포지션 — 포지션 탭에 카드 여러 장 */
  const liveOpenList = useMemo(() => {
    const out: LivePosition[] = [];
    const seen = new Set<string>();
    for (const p of [livePosBtc, livePosEth, livePosBnb, livePosXrp, livePosSol, livePos]) {
      if (!p || !(Number(p.size) > 0)) continue;
      const k = String(p.symbol || '').toUpperCase();
      if (!k || seen.has(k)) continue;
      seen.add(k);
      out.push(p);
    }
    return out;
  }, [livePosBtc, livePosEth, livePosBnb, livePosXrp, livePosSol, livePos]);

  const onTitlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { ox: e.clientX, oy: e.clientY, px: pos.x, py: pos.y };
  };
  const onTitlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const d = dragRef.current;
    const nx = Math.max(8, Math.min(window.innerWidth - 120, d.px + (e.clientX - d.ox)));
    const ny = Math.max(8, Math.min(window.innerHeight - 48, d.py + (e.clientY - d.oy)));
    setPos({ x: nx, y: ny });
  };
  const onTitlePointerUp = () => {
    dragRef.current = null;
  };

  const stopChart = (e: { stopPropagation: () => void }) => e.stopPropagation();

  const engineAlive = Boolean(cfg.enabled || cfg.liveArmed || virtSession.active);
  const linkBadge = liveReady ? '실전연결' : virtOn ? '가상연결' : engineAlive ? '엔진연결' : '매매창';

  /** 창 닫아도 ARM·틱 유지 — 미니 칩만 (카드 전체 안 뜸) */
  if (!uiVisible) {
    if (!engineAlive) return null;
    return (
      <button
        type="button"
        className={styles.tradeWindowRestoreChip}
        style={{ left: pos.x, top: pos.y }}
        data-auto-trade-panel="1"
        data-merged-fold-hud="auto-trade-keepalive"
        data-live={liveReady ? '1' : '0'}
        onPointerDown={stopChart}
        onClick={() => {
          onOpenUi?.();
        }}
        title="매매창 닫힘 · 신호 연결 유지중 · 클릭하면 창 열기"
      >
        {linkBadge} · {symbol} · ON
      </button>
    );
  }

  /** 숨김 = 미니 칩만 남김 (닫기와 다름) */
  if (minimized) {
    return (
      <button
        type="button"
        className={styles.tradeWindowRestoreChip}
        style={{ left: pos.x, top: pos.y }}
        data-auto-trade-panel="1"
        data-merged-fold-hud="auto-trade-mini"
        onPointerDown={stopChart}
        onClick={() => setMinimized(false)}
        title="매매창 다시 열기"
      >
        매매창 · {symbol} · {badge}
      </button>
    );
  }

  return (
    <div
      className={styles.tradeWindow}
      data-auto-trade-panel="1"
      data-merged-fold-hud="auto-trade-window"
      data-armed={cfg.enabled ? '1' : '0'}
      data-live={liveReady ? '1' : '0'}
      style={{ left: pos.x, top: pos.y }}
      onPointerDown={stopChart}
      onTouchStart={stopChart}
    >
      <div
        className={styles.tradeWindowTitle}
        onPointerDown={onTitlePointerDown}
        onPointerMove={onTitlePointerMove}
        onPointerUp={onTitlePointerUp}
        onPointerCancel={onTitlePointerUp}
      >
        <span className={styles.tradeWindowDragDots} aria-hidden>
          ⋮⋮
        </span>
        <span className={styles.tradeWindowTitleText}>
          {tapOnly ? `${BAND15_AUTO_HOCHUNG}` : '자동매매창'} · {symbol}
          <span
            className={styles.tradeWindowBadge}
            data-tone={tapOnly ? 'paper' : liveReady ? 'live' : cfg.enabled || virtOn ? 'paper' : 'off'}
          >
            {tapOnly ? 'Paper' : liveReady ? '실전' : virtOn || cfg.enabled ? '가상' : '끔'}
          </span>
          <span className={styles.tradeTfPill}>
            {tapOnly ? BAND15_AUTO_TF : tfEntryKo(timeframe)}
          </span>
        </span>
        <span className={styles.tradeWindowTitleActions}>
          <button
            type="button"
            className={styles.tradeWindowIconBtn}
            title="숨기기 (미니 칩으로)"
            onClick={() => setMinimized(true)}
          >
            –
          </button>
          {onClose ? (
            <button
              type="button"
              className={styles.tradeWindowIconBtnClose}
              title="매매창만 닫기 · 가상/실전 연결은 유지"
              onClick={onClose}
            >
              ×
            </button>
          ) : null}
        </span>
      </div>

      <div className={styles.tradeWindowTabs}>
        {(
          (tapOnly
            ? ([
                ['desk', '주문'],
                ['skill', '스킬'],
                ['tp', '익절'],
                ['sl', '손절'],
                ['size', '비중'],
                ['pos', '포지션'],
                ['live', '상황'],
                ['setup', '설정'],
                ['journal', '기록'],
              ] as const)
            : ([
                ['desk', '주문'],
                ['stats', '통계'],
                ['skill', '스킬'],
                ['tp', '익절'],
                ['sl', '손절'],
                ['size', '비중'],
                ['pos', '포지션'],
                ['live', '상황'],
                ['setup', '설정'],
                ['scalp', '초단'],
                ['journal', '기록'],
                ['guide', '설명'],
              ] as const)
          )
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`${styles.tradeWindowTab}${tab === id ? ` ${styles.tradeWindowTabOn}` : ''}`}
            onClick={() => setTab(id)}
          >
            {label}
            {id === 'pos' && (livePosBtc || livePosEth || livePosBnb || livePosXrp || livePosSol || livePos || virtPos) ? (
              <span className={styles.tradePosTabDot} />
            ) : null}
            {id === 'stats' && coinBoard.rows.some((r) => r.needReinforce || r.cooling) ? (
              <span className={styles.tradePosTabDot} />
            ) : null}
            {id === 'skill' && !skillBoard.linkAllOk ? (
              <span className={styles.tradePosTabDot} />
            ) : null}
          </button>
        ))}
      </div>

      <div className={styles.tradeWindowBody}>
        <div
          className={styles.tradeStatusLine}
          style={{ marginBottom: 8 }}
          title={`${BAND15_AUTO_HOCHUNG}(${BAND15_AUTO_CALLSIGN})`}
        >
          <span className={styles.tradeStatusDot} />
          {tapOnly
            ? liveStatusKo && !/BTC 3m|Dual|eagle1-tap-engine|CONFIRMED/i.test(liveStatusKo)
              ? liveStatusKo
              : tapOnlyStatusKo()
            : liveStatusKo || '대기 · 조건 미완성'}
        </div>
        {tapOnly ? null : (
        <div className={styles.tradeLinkBar} data-tone={liveReady ? 'live' : cfg.enabled || virtOn ? 'on' : 'off'}>
          {linkKo}
        </div>
        )}
        {tapOnly ? null : (
          <div
            className={styles.tradeWindowHint}
            style={{
              marginBottom: 8,
              padding: '8px 10px',
              borderRadius: 8,
              border: '1px solid #854d0e',
              background: 'rgba(250,204,21,0.08)',
              color: '#fde68a',
              lineHeight: 1.45,
            }}
          >
            타점엔진만 주문 · Dual/AIZONE/초단·독수리 자동주문 OFF
            <br />
            실행TF · {tapointEntryTfLabelKo()}
            <br />
            익절 ROE {cfg.scalpTp1RoePct ?? FAST_TP1_ROE_PCT}% 전량컷 · 칩 ON + ARM + CONFIRMED만
          </div>
        )}
        <div className={styles.tradeSigBoard} aria-label="사용 중">
          <div className={styles.tradeSigRow}>
            <Sig on={true} label={BAND15_AUTO_HOCHUNG} title={`${BAND15_AUTO_HOCHUNG}(${BAND15_AUTO_CALLSIGN})`} />
            <Sig on={true} label={BAND15_AUTO_TF} />
            <Sig on={true} label="Paper" />
            <Sig on={virtOn} label="가상매매" />
            <Sig on={Boolean(livePosBtc || livePosEth || livePosBnb || livePosXrp || livePosSol || livePos || virtPos)} label="포지션" />
          </div>
          {tapOnly ? null : (
          <div className={styles.tradeSigRow}>
            <Sig on={cfg.enabled || cfg.liveArmed} label="엔진" />
            <Sig on={cfg.strategyScalp} label="단타" />
            <Sig on={cfg.strategyDoksuri1} label="독수리" />
            <Sig on={chartPxOn} label="차트가격" />
            <Sig on={planOn} label="플랜E" />
            <Sig on={liveReady} label="실전매매" />
            <Sig on={!liveReady && virtOn} label="가상매매" />
            <Sig on={!flatCd.cooling && (liveReady || virtOn)} label="연속스캔" />
            <Sig on={liveReady ? Boolean(livePosBtc || livePosEth || livePosBnb || livePosXrp || livePosSol || livePos) : Boolean(virtPos)} label="포지션" />
          </div>
          )}
          <div className={styles.tradeSigRowSym} aria-label="심볼">
            <Sig on={isAutoTradeSymbolEnabled(cfg, 'BTCUSDT')} label="BTC" title={`BTC ${BAND15_AUTO_TF}`} />
            <Sig on={isAutoTradeSymbolEnabled(cfg, 'ETHUSDT')} label="ETH" title={`ETH ${BAND15_AUTO_TF}`} />
            <Sig on={isAutoTradeSymbolEnabled(cfg, 'BNBUSDT')} label="BNB" title={`BNB ${BAND15_AUTO_TF}`} />
            <Sig on={isAutoTradeSymbolEnabled(cfg, 'XRPUSDT')} label="XRP" title={`XRP ${BAND15_AUTO_TF}`} />
            <Sig on={isAutoTradeSymbolEnabled(cfg, 'SOLUSDT')} label="SOL" title={`SOL ${BAND15_AUTO_TF}`} />
          </div>
          <div className={styles.tradeSigRow}>
            <Sig on={apiConfigured} label="API키" />
            <Sig on={apiAuthOk} label="API인증" />
          </div>
        </div>

        {/* 코인 스킬칩 미니 — 한눈에 연동·활력 */}
        <div className={styles.skillCompactRow} aria-label="코인 스킬칩">
          {skillBoard.cards.map((c) => (
            <button
              key={c.coin}
              type="button"
              className={styles.skillCompactChip}
              data-on={c.chipOn ? '1' : '0'}
              data-tone={c.tone}
              title={`${c.skillsHeldKo} · 진입${c.tradeCount} · TP${c.tpExits} · ${c.linkKo}`}
              onClick={() => setTab('skill')}
            >
              <strong>
                {c.emoji} {c.coin}
              </strong>
              <span>
                {c.tf} · {BAND15_AUTO_HOCHUNG}
              </span>
              <span>
                {c.chipOn ? 'ON' : 'OFF'}
                {c.posDir ? ` · ${c.posDir === 'LONG' ? '롱' : '숏'}` : ''}
              </span>
              <span className={styles.skillMiniBar}>
                <i style={{ width: `${c.vitality}%` }} />
              </span>
            </button>
          ))}
        </div>

        <div className={styles.tradeHeroStrip} aria-label="핵심 현황">
          {liveReady ? (
            <>
              <div className={styles.tradeHeroCard} data-tone="teal">
                <div className={styles.tradeHeroLabel}>Bitget 가용</div>
                <div className={styles.tradeHeroValue}>
                  {availUsdt != null
                    ? `${availUsdt.toLocaleString('en-US', { maximumFractionDigits: 2 })}U`
                    : '재조회'}
                </div>
              </div>
              <div className={styles.tradeHeroCard} data-tone="gold">
                <div className={styles.tradeHeroLabel}>실전포지션</div>
                <div className={styles.tradeHeroValue} style={{ fontSize: 12, lineHeight: 1.35 }}>
                  {liveOpenList.length > 0 ? (
                    liveOpenList
                      .map(
                        (p) =>
                          `${autoTradeSymbolChipKo(p.symbol)}${p.direction === 'LONG' ? '롱' : '숏'} ${fmtPnl(p.unrealizedPnl)}`
                      )
                      .join(' · ')
                  ) : (
                    '없음'
                  )}
                </div>
              </div>
              <div className={styles.tradeHeroCard} data-tone="rose">
                <div className={styles.tradeHeroLabel}>1회운영 · {scalpPct}%</div>
                <div className={styles.tradeHeroValue}>
                  {liveRiskUsdt != null
                    ? `${liveRiskUsdt.toLocaleString('en-US', { maximumFractionDigits: 1 })}U`
                    : '—'}
                </div>
              </div>
            </>
          ) : (
            <>
              <div className={styles.tradeHeroCard} data-tone="teal">
                <div className={styles.tradeHeroLabel}>가상시드</div>
                <div className={styles.tradeHeroValue} data-tone={pnlTone(seedSum.seedDelta)}>
                  {seedSum.seedNow.toLocaleString('en-US', { maximumFractionDigits: 1 })}U
                </div>
              </div>
              <div className={styles.tradeHeroCard} data-tone="gold">
                <div className={styles.tradeHeroLabel}>가상오늘</div>
                <div className={styles.tradeHeroValue}>
                  {seedSum.tradeCount}회 · 승{seedSum.winCount}/패{seedSum.lossCount}
                </div>
              </div>
              <div className={styles.tradeHeroCard} data-tone="rose">
                <div className={styles.tradeHeroLabel}>1회운영 · {VIRTUAL_SEED_RISK_PCT}%</div>
                <div className={styles.tradeHeroValue}>
                  {virtualRiskMarginUsdt(seedSum.seedNow).toLocaleString('en-US', {
                    maximumFractionDigits: 1,
                  })}
                  U
                </div>
              </div>
            </>
          )}
        </div>
        {tab === 'live' ? (
          <div className={styles.tradeWindowStack}>
            <div className={styles.tradeSituationBoard}>
              <div className={styles.tradeSituationTitle}>실시간 상황판 · 전부 한글</div>
              <div className={styles.tradeSituationGrid}>
                <div>
                  모드 <b>{liveReady ? '실전매매' : virtOn ? '가상매매' : '대기'}</b>
                </div>
                <div>
                  분봉 <b>{tfEntryKo(timeframe)}</b>
                </div>
                <div>
                  마크가{' '}
                  <b>
                    {markPx > 0
                      ? markPx.toLocaleString('en-US', { maximumFractionDigits: 1 })
                      : '—'}
                  </b>
                </div>
                <div>
                  레버리지 <b>{cfg.leverage}배</b>
                </div>
                <div>
                  단타비중 <b>{scalpPct}%</b>
                </div>
                <div>
                  독수리비중 <b>{dokPct}%</b>
                </div>
              </div>
              <div style={{ marginTop: 8, fontSize: 12, color: '#e2e8f0', lineHeight: 1.45 }}>
                <b>연속분석:</b> {reentryKo}
              </div>
              <div style={{ marginTop: 6, fontSize: 12, color: '#7dd3fc', lineHeight: 1.4 }}>
                {virtAnalysisStripKo}
              </div>
              <div style={{ marginTop: 6, fontSize: 11, color: '#94a3b8' }}>
                {liveStatusKo || '상태 · 대기'} · {fourStrategyStripKo}
              </div>
            </div>

            <div className={styles.tradeWindowSectionTitle}>분석 파이프 (가상=실전 동일)</div>
            <div className={styles.tradeWindowHint}>
              폭락존 · 핫존 · 구조로켓 · 4전략 · 독수리1호 · MTF감시 · 플랜터치 · 고래빔가산
            </div>
            <div className={styles.tradeWindowHint} style={{ marginTop: 4 }}>
              익절 후: 같은방향 눌림재진입(최대 {cfg.reentryExpireMin ?? 10}분) → 만료 후 전방향 ·
              손절/청산 후: {cfg.postFlatCooldownSec ?? 20}초 뒤 전방향 · 익절 직후 추격금지{' '}
              {cfg.reentryCooldownSec ?? 45}초
            </div>

            <div className={styles.tradeWindowSectionTitle}>시드·성적 요약</div>
            <div className={styles.tradeHeroStrip}>
              {liveReady ? (
                <>
                  <div className={styles.tradeHeroCard} data-tone="teal">
                    <div className={styles.tradeHeroLabel}>Bitget 시드</div>
                    <div className={styles.tradeHeroValue}>
                      {availUsdt != null
                        ? `${availUsdt.toLocaleString('en-US', { maximumFractionDigits: 2 })}U`
                        : '—'}
                    </div>
                  </div>
                  <div className={styles.tradeHeroCard} data-tone="gold">
                    <div className={styles.tradeHeroLabel}>BTC/ETH/BNB/XRP</div>
                    <div className={styles.tradeHeroValue} style={{ fontSize: 11, lineHeight: 1.35 }}>
                      {symSigLine}
                    </div>
                  </div>
                  <div className={styles.tradeHeroCard} data-tone="rose">
                    <div className={styles.tradeHeroLabel}>1회 · {scalpPct}%</div>
                    <div className={styles.tradeHeroValue}>
                      {liveRiskUsdt != null
                        ? `${liveRiskUsdt.toLocaleString('en-US', { maximumFractionDigits: 1 })}U`
                        : '—'}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className={styles.tradeHeroCard} data-tone="teal">
                    <div className={styles.tradeHeroLabel}>누적손익</div>
                    <div className={styles.tradeHeroValue} data-tone={pnlTone(seedSum.seedDelta)}>
                      {fmtPnl(seedSum.seedDelta, 2)}U
                    </div>
                  </div>
                  <div className={styles.tradeHeroCard} data-tone="gold">
                    <div className={styles.tradeHeroLabel}>수익합</div>
                    <div className={styles.tradeHeroValue} data-tone="up">
                      {fmtPnl(seedSum.winPnl, 2)}U
                    </div>
                  </div>
                  <div className={styles.tradeHeroCard} data-tone="rose">
                    <div className={styles.tradeHeroLabel}>손실합</div>
                    <div className={styles.tradeHeroValue} data-tone="down">
                      {fmtPnl(seedSum.lossPnl, 2)}U
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className={styles.tradeWindowSectionTitle}>빠른 조치</div>
            <div className={styles.tradeWindowRow}>
              <button
                type="button"
                className="tool-chip tool-chip-button"
                onClick={() => setTab('pos')}
              >
                포지션 보기
              </button>
              <button
                type="button"
                className="tool-chip tool-chip-button"
                onClick={() => setTab('guide')}
              >
                설명서
              </button>
              <button
                type="button"
                className="tool-chip tool-chip-button"
                onClick={() => setTab('journal')}
              >
                보강기록 열기
              </button>
              <button
                type="button"
                className="tool-chip tool-chip-button"
                onClick={() => {
                  downloadReinforcementPack();
                  setMsg('보강용 파일 저장됨');
                }}
              >
                보강파일 받기
              </button>
            </div>
            <div className={styles.tradeWindowCard} style={{ borderColor: 'rgba(56,189,248,0.35)' }}>
              <b>청산 한줄</b>
              <div>TP1 = 반익(약 50~55%) · 전량 종료는 TP2·러너 / 본절 / 시간손절 / 수동청산</div>
            </div>
            <div className={styles.tradeDeskFoot}>
              확정 수익 아님 · 교육·검증용 · 실시간 마크 기준 진입
            </div>
          </div>
        ) : null}

        {tab === 'skill' ? (
          <div
            className={styles.skillBoard}
            aria-label="코인 스킬칩"
            style={skillColorsToCssVars(skillColors) as CSSProperties}
          >
            <div className={styles.skillBoardHead}>
              <div className={styles.skillBoardTitle}>
                <span className={styles.skillBoardPulse} aria-hidden />
                코인 · {BAND15_AUTO_HOCHUNG}
              </div>
              <button
                type="button"
                className="tool-chip tool-chip-button"
                onClick={() => setScoreTick((v) => v + 1)}
              >
                ↻ 갱신
              </button>
            </div>
            <div className={styles.skillBoardSum}>{skillBoard.summaryKo}</div>
            {tapOnly ? null : (
            <div className={styles.skillColorBar} aria-label="스킬 색상">
              <b>색상</b>
              {SKILL_COLOR_FIELDS.map((f) => (
                <label key={f.key} className={styles.skillColorItem}>
                  <span>{f.labelKo}</span>
                  <input
                    type="color"
                    value={skillColors[f.key]}
                    onChange={(e) => {
                      const next = writeSkillColors({ [f.key]: e.target.value });
                      setSkillColors(next);
                    }}
                  />
                </label>
              ))}
              <button
                type="button"
                className="tool-chip tool-chip-button"
                onClick={() => {
                  const next = writeSkillColors({ ...DEFAULT_SKILL_COLORS, updatedAt: Date.now() });
                  setSkillColors(next);
                }}
              >
                색기본
              </button>
            </div>
            )}
            <div className={styles.tradeWindowHint} style={{ marginBottom: 4 }}>
              사용 스킬 {BAND15_AUTO_HOCHUNG} · 레버·비중·TP/SL · 확정 수익 아님
            </div>
            <div
              className={styles.tradeWindowCard}
              style={{ borderColor: 'rgba(56,189,248,0.4)', marginBottom: 8 }}
            >
              <div style={{ fontWeight: 800, marginBottom: 6 }}>
                텔레그램 코인테스트 · 주문없음
              </div>
              <div className={styles.tradeWindowHint} style={{ marginBottom: 6 }}>
                {tgEnvKo || 'TG상태 확인 중…'} · 칩 누르면 단톡 1건 (진입알림과 동일 경로)
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {(['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'XRPUSDT', 'SOLUSDT'] as const).map(
                  (sym) => (
                    <button
                      key={sym}
                      type="button"
                      className="tool-chip tool-chip-button"
                      disabled={Boolean(tgTestBusy)}
                      title={`${sym} 텔레그램 테스트 전송`}
                      onClick={() => void runTelegramCoinTest(sym)}
                    >
                      {tgTestBusy === sym
                        ? `${sym.replace('USDT', '')}…`
                        : `${sym.replace('USDT', '')} TG`}
                    </button>
                  )
                )}
                <button
                  type="button"
                  className="tool-chip tool-chip-button"
                  disabled={Boolean(tgTestBusy)}
                  title="5코인 순차 테스트"
                  onClick={() => void runTelegramCoinTest('ALL')}
                >
                  {tgTestBusy === 'ALL' ? '전부…' : '전부TG'}
                </button>
                <button
                  type="button"
                  className="tool-chip tool-chip-button"
                  disabled={Boolean(tgTestBusy)}
                  onClick={() => void refreshTelegramEnv()}
                >
                  TG상태
                </button>
              </div>
              {tgTestMsg ? (
                <div
                  className={styles.tradeWindowHint}
                  style={{
                    marginTop: 8,
                    color: /실패|오류|FAIL/i.test(tgTestMsg) ? '#fca5a5' : '#a7f3d0',
                  }}
                >
                  {tgTestMsg}
                </div>
              ) : null}
            </div>
            <div className={styles.skillGrid}>
              {skillBoard.cards.map((c) => (
                <SkillCardView
                  key={c.coin}
                  card={c}
                  risk={skillRiskMap[c.coin] || getCoinSkillRisk(c.coin)}
                  onSaveRisk={saveSkillRisk}
                  saveBusy={skillRiskBusyCoin === c.coin}
                  exclusive={
                    exclusiveMap[c.coin] ||
                    getCoinExclusiveSkills(c.coin) ||
                    defaultExclusiveState(c.coin)
                  }
                  onToggleExclusive={(skillId, on) =>
                    toggleExclusiveSkill(c.coin, skillId, on)
                  }
                  exclusiveBusy={exclusiveBusyCoin === c.coin}
                />
              ))}
            </div>
            <div className={styles.tradeDeskFoot}>
              {BAND15_AUTO_HOCHUNG} · 레버·비중 저장 · 확정아님
            </div>
          </div>
        ) : null}

        {tab === 'stats' ? (
          <div className={styles.tradeWindowStack}>
            <div className={styles.tradeWindowCard} style={{ borderColor: 'rgba(125,211,252,0.45)' }}>
              <div style={{ fontWeight: 800 }}>통계 · 코인별 승패·누적</div>
              <div className={styles.tradeWindowHint} style={{ marginTop: 4 }}>
                {coinBoard.summaryKo}
              </div>
              <div className={styles.tradeWindowHint} style={{ marginTop: 4 }}>
                전체 {coinBoard.totalTrades}회 · 누적{' '}
                <span data-tone={pnlTone(coinBoard.totalNetPnl)}>
                  {coinBoard.totalNetPnl >= 0 ? '+' : ''}
                  {coinBoard.totalNetPnl.toFixed(1)}U
                </span>
                {' · '}오늘 {coinBoard.todayAllCount}회{' '}
                <span data-tone={pnlTone(coinBoard.todayAllPnl)}>
                  {coinBoard.todayAllPnl >= 0 ? '+' : ''}
                  {coinBoard.todayAllPnl.toFixed(1)}U
                </span>
              </div>
              <button
                type="button"
                className="tool-chip tool-chip-button"
                style={{ marginTop: 8 }}
                onClick={() => {
                  downloadCoinScorePack();
                  setMsg('코인통계 저장됨 · 채팅에 첨부해 주세요');
                }}
              >
                통계 다운로드
              </button>
            </div>

            <div className={styles.tradeWindowSectionTitle}>코인 성적 칩 · 한눈에 (누적손익순)</div>
            <div className={styles.tradeWindowRow} style={{ flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {(
                [
                  ['ALL', '전체'],
                  ['BTC', 'BTC'],
                  ['ETH', 'ETH'],
                  ['BNB', 'BNB'],
                  ['XRP', 'XRP'],
                  ['SOL', 'SOL'],
                ] as const
              ).map(([id, label]) => {
                const row = id === 'ALL' ? null : coinBoard.rows.find((r) => r.coin === id);
                const pnl = id === 'ALL' ? coinBoard.totalNetPnl : row?.netPnl ?? 0;
                const hot = row ? row.needReinforce || row.cooling : coinBoard.rows.some((r) => r.needReinforce);
                const rankKo = row?.rank != null ? `${row.rank}위 ` : '';
                const wrKo =
                  row?.winRatePct != null && row.tradeCount > 0
                    ? ` ${Math.round(row.winRatePct)}%`
                    : '';
                return (
                  <button
                    key={id}
                    type="button"
                    className={`tool-chip tool-chip-button${statsCoin === id ? ' tool-chip-active' : ''}`}
                    onClick={() => setStatsCoin(id)}
                    title={
                      row
                        ? `${row.routeKo} · ${row.statusKo} · ${row.wins}승${row.losses}패 · 확정아님`
                        : coinBoard.summaryKo
                    }
                  >
                    {rankKo}
                    {label}
                    {hot ? ' !' : ''}
                    <span style={{ marginLeft: 4, opacity: 0.85 }} data-tone={pnlTone(pnl)}>
                      {pnl >= 0 ? '+' : ''}
                      {pnl.toFixed(0)}U
                    </span>
                    {wrKo ? (
                      <span style={{ marginLeft: 2, opacity: 0.7, fontSize: '0.85em' }}>{wrKo}</span>
                    ) : null}
                  </button>
                );
              })}
            </div>

            {statsCoin === 'ALL' ? (
              <div className={styles.tradeWindowStack}>
                <div className={styles.tradeWindowSectionTitle}>5코인 한눈에 · 잘한 순</div>
                {coinBoard.rows.map((r) => {
                  const td = todayBoard.rows.find((t) => t.coin === r.coin);
                  return (
                    <button
                      key={r.coin}
                      type="button"
                      className={styles.tradeWindowJournalRow}
                      style={{
                        marginTop: 6,
                        textAlign: 'left',
                        width: '100%',
                        cursor: 'pointer',
                        borderLeft: r.needReinforce || r.cooling
                          ? '3px solid #f87171'
                          : r.netPnl > 0
                            ? '3px solid #34d399'
                            : '3px solid #64748b',
                        paddingLeft: 8,
                        background: 'transparent',
                        color: 'inherit',
                      }}
                      onClick={() => setStatsCoin(r.coin)}
                    >
                      <div className={styles.tradeWindowJournalHead}>
                        <b>
                          {r.rank != null ? `${r.rank}위 ` : ''}
                          {r.coin}
                          {r.openCount > 0 ? ` · 진행${r.openCount}` : ''}
                        </b>
                        <span data-tone={pnlTone(r.netPnl)}>
                          {r.netPnl >= 0 ? '+' : ''}
                          {r.netPnl.toFixed(1)}U
                        </span>
                      </div>
                      <div className={styles.tradeWindowHint}>
                        {r.routeKo} · {r.statusKo}
                        {r.cooling ? ` · CD${r.remainSec}s` : ''} · ×{r.sizeMult}
                      </div>
                      <div className={styles.tradeWindowHint}>
                        {r.tradeCount}회 · 승{r.wins}/패{r.losses}
                        {r.winRatePct != null ? ` · 표본${Math.round(r.winRatePct)}%` : ''}
                        {' · '}손절{r.slExits} · 오늘 {td?.count ?? 0}회{' '}
                        <span data-tone={pnlTone(td?.pnl ?? 0)}>
                          {(td?.pnl ?? 0) >= 0 ? '+' : ''}
                          {(td?.pnl ?? 0).toFixed(1)}U
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              (() => {
                const r = coinBoard.rows.find((x) => x.coin === statsCoin);
                const td = todayBoard.rows.find((t) => t.coin === statsCoin);
                if (!r) return <div className={styles.tradeWindowHint}>데이터 없음</div>;
                return (
                  <div className={styles.tradeWindowStack}>
                    <div
                      className={styles.tradeWindowCard}
                      style={{
                        borderColor:
                          r.needReinforce || r.cooling
                            ? 'rgba(248,113,113,0.5)'
                            : r.netPnl > 0
                              ? 'rgba(52,211,153,0.45)'
                              : 'rgba(100,116,139,0.4)',
                      }}
                    >
                      <div className={styles.tradeWindowJournalHead}>
                        <b style={{ fontSize: 15 }}>
                          {r.coin} · {r.statusKo}
                        </b>
                        <span data-tone={pnlTone(r.netPnl)}>
                          {r.netPnl >= 0 ? '+' : ''}
                          {r.netPnl.toFixed(1)}U
                        </span>
                      </div>
                      <div className={styles.tradeWindowHint} style={{ marginTop: 4 }}>
                        루트: {r.routeKo}
                      </div>
                      <div className={styles.tradeWindowHint}>
                        {r.cooling ? `쿨다운 ${r.remainSec}s · ` : ''}
                        사이즈 ×{r.sizeMult}
                        {r.openCount > 0 ? ` · 진행 ${r.openCount}` : ''}
                        {r.consecutiveSl > 0 ? ` · 연속손절 ${r.consecutiveSl}` : ''}
                      </div>
                    </div>

                    <div className={styles.tradeWindowSectionTitle}>누적</div>
                    <div className={styles.tradeWindowCard}>
                      <div className={styles.tradeWindowHint}>
                        {r.tradeCount}회 · 승{r.wins} / 패{r.losses}
                        {r.tradeCount > 0
                          ? ` · 승률 ${((r.wins / r.tradeCount) * 100).toFixed(0)}%`
                          : ''}{' '}
                        · 익절{r.tpExits} · 손절{r.slExits} · 손절률 {(r.slRate * 100).toFixed(0)}%
                      </div>
                      <div className={styles.tradeWindowHint}>
                        누적{' '}
                        <b data-tone={pnlTone(r.netPnl)}>
                          {r.netPnl >= 0 ? '+' : ''}
                          {r.netPnl.toFixed(1)}U
                        </b>
                        {' · '}이익 {r.winPnl.toFixed(1)}U · 손실{' '}
                        {Math.abs(r.lossPnl).toFixed(1)}U · 평균ROE {r.avgRoePct.toFixed(1)}%
                      </div>
                      <div className={styles.tradeWindowHint}>
                        실전 {r.liveCount} · 가상 {r.virtualCount}
                      </div>
                    </div>

                    <div className={styles.tradeWindowSectionTitle}>오늘</div>
                    <div className={styles.tradeWindowCard}>
                      <div className={styles.tradeWindowHint}>
                        {td?.count ?? 0}회 · 승{td?.wins ?? 0} / 패{td?.losses ?? 0}
                        {(td?.count ?? 0) > 0
                          ? ` · 승률 ${(((td?.wins ?? 0) / (td?.count ?? 1)) * 100).toFixed(0)}%`
                          : ''}{' '}
                        · 손절{td?.slExits ?? 0}
                      </div>
                      <div className={styles.tradeWindowHint}>
                        오늘 손익{' '}
                        <b data-tone={pnlTone(td?.pnl ?? 0)}>
                          {(td?.pnl ?? 0) >= 0 ? '+' : ''}
                          {(td?.pnl ?? 0).toFixed(1)}U
                        </b>
                      </div>
                    </div>

                    <div className={styles.tradeWindowSectionTitle}>왜 · 조치</div>
                    <div className={styles.tradeWindowCard}>
                      <div className={styles.tradeWindowHint}>왜: {r.whyKo}</div>
                      <div className={styles.tradeWindowHint}>조치: {r.actionKo}</div>
                    </div>

                    <button
                      type="button"
                      className="tool-chip tool-chip-button"
                      onClick={() => setStatsCoin('ALL')}
                    >
                      ← 전체 보기
                    </button>
                  </div>
                );
              })()
            )}
            <div className={styles.tradeWindowSectionTitle}>BTC · 3분 로켓 1년</div>
            <div className={styles.tradeWindowCard} style={{ borderColor: 'rgba(251,146,60,0.45)' }}>
              <div className={styles.tradeWindowHint}>
                3분봉 1년 · 🚀상승/📉하락 로켓 · 헌팅SL · 30x 기준 TP/SL·수수료·적정레버 · 확정아님
              </div>
              <div className={styles.tradeWindowRow} style={{ marginTop: 8, flexWrap: 'wrap', gap: 6 }}>
                <button
                  type="button"
                  className="tool-chip tool-chip-button"
                  disabled={btcRocketBusy}
                  onClick={() => {
                    setBtcRocketBusy(true);
                    setMsg('BTC 3m 로켓 1년 분석중… (첫 실행 다운로드+analyze 수 분)');
                    const q = new URLSearchParams({
                      leverage: String(cfg.leverage || 30),
                    });
                    void fetch(`/api/merged-desk/btc-3m-rocket-year-replay?${q}`, {
                      credentials: 'same-origin',
                      cache: 'no-store',
                    })
                      .then(async (res) => {
                        const j = (await res.json().catch(() => ({}))) as typeof btcRocketReplay & {
                          ok?: boolean;
                          error?: string;
                        };
                        if (!j?.ok) {
                          setMsg(j?.error || 'BTC 로켓 리플레이 실패');
                          return;
                        }
                        setBtcRocketReplay(j);
                        setStatsCoin('BTC');
                        persistYearStatsResult('BTC', j as unknown as Record<string, unknown>, cfg.leverage || 30);
                        setMsg(
                          `${j.summaryKo || 'BTC 로켓 분석 완료'} · 서버저장(재다운 불필요)`
                        );
                      })
                      .catch((e) => setMsg(e instanceof Error ? e.message : '오류'))
                      .finally(() => setBtcRocketBusy(false));
                  }}
                >
                  {btcRocketBusy ? '분석중…' : 'BTC 3m 로켓 1년 통계'}
                </button>
                <button
                  type="button"
                  className="tool-chip tool-chip-button"
                  disabled={btcRocketBusy}
                  onClick={() => {
                    setBtcRocketBusy(true);
                    setMsg('BTC 3m 강제 재다운+분석…');
                    const q = new URLSearchParams({
                      leverage: String(cfg.leverage || 30),
                      forceDownload: '1',
                    });
                    void fetch(`/api/merged-desk/btc-3m-rocket-year-replay?${q}`, {
                      credentials: 'same-origin',
                      cache: 'no-store',
                    })
                      .then(async (res) => {
                        const j = (await res.json().catch(() => ({}))) as typeof btcRocketReplay & {
                          ok?: boolean;
                          error?: string;
                        };
                        if (!j?.ok) {
                          setMsg(j?.error || '실패');
                          return;
                        }
                        setBtcRocketReplay(j);
                        setStatsCoin('BTC');
                        persistYearStatsResult('BTC', j as unknown as Record<string, unknown>, cfg.leverage || 30);
                        setMsg(`${j.summaryKo || '완료'} · 서버저장(재다운 불필요)`);
                      })
                      .catch((e) => setMsg(e instanceof Error ? e.message : '오류'))
                      .finally(() => setBtcRocketBusy(false));
                  }}
                >
                  재다운+실행
                </button>
              </div>
                  {btcRocketReplay ? (
                <div style={{ marginTop: 10 }}>
                  <div className={styles.tradeWindowHint} style={{ fontWeight: 700 }}>
                    {btcRocketReplay.summaryKo}
                  </div>
                  <div className={styles.tradeWindowHint}>{btcRocketReplay.hintKo}</div>
                  {btcRocketReplay.source ? (
                    <div className={styles.tradeWindowHint}>데이터: {btcRocketReplay.source}</div>
                  ) : null}
                  <div className={styles.tradeWindowHint} style={{ marginTop: 6 }}>
                    🚀상승 {btcRocketReplay.rocketLong} · 📉하락 {btcRocketReplay.rocketShort} · 거래{' '}
                    {btcRocketReplay.tradeCount} · 승{btcRocketReplay.wins}/패{btcRocketReplay.losses}
                    {btcRocketReplay.winRate != null
                      ? ` · 승률 ${(btcRocketReplay.winRate * 100).toFixed(0)}%`
                      : ''}
                  </div>
                  <div className={styles.tradeWindowHint}>
                    평균상승(MFE) {btcRocketReplay.avgMfePct.toFixed(3)}% · 평균하락(MAE){' '}
                    {btcRocketReplay.avgMaePct.toFixed(3)}% · 승평균 {btcRocketReplay.avgWinMovePct.toFixed(3)}% ·
                    패평균 {btcRocketReplay.avgLossMovePct.toFixed(3)}%
                  </div>
                  <div className={styles.tradeWindowHint}>
                    TP도달 {btcRocketReplay.tpHits} · 손절 {btcRocketReplay.slHits} · 시간청산{' '}
                    {btcRocketReplay.timeExits}
                  </div>

                  <div className={styles.tradeWindowSectionTitle}>30x 권장 타점</div>
                  <div className={styles.tradeWindowCard}>
                    <div className={styles.tradeWindowHint}>
                      가격 TP ≈ {btcRocketReplay.suggestTpPricePct.toFixed(3)}% → ROE{' '}
                      <b>{btcRocketReplay.lev30.suggestTpRoePct.toFixed(1)}%</b>
                    </div>
                    <div className={styles.tradeWindowHint}>
                      가격 SL ≈ {btcRocketReplay.suggestSlPricePct.toFixed(3)}% (헌팅중앙{' '}
                      {btcRocketReplay.medianSlDistPct.toFixed(3)}%) → ROE{' '}
                      <b>{btcRocketReplay.lev30.suggestSlRoePct.toFixed(1)}%</b>
                    </div>
                    <div className={styles.tradeWindowHint}>
                      왕복수수료(테이커) 증거금 −{btcRocketReplay.lev30.feeRoundTripMarginPct.toFixed(2)}%p ·
                      펀딩(0.5h) −{btcRocketReplay.lev30.fundingHalfHourMarginPct.toFixed(2)}%p
                    </div>
                    <div className={styles.tradeWindowHint}>
                      TP 찍었을 때 순ROE 대략{' '}
                      <b data-tone={pnlTone(btcRocketReplay.lev30.netTpRoeAfterFeePct)}>
                        {btcRocketReplay.lev30.netTpRoeAfterFeePct.toFixed(2)}%
                      </b>
                    </div>
                    {btcRocketReplay.lev30.detailKo.map((line, i) => (
                      <div key={`btc-d-${i}`} className={styles.tradeWindowHint}>
                        {line}
                      </div>
                    ))}
                    <button
                      type="button"
                      className="tool-chip tool-chip-button"
                      style={{ marginTop: 8 }}
                      onClick={() => {
                        const tp = Math.max(
                          3,
                          Math.min(25, Math.round(btcRocketReplay.lev30.suggestTpRoePct * 10) / 10)
                        );
                        const sl = Math.max(
                          1.5,
                          Math.min(15, Math.round(btcRocketReplay.lev30.suggestSlRoePct * 10) / 10)
                        );
                        const lev = btcRocketReplay.bestLeverage || cfg.leverage || 30;
                        const next = {
                          ...cfg,
                          leverage: lev,
                          scalpTp1RoePct: tp,
                          scalpSlRoePct: sl,
                        };
                        setCfg(next);
                        writeAutoTradeConfig(next);
                        const prof = buildExitFromStats({
                          coin: 'BTC',
                          leverage: lev,
                          avgMfePct: btcRocketReplay.avgMfePct,
                          avgMaePct: btcRocketReplay.avgMaePct,
                          medianSlDistPct: btcRocketReplay.medianSlDistPct,
                          targetTpRoePct: tp,
                          sampleTrades: btcRocketReplay.tradeCount,
                          winRate: btcRocketReplay.winRate,
                          preferTfs: ['3m'],
                          noteKo: btcRocketReplay.summaryKo,
                        });
                        prof.slPricePct = btcRocketReplay.suggestSlPricePct || prof.slPricePct;
                        prof.tpPricePct = btcRocketReplay.suggestTpPricePct || prof.tpPricePct;
                        writeCoinExitProfilePersistent(prof);
                        writeYearReplayPackPersistent(
                          'BTC',
                          btcRocketReplay as unknown as CachedYearPack
                        );
                        setMsg(
                          `BTC 실전적용 · ${lev}x · SL ${prof.slPricePct.toFixed(3)}% · TP ${prof.tpPricePct.toFixed(3)}% · 서버유지`
                        );
                      }}
                    >
                      권장 레버·TP·SL 적용
                    </button>
                  </div>

                  <div className={styles.tradeWindowSectionTitle}>적정 레버 (수수료 반영)</div>
                  <div className={styles.tradeWindowHint} style={{ fontWeight: 700 }}>
                    {btcRocketReplay.bestLevKo}
                  </div>
                  {btcRocketReplay.leverageTable?.map((row) => (
                    <div key={`lev-${row.leverage}`} className={styles.tradeWindowHint}>
                      {row.leverage}x · {row.okKo} · TP {row.suggestTpRoePct.toFixed(1)}%ROE / SL{' '}
                      {row.suggestSlRoePct.toFixed(1)}%ROE · 수수료 {row.roundTripFeeMarginPct.toFixed(1)}%p ·
                      순기대 {row.netEvRoePct.toFixed(2)}%p · 수수료/승{' '}
                      {row.feeShareOfWinPct.toFixed(0)}%
                    </div>
                  ))}

                  {btcRocketReplay.equityCurve && btcRocketReplay.equityCurve.length > 1 ? (
                    <>
                      <div className={styles.tradeWindowSectionTitle}>누적 곡선 (참고)</div>
                      <svg
                        viewBox="0 0 320 72"
                        width="100%"
                        height="72"
                        style={{ display: 'block', marginTop: 4 }}
                        aria-label="BTC rocket equity"
                      >
                        {(() => {
                          const pts = btcRocketReplay.equityCurve;
                          const ys = pts.map((p) => p.cumRoe30);
                          const minY = Math.min(...ys, 0);
                          const maxY = Math.max(...ys, 0);
                          const span = Math.max(1e-6, maxY - minY);
                          const path = pts
                            .map((p, i) => {
                              const x = (i / Math.max(1, pts.length - 1)) * 310 + 5;
                              const y = 66 - ((p.cumRoe30 - minY) / span) * 58;
                              return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
                            })
                            .join(' ');
                          const zeroY = 66 - ((0 - minY) / span) * 58;
                          return (
                            <>
                              <line
                                x1={5}
                                x2={315}
                                y1={zeroY}
                                y2={zeroY}
                                stroke="rgba(148,163,184,0.45)"
                                strokeWidth={1}
                              />
                              <path d={path} fill="none" stroke="#fb923c" strokeWidth={1.6} />
                            </>
                          );
                        })()}
                      </svg>
                      <div className={styles.tradeWindowHint}>주황=누적 ROE(30x 가정) · 확정아님</div>
                    </>
                  ) : null}
                </div>
              ) : (
                <div className={styles.tradeWindowHint} style={{ marginTop: 8 }}>
                  실행 후 🚀/📉 개수 · 평균 상승·손절 % · 30x TP/SL ROE · 수수료·적정레버가 나옵니다.
                </div>
              )}
            </div>

            <div className={styles.tradeWindowSectionTitle}>ETH · 폭락존 1년</div>
            <div className={styles.tradeWindowCard} style={{ borderColor: 'rgba(96,165,250,0.45)' }}>
              <div className={styles.tradeWindowHint}>
                3·5·15 폭락존 · TP ROE5% · 수수료·적정레버 · 히스토리 AI생략(실전≥60%) · 확정아님
              </div>
              <div className={styles.tradeWindowRow} style={{ marginTop: 8, flexWrap: 'wrap', gap: 6 }}>
                <button
                  type="button"
                  className="tool-chip tool-chip-button"
                  disabled={ethDumpBusy}
                  onClick={() => {
                    setEthDumpBusy(true);
                    setMsg('ETH 폭락존 1년 분석중…');
                    const q = new URLSearchParams({ leverage: String(cfg.leverage || 30) });
                    void fetch(`/api/merged-desk/eth-dump-year-replay?${q}`, {
                      credentials: 'same-origin',
                      cache: 'no-store',
                    })
                      .then(async (res) => {
                        const j = (await res.json().catch(() => ({}))) as CoinYearUiPack & {
                          ok?: boolean;
                          error?: string;
                        };
                        if (!j?.ok) {
                          setMsg(j?.error || 'ETH 리플레이 실패');
                          return;
                        }
                        setEthDumpReplay(j);
                        setStatsCoin('ETH');
                        const prof = saveYearPackAsExitProfile('ETH', j, cfg.leverage || 30);
                        setMsg(
                          `${j.summaryKo || 'ETH 완료'} · 실전반영 SL${prof.slPricePct.toFixed(3)}%/TP${prof.tpPricePct.toFixed(3)}% · 서버저장(재다운 불필요)`
                        );
                      })
                      .catch((e) => setMsg(e instanceof Error ? e.message : '오류'))
                      .finally(() => setEthDumpBusy(false));
                  }}
                >
                  {ethDumpBusy ? '분석중…' : 'ETH 폭락존 1년 통계'}
                </button>
              </div>
              {ethDumpReplay ? (
                <div style={{ marginTop: 8 }}>
                  <div className={styles.tradeWindowHint} style={{ fontWeight: 700 }}>
                    {ethDumpReplay.summaryKo}
                  </div>
                  <div className={styles.tradeWindowHint}>{ethDumpReplay.hintKo}</div>
                  <div className={styles.tradeWindowHint}>
                    거래 {ethDumpReplay.tradeCount} · 승{ethDumpReplay.wins}/패{ethDumpReplay.losses}
                    {ethDumpReplay.winRate != null
                      ? ` · ${(ethDumpReplay.winRate * 100).toFixed(0)}%`
                      : ''}{' '}
                    · 롱{ethDumpReplay.longCount}/숏{ethDumpReplay.shortCount} · TP{ethDumpReplay.tpHits}/SL
                    {ethDumpReplay.slHits}
                  </div>
                  <div className={styles.tradeWindowHint}>
                    MFE {ethDumpReplay.avgMfePct.toFixed(3)}% · MAE {ethDumpReplay.avgMaePct.toFixed(3)}% · 권장SL{' '}
                    {ethDumpReplay.suggestSlPricePct.toFixed(3)}% · TP{' '}
                    {ethDumpReplay.suggestTpPricePct.toFixed(3)}%
                  </div>
                  <div className={styles.tradeWindowHint}>
                    {cfg.leverage || 30}x · TP ROE {ethDumpReplay.lev30.suggestTpRoePct.toFixed(1)}% / SL{' '}
                    {ethDumpReplay.lev30.suggestSlRoePct.toFixed(1)}% · 수수료 −
                    {ethDumpReplay.lev30.feeRoundTripMarginPct.toFixed(1)}%p · 순TP{' '}
                    {ethDumpReplay.lev30.netTpRoeAfterFeePct.toFixed(2)}%
                  </div>
                  <div className={styles.tradeWindowHint} style={{ fontWeight: 700 }}>
                    {ethDumpReplay.bestLevKo}
                  </div>
                  {ethDumpReplay.byTf.map((tf) => (
                    <div key={`eth-${tf.timeframe}`} className={styles.tradeWindowHint}>
                      {tf.noteKo}
                      {tf.winRate != null ? ` · ${(tf.winRate * 100).toFixed(0)}%` : ''} · TP{tf.tpHits}/SL
                      {tf.slHits}
                    </div>
                  ))}
                  <button
                    type="button"
                    className="tool-chip tool-chip-button"
                    style={{ marginTop: 6 }}
                    onClick={() => {
                      const tp = Math.max(
                        3,
                        Math.min(25, Math.round(ethDumpReplay.lev30.suggestTpRoePct * 10) / 10)
                      );
                      const sl = Math.max(
                        1.5,
                        Math.min(15, Math.round(ethDumpReplay.lev30.suggestSlRoePct * 10) / 10)
                      );
                      const lev = ethDumpReplay.bestLeverage || cfg.leverage || 30;
                      const next = { ...cfg, leverage: lev, scalpTp1RoePct: tp, scalpSlRoePct: sl };
                      setCfg(next);
                      writeAutoTradeConfig(next);
                      const prof = saveYearPackAsExitProfile('ETH', ethDumpReplay, lev);
                      setMsg(
                        `ETH 실전적용 · ${lev}x · 가격SL ${prof.slPricePct.toFixed(3)}% · TP ${prof.tpPricePct.toFixed(3)}% · ROE TP${tp}/SL${sl}`
                      );
                    }}
                  >
                    ETH 권장 레버·TP·SL 적용
                  </button>
                </div>
              ) : null}
            </div>

            <div className={styles.tradeWindowSectionTitle}>BNB · SFP 1년</div>
            <div className={styles.tradeWindowCard} style={{ borderColor: 'rgba(250,204,21,0.4)' }}>
              <div className={styles.tradeWindowHint}>
                3·5·15 SFP · TP ROE5% · 헌팅SL · 수수료·적정레버 · 히스토리 AI생략(실전≥55%) · 확정아님
              </div>
              <div className={styles.tradeWindowRow} style={{ marginTop: 8, flexWrap: 'wrap', gap: 6 }}>
                <button
                  type="button"
                  className="tool-chip tool-chip-button"
                  disabled={bnbSfpBusy}
                  onClick={() => {
                    setBnbSfpBusy(true);
                    setMsg('BNB SFP 1년 분석중…');
                    const q = new URLSearchParams({ leverage: String(cfg.leverage || 30) });
                    void fetch(`/api/merged-desk/bnb-sfp-year-replay?${q}`, {
                      credentials: 'same-origin',
                      cache: 'no-store',
                    })
                      .then(async (res) => {
                        const j = (await res.json().catch(() => ({}))) as CoinYearUiPack & {
                          ok?: boolean;
                          error?: string;
                        };
                        if (!j?.ok) {
                          setMsg(j?.error || 'BNB 리플레이 실패');
                          return;
                        }
                        setBnbSfpReplay(j);
                        setStatsCoin('BNB');
                        const prof = saveYearPackAsExitProfile('BNB', j, cfg.leverage || 30);
                        setMsg(
                          `${j.summaryKo || 'BNB 완료'} · 실전반영 SL${prof.slPricePct.toFixed(3)}%/TP${prof.tpPricePct.toFixed(3)}% · 서버저장(재다운 불필요)`
                        );
                      })
                      .catch((e) => setMsg(e instanceof Error ? e.message : '오류'))
                      .finally(() => setBnbSfpBusy(false));
                  }}
                >
                  {bnbSfpBusy ? '분석중…' : 'BNB SFP 1년 통계'}
                </button>
              </div>
              {bnbSfpReplay ? (
                <div style={{ marginTop: 8 }}>
                  <div className={styles.tradeWindowHint} style={{ fontWeight: 700 }}>
                    {bnbSfpReplay.summaryKo}
                  </div>
                  <div className={styles.tradeWindowHint}>{bnbSfpReplay.hintKo}</div>
                  <div className={styles.tradeWindowHint}>
                    거래 {bnbSfpReplay.tradeCount} · 승{bnbSfpReplay.wins}/패{bnbSfpReplay.losses}
                    {bnbSfpReplay.winRate != null
                      ? ` · ${(bnbSfpReplay.winRate * 100).toFixed(0)}%`
                      : ''}{' '}
                    · 롱{bnbSfpReplay.longCount}/숏{bnbSfpReplay.shortCount} · TP{bnbSfpReplay.tpHits}/SL
                    {bnbSfpReplay.slHits}
                  </div>
                  <div className={styles.tradeWindowHint}>
                    MFE {bnbSfpReplay.avgMfePct.toFixed(3)}% · MAE {bnbSfpReplay.avgMaePct.toFixed(3)}% · 권장SL{' '}
                    {bnbSfpReplay.suggestSlPricePct.toFixed(3)}% · TP{' '}
                    {bnbSfpReplay.suggestTpPricePct.toFixed(3)}%
                  </div>
                  <div className={styles.tradeWindowHint}>
                    수수료 −{bnbSfpReplay.lev30.feeRoundTripMarginPct.toFixed(1)}%p · 순TP{' '}
                    {bnbSfpReplay.lev30.netTpRoeAfterFeePct.toFixed(2)}% · {bnbSfpReplay.bestLevKo}
                  </div>
                  {bnbSfpReplay.byTf.map((tf) => (
                    <div key={`bnb-${tf.timeframe}`} className={styles.tradeWindowHint}>
                      {tf.noteKo}
                      {tf.winRate != null ? ` · ${(tf.winRate * 100).toFixed(0)}%` : ''} · TP{tf.tpHits}/SL
                      {tf.slHits}
                    </div>
                  ))}
                  <button
                    type="button"
                    className="tool-chip tool-chip-button"
                    style={{ marginTop: 6 }}
                    onClick={() => {
                      const tp = Math.max(
                        3,
                        Math.min(25, Math.round(bnbSfpReplay.lev30.suggestTpRoePct * 10) / 10)
                      );
                      const sl = Math.max(
                        1.5,
                        Math.min(15, Math.round(bnbSfpReplay.lev30.suggestSlRoePct * 10) / 10)
                      );
                      const lev = bnbSfpReplay.bestLeverage || cfg.leverage || 30;
                      const next = { ...cfg, leverage: lev, scalpTp1RoePct: tp, scalpSlRoePct: sl };
                      setCfg(next);
                      writeAutoTradeConfig(next);
                      const prof = saveYearPackAsExitProfile('BNB', bnbSfpReplay, lev);
                      setMsg(
                        `BNB 실전적용 · ${lev}x · 가격SL ${prof.slPricePct.toFixed(3)}% · TP ${prof.tpPricePct.toFixed(3)}%`
                      );
                    }}
                  >
                    BNB 권장 레버·TP·SL 적용
                  </button>
                </div>
              ) : null}
            </div>

            <div className={styles.tradeWindowSectionTitle}>XRP · 1년 4패턴 리플레이</div>
            <div className={styles.tradeWindowCard} style={{ borderColor: 'rgba(250,204,21,0.4)' }}>
              <div className={styles.tradeWindowHint}>
                3m·5m·15m · 마감봉 신호 → TP1/SL/시간청산 · 전략별 분리 · 확정 승률·수익 아님
              </div>
              <div className={styles.tradeWindowRow} style={{ marginTop: 8, flexWrap: 'wrap', gap: 6 }}>
                <button
                  type="button"
                  className="tool-chip tool-chip-button"
                  disabled={xrpReplayBusy}
                  onClick={() => {
                    setXrpReplayBusy(true);
                    setMsg('XRP 1년 리플레이 실행중… (첫 실행은 다운로드로 수 분 걸릴 수 있음)');
                    const q = new URLSearchParams({
                      leverage: String(cfg.leverage || 30),
                      tp1RoePct: String(cfg.scalpTp1RoePct ?? 5),
                    });
                    void fetch(`/api/merged-desk/xrp-4strat-year-replay?${q}`, {
                      credentials: 'same-origin',
                      cache: 'no-store',
                    })
                      .then(async (res) => {
                        const j = (await res.json().catch(() => ({}))) as typeof xrpReplay & {
                          ok?: boolean;
                          error?: string;
                        };
                        if (!j?.ok) {
                          setMsg(j?.error || '리플레이 실패');
                          return;
                        }
                        setXrpReplay(j);
                        setStatsCoin('XRP');
                        const rows = Array.isArray(j.overall) ? j.overall : [];
                        const tradeCount = rows.reduce((s, r) => s + (r.tradeCount || 0), 0);
                        const wins = rows.reduce((s, r) => s + (r.wins || 0), 0);
                        const losses = rows.reduce((s, r) => s + (r.losses || 0), 0);
                        const avgMfePct =
                          tradeCount > 0
                            ? rows.reduce((s, r) => s + (r.avgMfePct || 0) * (r.tradeCount || 0), 0) /
                              tradeCount
                            : 0;
                        const avgMaePct =
                          tradeCount > 0
                            ? rows.reduce((s, r) => s + (r.avgMaePct || 0) * (r.tradeCount || 0), 0) /
                              tradeCount
                            : 0;
                        const medianSlDistPct =
                          tradeCount > 0
                            ? rows.reduce(
                                (s, r) => s + (r.medianSlDistPct || 0) * (r.tradeCount || 0),
                                0
                              ) / tradeCount
                            : 0;
                        const pack: CachedYearPack = {
                          ...(j as unknown as CachedYearPack),
                          tradeCount,
                          wins,
                          losses,
                          winRate: tradeCount > 0 ? wins / tradeCount : null,
                          avgMfePct,
                          avgMaePct,
                          medianSlDistPct,
                          suggestSlPricePct: medianSlDistPct,
                          suggestTpPricePct: avgMfePct > 0 ? avgMfePct * 0.7 : 0,
                          preferTfs: ['3m', '5m'],
                          summaryKo: j.summaryKo,
                        };
                        persistYearStatsResult('XRP', pack, cfg.leverage || 30);
                        setMsg(`${j.summaryKo || '리플레이 완료'} · 서버저장(재다운 불필요)`);
                      })
                      .catch((e) => {
                        setMsg(e instanceof Error ? e.message : '리플레이 오류');
                      })
                      .finally(() => setXrpReplayBusy(false));
                  }}
                >
                  {xrpReplayBusy ? '리플레이중…' : 'XRP 1년 리플레이 실행'}
                </button>
                <button
                  type="button"
                  className="tool-chip tool-chip-button"
                  disabled={xrpReplayBusy}
                  onClick={() => {
                    setXrpReplayBusy(true);
                    setMsg('강제 재다운로드 + 리플레이…');
                    const q = new URLSearchParams({
                      leverage: String(cfg.leverage || 30),
                      tp1RoePct: String(cfg.scalpTp1RoePct ?? 5),
                      forceDownload: '1',
                    });
                    void fetch(`/api/merged-desk/xrp-4strat-year-replay?${q}`, {
                      credentials: 'same-origin',
                      cache: 'no-store',
                    })
                      .then(async (res) => {
                        const j = (await res.json().catch(() => ({}))) as typeof xrpReplay & {
                          ok?: boolean;
                          error?: string;
                        };
                        if (!j?.ok) {
                          setMsg(j?.error || '리플레이 실패');
                          return;
                        }
                        setXrpReplay(j);
                        setStatsCoin('XRP');
                        const rows = Array.isArray(j.overall) ? j.overall : [];
                        const tradeCount = rows.reduce((s, r) => s + (r.tradeCount || 0), 0);
                        const wins = rows.reduce((s, r) => s + (r.wins || 0), 0);
                        const losses = rows.reduce((s, r) => s + (r.losses || 0), 0);
                        const avgMfePct =
                          tradeCount > 0
                            ? rows.reduce((s, r) => s + (r.avgMfePct || 0) * (r.tradeCount || 0), 0) /
                              tradeCount
                            : 0;
                        const avgMaePct =
                          tradeCount > 0
                            ? rows.reduce((s, r) => s + (r.avgMaePct || 0) * (r.tradeCount || 0), 0) /
                              tradeCount
                            : 0;
                        const medianSlDistPct =
                          tradeCount > 0
                            ? rows.reduce(
                                (s, r) => s + (r.medianSlDistPct || 0) * (r.tradeCount || 0),
                                0
                              ) / tradeCount
                            : 0;
                        const pack: CachedYearPack = {
                          ...(j as unknown as CachedYearPack),
                          tradeCount,
                          wins,
                          losses,
                          winRate: tradeCount > 0 ? wins / tradeCount : null,
                          avgMfePct,
                          avgMaePct,
                          medianSlDistPct,
                          suggestSlPricePct: medianSlDistPct,
                          suggestTpPricePct: avgMfePct > 0 ? avgMfePct * 0.7 : 0,
                          preferTfs: ['3m', '5m'],
                          summaryKo: j.summaryKo,
                        };
                        persistYearStatsResult('XRP', pack, cfg.leverage || 30);
                        setMsg(`${j.summaryKo || '리플레이 완료'} · 서버저장(재다운 불필요)`);
                      })
                      .catch((e) => {
                        setMsg(e instanceof Error ? e.message : '리플레이 오류');
                      })
                      .finally(() => setXrpReplayBusy(false));
                  }}
                >
                  재다운+실행
                </button>
              </div>
              {xrpReplay ? (
                <div style={{ marginTop: 10 }}>
                  <div className={styles.tradeWindowHint} style={{ fontWeight: 700 }}>
                    {xrpReplay.summaryKo}
                  </div>
                  <div className={styles.tradeWindowHint}>{xrpReplay.hintKo}</div>
                  {xrpReplay.sources ? (
                    <div className={styles.tradeWindowHint}>
                      데이터:{' '}
                      {Object.entries(xrpReplay.sources)
                        .map(([k, v]) => `${k}=${v}`)
                        .join(' · ')}
                    </div>
                  ) : null}
                  {xrpReplay.errors?.length ? (
                    <div className={styles.tradeWindowHint} style={{ color: '#fca5a5' }}>
                      {xrpReplay.errors.map((e) => `${e.tf}:${e.msg}`).join(' · ')}
                    </div>
                  ) : null}
                  <div className={styles.tradeWindowSectionTitle}>전략별 (합산 승률 금지)</div>
                  {xrpReplay.overall.map((row) => (
                    <div
                      key={row.strategyId}
                      className={styles.tradeWindowJournalRow}
                      style={{
                        marginTop: 6,
                        borderLeft:
                          (row.winRate ?? 0) >= 0.5
                            ? '3px solid #34d399'
                            : row.tradeCount > 0
                              ? '3px solid #f87171'
                              : '3px solid #64748b',
                        paddingLeft: 8,
                      }}
                    >
                      <div className={styles.tradeWindowJournalHead}>
                        <b>{row.labelKo}</b>
                        <span>
                          {row.tradeCount}회
                          {row.winRate != null ? ` · 승률 ${(row.winRate * 100).toFixed(0)}%` : ''}
                        </span>
                      </div>
                      <div className={styles.tradeWindowHint}>
                        승{row.wins}/패{row.losses} · TP{row.tpHits} · SL{row.slHits} · 시간{row.timeExits} · 롱
                        {row.longCount}/숏{row.shortCount}
                      </div>
                      <div className={styles.tradeWindowHint}>
                        평균+ {row.avgWinPct.toFixed(2)}% · 평균− {row.avgLossPct.toFixed(2)}% · MFE{' '}
                        {row.avgMfePct.toFixed(2)}% · MAE {row.avgMaePct.toFixed(2)}%
                      </div>
                      <div className={styles.tradeWindowHint}>
                        타점참고 · SL중앙 {row.medianSlDistPct.toFixed(3)}% · TP중앙{' '}
                        {row.medianTpDistPct.toFixed(3)}% (진입대비)
                      </div>
                      <div className={styles.tradeWindowHint}>{row.noteKo}</div>
                    </div>
                  ))}
                  <div className={styles.tradeWindowSectionTitle}>분봉별</div>
                  {xrpReplay.tfs.map((tf) => (
                    <div key={tf.timeframe} className={styles.tradeWindowCard} style={{ marginTop: 6 }}>
                      <div style={{ fontWeight: 700 }}>{tf.summaryKo}</div>
                      <div className={styles.tradeWindowHint}>
                        봉 {tf.candleCount}
                        {tf.tradeCountFull != null ? ` · 거래 ${tf.tradeCountFull}` : ''} ·{' '}
                        {tf.daysCovered.toFixed(0)}일
                      </div>
                      {tf.byStrategy
                        .filter((s) => s.tradeCount > 0)
                        .map((s) => (
                          <div key={`${tf.timeframe}-${s.labelKo}`} className={styles.tradeWindowHint}>
                            {s.labelKo}: {s.tradeCount}회
                            {s.winRate != null ? ` · ${(s.winRate * 100).toFixed(0)}%` : ''} · TP{s.tpHits}/SL
                            {s.slHits} · SL거리 {s.medianSlDistPct.toFixed(3)}% · TP거리{' '}
                            {s.medianTpDistPct.toFixed(3)}%
                          </div>
                        ))}
                    </div>
                  ))}
                </div>
              ) : (
                <div className={styles.tradeWindowHint} style={{ marginTop: 8 }}>
                  실행 후 상승%/하락%(승패) · 손절·익절 도달 · 타점·SL·TP 거리 통계가 표시됩니다.
                </div>
              )}
            </div>
            <div className={styles.tradeDeskFoot}>확정 승률·수익 아님 · 검증용 장부</div>
          </div>
        ) : null}

        {tab === 'desk' ? (
          <div className={styles.tradeDeskLayout}>
            {tapOnly ? (
              <div
                className={styles.aizoneTripleStrip}
                data-allow="1"
                title={tapOnlyStatusKo()}
              >
                <div className={styles.aizoneTripleTitle}>
                  {BAND15_AUTO_HOCHUNG}
                  <span data-tone="up">Paper</span>
                </div>
                <div className={styles.aizoneTripleCells}>
                  <div className={styles.aizoneTripleCell} data-tone="up">
                    <span className={styles.aizoneTripleLabel}>호칭</span>
                    <strong>{BAND15_AUTO_CALLSIGN}</strong>
                    <em>band15Auto</em>
                  </div>
                  <div className={styles.aizoneTripleCell} data-tone="flat">
                    <span className={styles.aizoneTripleLabel}>실행TF</span>
                    <strong>{BAND15_AUTO_TF}</strong>
                    <em>전코인</em>
                  </div>
                  <div className={styles.aizoneTripleCell} data-tone="up">
                    <span className={styles.aizoneTripleLabel}>익절ROE</span>
                    <strong>{cfg.scalpTp1RoePct ?? FAST_TP1_ROE_PCT}%</strong>
                    <em>8%기본</em>
                  </div>
                </div>
                <div className={styles.aizoneTripleFoot}>
                  LIVE금지 · 구스킬 주문OFF · 카드·차트 유지
                </div>
              </div>
            ) : (
              <div
                className={styles.aizoneTripleStrip}
                data-allow={aizoneTriple.gateAllow ? '1' : '0'}
                title={aizoneTriple.gateKo}
              >
              <div className={styles.aizoneTripleTitle}>
                AIZONE {aizoneTriple.dir === 'LONG' ? '롱' : '숏'} · {aizoneTriple.faceKo}
                <span data-tone={aizoneTriple.gateAllow ? 'up' : 'down'}>
                  {aizoneTriple.gateAllow ? '진입가능' : '대기'}
                </span>
              </div>
              <div className={styles.aizoneTripleCells}>
                <div
                  className={styles.aizoneTripleCell}
                  data-tone={aizoneTriple.scoreTone}
                >
                  <span className={styles.aizoneTripleLabel}>점수</span>
                  <strong>{aizoneTriple.scoreKo}</strong>
                  <em>≥{aizoneTriple.pctMin}</em>
                </div>
                <div
                  className={styles.aizoneTripleCell}
                  data-tone={aizoneTriple.evidenceOk ? 'up' : 'down'}
                >
                  <span className={styles.aizoneTripleLabel}>근거OK</span>
                  <strong>{aizoneTriple.evidenceOk ? 'OK' : '차단'}</strong>
                  <em>{aizoneTriple.evidenceKo}</em>
                </div>
                <div
                  className={styles.aizoneTripleCell}
                  data-tone={aizoneTriple.alignedN > 0 ? 'up' : 'flat'}
                >
                  <span className={styles.aizoneTripleLabel}>정렬축</span>
                  <strong>{aizoneTriple.alignedN}축</strong>
                  <em>{aizoneTriple.alignedDetailKo}</em>
                </div>
              </div>
              <div className={styles.aizoneTripleFoot}>
                Dual · {AUTO_TRADE_SCALP_MODE_KO[cfg.autoTradeScalpMode || 'FAST']} · Fast{' '}
                {dualLaneStats.fastCount}회 · S {dualLaneStats.sCount}회 · 품질레인 면+방 ·
                스윕회수|흡수 · 수수료 · 장바구니 가산만
                <br />
                {aizoneTriple.feeKo} · {aizoneTriple.gateKo}
              </div>
            </div>
            )}
            {!tapOnly ? (
              <>
                <MergedDeskCoinTradeProgressStrip />
                <MergedDeskBtcSignalBCard />
              </>
            ) : null}
            <div className={styles.tradeSeedPanel}>
              {liveReady ? (
                <>
                  <div className={styles.tradeSeedTitle}>거래소 시드 · Bitget</div>
                  <div className={styles.tradeWindowHint} style={{ marginBottom: 8 }}>
                    실전창 · Bitget 가용잔고가 운영시드입니다. 가상시드·가상기록은 표시하지 않습니다.
                  </div>
                  <div className={styles.tradeSeedInputRow}>
                    <input
                      type="text"
                      readOnly
                      value={
                        availUsdt != null
                          ? availUsdt.toLocaleString('en-US', { maximumFractionDigits: 2 })
                          : '조회중'
                      }
                      className={styles.tradeSeedInput}
                      aria-label="Bitget 가용 시드"
                    />
                    <span className={styles.tradeSeedUnit}>U</span>
                  </div>
                  <div className={styles.tradeSeedHint}>
                    Bitget 가용 = 전체시드 · 매매마다 {scalpPct}% · 1회{' '}
                    {liveRiskUsdt != null
                      ? `${liveRiskUsdt.toLocaleString('en-US', { maximumFractionDigits: 1 })}U`
                      : '—'}
                    {' · '}
                    BTC {btcPosDir ? (btcPosDir === 'LONG' ? '롱' : '숏') : btcEnabled ? '스캔' : '끔'}
                    {' / '}
                    ETH {ethPosDir ? (ethPosDir === 'LONG' ? '롱' : '숏') : ethEnabled ? '스캔' : '끔'}
                  </div>
                </>
              ) : (
                <>
                  <div className={styles.tradeSeedTitle}>가상매매 시드</div>
                  <div className={styles.tradeSeedInputRow}>
                    <input
                      type="number"
                      min={10}
                      max={1000000}
                      step={10}
                      value={seedStr}
                      disabled={virtOn}
                      onChange={(e) => setSeedStr(e.target.value)}
                      className={styles.tradeSeedInput}
                      placeholder="1000"
                    />
                    <span className={styles.tradeSeedUnit}>U</span>
                  </div>
                  <div className={styles.tradeSeedPresets}>
                    {[500, 1000, 3000, 5000].map((n) => (
                      <button
                        key={n}
                        type="button"
                        className={styles.tradeSeedPreset}
                        data-on={Number(seedStr) === n ? '1' : '0'}
                        disabled={virtOn}
                        onClick={() => setSeedStr(String(n))}
                      >
                        {n.toLocaleString('en-US')}
                      </button>
                    ))}
                  </div>
                  <div className={styles.tradeSeedActions}>
                    <button
                      type="button"
                      className={styles.tradeSeedSaveBtn}
                      disabled={virtOn || testBusy}
                      onClick={() => {
                        const seed = Math.max(10, Number(seedStr) || 0);
                        if (!(seed >= 10)) {
                          setMsg('시드를 입력하세요 (최소 10)');
                          return;
                        }
                        const led = setVirtualSeedUsdt(seed, true);
                        setSeedStr(String(led.seedUsdt));
                        setVirtSession((prev) => ({
                          ...prev,
                          seedUsdt: led.seedUsdt,
                          equityUsdt: led.equityUsdt,
                        }));
                        writeAutoTradeConfig({
                          sizeMode: 'equityPct',
                          scalpEquityPct: VIRTUAL_SEED_RISK_PCT,
                          equityPct: VIRTUAL_SEED_RISK_PCT,
                          doksuriEquityPct: VIRTUAL_SEED_RISK_PCT,
                        });
                        setSeedTick((v) => v + 1);
                        setMsg(
                          `시드 저장 ${led.seedUsdt.toLocaleString('en-US')}U · 1회 ${virtualRiskMarginUsdt(led.equityUsdt).toLocaleString('en-US')}U(${VIRTUAL_SEED_RISK_PCT}%)`
                        );
                      }}
                    >
                      시드저장
                    </button>
                    <button
                      type="button"
                      className={styles.tradeSeedResetBtn}
                      disabled={virtOn || testBusy}
                      onClick={() => {
                        const seed = Math.max(10, Number(seedStr) || seedSum.seedStart || 1000);
                        const led = resetVirtualSeedLedger(seed);
                        setSeedStr(String(led.seedUsdt));
                        setVirtSession((prev) => ({
                          ...prev,
                          seedUsdt: led.seedUsdt,
                          equityUsdt: led.equityUsdt,
                          position: prev.active ? prev.position : null,
                        }));
                        setSeedTick((v) => v + 1);
                        setJournalTick((v) => v + 1);
                        setMsg(`시드 초기화 ${led.seedUsdt.toLocaleString('en-US')}U`);
                        onStatusKo?.(`가상시드 초기화 ${led.seedUsdt}U`);
                      }}
                    >
                      시드초기화
                    </button>
                  </div>
                  <div className={styles.tradeSeedHint}>
                    입력=전체시드 · 매매마다 {VIRTUAL_SEED_RISK_PCT}% · 누적 {fmtPnl(seedSum.seedDelta, 2)}U · 거래{' '}
                    {seedSum.tradeCount}회
                  </div>
                </>
              )}
              <button
                type="button"
                className={
                  cfg.liveArmed || virtOn ? styles.tradeCtaStop : styles.tradeCtaStart
                }
                disabled={testBusy}
                onClick={() => {
                  /** 실전만 켜져 있고 가상 OFF → 가상 시작(병행). 둘 다 ON이면 실전만 중지. */
                  if (cfg.liveArmed && !virtOn) {
                    void toggleVirtualTrade();
                    return;
                  }
                  if (cfg.liveArmed) {
                    stopLiveTradeArm();
                    return;
                  }
                  void toggleVirtualTrade();
                }}
              >
                {testBusy
                  ? '처리 중…'
                  : cfg.liveArmed && !virtOn
                    ? '가상 추가(병행)'
                    : cfg.liveArmed
                      ? livePos
                        ? '실전만 중지 (가상·포지션 유지)'
                        : '실전만 중지 (가상 유지)'
                      : virtOn
                        ? virtPos
                          ? '가상매매 중지 (포지션)'
                          : '가상매매 중지'
                        : '가상매매 시작'}
              </button>
              <div className={styles.tradeSecondaryRow}>
                <button
                  type="button"
                  className={styles.tradeSecondaryBtn}
                  disabled={testBusy}
                  title="가상·병행 기록 JSON 복사 · 채팅에 붙여 검증용"
                  onClick={() => {
                    void (async () => {
                      const r = await copyVirtualAuditPackToClipboard(symbol);
                      if (r.ok) {
                        setMsg(`가상기록 복사됨 · ${r.summaryKo}`);
                        onStatusKo?.(`가상기록복사 · ${r.summaryKo}`);
                      } else {
                        setMsg(`가상기록 복사실패 · ${r.error || ''}`);
                      }
                    })();
                  }}
                >
                  가상기록복사
                </button>
                <button
                  type="button"
                  className={styles.tradeSecondaryBtn}
                  disabled={testBusy || Boolean(tgTestBusy)}
                  title="텔레그램 단톡 연동 테스트 (주문 없음)"
                  onClick={() => void runTelegramCoinTest('ALL')}
                >
                  {tgTestBusy ? 'TG…' : 'TG테스트'}
                </button>
                <button
                  type="button"
                  className={styles.tradeSecondaryBtn}
                  disabled={testBusy}
                  title="거래소·스캔·게이트 연동 점검 (주문 없음)"
                  onClick={() => void runTradeLinkHealth()}
                >
                  연동점검
                </button>
                <button
                  type="button"
                  className={styles.tradeSecondaryBtn}
                  disabled={testBusy}
                  onClick={() => void runOrderDiag()}
                >
                  주문 진단
                </button>
                <button
                  type="button"
                  className={styles.tradeSecondaryBtn}
                  disabled={testBusy}
                  onClick={() => void runEntryGatePing()}
                >
                  진입PING
                </button>
                <button
                  type="button"
                  className={styles.tradeSecondaryBtn}
                  disabled={testBusy}
                  onClick={() => void runPaperTradeTest()}
                >
                  경로점검
                </button>
                <button
                  type="button"
                  className={styles.tradeSecondaryBtn}
                  onClick={() => {
                    downloadReinforcementPack();
                    setMsg('보강용 파일 저장됨');
                  }}
                >
                  보강파일
                </button>
              </div>
              {(msg || testDetail.length > 0 || healthReport) && (
                <div
                  className={styles.tradeWindowCard}
                  style={{
                    marginTop: 8,
                    fontSize: 11,
                    lineHeight: 1.4,
                    maxHeight: 200,
                    overflow: 'auto',
                  }}
                  title="점검 결과 · 확정 수익 아님"
                >
                  <div
                    style={{
                      fontWeight: 800,
                      marginBottom: 6,
                      color:
                        healthReport?.tone === 'down'
                          ? '#f87171'
                          : healthReport?.tone === 'up'
                            ? '#34d399'
                            : '#fbbf24',
                    }}
                  >
                    {msg || healthReport?.titleKo || '점검'}
                  </div>
                  {healthReport ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      {healthReport.rows
                        .filter((r) => !r.ok || r.blockEntry)
                        .map((r) => (
                          <div
                            key={r.id}
                            style={{
                              color: r.blockEntry || !r.ok ? '#f87171' : '#fbbf24',
                            }}
                          >
                            {r.blockEntry ? '차단' : '주의'} · {r.titleKo}
                            <span style={{ opacity: 0.85 }}> · {r.detailKo}</span>
                          </div>
                        ))}
                      {!healthReport.rows.some((r) => !r.ok) ? (
                        <div style={{ color: '#34d399' }}>전부 정상 · 진입경로 열림</div>
                      ) : (
                        <div style={{ color: '#34d399', marginTop: 4 }}>
                          정상{' '}
                          {healthReport.rows.filter((r) => r.ok).length}/
                          {healthReport.rows.length} · 문제만 위에 표시
                        </div>
                      )}
                    </div>
                  ) : testDetail.length ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {testDetail.map((line, i) => {
                        const bad = /^(차단|주의|FAIL|막힘|오류)/.test(line) || line.includes('FAIL');
                        const good = /^(OK|PASS)/.test(line);
                        return (
                          <div
                            key={`td-${i}`}
                            style={{
                              color: bad ? '#f87171' : good ? '#34d399' : '#e2e8f0',
                            }}
                          >
                            {line}
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              )}
              {cfg.liveArmed ? (
                <div className={styles.tradeLastStrip} data-tone="flat">
                  <span>
                    실전 연동 중 · Bitget{' '}
                    {livePos
                      ? `${livePos.direction === 'LONG' ? '롱' : '숏'} 포지션`
                      : '신호 대기'}{' '}
                    · 시드 {availUsdt != null ? `${availUsdt.toFixed(2)}U` : '—'}
                  </span>
                  <i className={styles.tradeLastDot} aria-hidden />
                </div>
              ) : seedTrades[0] ? (
                <div className={styles.tradeLastStrip} data-tone={pnlTone(seedTrades[0].pnlUsdt)}>
                  <span>
                    최근청산 · {fmtPnl(seedTrades[0].pnlUsdt, 2)}U{' '}
                    {seedTrades[0].direction === 'LONG' ? '롱' : '숏'} ·{' '}
                    {tfEntryKo(seedTrades[0].timeframe)} · {seedTrades[0].signalKo}
                  </span>
                  <i className={styles.tradeLastDot} aria-hidden />
                </div>
              ) : (
                <div className={styles.tradeLastStrip} data-tone="flat">
                  <span>최근 체결 없음 · 시드저장 후 가상매매 시작</span>
                </div>
              )}
            </div>
            <div className={styles.tradeDeskLeft}>
              <div className={styles.tradeWindowHint} style={{ marginBottom: 6 }}>
                {tapOnly
                  ? `${BAND15_AUTO_HOCHUNG}가 롱/숏 결정 · 익절/손절/비중은 TP·SL·비중 탭`
                  : '신호(MTF·초단·독수리)가 롱/숏 결정 · 아래는 플랜 선호방향만 · 익절/손절/비중은 위 칩에서 설정'}
              </div>
              <div className={styles.tradeSideRow}>
                <button
                  type="button"
                  className={`${styles.tradeSideBtn} ${styles.tradeSideLong}${
                    side === 'LONG' ? ` ${styles.tradeSideBtnOn}` : ''
                  }`}
                  title="플랜 터치 시 선호 롱"
                  onClick={() => setSide('LONG')}
                >
                  선호 롱
                </button>
                <button
                  type="button"
                  className={`${styles.tradeSideBtn} ${styles.tradeSideShort}${
                    side === 'SHORT' ? ` ${styles.tradeSideBtnOn}` : ''
                  }`}
                  title="플랜 터치 시 선호 숏"
                  onClick={() => setSide('SHORT')}
                >
                  선호 숏
                </button>
              </div>

              {tapOnly ? null : (
              <>
              <div className={styles.tradeWindowSectionTitle}>
                초단타 모드 · 1·3·5·15분 롱/숏
              </div>
              <div className={styles.tradeWindowRow}>
                {(
                  [
                    ['PAPER', '가상'],
                    ['SIGNAL_ONLY', '신호만'],
                    ['SHADOW', '그림자'],
                    ['LIVE', '실거래'],
                  ] as [UltraTradingMode, string][]
                ).map(([m, label]) => {
                  const effective = resolveUltraTradingMode({
                    enabled: true,
                    liveArmed: cfg.liveArmed,
                    tradingMode: cfg.tradingMode ?? 'PAPER',
                  });
                  const on =
                    (cfg.tradingMode ?? 'PAPER') === m ||
                    (m === 'PAPER' &&
                      effective === 'PAPER' &&
                      cfg.tradingMode === 'LIVE' &&
                      !cfg.liveArmed);
                  return (
                    <button
                      key={m}
                      type="button"
                      className={`tool-chip tool-chip-button ${on ? 'tool-chip-active' : ''}`}
                      title={
                        m === 'LIVE'
                          ? '실주문 준비 필요 · 기본 잠금'
                          : m === 'SHADOW'
                            ? '실데이터 신호·가상체결만'
                            : undefined
                      }
                      onClick={() => {
                        if (m === 'LIVE' && !cfg.liveArmed) {
                          patch({
                            tradingMode: 'PAPER',
                            enabled: true,
                            strategySpeed: 'ULTRA_SCALP',
                            ultraScalpOnlyLtf: false,
                          });
                          return;
                        }
                        patch({
                          tradingMode: m,
                          enabled: true,
                          strategySpeed: 'ULTRA_SCALP',
                          ultraScalpOnlyLtf: false,
                        });
                      }}
                    >
                      {label}
                      {m === 'LIVE' && !cfg.liveArmed ? '잠금' : ''}
                    </button>
                  );
                })}
              </div>
              <div className={styles.tradeWindowRow}>
                {(
                  [
                    ['ULTRA_SCALP', '초단타'],
                    ['SCALP', '단타'],
                    ['NORMAL', '일반'],
                  ] as [UltraStrategySpeed, string][]
                ).map(([s, label]) => (
                  <button
                    key={s}
                    type="button"
                    className={`tool-chip tool-chip-button ${
                      (cfg.strategySpeed || 'ULTRA_SCALP') === s ? 'tool-chip-active' : ''
                    }`}
                    onClick={() =>
                      patch({
                        strategySpeed: s,
                        /** 신호는 기존 TF 그대로 · LTF 강제 차단 안 함 */
                        ultraScalpOnlyLtf: false,
                      })
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className={styles.tradeWindowRow}>
                {(
                  [
                    ['FAST', AUTO_TRADE_SCALP_MODE_KO.FAST],
                    ['S', AUTO_TRADE_SCALP_MODE_KO.S],
                    ['DUAL', AUTO_TRADE_SCALP_MODE_KO.DUAL],
                  ] as [AutoTradeScalpMode, string][]
                ).map(([m, label]) => (
                  <button
                    key={m}
                    type="button"
                    className={`tool-chip tool-chip-button ${
                      (cfg.autoTradeScalpMode || 'FAST') === m ? 'tool-chip-active' : ''
                    }`}
                    title={
                      m === 'FAST'
                        ? '띠자리+SFP+ROE8 초단 · 고빈도'
                        : m === 'S'
                          ? 'AIZONE Tier S · 품질'
                          : 'Fast+S 병행'
                    }
                    onClick={() => patch({ autoTradeScalpMode: m })}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className={styles.tradeWindowHint}>
                Dual · Fast {dualLaneStats.fastCount}회{' '}
                {dualLaneStats.fastPnl >= 0 ? '+' : ''}
                {dualLaneStats.fastPnl.toFixed(2)}U · S {dualLaneStats.sCount}회{' '}
                {dualLaneStats.sPnl >= 0 ? '+' : ''}
                {dualLaneStats.sPnl.toFixed(2)}U · 오늘 F{dualLaneStats.todayFast}/S
                {dualLaneStats.todayS} · 수수료후장부 · 확정아님
              </div>
              </>
              )}
              <div className={styles.tradeWindowHint}>
                {tapOnly ? (
                  <>
                    레버 {cfg.leverage}배 · 익절 {cfg.scalpTp1RoePct ?? FAST_TP1_ROE_PCT}% · 손절{' '}
                    {resolveTapointSlRoePct(BAND15_AUTO_TF)}%ROE · 15m
                  </>
                ) : (
                  <>
                    레버 {cfg.leverage}배 · 익절 {cfg.scalpTp1RoePct ?? FAST_TP1_ROE_PCT}%전량컷 · 손절{' '}
                    {cfg.scalpSlRoePct ?? 20}% · 단타 {scalpPct}% · 모드 {modeKo(cfg.tradingMode)}
                    · 레인 {AUTO_TRADE_SCALP_MODE_KO[cfg.autoTradeScalpMode || 'FAST']}
                  </>
                )}
              </div>
              <div className={styles.tradeWindowRow}>
                <button
                  type="button"
                  className="tool-chip tool-chip-button"
                  onClick={() => setTab('tp')}
                >
                  익절 설정
                </button>
                <button
                  type="button"
                  className="tool-chip tool-chip-button"
                  onClick={() => setTab('sl')}
                >
                  손절 설정
                </button>
                <button
                  type="button"
                  className="tool-chip tool-chip-button"
                  onClick={() => setTab('size')}
                >
                  비중·레버
                </button>
              </div>
            </div>

            <div className={styles.tradeDeskRight}>
              <div className={styles.tradeModeToggle} style={{ marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
                <span className={styles.tradeWindowHint} style={{ width: '100%' }}>
                  자동매매 심볼 · 동시 포지션 한도 {AUTO_TRADE_MAX_CONCURRENT}
                </span>
                {AUTO_TRADE_SYMBOL_OPTIONS.map((opt) => {
                  const on = (cfg.enabledSymbols || DEFAULT_ENABLED_AUTO_TRADE_SYMBOLS).includes(
                    opt.id
                  );
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      className={on ? styles.tradeModeOnLive : undefined}
                      title={
                        on
                          ? `${opt.chipKo} 자동매매 ON · 다시 클릭하면 끔`
                          : `${opt.chipKo} 자동매매 OFF`
                      }
                      onClick={() => {
                        const next = toggleAutoTradeSymbol(cfg, opt.id as AutoTradeSymbolId);
                        setCfg(next);
                        onConfigChange?.(next);
                        setMsg(
                          `심볼 ${next.enabledSymbols.map((s) => autoTradeSymbolChipKo(s)).join('+') || '없음'} · 동시 ${next.maxConcurrent ?? AUTO_TRADE_MAX_CONCURRENT}포 · OFF코인 진입안함`
                        );
                        if (next.liveArmed) void syncServerArm(next);
                      }}
                    >
                      {opt.chipKo}
                      {on ? ' ·ON' : ''}
                    </button>
                  );
                })}
              </div>
              <div className={styles.tradeWindowHint} style={{ marginBottom: 8 }}>
                {tapOnly
                  ? `${BAND15_AUTO_HOCHUNG} · ${BAND15_AUTO_TF} · 칩 ON만 · Paper`
                  : `BTC: 초단·독수리 · ETH: 폭락존터치 · BNB=캔들+PPL · XRP=독수리1호4패턴 · SOL=꼬리·BPR · 15m꼬리·폭락감시윗꼬리·HTF폭락존은 전코인 · BPR재터치 OFF · 앱 외 코인 무시 · 심볼당1 · 동시${AUTO_TRADE_MAX_CONCURRENT}`}
              </div>
              <div className={styles.tradeWindowHint} style={{ marginTop: 0, marginBottom: 8 }}>
                {cfg.liveArmed && virtSession.active
                  ? '병행 ON · 확정신호 → 실전주문 + 가상시드 동시'
                  : cfg.liveArmed
                    ? '실전만 · 가상은 「가상매매 시작」으로 추가'
                    : virtSession.active
                      ? '가상만 · 실전은 「실전매매」로 추가'
                      : '가상시작 + 실전매매 둘 다 켜면 병행'}
              </div>
              <div className={styles.tradeModeToggle}>
                <button
                  type="button"
                  className={!cfg.liveArmed ? styles.tradeModeOn : undefined}
                  onClick={() =>
                    patch({ liveArmed: false, tradingMode: 'PAPER' })
                  }
                  title="실전 ARM만 OFF · 가상세션은 유지(병행 해제 시 실전만 끔)"
                >
                  실전OFF
                </button>
                <button
                  type="button"
                  className={cfg.liveArmed ? styles.tradeModeOnLive : undefined}
                  disabled={!keysOk}
                  title={
                    keysOk
                      ? virtSession.active
                        ? '실전 ON · 가상과 병행(같은 신호→둘 다)'
                        : '분석 동일 · Bitget 실주문'
                      : 'API 인증 후 가능'
                  }
                  onClick={() => {
                    if (!keysOk) return;
                    /** 가상 세션 유지 · 실전·가상 병행 가능 */
                    patch({
                      enabled: true,
                      liveArmed: true,
                      tradingMode: 'LIVE',
                      enabledSymbols: [...DEFAULT_ENABLED_AUTO_TRADE_SYMBOLS],
                      maxConcurrent: AUTO_TRADE_MAX_CONCURRENT,
                    });
                    void refreshPosition();
                    const virtHint = virtSession.active ? ' · 가상병행ON' : '';
                    setMsg(
                      tapOnly
                        ? `${BAND15_AUTO_HOCHUNG} Paper · LIVE금지 · ${BAND15_AUTO_TF} · ROE ${cfg.scalpTp1RoePct ?? FAST_TP1_ROE_PCT}%${virtHint}`
                        : `실전매매 ON · 칩ON코인만 진입 · 폰·PC 꺼도 서버 · ROE+${cfg.scalpTp1RoePct ?? FAST_TP1_ROE_PCT}%익절 · 동시최대${AUTO_TRADE_MAX_CONCURRENT}${virtHint}`
                    );
                    onStatusKo?.(
                      tapOnly
                        ? `${BAND15_AUTO_HOCHUNG} ARM · Paper만`
                        : `실전매매 ON · 서버무접속 자동매매 · ROE8%익절${virtHint}`
                    );
                  }}
                >
                  실전매매
                </button>
              </div>

              <div className={styles.tradeWindowHint} style={{ marginTop: 6 }}>
                {tapOnly
                  ? `${BAND15_AUTO_HOCHUNG}만 · Paper · 구스킬 주문 OFF`
                  : '분석은 동일(폭락·핫존·로켓·4전략·독수리·MTF·플랜) · 버튼만 가상/실전 체결 분기'}
              </div>

              <div className={styles.tradeAvailBox}>
                <div className={styles.tradeWindowHint}>사용 가능</div>
                <div className={styles.tradeAvailVal}>
                  {availUsdt != null
                    ? `${availUsdt.toLocaleString('en-US', { maximumFractionDigits: 2 })} USDT`
                    : keysOk
                      ? '재테스트로 조회'
                      : '— USDT'}
                </div>
              </div>

              <label className={styles.tradeWindowCheck}>
                <input
                  type="checkbox"
                  checked={cfg.enabled}
                  onChange={(e) => patch({ enabled: e.target.checked })}
                />
                {tapOnly ? `엔진 ON (${BAND15_AUTO_HOCHUNG})` : '자동매매 엔진 ON (통합모드 연동)'}
              </label>
              {tapOnly ? (
                <div className={styles.tradeWindowHint}>
                  {BAND15_AUTO_HOCHUNG}만 주문 · LIVE금지 · 구스킬 주문 OFF
                </div>
              ) : (
                <>
                  <label className={styles.tradeWindowCheck}>
                    <input
                      type="checkbox"
                      checked={cfg.strategyScalp}
                      onChange={(e) => patch({ strategyScalp: e.target.checked })}
                    />
                    단타·초단 FIRE → 주문
                  </label>
                  <label className={styles.tradeWindowCheck}>
                    <input
                      type="checkbox"
                      checked={cfg.strategyDoksuri1}
                      onChange={(e) => patch({ strategyDoksuri1: e.target.checked })}
                    />
                    독수리 CONFIRMED → 주문
                  </label>
                </>
              )}

              <div className={styles.tradeWindowHint}>
                {cfg.liveArmed
                  ? tapOnly
                    ? '실전 · 타점 CONFIRMED → Bitget'
                    : '실전모드 · 동일 분석 신호 → Bitget 실주문'
                  : tapOnly
                    ? '가상 · 타점 CONFIRMED → 시드 가상체결'
                    : '가상모드 · 동일 분석 신호 → 시드 가상체결'}
                {' · '}
                {tapOnly
                  ? `익절ROE ${cfg.scalpTp1RoePct ?? FAST_TP1_ROE_PCT}% · ${cfg.leverage}x · ${resolveTapointEntryTf(symbol)}`
                  : `단타 ${scalpPct}% · 독수리 ${dokPct}% · ${cfg.leverage}x · ${
                      cfg.sizeMode === 'equityPct' ? '비중%' : `${cfg.marginUsdt}U`
                    } · ${timeframe}`}
              </div>
            </div>

            <div className={styles.tradeDeskFoot}>
              확정 수익 아님 · 가상/실전 동일 실시간 분석 · 체결만 버튼 분기
            </div>
          </div>
        ) : null}

        {tab === 'tp' ? (
          <div className={styles.tradeWindowStack}>
            <div className={styles.tradeWindowSectionTitle}>초단 목표 수익 (증거금 대비 ROE%)</div>
            <div className={styles.tradeWindowHint}>
              사용자가 설정 · TP1 ROE {cfg.scalpTp1RoePct ?? FAST_TP1_ROE_PCT}% 전량컷 → 재스캔
              {' · '}익절 {cfg.scalpTp1RoePct ?? FAST_TP1_ROE_PCT}% ÷ 레버 {cfg.leverage}배 ≈ 가격{' '}
              {(
                ((cfg.scalpTp1RoePct ?? FAST_TP1_ROE_PCT) / Math.max(1, cfg.leverage)) *
                100
              ).toFixed(2)}
              %
            </div>
            <div className={styles.tradeWindowRow} style={{ flexWrap: 'wrap', gap: 8 }}>
              {[5, 8, 10, 12, 15].map((n) => (
                <button
                  key={n}
                  type="button"
                  className={
                    Math.abs((cfg.scalpTp1RoePct ?? FAST_TP1_ROE_PCT) - n) < 0.01
                      ? 'tool-chip tool-chip-active'
                      : 'tool-chip'
                  }
                  onClick={() => {
                    const next = writeAutoTradeConfig({
                      scalpTp1RoePct: n,
                      scalpExitMode: 'TP1_CUT',
                    });
                    setCfg(next);
                    onConfigChange?.(next);
                    setMsg(`익절 ROE ${n}% · 전량컷`);
                    if (next.liveArmed) void syncServerArm(next);
                  }}
                >
                  익절 {n}%
                </button>
              ))}
            </div>
            <label className={styles.tradePriceField}>
              <span>익절 ROE% (직접입력 · 기본 8)</span>
              <div className={styles.tradePriceInputWrap}>
                <input
                  type="number"
                  min={1}
                  max={50}
                  step={0.5}
                  value={cfg.scalpTp1RoePct ?? FAST_TP1_ROE_PCT}
                  onChange={(e) => {
                    const n = Math.max(1, Math.min(50, Number(e.target.value) || FAST_TP1_ROE_PCT));
                    const next = writeAutoTradeConfig({
                      scalpTp1RoePct: n,
                      scalpExitMode: 'TP1_CUT',
                    });
                    setCfg(next);
                    onConfigChange?.(next);
                  }}
                  onBlur={() => {
                    if (cfg.liveArmed) void syncServerArm(cfg);
                  }}
                  style={inputStyle}
                />
                <span>%</span>
              </div>
            </label>

            <div className={styles.tradeWindowSectionTitle}>익절 방식</div>
            <div className={styles.tradeWindowHint}>
              TP1 도달 시 시장가 전량 익절 · 잔량/러너 없음 · 쿨다운 후 재진입 구간 스캔
            </div>

            <div className={styles.tradeWindowSectionTitle}>순수익 미리보기 (수수료·펀비 후)</div>
            <div className={styles.tradeWindowHint}>
              {cfg.leverage}x · 테이커 0.06%×2 · 펀딩 가정 0.5h
              <br />
              목표 <b>{cfg.scalpTp1RoePct ?? FAST_TP1_ROE_PCT}%</b> → 약{' '}
              <b>{netRoe5.netRoePct.toFixed(2)}%</b>
              <br />
              (가격약 {ultraRoeCaps.priceMoveTp1Pct.toFixed(3)}% · 확정 아님)
            </div>

            <label className={styles.tradePriceField}>
              <span>익절가1 (선택·플랜E)</span>
              <div className={styles.tradePriceInputWrap}>
                <input
                  type="text"
                  inputMode="decimal"
                  value={tp1Str}
                  onChange={(e) => setTp1Str(e.target.value)}
                  placeholder={fmtPx(planTp1)}
                  style={inputStyle}
                />
                <span>USDT</span>
              </div>
            </label>
            <div className={styles.tradeWindowHint}>
              실주문 TP는 위 ROE%로 Bitget 프리셋 · ULTRA 초단은 레버×ROE 자동
            </div>

            <div className={styles.tradeWindowSectionTitle}>재진입 대기 (사용자 설정)</div>
            <div className={styles.tradeWindowHint}>
              청산직후 전방향 · 익절 후 추격금지 · 같은방향 ARM 창 — 초/분 직접 입력·▲▼
            </div>
            <div className={styles.tradeWindowSectionTitle} style={{ fontSize: 11 }}>
              청산 후 전방향 대기 (초)
            </div>
            <div className={styles.tradeWindowRow}>
              {[0, 20, 30, 60].map((sec) => (
                <button
                  key={`flat-cd-${sec}`}
                  type="button"
                  className={`tool-chip tool-chip-button ${
                    (cfg.postFlatCooldownSec ?? 20) === sec ? 'tool-chip-active' : ''
                  }`}
                  onClick={() => patch({ postFlatCooldownSec: sec })}
                >
                  {sec === 0 ? '즉시' : sec < 60 ? `${sec}초` : `${sec / 60}분`}
                </button>
              ))}
              <NumStepperBox
                value={cfg.postFlatCooldownSec ?? 20}
                min={0}
                max={600}
                step={5}
                suffix="초"
                title="청산 후 전방향 대기(초)"
                onCommit={(n) => patch({ postFlatCooldownSec: Math.round(n) })}
              />
            </div>
            <div className={styles.tradeWindowSectionTitle} style={{ fontSize: 11 }}>
              익절 후 추격금지 (초)
            </div>
            <div className={styles.tradeWindowRow}>
              {[0, 20, 45, 60].map((sec) => (
                <button
                  key={`re-cd-${sec}`}
                  type="button"
                  className={`tool-chip tool-chip-button ${
                    (cfg.reentryCooldownSec ?? 45) === sec ? 'tool-chip-active' : ''
                  }`}
                  onClick={() => patch({ reentryCooldownSec: sec })}
                >
                  {sec === 0 ? '즉시' : sec < 60 ? `${sec}초` : `${sec / 60}분`}
                </button>
              ))}
              <NumStepperBox
                value={cfg.reentryCooldownSec ?? 45}
                min={0}
                max={600}
                step={5}
                suffix="초"
                title="익절 후 추격금지(초)"
                onCommit={(n) => patch({ reentryCooldownSec: Math.round(n) })}
              />
            </div>
            <div className={styles.tradeWindowSectionTitle} style={{ fontSize: 11 }}>
              같은방향 재진입 창 (분)
            </div>
            <div className={styles.tradeWindowRow}>
              {[5, 7, 10, 15].map((min) => (
                <button
                  key={`re-exp-${min}`}
                  type="button"
                  className={`tool-chip tool-chip-button ${
                    (cfg.reentryExpireMin ?? 10) === min ? 'tool-chip-active' : ''
                  }`}
                  onClick={() => patch({ reentryExpireMin: min })}
                >
                  {min}분
                </button>
              ))}
              <NumStepperBox
                value={cfg.reentryExpireMin ?? 10}
                min={1}
                max={60}
                step={1}
                suffix="분"
                title="같은방향 재진입 ARM(분)"
                onCommit={(n) => patch({ reentryExpireMin: Math.round(n) })}
              />
            </div>
            <div className={styles.tradeWindowHint}>
              현재: 청산후 {cfg.postFlatCooldownSec ?? 20}초 · 익절추격금지{' '}
              {cfg.reentryCooldownSec ?? 45}초 · 같은방향 {cfg.reentryExpireMin ?? 10}분 → 만료 후
              전방향
            </div>
          </div>
        ) : null}

        {tab === 'sl' ? (
          <div className={styles.tradeWindowStack}>
            <div className={styles.tradeWindowSectionTitle}>
              {tapOnly
                ? '타점엔진 손절 ROE% (TF고정 · 20배 기준)'
                : '손절 ROE% (전코인 · 기본 30% · 익절 탭과 별도)'}
            </div>
            {tapOnly ? (
              <>
                <div className={styles.tradeWindowHint}>{tapointSlRoeLabelKo()}</div>
                <div className={styles.tradeWindowHint}>
                  현재 TF {timeframe} → 손절 {resolveTapointSlRoePct(timeframe)}%ROE · 레버{' '}
                  {cfg.leverage}배≈가격{' '}
                  {(
                    (resolveTapointSlRoePct(timeframe) / Math.max(1, cfg.leverage)) *
                    100
                  ).toFixed(2)}
                  % · 칩 손절%는 타점엔진에 미적용(TF표 우선)
                </div>
              </>
            ) : (
              <>
            <div className={styles.tradeWindowRow}>
              {[20, 25, 30, 40, 50].map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`tool-chip tool-chip-button${
                    Number(cfg.scalpSlRoePct) === n ? ' tool-chip-active' : ''
                  }`}
                  onClick={() => patch({ scalpSlRoePct: n })}
                >
                  손절 {n}%
                </button>
              ))}
              <NumStepperBox
                value={Number(cfg.scalpSlRoePct) || 30}
                min={5}
                max={80}
                step={1}
                suffix="%"
                title="손절 ROE%"
                onCommit={(v) => patch({ scalpSlRoePct: Math.max(5, Math.min(80, v)) })}
              />
            </div>
            <div className={styles.tradeWindowHint}>
              전코인 손절 ROE -{Number(cfg.scalpSlRoePct) || 30}% · 레버 {cfg.leverage}배≈가격{' '}
              {(
                ((Number(cfg.scalpSlRoePct) || 30) / Math.max(1, cfg.leverage)) *
                100
              ).toFixed(2)}
              % · 구조타점보다 타이트한 SL은 이 폭으로 강제 확장
            </div>
              </>
            )}
            <label className={styles.tradePriceField}>
              <span>손절가 (선택·플랜E)</span>
              <div className={styles.tradePriceInputWrap}>
                <input
                  type="text"
                  inputMode="decimal"
                  value={slStr}
                  onChange={(e) => setSlStr(e.target.value)}
                  placeholder={fmtPx(planSl)}
                  style={inputStyle}
                />
                <span>USDT</span>
              </div>
            </label>
          </div>
        ) : null}

        {tab === 'size' ? (
          <div className={styles.tradeWindowStack}>
            <div className={styles.tradeWindowSectionTitle}>
              단타 비중 (% of Equity) · 초단 FIRE 적용
            </div>
            <div className={styles.tradeWindowRow}>
              {EQUITY_CHIPS.map((pct) => (
                <button
                  key={`scalp-${pct}`}
                  type="button"
                  className={`tool-chip tool-chip-button ${
                    cfg.sizeMode === 'equityPct' && scalpPct === pct ? 'tool-chip-active' : ''
                  }`}
                  onClick={() =>
                    patch({ sizeMode: 'equityPct', scalpEquityPct: pct, equityPct: pct })
                  }
                >
                  {pct}%
                </button>
              ))}
              <NumStepperBox
                value={scalpPct}
                min={0.5}
                max={100}
                step={0.5}
                suffix="%"
                title="단타 비중 직접 입력"
                onCommit={(n) =>
                  patch({ sizeMode: 'equityPct', scalpEquityPct: n, equityPct: n })
                }
              />
            </div>
            {estScalpMargin != null ? (
              <div className={styles.tradeWindowHint}>
                예상 단타 증거금 ≈ {estScalpMargin.toLocaleString('en-US')} USDT
                {availUsdt != null
                  ? ` (${scalpPct}% of ${availUsdt.toLocaleString('en-US', {
                      maximumFractionDigits: 0,
                    })})`
                  : ''}
              </div>
            ) : null}

            <div className={styles.tradeWindowSectionTitle}>독수리 비중 (% of Equity)</div>
            <div className={styles.tradeWindowRow}>
              {EQUITY_CHIPS.map((pct) => (
                <button
                  key={`dok-${pct}`}
                  type="button"
                  className={`tool-chip tool-chip-button ${
                    cfg.sizeMode === 'equityPct' && dokPct === pct ? 'tool-chip-active' : ''
                  }`}
                  onClick={() => patch({ sizeMode: 'equityPct', doksuriEquityPct: pct })}
                >
                  {pct}%
                </button>
              ))}
              <NumStepperBox
                value={dokPct}
                min={0.5}
                max={100}
                step={0.5}
                suffix="%"
                title="독수리 비중 직접 입력"
                onCommit={(n) => patch({ sizeMode: 'equityPct', doksuriEquityPct: n })}
              />
            </div>

            <div className={styles.tradeWindowSectionTitle}>레버리지</div>
            <div className={styles.tradeWindowRow}>
              {LEV_CHIPS.map((lev) => (
                <button
                  key={lev}
                  type="button"
                  className={`tool-chip tool-chip-button ${cfg.leverage === lev ? 'tool-chip-active' : ''}`}
                  onClick={() => patch({ leverage: lev })}
                >
                  {lev}x
                </button>
              ))}
              <NumStepperBox
                value={cfg.leverage}
                min={1}
                max={125}
                step={1}
                suffix="x"
                title="레버리지 직접 입력"
                onCommit={(n) => patch({ leverage: Math.round(n) })}
              />
            </div>

            <label className={styles.tradePriceField}>
              <span>진입가 (선택·플랜E)</span>
              <div className={styles.tradePriceInputWrap}>
                <input
                  type="text"
                  inputMode="decimal"
                  value={entryStr}
                  onChange={(e) => setEntryStr(e.target.value)}
                  placeholder={fmtPx(planEntry)}
                  style={inputStyle}
                />
                <span>USDT</span>
              </div>
            </label>
            <div className={styles.tradeWindowHint}>
              단타 {scalpPct}% · 독수리 {dokPct}% · {cfg.leverage}x ·{' '}
              {cfg.sizeMode === 'equityPct' ? '비중%' : `${cfg.marginUsdt}U`}
            </div>
          </div>
        ) : null}

        {tab === 'pos' ? (
          <div className={styles.tradePosCard}>
            {virtPos ? (
              <>
                <div className={styles.tradePosHead}>
                  <div>
                    <div className={styles.tradePosSym}>
                      {virtPos.symbol} · 가상
                    </div>
                    <div className={styles.tradePosTags}>
                      <span data-dir={virtPos.direction}>
                        {virtPos.direction === 'LONG' ? '롱' : '숏'}
                      </span>
                      <span>{virtPos.leverage}배</span>
                      <span>가상</span>
                      <span>테더</span>
                    </div>
                  </div>
                </div>
                <div className={styles.tradePosPnlRow}>
                  <div>
                    <div className={styles.tradePosLabel}>미실현 손익 (테더)</div>
                    <div
                      className={styles.tradePosPnlBig}
                      data-tone={pnlTone(virtPnl?.pnl)}
                    >
                      {fmtPnl(virtPnl?.pnl ?? 0)}
                    </div>
                  </div>
                  <div className={styles.tradePosRoe}>
                    <div className={styles.tradePosLabel}>수익률(증거금)</div>
                    <div
                      className={styles.tradePosPnlBig}
                      data-tone={pnlTone(virtPnl?.roePct)}
                    >
                      {fmtPct(virtPnl?.roePct)}
                    </div>
                  </div>
                </div>
                {(() => {
                  const st = exitStageKo({
                    tp1Done: virtPos.tp1Done,
                    runnerTp: virtPos.runnerTp,
                    tp: virtPos.tp,
                    sl: virtPos.sl,
                  });
                  return (
                    <div
                      className={styles.tradeExitStageCard}
                      data-stage={virtPos.tp1Done ? 'half' : 'full-open'}
                    >
                      <div className={styles.tradeExitStageTitle}>{st.title}</div>
                      <div>{st.body}</div>
                      <div className={styles.tradeExitStageNext}>{st.next}</div>
                      {virtPos.tp1Done && virtPos.runnerTp != null && virtPos.runnerTp > 0 ? (
                        <div style={{ marginTop: 4 }}>
                          잔량 목표(러너) <b>{fmtPx(virtPos.runnerTp)}</b>
                          {' · '}본절 <b>{fmtPx(virtPos.sl)}</b>
                        </div>
                      ) : null}
                    </div>
                  );
                })()}
                <div className={styles.tradePosGrid}>
                  <div>
                    <span>수량</span>
                    <b>{virtPos.sizeStr}</b>
                  </div>
                  <div>
                    <span>증거금</span>
                    <b>{virtPos.marginUsdt.toFixed(2)}</b>
                  </div>
                  <div>
                    <span>마크가</span>
                    <b>{fmtPx(markPx)}</b>
                  </div>
                  <div>
                    <span>진입가</span>
                    <b>{fmtPx(virtPos.entry)}</b>
                  </div>
                  <div>
                    <span>{virtPos.tp1Done ? '러너 / 본절' : '익절1 / 손절'}</span>
                    <b className={styles.tradePosTpsl}>
                      {virtPos.tp1Done
                        ? `${virtPos.runnerTp != null ? fmtPx(virtPos.runnerTp) : '—'} / ${
                            virtPos.sl != null ? fmtPx(virtPos.sl) : '—'
                          }`
                        : `${virtPos.tp != null ? fmtPx(virtPos.tp) : '—'} / ${
                            virtPos.sl != null ? fmtPx(virtPos.sl) : '—'
                          }`}
                    </b>
                  </div>
                  <div>
                    <span>청산단계</span>
                    <b>{virtPos.tp1Done ? '잔량·본절대기' : '전량보유'}</b>
                  </div>
                  <div>
                    <span>비중</span>
                    <b>{virtPos.equityPct}%</b>
                  </div>
                  <div>
                    <span>진입시각</span>
                    <b>{fmtTime(virtPos.openedAt)}</b>
                  </div>
                  <div>
                    <span>보유</span>
                    <b>{fmtHoldMs(virtHoldMs)}</b>
                  </div>
                  <div>
                    <span>분봉</span>
                    <b>{tfEntryKo(timeframe)}</b>
                  </div>
                </div>
                <div className={styles.tradePosActions}>
                  <button type="button" disabled>
                    가상
                  </button>
                  <button
                    type="button"
                    className={styles.tradePosCloseBtn}
                    onClick={() => {
                      const s = stopVirtualTradeSession(
                        '가상 포지션 청산',
                        markPx > 0 ? markPx : undefined
                      );
                      setVirtSession(s);
                      setMsg('가상 포지션 청산');
                      onStatusKo?.('가상 포지션 청산');
                      onVirtualSessionStop?.();
                    }}
                  >
                    청산
                  </button>
                  <button type="button" onClick={() => void toggleVirtualTrade()}>
                    중지
                  </button>
                </div>
                <div className={styles.tradeDeskFoot}>
                  진입근거: {virtPos.signalKo} · 진입 {fmtTime(virtPos.openedAt)} · 보유{' '}
                  {fmtHoldMs(virtHoldMs)} · 실시간 마크 · 확정 수익 아님
                </div>
              </>
            ) : !keys?.configured ? (
              <div className={styles.tradePosEmpty}>
                {virtOn && !virtPos ? (
                  <>
                    <div className={styles.tradePosSym}>신호 대기중</div>
                    <div className={styles.tradeWindowHint}>
                      ① 초단·4전략 FIRE (폭락→SFP→로켓 · 스윕/추세/존방어/돌파)
                    </div>
                    <div className={styles.tradeWindowHint}>
                      ② 독수리1호 CONFIRMED
                    </div>
                    <div className={styles.tradeWindowHint}>
                      ③ 플랜E 터치
                      {virtSession.watchEntry != null
                        ? ` · ${virtSession.watchEntry.toLocaleString('en-US')}`
                        : ' · 진입가 미설정(선택)'}
                    </div>
                    <div className={styles.tradeWindowHint}>
                      ④ 폭락존반응 · 핫존 · 구조로켓 · 스윙미드
                    </div>
                    <div className={styles.tradeWindowHint}>
                      ⑤ MTF감시 (분~월 RR·ROE) · 익절 후 같은방향 눌림재진입
                    </div>
                    <div className={styles.tradeWindowHint}>
                      ⑥ 고래빔은 가산점만 (단독 진입 아님)
                    </div>
                    <div className={styles.tradeWindowHint}>
                      마크 {markPx > 0 ? markPx.toLocaleString('en-US') : '—'} · 즉시진입 아님 · 실시간 분석 연속탐색
                    </div>
                  </>
                ) : (
                  <>
                    <div className={styles.tradeWindowHint}>
                      가상매매 시작(신호 대기) 또는 API 등록
                    </div>
                    <button
                      type="button"
                      className={styles.tradeTestBtn}
                      disabled={testBusy}
                      onClick={() => void toggleVirtualTrade()}
                    >
                      가상매매 시작 · 신호 대기
                    </button>
                  </>
                )}
              </div>
            ) : liveOpenList.length === 0 ? (
              <div className={styles.tradePosEmpty}>
                <div className={styles.tradePosSym}>{symbol.toUpperCase()}</div>
                <div className={styles.tradeWindowHint}>
                  오픈 포지션 없음 · BTC·ETH·BNB·XRP 개인 API 기준
                </div>
                {keys?.user ? (
                  <div className={styles.tradeWindowHint}>계정 {keys.user}</div>
                ) : null}
                <button
                  type="button"
                  className="tool-chip tool-chip-button"
                  disabled={posBusy}
                  onClick={() => void refreshPosition()}
                >
                  새로고침
                </button>
              </div>
            ) : (
              <>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 8,
                  }}
                >
                  <div className={styles.tradeWindowHint}>
                    실포지션 {liveOpenList.length}개 · BTC/ETH/BNB/XRP · 최대{AUTO_TRADE_MAX_CONCURRENT}
                  </div>
                  <button
                    type="button"
                    className={styles.tradeWindowIconBtn}
                    title="새로고침"
                    disabled={posBusy}
                    onClick={() => void refreshPosition()}
                  >
                    ↻
                  </button>
                </div>
                {liveOpenList.map((pos) => {
                  const scoreHit = openScoreTrades.find(
                    (o) =>
                      o.mode === 'live' &&
                      String(o.symbol || '').toUpperCase() ===
                        String(pos.symbol || '').toUpperCase() &&
                      o.direction === pos.direction
                  );
                  const stored = readPositionEntryLabel(pos.symbol, pos.direction);
                  const entrySignalKo = formatPositionEntrySignalKo(
                    stored,
                    scoreHit?.signalKo || null
                  );
                  return (
                  <div
                    key={pos.symbol}
                    style={{
                      marginBottom: liveOpenList.length > 1 ? 14 : 0,
                      paddingBottom: liveOpenList.length > 1 ? 12 : 0,
                      borderBottom:
                        liveOpenList.length > 1
                          ? '1px solid rgba(148,163,184,0.2)'
                          : undefined,
                    }}
                  >
                    {entrySignalKo ? (
                      <div
                        title={entrySignalKo}
                        style={{
                          marginBottom: 8,
                          padding: '6px 8px',
                          borderRadius: 6,
                          background: 'rgba(14,165,233,0.12)',
                          border: '1px solid rgba(56,189,248,0.35)',
                          color: '#7dd3fc',
                          fontSize: 11,
                          fontWeight: 600,
                          lineHeight: 1.35,
                          letterSpacing: '-0.01em',
                        }}
                      >
                        {entrySignalKo}
                      </div>
                    ) : (
                      <div
                        style={{
                          marginBottom: 8,
                          padding: '6px 8px',
                          borderRadius: 6,
                          background: 'rgba(100,116,139,0.15)',
                          border: '1px solid rgba(148,163,184,0.25)',
                          color: '#94a3b8',
                          fontSize: 11,
                          lineHeight: 1.35,
                        }}
                      >
                        진입신호 · 기록없음 (이번 앱 진입 이후부터 표시)
                      </div>
                    )}
                    <div className={styles.tradePosHead}>
                      <div>
                        <div className={styles.tradePosSym}>{pos.symbol}</div>
                        <div className={styles.tradePosTags}>
                          <span data-dir={pos.direction}>
                            {pos.direction === 'LONG' ? '롱' : '숏'}
                          </span>
                          <span>{pos.leverage}배</span>
                          <span>{pos.marginMode === 'crossed' ? '교차' : '격리'}</span>
                          <span>테더</span>
                        </div>
                      </div>
                    </div>

                    <div className={styles.tradePosPnlRow}>
                      <div>
                        <div className={styles.tradePosLabel}>미실현 손익 (테더)</div>
                        <div
                          className={styles.tradePosPnlBig}
                          data-tone={pnlTone(pos.unrealizedPnl)}
                        >
                          {fmtPnl(pos.unrealizedPnl)}
                        </div>
                      </div>
                      <div className={styles.tradePosRoe}>
                        <div className={styles.tradePosLabel}>수익률(증거금)</div>
                        <div
                          className={styles.tradePosPnlBig}
                          data-tone={pnlTone(pos.roePct)}
                        >
                          {fmtPct(pos.roePct)}
                        </div>
                      </div>
                    </div>

                    <div className={styles.tradePosGrid}>
                      <div>
                        <span>수량 ({baseAsset(pos.symbol)})</span>
                        <b>{pos.size}</b>
                      </div>
                      <div>
                        <span>증거금 (테더)</span>
                        <b>{pos.marginUsdt.toFixed(4)}</b>
                      </div>
                      <div>
                        <span>유지증거금률</span>
                        <b>{pos.mmrPct != null ? `${pos.mmrPct.toFixed(2)}%` : '—'}</b>
                      </div>
                      <div>
                        <span>진입가</span>
                        <b>{fmtPx(pos.entryPrice)}</b>
                      </div>
                      <div>
                        <span>마크가</span>
                        <b>{fmtPx(pos.markPrice)}</b>
                      </div>
                      <div>
                        <span>예상청산가</span>
                        <b className={styles.tradePosLiq}>{fmtPx(pos.liqPrice)}</b>
                      </div>
                    </div>

                    <div className={styles.tradePosMeta}>
                      <div>
                        <span>실현 손익 (테더)</span>
                        <b data-tone={pnlTone(pos.realizedPnl)}>{fmtPnl(pos.realizedPnl)}</b>
                      </div>
                      <div>
                        <span>전체 익절/손절</span>
                        <b className={styles.tradePosTpsl}>
                          {pos.tpPrice != null ? fmtPx(pos.tpPrice) : '—'}
                          {' / '}
                          {pos.slPrice != null ? fmtPx(pos.slPrice) : '—'}
                        </b>
                      </div>
                    </div>

                    <div className={styles.tradePosActions}>
                      <button
                        type="button"
                        disabled={posBusy}
                        onClick={() => {
                          setSide(pos.direction);
                          if (pos.slPrice) setSlStr(String(pos.slPrice));
                          if (pos.tpPrice) setTp1Str(String(pos.tpPrice));
                          setTab('tp');
                          setMsg(`${pos.symbol} 익절/손절 프리셋 · 익절 탭`);
                        }}
                      >
                        익절손절
                      </button>
                      <button
                        type="button"
                        disabled={posBusy}
                        onClick={() => void reverseLivePosition(pos)}
                      >
                        반전
                      </button>
                      <button
                        type="button"
                        className={styles.tradePosCloseBtn}
                        disabled={posBusy}
                        onClick={() => void closeLivePosition(pos)}
                      >
                        청산
                      </button>
                    </div>
                  </div>
                  );
                })}
              </>
            )}
            {posMsg ? <div className={styles.tradePosMsg}>{posMsg}</div> : null}
            <div className={styles.tradeDeskFoot}>실포지션 · BTC+ETH+BNB+XRP · 로그인 계정 API · 확정 수익 아님</div>
          </div>
        ) : null}

        {tab === 'setup' ? (
          <div className={styles.tradeWindowStack}>
            {liveStatusKo ? <div className={styles.tradeWindowStatus}>{liveStatusKo}</div> : null}
            <div className={styles.tradeWindowCard}>
              <b>매매 방법 (통합·독수리1호) · 이미 연동됨</b>
              <div>1) 초단: 폭락존 터치(Arm) → SFP → 로켓 → 시장가 (단타 비중%)</div>
              <div>2) 독수리: CONFIRMED 롱/숏 + 진입가 0.8% 이내 (독수리 비중%)</div>
              <div>3) 청산: TP1≈55% → 본절 → TP2 · ROE 캡 · 시간손절</div>
              <div>4) 사이즈: 주문 직전 계좌자산 × 전략별 비중%</div>
              <div>5) 포지션 탭: 개인 API 실포지션 · Close/Reverse</div>
            </div>
            <div className={styles.tradeWindowRow}>
              <button
                type="button"
                className={`tool-chip tool-chip-button ${cfg.marginMode === 'isolated' ? 'tool-chip-active' : ''}`}
                onClick={() => patch({ marginMode: 'isolated' })}
              >
                격리
              </button>
              <button
                type="button"
                className={`tool-chip tool-chip-button ${cfg.marginMode === 'crossed' ? 'tool-chip-active' : ''}`}
                onClick={() => patch({ marginMode: 'crossed' })}
              >
                교차
              </button>
              <button
                type="button"
                className={`tool-chip tool-chip-button ${cfg.sizeMode === 'fixedUsdt' ? 'tool-chip-active' : ''}`}
                onClick={() => patch({ sizeMode: 'fixedUsdt' })}
              >
                고정 USDT
              </button>
            </div>
            {cfg.sizeMode === 'fixedUsdt' ? (
              <label className={styles.tradeWindowField}>
                <span>증거금 USDT</span>
                <input
                  type="number"
                  min={1}
                  max={50000}
                  value={cfg.marginUsdt}
                  onChange={(e) => patch({ marginUsdt: Number(e.target.value) || 1 })}
                  style={inputStyle}
                />
              </label>
            ) : null}
            <label className={styles.tradeWindowCheck}>
              <input
                type="checkbox"
                checked={cfg.strategyScalp}
                onChange={(e) => patch({ strategyScalp: e.target.checked })}
              />
              초단 · 폭락터치→SFP→로켓
            </label>
            <label className={styles.tradeWindowCheck}>
              <input
                type="checkbox"
                checked={cfg.strategyDoksuri1}
                onChange={(e) => patch({ strategyDoksuri1: e.target.checked })}
              />
              독수리1호 CONFIRMED
            </label>
            <div className={styles.tradeWindowApiBox}>
              <div className={styles.tradeWindowSectionTitle} style={{ color: '#fecaca' }}>
                Bitget API · 개인 키
              </div>
              <div className={styles.tradeWindowCard} style={{ marginBottom: 8 }}>
                <b>다중 사용자 보안</b>
                <div>로그인 계정마다 키가 분리 저장됩니다 (AES-256-GCM).</div>
                <div>시크릿·패스프레이즈는 화면에 다시 안 나오고, 마스킹만 표시.</div>
                <div>포지션·주문은 본인 키로만 조회·실행됩니다.</div>
                {keys?.user ? <div>현재 로그인: {keys.user}</div> : null}
              </div>
              {keys?.configured ? (
                <div>
                  Bitget Credential: <b>{keys.meta?.apiKeyMasked}</b>
                  {' · '}
                  {keys.meta?.lastTestOk === true
                    ? 'OK'
                    : keys.meta?.lastTestOk === false
                      ? 'FAIL'
                      : '미확인'}
                  <div className={styles.tradeWindowHint}>
                    Bitget API 관리 화면의 Key 앞4·뒤4와 위 마스킹이 같아야 함
                  </div>
                </div>
              ) : (
                <div className={styles.tradeWindowHint}>미등록 · 페이퍼만</div>
              )}
              {keys?.configured && keys?.meta?.lastTestOk === false ? (
                <div className={styles.tradeWindowCard} style={{ borderColor: 'rgba(248,113,113,0.5)' }}>
                  <b>인증 실패 · 실전 잠금</b>
                  {probeFailClass ? <div>ERROR CLASS · {probeFailClass}</div> : null}
                  {keys.meta?.lastTestMsg ? <div>서버응답 · {keys.meta.lastTestMsg}</div> : null}
                  <div>「재테스트」로 code/msg/step 확인 · Secret·Passphrase는 로그에 안 나옴</div>
                  <div>Bitget whitelist = 공인 IPv4 (127.0.0.1 / 사설IP 불가)</div>
                </div>
              ) : null}
              <input
                type="text"
                placeholder="1) API Key (공개키)"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                style={inputStyle}
              />
              <input
                type="password"
                placeholder="2) API Secret (비밀키 · 발급직후 복사)"
                value={apiSecret}
                onChange={(e) => setApiSecret(e.target.value)}
                autoComplete="new-password"
                style={inputStyle}
              />
              <input
                type="password"
                placeholder="3) Passphrase (키 만들 때 설정한 암호문구)"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                autoComplete="new-password"
                style={inputStyle}
              />
              <div className={styles.tradeWindowHint}>
                HMAC 키 · Key≠Secret≠Passphrase · 로그인 비번 아님 · IP는 공인IPv4만
              </div>
              <div className={styles.tradeWindowRow}>
                <button type="button" className="tool-chip tool-chip-button" disabled={busy} onClick={() => void saveKeys()}>
                  저장·인증
                </button>
                <button type="button" className="tool-chip tool-chip-button" disabled={busy} onClick={() => void testKeys()}>
                  재테스트
                </button>
                <button type="button" className="tool-chip tool-chip-button" disabled={busy} onClick={() => void clearKeys()}>
                  키 삭제
                </button>
              </div>
              {msg ? <div style={{ color: '#fde68a', fontSize: 11 }}>{msg}</div> : null}
              {probeLines.length ? (
                <div
                  className={styles.tradeWindowCard}
                  style={{
                    marginTop: 8,
                    fontSize: 11,
                    lineHeight: 1.45,
                    color: probeFailClass ? '#fecaca' : '#a7f3d0',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {probeLines.join('\n')}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {tab === 'scalp' ? (
          <div className={styles.tradeWindowStack}>
            <div className={styles.tradeWindowCard} style={{ borderColor: 'rgba(56,189,248,0.4)' }}>
              <div style={{ fontWeight: 800 }}>{scalpStripKo}</div>
              <div style={{ marginTop: 4, color: '#bae6fd' }}>{scalpDetailKo}</div>
              <div style={{ marginTop: 6, color: '#7dd3fc', fontSize: 11 }}>{fourStrategyStripKo}</div>
            </div>
            <div className={styles.tradeWindowSectionTitle}>4전략 · 개별 통계 (합산 승률 없음)</div>
            <div className={styles.tradeWindowHint}>
              필수3=후보 · 보너스는 점수만 · XRP는 이 4패턴만 자동진입 · 확정 아님
            </div>
            {(fourStrategyCards.length ? fourStrategyCards : []).map((card) => (
              <div
                key={card.strategyId}
                className={styles.tradeWindowCard}
                style={{
                  borderColor:
                    card.status === 'ACTIVE'
                      ? 'rgba(52,211,153,0.55)'
                      : card.status === 'DISABLED'
                        ? 'rgba(248,113,113,0.45)'
                        : 'rgba(148,163,184,0.35)',
                }}
              >
                <div style={{ fontWeight: 700 }}>
                  {card.labelKo}{' '}
                  <span style={{ opacity: 0.85, fontWeight: 600 }}>{statusKo(card.status)}</span>
                </div>
                <div style={{ fontSize: 11, marginTop: 4, color: '#cbd5e1' }}>
                  거래 {card.tradeCount}회
                  {card.winRate != null ? ` · 승률 ${(card.winRate * 100).toFixed(0)}%` : ''}
                  {' · '}순기대값 {card.netEv.toFixed(2)}
                  {' · '}손익비 {card.profitFactor.toFixed(2)}
                  {card.bestRegime ? ` · 최선국면 ${card.bestRegime}` : ''}
                </div>
                <div style={{ fontSize: 11, marginTop: 2, color: '#94a3b8' }}>
                  현재셋업: {card.setupKo}
                </div>
              </div>
            ))}
            {!fourStrategyCards.length ? (
              <div className={styles.tradeWindowHint}>1·3·5·15분에서 초단 켜면 4전략 카드 갱신</div>
            ) : null}
            {scalpTrade ? (
              <div className={styles.tradeWindowCard}>
                <div>
                  단계 <b>{phaseKo(scalpTrade.phase)}</b> · {dirKo(scalpTrade.direction)}
                  {scalpTrade.fourStrategyId
                    ? ` · ${FOUR_STRATEGY_KO[scalpTrade.fourStrategyId as keyof typeof FOUR_STRATEGY_KO] || scalpTrade.fourStrategyId}`
                    : ''}
                </div>
                {scalpTrade.entry != null ? (
                  <div>
                    진입 {scalpTrade.entry.toFixed(0)} · 손절 {(scalpTrade.activeSl ?? scalpTrade.sl)?.toFixed(0)} · 익절1{' '}
                    {scalpTrade.tp1?.toFixed(0)} · 익절2 {scalpTrade.tp2?.toFixed(0)}
                  </div>
                ) : null}
                {(() => {
                  const st = exitStageKo({
                    phase: scalpTrade.phase,
                    remainingFrac: scalpTrade.remainingFrac,
                    tp: scalpTrade.tp1,
                    sl: scalpTrade.activeSl ?? scalpTrade.sl,
                    runnerTp: scalpTrade.tp2,
                    tp1Done:
                      scalpTrade.phase === 'TP1_HIT' ||
                      scalpTrade.phase === 'BE' ||
                      (scalpTrade.remainingFrac != null && scalpTrade.remainingFrac < 1),
                  });
                  return (
                    <div className={styles.tradeExitStageCard} data-stage={scalpTrade.phase === 'CLOSED' ? 'done' : scalpTrade.remainingFrac < 1 ? 'half' : 'full-open'}>
                      <div className={styles.tradeExitStageTitle}>{st.title}</div>
                      <div>{st.body}</div>
                      <div className={styles.tradeExitStageNext}>{st.next}</div>
                      {scalpTrade.remainingFrac != null && scalpTrade.remainingFrac > 0 && scalpTrade.remainingFrac < 1 ? (
                        <div style={{ marginTop: 4 }}>
                          잔량 {(scalpTrade.remainingFrac * 100).toFixed(0)}% · 실현 ROE{' '}
                          {(scalpTrade.realizedRoePct * 100).toFixed(1)}%
                        </div>
                      ) : null}
                    </div>
                  );
                })()}
              </div>
            ) : (
              <div className={styles.tradeWindowHint}>활성 가상 초단 없음</div>
            )}
            <div className={styles.tradeWindowHint}>
              기대값(참고): {sum.expectancyKo || autoScalpExpectancyKo(symbol)}
            </div>
            {hist.slice(0, 10).map((h) => (
              <div key={h.id} className={styles.tradeWindowJournalRow}>
                {dirKo(h.direction)} {h.closeReason} · 수익 {(h.realizedRoePct * 100).toFixed(1)}%
              </div>
            ))}
          </div>
        ) : null}

        {tab === 'journal' ? (
          <div className={styles.tradeWindowStack}>
            <div className={styles.tradeWindowRow} style={{ marginBottom: 6, flexWrap: 'wrap', gap: 6 }}>
              {(
                [
                  ['open', '진행중'],
                  ['score', '신호성적'],
                  ['reinforce', '보강'],
                  ['log', '기록'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={`${styles.tradeWindowTab}${journalSub === id ? ` ${styles.tradeWindowTabOn}` : ''}`}
                  onClick={() => setJournalSub(id)}
                >
                  {label}
                  {id === 'open' && openScoreTrades.length > 0 ? ` ${openScoreTrades.length}` : ''}
                  {id === 'reinforce' &&
                  (signalScore.reinforceKo.length > 0 || reinforceBoard.urgentKo.length > 0)
                    ? ' !'
                    : ''}
                </button>
              ))}
            </div>
            <div className={styles.tradeWindowHint} style={{ marginBottom: 6 }}>
              {signalScore.summaryKo} · 양호신호 유지 · 손절많은 신호만 보강 (확정아님)
              {' · '}
              <button
                type="button"
                className="tool-chip tool-chip-button"
                style={{ display: 'inline', padding: '0 6px', fontSize: 11 }}
                onClick={() => setTab('stats')}
              >
                코인통계 →
              </button>
            </div>

            {journalSub === 'open' ? (
              <div className={styles.tradeWindowStack}>
                <div className={styles.tradeWindowSectionTitle}>진행중 · 신호→청산 대기</div>
                {openScoreTrades.length === 0 && !virtPos && !livePos ? (
                  <div className={styles.tradeWindowHint}>열린 성적부 포지션 없음</div>
                ) : null}
                {openScoreTrades.map((o) => (
                  <div key={o.tradeId} className={styles.tradeWindowCard}>
                    <div style={{ fontWeight: 700 }}>
                      {o.mode === 'live' ? '실전' : '가상'} · {o.direction === 'LONG' ? '롱' : '숏'} ·{' '}
                      {o.signalKo}
                    </div>
                    <div className={styles.tradeWindowHint}>
                      {o.symbol.replace('USDT', '')} · {o.timeframe} · 진입 {o.entry.toFixed(0)}
                      {o.sl != null ? ` · SL ${o.sl.toFixed(0)}` : ''}
                      {o.tp != null ? ` · TP ${o.tp.toFixed(0)}` : ''}
                    </div>
                    <div className={styles.tradeWindowHint}>
                      보유 {Math.max(0, Math.round((Date.now() - o.openedAt) / 1000))}초 · 청산 시 성적 반영
                    </div>
                  </div>
                ))}
                {virtPos && !openScoreTrades.some((o) => o.tradeId === virtPos.id) ? (
                  <div className={styles.tradeWindowCard}>
                    <div style={{ fontWeight: 700 }}>
                      가상 · {virtPos.direction === 'LONG' ? '롱' : '숏'} · {virtPos.signalKo}
                    </div>
                    <div className={styles.tradeWindowHint}>
                      진입 {virtPos.entry.toFixed(0)}
                      {virtPos.sl != null ? ` · SL ${Number(virtPos.sl).toFixed(0)}` : ''}
                    </div>
                  </div>
                ) : null}
                <div className={styles.tradeWindowSectionTitle}>최근 청산</div>
                {recentScoreClosed.length === 0 ? (
                  <div className={styles.tradeWindowHint}>청산 성적 아직 없음</div>
                ) : (
                  recentScoreClosed.map((c) => (
                    <div
                      key={`${c.tradeId}-${c.closedAt}`}
                      className={styles.tradeWindowJournalRow}
                      style={{
                        borderLeft: c.win ? '3px solid #34d399' : '3px solid #f87171',
                        paddingLeft: 8,
                      }}
                    >
                      <div className={styles.tradeWindowJournalHead}>
                        <b>
                          {c.win ? '성공' : '실패'} · {c.signalKo}
                        </b>
                        <span>{c.exitReason}</span>
                      </div>
                      <div className={styles.tradeWindowHint}>
                        {c.direction === 'LONG' ? '롱' : '숏'} · {c.pnlUsdt >= 0 ? '+' : ''}
                        {c.pnlUsdt.toFixed(2)}U · ROE {c.roePct.toFixed(1)}%
                      </div>
                    </div>
                  ))
                )}
              </div>
            ) : null}

            {journalSub === 'score' ? (
              <div className={styles.tradeWindowStack}>
                <div className={styles.tradeWindowSectionTitle}>신호별 성적표</div>
                <div className={styles.tradeWindowHint}>
                  유지=왜 좋은지 · 보강=왜 손봐야 하는지 · 확정 승률 아님
                </div>
                {signalScore.rows.filter((r) => r.verdict === 'keep').length > 0 ? (
                  <div className={styles.tradeWindowCard} style={{ borderColor: 'rgba(52,211,153,0.4)' }}>
                    <div style={{ fontWeight: 700 }}>유지 · 좋은 성적 사유</div>
                    {signalScore.rows
                      .filter((r) => r.verdict === 'keep')
                      .slice(0, 8)
                      .map((r) => (
                        <div key={`keep-${r.signalKey}`} style={{ marginTop: 8 }}>
                          <div style={{ color: '#6ee7b7', fontWeight: 600 }}>{r.signalKo}</div>
                          <div className={styles.tradeWindowHint}>왜: {r.whyKo}</div>
                          <div className={styles.tradeWindowHint}>조치: {r.actionKo}</div>
                        </div>
                      ))}
                  </div>
                ) : null}
                {signalScore.rows.length === 0 ? (
                  <div className={styles.tradeWindowHint}>청산 후 신호별 승·패·손절률이 여기에 쌓입니다</div>
                ) : (
                  signalScore.rows.slice(0, 20).map((r) => (
                    <div
                      key={r.signalKey}
                      className={styles.tradeWindowJournalRow}
                      style={{
                        borderLeft:
                          r.verdict === 'reinforce'
                            ? '3px solid #f87171'
                            : r.verdict === 'keep'
                              ? '3px solid #34d399'
                              : '3px solid #64748b',
                        paddingLeft: 8,
                      }}
                    >
                      <div className={styles.tradeWindowJournalHead}>
                        <b>{r.signalKo}</b>
                        <span
                          style={{
                            color:
                              r.verdict === 'reinforce'
                                ? '#fca5a5'
                                : r.verdict === 'keep'
                                  ? '#6ee7b7'
                                  : '#94a3b8',
                          }}
                        >
                          {r.verdictKo}
                          {r.softSkip ? ' · 일시대기' : ''}
                          {r.sizeMult < 1 && r.sizeMult > 0 ? ` · 비중×${r.sizeMult}` : ''}
                        </span>
                      </div>
                      <div className={styles.tradeWindowHint}>왜: {r.whyKo}</div>
                      <div className={styles.tradeWindowHint}>조치: {r.actionKo}</div>
                      <div className={styles.tradeWindowHint}>
                        {r.count}회 · 승{r.wins}/패{r.losses} · 손절{r.slExits} · 익절{r.tpExits} · 실패
                        {(r.failRate * 100).toFixed(0)}% · 손절률{(r.slRate * 100).toFixed(0)}% ·{' '}
                        {r.netPnl >= 0 ? '+' : ''}
                        {r.netPnl.toFixed(1)}U · 평균ROE {r.avgRoePct.toFixed(1)}%
                      </div>
                    </div>
                  ))
                )}
                <div className={styles.tradeWindowRow}>
                  <button
                    type="button"
                    className="tool-chip tool-chip-button"
                    title="보강필요 신호·청산·유지사유 JSON"
                    onClick={() => {
                      downloadReinforceNeededWithMatrix();
                      setMsg('보강필요 기록 저장됨 · 채팅에 첨부해 주세요');
                    }}
                  >
                    보강필요 다운로드
                  </button>
                </div>
              </div>
            ) : null}

            {journalSub === 'reinforce' ? (
              <div className={styles.tradeWindowStack}>
                <div className={styles.tradeWindowCard} style={{ borderColor: 'rgba(125,211,252,0.45)' }}>
                  <div style={{ fontWeight: 800 }}>4심볼 보강 매트릭스 (숨김없음)</div>
                  <div className={styles.tradeWindowHint} style={{ marginTop: 4 }}>
                    {symbolMatrix.summaryKo}
                  </div>
                  {symbolMatrix.rows.map((row) => (
                    <div
                      key={row.coin}
                      className={styles.tradeWindowJournalRow}
                      style={{
                        marginTop: 8,
                        borderLeft: row.cooling || row.slRate >= 0.45
                          ? '3px solid #f87171'
                          : row.netPnl > 0
                            ? '3px solid #34d399'
                            : '3px solid #64748b',
                        paddingLeft: 8,
                      }}
                    >
                      <div className={styles.tradeWindowJournalHead}>
                        <b>{row.coin}</b>
                        <span>
                          {row.cooling
                            ? `쿨다운 ${row.remainSec}s`
                            : row.consecutiveSl > 0
                              ? `연속손절 ${row.consecutiveSl}`
                              : '가드정상'}
                          {` · 비중×${row.sizeMult}`}
                        </span>
                      </div>
                      <div className={styles.tradeWindowHint}>
                        {row.tradeCount}회 · 승{row.wins}/패{row.losses} · 손절{row.slExits} · 손절률
                        {(row.slRate * 100).toFixed(0)}% · {row.netPnl >= 0 ? '+' : ''}
                        {row.netPnl.toFixed(1)}U
                      </div>
                      <div className={styles.tradeWindowHint}>
                        프로필: 늦은{(row.profile.lateEntryPct * 100).toFixed(2)}% · SL최소
                        {(row.profile.minSlPct * 100).toFixed(2)}% · 유예{row.profile.graceMs / 1000}s
                      </div>
                      <div className={styles.tradeWindowHint}>왜: {row.whyKo}</div>
                      <div className={styles.tradeWindowHint}>조치: {row.actionKo}</div>
                    </div>
                  ))}
                </div>
                <div className={styles.tradeWindowCard} style={{ borderColor: 'rgba(248,113,113,0.45)' }}>
                  <div style={{ fontWeight: 800 }}>보강 큐 · 손실 줄이기</div>
                  <div className={styles.tradeWindowHint} style={{ marginTop: 4 }}>
                    손절·실패 많은 신호 · 왜/조치 표시 · 연속손절 시 심볼 쿨다운·비중축소 자동
                  </div>
                  <button
                    type="button"
                    className="tool-chip tool-chip-button"
                    style={{ marginTop: 8 }}
                    onClick={() => {
                      downloadReinforceNeededWithMatrix();
                      setMsg('보강필요 기록 저장됨 · 채팅에 첨부해 주세요');
                    }}
                  >
                    보강필요 기록 다운로드
                  </button>
                  {signalScore.rows.filter((r) => r.verdict === 'reinforce').length === 0 &&
                  reinforceBoard.urgentKo.length === 0 ? (
                    <div className={styles.tradeWindowHint} style={{ marginTop: 8 }}>
                      긴급 보강 신호 없음 · 위 4심볼 매트릭스는 항상 표시
                    </div>
                  ) : null}
                  {signalScore.rows
                    .filter((r) => r.verdict === 'reinforce')
                    .map((r) => (
                      <div
                        key={`sc-r-${r.signalKey}`}
                        className={styles.tradeWindowJournalRow}
                        style={{ color: '#fca5a5', marginTop: 8 }}
                      >
                        <div style={{ fontWeight: 700 }}>
                          {r.signalKo} · {r.verdictKo}
                          {r.softSkip ? ' · 일시대기' : ''}
                        </div>
                        <div className={styles.tradeWindowHint}>왜: {r.whyKo}</div>
                        <div className={styles.tradeWindowHint}>조치: {r.actionKo}</div>
                      </div>
                    ))}
                  {reinforceBoard.urgentKo.map((line, i) => (
                    <div key={`urg-${i}`} className={styles.tradeWindowJournalRow} style={{ color: '#fca5a5' }}>
                      {line}
                    </div>
                  ))}
                </div>
                <div className={styles.tradeWindowSectionTitle}>시드 분석 보강(기존)</div>
                <div style={{ fontSize: 12 }}>{reinforceBoard.summaryKo}</div>
                {reinforceBoard.rows.slice(0, 12).map((r) => (
                  <div
                    key={r.key}
                    className={styles.tradeWindowJournalRow}
                    style={{
                      borderLeft: r.needReinforce
                        ? '3px solid #f87171'
                        : r.netPnl > 0
                          ? '3px solid #34d399'
                          : '3px solid transparent',
                      paddingLeft: 8,
                    }}
                  >
                    <div className={styles.tradeWindowJournalHead}>
                      <b>{r.labelKo}</b>
                      <span style={{ color: r.needReinforce ? '#fca5a5' : '#94a3b8' }}>{r.statusKo}</span>
                    </div>
                    <div className={styles.tradeWindowHint}>
                      {r.count}회 · 승{r.wins}/패{r.losses} · 실패율 {(r.failRate * 100).toFixed(0)}% · 손익{' '}
                      {fmtPnl(r.netPnl, 2)}U · 평균ROE {fmtPct(r.avgRoePct)}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {journalSub === 'log' ? (
              <>
            {liveReady ? (
              <div className={styles.tradeWindowCard} style={{ borderColor: 'rgba(52,211,153,0.45)' }}>
                <div style={{ fontWeight: 800 }}>실전 기록 · Bitget</div>
                <div className={styles.tradeWindowHint} style={{ marginTop: 4 }}>
                  가상·페이퍼 제외 · BTC/ETH/BNB/XRP 실주문·실전 신호만 표시 · 시드={' '}
                  {availUsdt != null ? `${availUsdt.toFixed(2)}U` : '—'}
                </div>
                <div className={styles.tradeWindowHint} style={{ marginTop: 6 }}>
                  {symSigLine} · 1회 {scalpPct}%
                </div>
              </div>
            ) : (
              <div className={styles.tradeWindowCard} style={{ borderColor: 'rgba(251,191,36,0.45)' }}>
                <div style={{ fontWeight: 800 }}>보강기록부 (실시간)</div>
                <div className={styles.tradeWindowHint} style={{ marginTop: 4 }}>
                  {virtAnalysisStripKo}
                </div>
                <div style={{ marginTop: 6, fontSize: 12 }}>{reinforceBoard.summaryKo}</div>
              </div>
            )}

            <div className={styles.tradeWindowSectionTitle}>
              {liveReady ? '실전 매매·신호 기록' : '매매 기록 · 성공/실패 전부 저장 (보강용)'}
            </div>
            {liveReady ? (
              <>
                <div className={styles.tradeWindowHint}>
                  실전 이벤트 {journalRows.length}건 · 가상체결 숨김
                </div>
                {journalRows.length === 0 ? (
                  <div className={styles.tradeWindowHint}>실주문·실전 신호 후 여기에 표시</div>
                ) : (
                  journalRows.slice(0, 80).map((e: TradeJournalEvent) => (
                    <div key={e.id} className={styles.tradeWindowJournalRow}>
                      <div className={styles.tradeWindowJournalHead}>
                        <b>{journalKindKo(e.kind)}</b>
                        <span>{e.symbol.replace('USDT', '')}</span>
                        <span>{dirKo(e.direction)}</span>
                        <span className={styles.tradeWindowHint}>{fmtTime(e.at)}</span>
                      </div>
                      <div>{e.noteKo || e.levelLabel}</div>
                      <div className={styles.tradeWindowHint}>
                        가격 {fmtPx(e.price)} ·{' '}
                        {e.meta?.live === true
                          ? '실주문'
                          : e.meta?.analysisOnly === true ||
                              String(e.kind || '').startsWith('TOUCH_') ||
                              String(e.kind || '').startsWith('APPROACH_')
                            ? '분석기록(주문아님)'
                            : '신호기록'}
                        {e.meta?.marginUsdt != null ? ` · 증거금 ${e.meta.marginUsdt}U` : ''}
                      </div>
                    </div>
                  ))
                )}
              </>
            ) : (
              <>
                <div className={styles.tradeWindowHint}>
                  성공 {seedTrades.filter((t) => t.outcome === 'SUCCESS').length} · 부분{' '}
                  {seedTrades.filter((t) => t.outcome === 'PARTIAL').length} · 실패{' '}
                  {seedTrades.filter((t) => t.outcome === 'FAIL').length} · 본절{' '}
                  {seedTrades.filter((t) => t.outcome === 'FLAT').length} · 총 {seedTrades.length}건
                </div>
                {seedTrades.length === 0 ? (
                  <div className={styles.tradeWindowHint}>가상 체결 후 여기에 실시간 표시</div>
                ) : (
                  seedTrades.slice(0, 80).map((t) => (
                    <div key={t.id} className={styles.tradeWindowJournalRow}>
                      <div className={styles.tradeWindowJournalHead}>
                        <b
                          className={styles.tradeOutcomeBadge}
                          data-outcome={t.outcome || (t.win ? 'SUCCESS' : 'FAIL')}
                        >
                          {t.outcomeKo || (t.win ? '성공' : '실패')}
                        </b>
                        <b data-tone={pnlTone(t.pnlUsdt)}>{fmtPnl(t.pnlUsdt, 2)}U</b>
                        <span>{dirKo(t.direction)}</span>
                        <span
                          className={styles.tradeWindowHint}
                          style={{ color: '#7dd3fc', fontWeight: 600 }}
                        >
                          {tfEntryKo(t.timeframe)}
                        </span>
                        <span className={styles.tradeWindowHint}>
                          {fmtTime(t.at)} → {fmtTime(t.closedAt)}
                        </span>
                      </div>
                      <div>
                        {t.signalKo} · {t.exitReason} · ROE {fmtPct(t.roePct)} · 보유{' '}
                        {fmtHoldMs(t.holdingMs)} · {tfEntryKo(t.timeframe)} 진입
                      </div>
                      <div className={styles.tradeWindowHint}>
                        진입 {fmtPx(t.entry)} → 종료 {fmtPx(t.exit)} · 출처 {entrySourceKo(t.source)} ·
                        시드 {t.seedBefore.toFixed(1)}→{t.seedAfter.toFixed(1)}U
                        {t.analysisTags?.length ? ` · 분석 ${(t.analysisTags || []).join('+')}` : ''}
                        {t.fourStrategyId
                          ? ` · ${(FOUR_STRATEGY_KO as Record<string, string>)[t.fourStrategyId] || t.fourStrategyId}`
                          : ''}
                        {' · '}보강저장됨
                      </div>
                    </div>
                  ))
                )}
              </>
            )}

            <div className={styles.tradeWindowRow}>
              <button
                type="button"
                className="tool-chip tool-chip-button"
                onClick={() => downloadTradeEventJournal(symbol, timeframe)}
              >
                기록 내보내기
              </button>
              <button
                type="button"
                className="tool-chip tool-chip-button"
                title="신호·시드 보강용 JSON"
                onClick={() => {
                  downloadReinforcementPack();
                  setMsg('보강용 파일 저장됨 · 채팅에 첨부해 주세요');
                }}
              >
                보강용 파일 받기
              </button>
              <button
                type="button"
                className="tool-chip tool-chip-button"
                title="보강필요 신호 why/action + 청산기록"
                onClick={() => {
                  downloadReinforceNeededWithMatrix();
                  setMsg('보강필요 기록 저장됨 · 채팅에 첨부해 주세요');
                }}
              >
                보강필요 다운로드
              </button>
              <button
                type="button"
                className="tool-chip tool-chip-button"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  void syncTradeEventJournalToServer()
                    .then((r) => setMsg(r.ok ? `서버 업로드 ${r.merged ?? 0}` : r.error || '실패'))
                    .finally(() => setBusy(false));
                }}
              >
                서버 올리기
              </button>
              <button
                type="button"
                className="tool-chip tool-chip-button"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  void pullTradeEventJournalFromServer()
                    .then((n) => {
                      setMsg(`서버 받기 ${n}`);
                      setJournalTick((v) => v + 1);
                      setSeedTick((v) => v + 1);
                    })
                    .finally(() => setBusy(false));
                }}
              >
                서버 받기
              </button>
            </div>
            {msg ? <div style={{ color: '#fde68a', fontSize: 11 }}>{msg}</div> : null}
            <div className={styles.tradeWindowSectionTitle}>이벤트 로그 · 성공/실패 포함</div>
            {journalRows.length === 0 ? (
              <div className={styles.tradeWindowHint}>이벤트 없음</div>
            ) : (
              journalRows.map((e: TradeJournalEvent) => (
                <div key={e.id} className={styles.tradeWindowJournalRow}>
                  <div className={styles.tradeWindowJournalHead}>
                    {typeof e.meta?.outcomeKo === 'string' ? (
                      <b
                        className={styles.tradeOutcomeBadge}
                        data-outcome={String(e.meta.outcome || '')}
                      >
                        {String(e.meta.outcomeKo)}
                      </b>
                    ) : null}
                    <b>{journalKindKo(e.kind)}</b>
                    <span data-dir={e.direction}>{dirKo(e.direction)}</span>
                    <span
                      className={styles.tradeWindowHint}
                      style={{ color: '#7dd3fc', fontWeight: 600 }}
                      title={`진입 차트 ${e.chartTf || e.sourceTf || ''}`}
                    >
                      {tfEntryKo(e.chartTf || e.sourceTf)}
                    </span>
                    <span className={styles.tradeWindowHint}>{fmtTime(e.at)}</span>
                  </div>
                  <div>
                    {e.levelLabel || e.noteKo.slice(0, 72)}
                    {e.chartTf || e.sourceTf
                      ? ` · ${tfEntryKo(e.chartTf || e.sourceTf)} 진입`
                      : ''}
                  </div>
                </div>
              ))
            )}
              </>
            ) : null}
          </div>
        ) : null}

        {tab === 'guide' ? (
          <div className={styles.tradeWindowStack}>
            <div className={styles.tradeGuideHero}>
              <b>자동매매 설명서</b>
              <div>가상·초단·4전략 공통 · 확정 수익 아님 · 교육·검증용</div>
            </div>

            <div className={styles.tradeWindowSectionTitle}>청산이 언제 끝나는가</div>
            <div className={styles.tradeWindowCard} style={{ borderColor: 'rgba(52,211,153,0.45)' }}>
              <b>핵심: TP1 = 반익(부분) · 전량 종료는 그 다음</b>
              <div>① 진입 → 포지션 100% 보유</div>
              <div>② 익절1(TP1) 도달 → 약 50~55%만 익절 · 손절을 진입가(본절)로 이동</div>
              <div>③ 잔량 종료 조건 (하나라도 되면 포지션 완전 종료)</div>
              <div style={{ paddingLeft: 10 }}>
                · 익절2(TP2) / 러너 목표가 도달
                <br />
                · 본절(진입가) 터치 → 잔량 0에 가깝게 청산
                <br />
                · 시간손절(봉 수 초과) → 시장가에 잔량 청산
                <br />· 수동 「청산」 버튼
              </div>
              <div>④ 전량 종료 후 → 연속 분석 재개 (즉시 같은자리 재진입 금지)</div>
            </div>

            <div className={styles.tradeWindowSectionTitle}>단계 흐름</div>
            <div className={styles.tradeGuideSteps}>
              <div data-n="1">대기 · 시드/가상 시작 (즉시 진입 아님)</div>
              <div data-n="2">신호 · 폭락→SFP→로켓 / 4전략 / 독수리 / 플랜터치</div>
              <div data-n="3">진입 · 시드 5% · 레버 설정 · SL·TP1·TP2 설정</div>
              <div data-n="4">TP1 · 반익 + 본절 이동 (아직 포지션 있음)</div>
              <div data-n="5">잔량 · TP2·러너 또는 본절·시간손절 → 완전 종료</div>
              <div data-n="6">기록 · 보강기록부 · 4전략 통계 반영 · 다음 Setup만</div>
            </div>

            <div className={styles.tradeWindowSectionTitle}>왜 반익인가</div>
            <div className={styles.tradeWindowCard}>
              <div>초단은 목표가에 빨리 닿고 되돌림이 잦습니다.</div>
              <div>절반은 확정 익절로 잠그고, 나머지는 본절 보호 후 추가 목표(TP2)를 노립니다.</div>
              <div>그래서 TP1만 찍혀도 「종료」가 아닙니다. 포지션 탭의 「청산단계」를 보세요.</div>
            </div>

            <div className={styles.tradeWindowSectionTitle}>가상 vs 실전</div>
            <div className={styles.tradeWindowCard}>
              <div>가상: API 없이 차트 마크로 모의 · 시드·5% · 기록·보강용</div>
              <div>실전: Bitget API 등록·인증 후 · 기본 OFF · ACTIVE 전략만</div>
              <div>
                실전 ON 한 번이면 폰·PC를 서버에 접속하지 않아도 서버가 진입·익절·손절을
                돌림 (탭/앱을 켜 둘 필요 없음)
              </div>
              <div>
                같은 코인 롱 보유 중 강한 숏 신호(또는 반대) → 헷지 진입(비중 절반) · Bitget
                헷지모드 필수
              </div>
              <div>분석 파이프(진입 조건)는 가상=실전 동일 · 체결·슬리피지만 다름</div>
              <div>끄려면 화면에서 「실전매매」를 OFF · 서버 ARM도 함께 꺼짐</div>
            </div>

            <div className={styles.tradeWindowSectionTitle}>선물에서 꼭 볼 것</div>
            <div className={styles.tradeWindowCard}>
              <div>격리/교차 · 레버리지 · 청산가 거리 · 수수료·펀딩(순ROE)</div>
              <div>ROE 5~10%는 가격 이동 %가 아니라 증거금 대비 목표</div>
              <div>강한 반대 존이 가까우면 목표가 축소(구조 우선)</div>
            </div>

            <div className={styles.tradeWindowSectionTitle}>대기(WAIT)가 뜨는 대표 이유</div>
            <div className={styles.tradeWindowCard}>
              <div>Setup 없음 · 점수 미달 · 비용(수수료) 대비 공간 부족 · RR 부족</div>
              <div>롱/숏 충돌 · 전략 DISABLED · 데이터/분봉 비대상 · 청산 직후 쿨다운</div>
            </div>

            <div className={styles.tradeDeskFoot}>
              투자 권유 아님 · 승률·수익 확정 표시 없음 · 설명 탭은 동작 안내만
            </div>
            <div className={styles.tradeWindowRow}>
              <button type="button" className="tool-chip tool-chip-button" onClick={() => setTab('pos')}>
                포지션에서 단계 보기
              </button>
              <button type="button" className="tool-chip tool-chip-button" onClick={() => setTab('scalp')}>
                초단 상태 보기
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '7px 9px',
  borderRadius: 8,
  border: '1px solid rgba(255,255,255,0.18)',
  background: 'rgba(0,0,0,0.35)',
  color: 'inherit',
  fontSize: 13,
};
