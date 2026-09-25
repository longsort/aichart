/**
 * 가상매매 · 실전매매 공통 진입 실행.
 * 분석(스캔·신호)은 동일 · 버튼(모드)만 주문 경로가 갈라짐.
 * 확정 수익·승률 아님.
 */
import type { MergedDeskAutoTradeConfig } from '@/lib/mergedDeskAutoTradeConfig';
import { isAutoTradeSymbolEnabled, FAST_TP1_ROE_PCT, FAST_SL_ROE_PCT } from '@/lib/mergedDeskAutoTradeConfig';
import { maybeLiveOpen } from '@/lib/mergedDeskAutoTradeRunner';
import { signalScoreSoftGate } from '@/lib/mergedDeskSignalScorecard';
import { symbolLossCooldownGate } from '@/lib/mergedDeskSymbolLossGuard';
import {
  isTfSkippedByProfile,
  isFailBandBlocked,
  normalizeCoinKey,
} from '@/lib/mergedDeskCoinExitProfile';
import { aiZoneEntryGate } from '@/lib/mergedDeskAiZoneEntryGate';
import { extremeEntryGate } from '@/lib/mergedDeskExtremeEntryGate';
import { aiZoneDualEstimateWait } from '@/lib/mergedDeskAiZoneDualWait';
import { readAiZoneEntrySnapshot } from '@/lib/mergedDeskAiZoneSnapshot';
import {
  buildRegimeKey,
  consecutiveEntryGate,
  noteConsecutiveEntry,
} from '@/lib/mergedDeskConsecutiveEntryGuard';
import {
  lateEntryGate,
  resolveReinforcedEntrySlTp,
  fastTpSlDistanceGate,
} from '@/lib/mergedDeskEntryRedesign';
import { roeTargetPrice } from '@/lib/mergedDeskAutoScalpEngine';
import {
  normalizeTapointTf,
  resolveTapointEntryTf,
} from '@/lib/eagle1Tapoint/symbolEntryTf';
import { resolveTapointSlRoePct } from '@/lib/eagle1Tapoint/slRoeByTf';
import { resolveCoinSkillRiskForSymbol } from '@/lib/mergedDeskCoinSkillRisk';
import { resolveStructureAwareLevSlTp } from '@/lib/mergedDeskLiveSlTp';
import { assertDirectionSlTp } from '@/lib/mergedDeskDirectionSlGuard';
import {
  openVirtualPosition,
  readVirtualTradeSession,
  type VirtualEntrySource,
} from '@/lib/mergedDeskVirtualTradeSession';
import {
  btcUltraExecHintKo,
  evaluateBtcUltraScalpConfluence,
  resolveBtcUltraLeverage,
} from '@/lib/mergedDeskBtcUltraScalpPack';
import { resolveWick15mLeverage } from '@/lib/mergedDeskWick15mTrade';
import { QUICK_SCALP_ENGINE_ID } from '@/lib/eagle1Tapoint/quickScalpAutoEngine';
import { SNIPER_SCALP_ENGINE_ID } from '@/lib/eagle1Tapoint/sniperScalpAutoEngine';
import { AI_AUTOPILOT_ENGINE_ID } from '@/lib/eagle1Tapoint/aiAutopilotRiskGovernor';

export type UnifiedTradeMode = 'virtual' | 'live';

/** liveArmed → 실전 우선(단일모드 호환). 병행은 resolveUnifiedTradeModes 사용. */
export function resolveUnifiedTradeMode(
  cfg: Pick<MergedDeskAutoTradeConfig, 'enabled' | 'liveArmed'>,
  virtActive?: boolean
): UnifiedTradeMode | null {
  const modes = resolveUnifiedTradeModes(cfg, virtActive);
  if (modes.includes('live')) return 'live';
  if (modes.includes('virtual')) return 'virtual';
  return null;
}

/**
 * 실전 ARM + 가상세션 동시 ON 이면 둘 다.
 * 실전만 / 가상만 / 없음.
 */
export function resolveUnifiedTradeModes(
  cfg: Pick<MergedDeskAutoTradeConfig, 'enabled' | 'liveArmed'>,
  virtActive?: boolean
): UnifiedTradeMode[] {
  const active =
    typeof virtActive === 'boolean' ? virtActive : readVirtualTradeSession().active;
  const out: UnifiedTradeMode[] = [];
  if (cfg.liveArmed) out.push('live');
  if (active) out.push('virtual');
  return out;
}

export function mapAnalysisSourceToLiveOrder(
  source: string
): 'scalp' | 'doksuri1' {
  return source === 'doksuri1' ? 'doksuri1' : 'scalp';
}

export type UnifiedEntryParams = {
  mode: UnifiedTradeMode;
  symbol: string;
  timeframe: string;
  direction: 'LONG' | 'SHORT';
  price: number;
  sl?: number | null;
  tp?: number | null;
  source: VirtualEntrySource | string;
  signalKo: string;
  cfg: MergedDeskAutoTradeConfig;
  liveMark?: number | null;
  signalId?: string;
  availableUsdt?: number | null;
  fourStrategyId?: string | null;
  fourSupporting?: string[] | null;
  entryScore?: number | null;
  analysisTags?: string[] | null;
  /** 세판정 — 스탑헌팅 거리에 맞춘 레버. 코인 설정은 상한 */
  leverageFit?: number | null;
  /** AIZONE 주도 등 호출측 근거 문구 */
  evidenceKo?: string | null;
  /** 극단 게이트용 캔들 (없으면 AIZONE 스냅 레인지 사용) */
  candles?: Array<{ high?: number; low?: number }> | null;
};

export type UnifiedEntryResult = {
  ok: boolean;
  msg: string;
  mode: UnifiedTradeMode;
  didLive?: boolean;
  size?: string;
  telegramOk?: boolean;
};

/**
 * 동일 신호 → 가상 openVirtual / 실전 maybeLiveOpen.
 * SL 필수 · enabledSymbols 칩 게이트.
 */
export async function executeUnifiedAnalysisEntry(
  params: UnifiedEntryParams
): Promise<UnifiedEntryResult> {
  const srcName = String(params.source || '');

  /** 플랜 진입가(E) 터치 자동진입 — 사용자 취소 */
  if (srcName === 'plan-touch') {
    return {
      ok: false,
      msg: '플랜진입가터치 자동진입 OFF · 차트 플랜 표시만 유지',
      mode: params.mode,
    };
  }

  /**
   * 타점엔진 전용 매매 (사용자 세팅).
   * Dual A/B/C·S급·AIZONE·PPL·로켓 등 구 자동주문 전부 OFF · 스캔/UI 유지.
   */
  if (srcName !== 'eagle1-tap-engine') {
    return {
      ok: false,
      msg: `타점엔진 전용 · ${srcName || 'unknown'} 자동주문 OFF`,
      mode: params.mode,
    };
  }

  const tags = params.analysisTags || [];
  const oldAuto =
    tags.includes(QUICK_SCALP_ENGINE_ID) ||
    tags.includes(SNIPER_SCALP_ENGINE_ID) ||
    tags.includes(AI_AUTOPILOT_ENGINE_ID) ||
    tags.includes('triple-align');
  const band15 =
    tags.includes('INST_BAND_15M_PAPER') ||
    tags.includes('band15Auto') ||
    tags.includes('BAND15_AUTO');
  if (oldAuto) {
    return {
      ok: false,
      msg: '15분밴드자동만 · 구 QS/SNIPER/오토/세판정 자동주문 금지',
      mode: params.mode,
    };
  }
  if (!band15) {
    return {
      ok: false,
      msg: '15분밴드자동(BAND15_AUTO)만 주문 레인 · 구신호 자동주문 금지',
      mode: params.mode,
    };
  }
  if (params.mode === 'live') {
    return {
      ok: false,
      msg: '15분밴드자동 LIVE 금지 · Paper만',
      mode: params.mode,
    };
  }

  const needTf = resolveTapointEntryTf(params.symbol);
  const gotTf = normalizeTapointTf(params.timeframe);
  if (gotTf !== normalizeTapointTf(needTf)) {
    return {
      ok: false,
      msg: `타점 TF ${needTf}만 · 지금 ${params.timeframe || '?'} 스킵`,
      mode: params.mode,
    };
  }

  /** 아래 구 경로 블록은 도달하지 않음(타점만 통과) — 호환용 유지 */
  if (false as boolean) {
  /**
   * 구 자동주문 경로 차단 (삭제 아님 · 스캔/API 유지).
   * 주문 허용: AIZONE(ai-zone) · Lane Fast(rb-scalp) · BTC신호B(btc-rocket-cart).
   */
  /**
   * 구자동주문 OFF 예외 — Dual·AIZONE·BNB PPL만.
   */
  if (
    srcName !== 'ai-zone' &&
    srcName !== 'rb-scalp' &&
    srcName !== 'btc-rocket-cart' &&
    srcName !== 'structure-s' &&
    srcName !== 'bnb-ppl-candle' &&
    srcName !== 'eagle1-tap-engine'
  ) {
    return {
      ok: false,
      msg: `구자동주문 OFF · ${srcName || 'unknown'} 차단 · AIZONE·초단Fast·신호B·S급·BNB PPL·타점엔진만`,
      mode: params.mode,
    };
  }
  }

  /** 코인 전용 스캔이 이미 자리·AI를 검증한 경로 */
  const structuralSrc =
    srcName === 'dump-zone' ||
    srcName === 'dump-confirm' ||
    srcName === 'sfp-signal' ||
    srcName === 'structure-rocket' ||
    srcName === 'wick-15m' ||
    srcName === 'dump-watch-wick' ||
    srcName === 'htf-dump-touch' ||
    srcName === 'four-strategy' ||
    srcName === 'ai-zone' ||
    srcName === 'rb-scalp' ||
    srcName === 'btc-rocket-cart' ||
    srcName === 'structure-s' ||
    srcName === 'bnb-ppl-candle' ||
    srcName === 'eagle1-tap-engine';
  const qsLock =
    (params.analysisTags || []).includes(QUICK_SCALP_ENGINE_ID) ||
    (params.analysisTags || []).includes(SNIPER_SCALP_ENGINE_ID) ||
    (params.analysisTags || []).includes(AI_AUTOPILOT_ENGINE_ID);

  /** 15m 꼬리+추정 — 전 코인 공통 추가 경로 (기존 코인별 경로 유지) */
  const isWick15 = srcName === 'wick-15m';
  const isDumpWatchWick = srcName === 'dump-watch-wick';
  const isHtfDumpTouch = srcName === 'htf-dump-touch';
  const isDumpConfirm = srcName === 'dump-confirm';
  /** BPR 재터치 자동진입 OFF */
  if (srcName === 'bpr-retest') {
    return {
      ok: false,
      msg: 'BPR재터치 자동진입 OFF',
      mode: params.mode,
    };
  }
  /** Dual 신호B — 3m만 · Dual 4코인 */
  if (srcName === 'btc-rocket-cart') {
    const tf = String(params.timeframe || '').toLowerCase();
    if (tf !== '3m') {
      return {
        ok: false,
        msg: `신호B는 3m만 · ${params.timeframe || '?'} 스킵`,
        mode: params.mode,
      };
    }
    const u = String(params.symbol || '').toUpperCase();
    if (
      !(
        u.startsWith('BTC') ||
        u.startsWith('ETH') ||
        u.startsWith('SOL') ||
        u.startsWith('XRP')
      )
    ) {
      return {
        ok: false,
        msg: '신호B는 BTC·ETH·SOL·XRP만',
        mode: params.mode,
      };
    }
  }
  /** 신호C S급 — 15m · Dual 4코인 */
  if (srcName === 'structure-s') {
    const tf = String(params.timeframe || '').toLowerCase();
    if (tf !== '15m') {
      return {
        ok: false,
        msg: `신호C S급은 15m만 · ${params.timeframe || '?'} 스킵`,
        mode: params.mode,
      };
    }
    const u = String(params.symbol || '').toUpperCase();
    if (
      !(
        u.startsWith('BTC') ||
        u.startsWith('ETH') ||
        u.startsWith('SOL') ||
        u.startsWith('XRP')
      )
    ) {
      return {
        ok: false,
        msg: '신호C S급은 BTC·ETH·SOL·XRP만',
        mode: params.mode,
      };
    }
  }
  if (isWick15 || isDumpWatchWick) {
    const tf = String(params.timeframe || '').toLowerCase();
    if (tf !== '15m') {
      return {
        ok: false,
        msg: `${isDumpWatchWick ? '폭락감시윗꼬리' : '15m꼬리'} 신호는 15m만 · ${params.timeframe || '?'} 스킵`,
        mode: params.mode,
      };
    }
  }
  if (isHtfDumpTouch) {
    const tf = String(params.timeframe || '');
    const n = tf.toLowerCase();
    const ok =
      n === '1h' || n === '4h' || n === '1d' || n === '1w' || tf === '1M';
    if (!ok) {
      return {
        ok: false,
        msg: `HTF폭락존터치는 1h·4h·1d·1w·1M만 · ${params.timeframe || '?'} 스킵`,
        mode: params.mode,
      };
    }
  }
  if (isDumpConfirm) {
    const tf = String(params.timeframe || '').toLowerCase();
    if (tf !== '3m' && tf !== '5m' && tf !== '15m') {
      return {
        ok: false,
        msg: `폭락확정 진입은 3m·5m·15m만 · ${params.timeframe || '?'} 스킵`,
        mode: params.mode,
      };
    }
  }

  /** BTC: 타점엔진만 (구 Dual/AIZONE 자동주문 OFF) */
  const symU = String(params.symbol || '').toUpperCase();
  if (
    (symU === 'BTCUSDT' || symU === 'BTC') &&
    srcName !== 'eagle1-tap-engine'
  ) {
    return {
      ok: false,
      msg: 'BTC 타점엔진 전용 · 구자동주문 OFF',
      mode: params.mode,
    };
  }
  if (isDumpConfirm && !(symU === 'BTCUSDT' || symU === 'BTC')) {
    return {
      ok: false,
      msg: '폭락확정 진입은 BTC만 · 다른 코인 스킵',
      mode: params.mode,
    };
  }
  if (
    (symU === 'ETHUSDT' || symU === 'ETH') &&
    srcName !== 'eagle1-tap-engine'
  ) {
    return {
      ok: false,
      msg: 'ETH 타점엔진 전용 · 구자동주문 OFF',
      mode: params.mode,
    };
  }
  if (symU === 'ETHUSDT' || symU === 'ETH' || String(params.symbol || '').toUpperCase().startsWith('ETH')) {
    const tags = params.analysisTags || [];
    const ap =
      tags.includes(AI_AUTOPILOT_ENGINE_ID) || tags.includes(SNIPER_SCALP_ENGINE_ID);
    if (!ap) {
      return {
        ok: false,
        msg: 'ETH 기존세판정·캔들·폭락 자동주문 중단 · 오토파일럿만',
        mode: params.mode,
      };
    }
  }
  if (
    (symU === 'BNBUSDT' || symU === 'BNB') &&
    srcName !== 'eagle1-tap-engine'
  ) {
    return {
      ok: false,
      msg: 'BNB 타점엔진 전용 · 구자동주문 OFF',
      mode: params.mode,
    };
  }
  if (
    (symU === 'XRPUSDT' || symU === 'XRP') &&
    srcName !== 'eagle1-tap-engine'
  ) {
    return {
      ok: false,
      msg: 'XRP 타점엔진 전용 · 구자동주문 OFF',
      mode: params.mode,
    };
  }
  if (
    (symU === 'SOLUSDT' || symU === 'SOL') &&
    srcName !== 'eagle1-tap-engine'
  ) {
    return {
      ok: false,
      msg: 'SOL 타점엔진 전용 · 구자동주문 OFF',
      mode: params.mode,
    };
  }
  if (!isAutoTradeSymbolEnabled(params.cfg, params.symbol)) {
    return {
      ok: false,
      msg: `${params.symbol} 칩 OFF · 자동매매 스킵`,
      mode: params.mode,
    };
  }
  const sl = params.sl != null ? Number(params.sl) : NaN;
  if (!(sl > 0)) {
    return {
      ok: false,
      msg: '손절(SL) 없음 · 진입 거부 (존/플랜 SL 필수)',
      mode: params.mode,
    };
  }
  if (params.direction === 'LONG' && !(sl < params.price)) {
    return { ok: false, msg: '롱 SL이 진입가 이상 · 거부', mode: params.mode };
  }
  if (params.direction === 'SHORT' && !(sl > params.price)) {
    return { ok: false, msg: '숏 SL이 진입가 이하 · 거부', mode: params.mode };
  }
  const dirGuard = assertDirectionSlTp({
    direction: params.direction,
    entry: params.price,
    sl,
    tp: params.tp != null ? Number(params.tp) : null,
  });
  if (!dirGuard.ok) {
    return { ok: false, msg: dirGuard.reasonKo, mode: params.mode };
  }

  /**
   * 통계 프로파일 열위 TF 스킵 —
   * 폭락존·15m꼬리·SFP·로켓·4패턴은 전용 스캔 TF를 쓰므로 프로파일 skip으로 막지 않음.
   */
  if (
    !structuralSrc &&
    isTfSkippedByProfile(params.symbol, params.timeframe)
  ) {
    return {
      ok: false,
      msg: `${params.timeframe} 통계열위 TF · 스킵 (프로파일)`,
      mode: params.mode,
    };
  }

  /** 통계 손절 다발 캔들·가격구간 배제 */
  const failBand = isFailBandBlocked(
    params.symbol,
    params.timeframe,
    params.direction,
    params.price
  );
  if (failBand.blocked) {
    return { ok: false, msg: failBand.reasonKo, mode: params.mode };
  }

  const src = (params.source || 'scalp-fire') as VirtualEntrySource;
  const mark =
    params.liveMark != null && params.liveMark > 0
      ? params.liveMark
      : params.price;

  /** AIZONE · 매도/매수면 · 추정% (롱·숏 대칭 · 전코인) */
  const aiSnap = readAiZoneEntrySnapshot(params.symbol);
  const dualWait = aiZoneDualEstimateWait({
    price: mark,
    leverage: params.cfg.leverage || 40,
    direction: params.direction,
    snap: aiSnap,
    longPct: aiSnap?.longPct,
    shortPct: aiSnap?.shortPct,
  });
  if (dualWait.wait && !qsLock) {
    return { ok: false, msg: dualWait.reasonKo, mode: params.mode };
  }

  const aiGate = aiZoneEntryGate({
    symbol: params.symbol,
    direction: params.direction,
    price: mark,
    leverage: params.cfg.leverage || 30,
    snap: aiSnap,
  });
  if (!aiGate.allow) {
    /**
     * 전용 스캔이 이미 AI≥70/존을 통과한 경우,
     * 차트 TF 스냅(예: BTC 15m 롱17%)으로 재차단하지 않음.
     * 추격면·양쪽추정 WAIT는 계속 막음.
     */
    const dualBlocked = /양쪽추정|상하방짧음|롱방 |숏방 /.test(aiGate.reasonKo);
    const evidenceBlocked = /근거충돌|근거부족|역행 · 차단/.test(aiGate.reasonKo);
    const pctOnly =
      /추정\s*\d/.test(aiGate.reasonKo) &&
      !/추격|매도면.*롱|매수면.*숏|양쪽추정|WAIT|근거충돌|근거부족/.test(aiGate.reasonKo);
    if (!qsLock && (evidenceBlocked || dualBlocked || !(structuralSrc && pctOnly))) {
      return { ok: false, msg: aiGate.reasonKo, mode: params.mode };
    }
  }

  /** 중간 횡보·EMA 뭉침 스킵 · 스윙고/저·면·존 가장자리만 */
  const extreme = extremeEntryGate({
    symbol: params.symbol,
    direction: params.direction,
    price: mark,
    snap: aiGate.snap,
    candles: params.candles ?? null,
  });
  if (!extreme.allow) {
    const snapMissing = /극단데이터없음/.test(extreme.reasonKo);
    /** 로켓은 로켓 방향 진입 · 극단/재터치로 막지 않음 */
    const rocketBypass = srcName === 'structure-rocket';
    if (!(rocketBypass || qsLock || (structuralSrc && snapMissing))) {
      return { ok: false, msg: extreme.reasonKo, mode: params.mode };
    }
  }

  const regimeKey = buildRegimeKey({
    direction: params.direction,
    sellMid: aiGate.snap?.sellFace?.mid,
    buyMid: aiGate.snap?.buyFace?.mid,
    timeframe: params.timeframe,
  });
  const consec = consecutiveEntryGate({
    symbol: params.symbol,
    direction: params.direction,
    regimeKey,
  });
  if (!consec.allow) {
    return { ok: false, msg: consec.reasonKo, mode: params.mode };
  }

  /** 손절 많은 신호는 표본 충분할 때만 일시 대기(손실 축소). 기능 삭제는 아님. */
  const soft = signalScoreSoftGate({
    source: params.source,
    signalKo: params.signalKo,
    timeframe: params.timeframe,
    fourStrategyId: params.fourStrategyId,
    analysisTags: params.analysisTags,
  });
  if (!soft.allow) {
    return { ok: false, msg: soft.reasonKo, mode: params.mode };
  }

  const symGuard = symbolLossCooldownGate(params.symbol);
  if (!symGuard.allow) {
    return { ok: false, msg: symGuard.reasonKo, mode: params.mode };
  }

  let sizeMult = Math.min(
    1,
    Math.max(0.25, (soft.sizeMult > 0 ? soft.sizeMult : 1) * (symGuard.sizeMult || 1))
  );

  const late = lateEntryGate({
    symbol: params.symbol,
    direction: params.direction,
    signalPrice: params.price,
    markPrice: mark,
  });
  if (!late.allow && !qsLock) {
    return { ok: false, msg: late.reasonKo, mode: params.mode };
  }

  const preserveStructureSl =
    src === 'scalp-fire' ||
    src === 'structure-rocket' ||
    src === 'dump-zone' ||
    src === 'sfp-signal' ||
    src === 'four-strategy' ||
    src === 'wick-15m' ||
    src === 'dump-watch-wick' ||
    src === 'htf-dump-touch' ||
    src === 'dump-confirm' ||
    src === 'rb-scalp' ||
    src === 'btc-rocket-cart' ||
    src === 'structure-s' ||
    src === 'bnb-ppl-candle' ||
    src === 'eagle1-tap-engine';

  const coinKey = normalizeCoinKey(params.symbol);
  const isBtc = symU === 'BTCUSDT' || symU === 'BTC' || coinKey === 'BTC';
  const isWick15Src = src === 'wick-15m';
  const isDumpWatchWickSrc = src === 'dump-watch-wick';
  const isHtfDumpTouchSrc = src === 'htf-dump-touch';
  /** Dual 레이스(신호A·B·C) — 구조SL + 레버 조정 */
  const isDualRaceSrc =
    src === 'rb-scalp' || src === 'btc-rocket-cart' || src === 'structure-s';
  /**
   * 레버:
   * - BTC/알트 Dual·초단 → 비중창 레버(사용자 설정)를 상한으로 구조SL에 맞게 하향
   * - Dual 레이스 → 구조SL 거리에 맞춰 하향 (사용자 레버 초과 금지)
   */
  let levForExit = isBtc
    ? resolveBtcUltraLeverage(params.cfg.leverage)
    : resolveWick15mLeverage(params.cfg.leverage);
  let userTp1Roe = params.cfg.scalpTp1RoePct || FAST_TP1_ROE_PCT;
  /** 타점엔진: 스킬창 코인별 레버·TP/SL · 없으면 코드기본 */
  let userSlRoe =
    src === 'eagle1-tap-engine'
      ? resolveTapointSlRoePct(params.timeframe)
      : params.cfg.scalpSlRoePct || FAST_SL_ROE_PCT;
  let skillEquityPct: number | null = null;
  if (src === 'eagle1-tap-engine') {
    const skill = resolveCoinSkillRiskForSymbol(params.symbol);
    levForExit = skill.leverage;
    userTp1Roe = skill.tp1RoePct;
    userSlRoe = skill.slRoePct > 0 ? skill.slRoePct : resolveTapointSlRoePct(params.timeframe);
    skillEquityPct = skill.equityPct;
    const fit = Number(params.leverageFit);
    if (
      ((params.analysisTags || []).includes('triple-align') || qsLock) &&
      fit > 0
    ) {
      levForExit = Math.max(1, Math.min(skill.leverage, Math.round(fit)));
    }
  }

  const rein = resolveReinforcedEntrySlTp({
    symbol: params.symbol,
    entry: mark,
    direction: params.direction,
    leverage: levForExit,
    signalSl: params.sl,
    tp1RoePct: userTp1Roe,
    slRoePct: userSlRoe,
    timeframe: params.timeframe,
    preserveStructureSl,
  });
  if (!rein.ok) {
    return { ok: false, msg: rein.reasonKo, mode: params.mode };
  }

  let entryTp: number;
  let entrySl: number;
  let structureLevKo = '';

  if (isDualRaceSrc && params.sl != null && Number(params.sl) > 0) {
    /**
     * Dual 레이스: 손절 = 신호 구조가(레일·로켓) · 레버 = ROE≤20% 맞게 조정.
     * 고정 ROE-20% 가격선으로 덮지 않음.
     */
    const tuned = resolveStructureAwareLevSlTp({
      entry: mark,
      direction: params.direction,
      signalSl: Number(params.sl),
      maxLev: levForExit,
      minLev: Math.min(5, levForExit),
      maxSlRoePct: userSlRoe,
      tp1RoePct: userTp1Roe,
    });
    if (!tuned.ok) {
      return { ok: false, msg: tuned.reasonKo, mode: params.mode };
    }
    levForExit = tuned.lev;
    entrySl = tuned.sl;
    entryTp = tuned.tp;
    structureLevKo = tuned.reasonKo;
    params = {
      ...params,
      analysisTags: [
        ...(Array.isArray(params.analysisTags) ? params.analysisTags : []),
        '구조SL',
        `${tuned.lev}x조정`,
        `SL≈${tuned.slRoePct.toFixed(1)}%ROE`,
        `TP${userTp1Roe}%ROE`,
      ],
    };
  } else {
    /**
     * 기타 소스: 손절·익절 = 사용자 비중/익절탭 ROE.
     * 세판정 진입은 밴드 구조 가격을 유지한다.
     */
    const tripleLock =
      (params.analysisTags || []).includes('triple-align') || qsLock;
    if (tripleLock && Number(params.sl) > 0 && Number(params.tp) > 0) {
      entrySl = Number(params.sl);
      entryTp = Number(params.tp);
      structureLevKo = qsLock
        ? (params.analysisTags || []).includes(SNIPER_SCALP_ENGINE_ID)
          ? 'SNIPER · TP1 전량 · 실행SL'
          : 'QUICK SCALP · TP1 전량 · 스윕극단 SL'
        : '세판정 · 밴드 밖 손절 · 반대밴드 익절';
    } else {
      const tpRoe = userTp1Roe / 100;
      const slRoe = userSlRoe / 100;
      entryTp = roeTargetPrice(mark, params.direction, levForExit, tpRoe);
      entrySl =
        params.direction === 'LONG'
          ? roeTargetPrice(mark, 'SHORT', levForExit, slRoe)
          : roeTargetPrice(mark, 'LONG', levForExit, slRoe);
    }
  }

  /** 8%ROE TP vs SL — 거리 게이트 (SL ROE 상한 21). QS는 가격% TP1 유지. */
  if (!qsLock) {
    const distGate = fastTpSlDistanceGate({
      entry: mark,
      direction: params.direction,
      sl: entrySl,
      tp: entryTp,
      leverage: levForExit,
      maxSlRoePct: userSlRoe + 1,
    });
    if (!distGate.allow) {
      return { ok: false, msg: distGate.reasonKo, mode: params.mode };
    }
  }

  /** BTC만 통합초단 합류팩 — 알트 꼬리는 별도 진입(여기 안 넣음) */
  if (isBtc && (src === 'structure-rocket' || src === 'wick-15m')) {
    const conf = evaluateBtcUltraScalpConfluence({
      direction: params.direction,
      entry: mark,
      sl: entrySl,
      trigger: src === 'wick-15m' ? 'wick-15m' : 'structure-rocket',
      snap: aiGate.snap,
      candles: params.candles ?? null,
      leverage: levForExit,
      longPct: aiGate.snap?.longPct,
      shortPct: aiGate.snap?.shortPct,
      volumeHeavy: aiGate.snap?.volumeHeavy,
    });
    if (!conf.allow) {
      return { ok: false, msg: conf.reasonKo, mode: params.mode };
    }
    /** 합류는 통과/거절만 · 증거금은 설정% 풀 (라이트합류 0.7 금지) */
    sizeMult = 1;
    /** 증거에 합류 요약 추가 */
    params = {
      ...params,
      signalKo: `${params.signalKo} · ${conf.reasonKo}`,
      entryScore: Math.max(Number(params.entryScore) || 0, conf.score * 20),
      analysisTags: [
        ...(Array.isArray(params.analysisTags) ? params.analysisTags : []),
        'btc-ultra',
        conf.tierKo,
        btcUltraExecHintKo(levForExit),
        `합류${conf.score}`,
        '비중풀',
      ],
    };
  } else if (isWick15Src && !isBtc) {
    /** 알트 15m꼬리 — 코인별 독립 · ≈40x · BTC합류 태그 없음 */
    const coinTag = coinKey ? `${coinKey.toLowerCase()}-wick` : 'alt-wick';
    params = {
      ...params,
      analysisTags: [
        ...(Array.isArray(params.analysisTags) ? params.analysisTags : []),
        coinTag,
        'wick-15m-solo',
        `${levForExit}x`,
        '추정≥70',
      ],
    };
  } else if (isDumpWatchWickSrc) {
    const coinTag = coinKey ? `${coinKey.toLowerCase()}-dwwick` : 'alt-dwwick';
    params = {
      ...params,
      analysisTags: [
        ...(Array.isArray(params.analysisTags) ? params.analysisTags : []),
        coinTag,
        'dump-watch-wick',
        `${levForExit}x`,
        '저항≥70',
        '매도량연속',
      ],
    };
  } else if (isHtfDumpTouchSrc) {
    const coinTag = coinKey ? `${coinKey.toLowerCase()}-htfdump` : 'alt-htfdump';
    params = {
      ...params,
      analysisTags: [
        ...(Array.isArray(params.analysisTags) ? params.analysisTags : []),
        coinTag,
        'htf-dump-touch',
        String(params.timeframe || ''),
        `${levForExit}x`,
      ],
    };
  }

  const evidenceParts = [
    params.signalKo,
    params.evidenceKo || null,
    params.fourStrategyId ? `4전략 ${params.fourStrategyId}` : null,
    ...(Array.isArray(params.analysisTags) ? params.analysisTags : []),
    params.entryScore != null && params.entryScore > 0
      ? `점수 ${Math.round(params.entryScore)}`
      : null,
    rein.reasonKo && !/스냅없음/.test(rein.reasonKo) ? rein.reasonKo : null,
    aiGate.reasonKo && !/스냅없음/.test(aiGate.reasonKo) ? aiGate.reasonKo : null,
    extreme.reasonKo && !/데이터없음/.test(extreme.reasonKo) ? extreme.reasonKo : null,
    isBtc && (src === 'structure-rocket' || isWick15Src)
      ? btcUltraExecHintKo(levForExit)
      : isDualRaceSrc
        ? structureLevKo || `Dual레이스 · ${levForExit}x · 구조SL · 확정아님`
        : isWick15Src
        ? `꼬리단독 · ${levForExit}x · 확정아님`
        : isDumpWatchWickSrc
          ? `폭락감시윗꼬리 · ${levForExit}x · 확정아님`
          : isHtfDumpTouchSrc
            ? `HTF폭락존터치 · ${params.timeframe} · ${levForExit}x · 확정아님`
            : null,
  ]
    .map((x) => (x != null ? String(x).trim() : ''))
    .filter(Boolean);
  const evidenceKo = Array.from(new Set(evidenceParts)).join(' · ');

  const cfgForOrder =
    src === 'eagle1-tap-engine'
      ? {
          ...params.cfg,
          leverage: levForExit,
          scalpTp1RoePct: userTp1Roe,
          scalpSlRoePct: userSlRoe,
          scalpEquityPct: skillEquityPct ?? params.cfg.scalpEquityPct,
          equityPct: skillEquityPct ?? params.cfg.equityPct,
          scalpExitMode: 'TP1_CUT' as const,
        }
      : isBtc || isDualRaceSrc || isWick15Src || isDumpWatchWickSrc || isHtfDumpTouchSrc
        ? {
            ...params.cfg,
            leverage: levForExit,
            scalpTp1RoePct: userTp1Roe,
            scalpSlRoePct: userSlRoe,
            scalpExitMode: 'TP1_CUT' as const,
          }
        : params.cfg;

  if (params.mode === 'virtual') {
    const r = openVirtualPosition({
      symbol: params.symbol,
      timeframe: params.timeframe,
      direction: params.direction,
      price: params.price,
      sl: entrySl,
      tp: entryTp,
      source: src,
      signalKo: params.signalKo,
      cfg: cfgForOrder,
      availableUsdt: params.availableUsdt,
      fourStrategyId: params.fourStrategyId,
      fourSupporting: params.fourSupporting,
      entryScore: params.entryScore,
      analysisTags: params.analysisTags,
      liveMark: mark,
      sizeMult,
      skipSlReinforce: true,
    });
    if (r.ok) {
      noteConsecutiveEntry({
        symbol: params.symbol,
        direction: params.direction,
        regimeKey,
      });
      /** 가상 진입 텔레그램 — 실패해도 진입 성공은 유지 */
      try {
        await fetch('/api/merged-desk/entry-telegram', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({
            symbol: params.symbol,
            direction: params.direction,
            price: mark,
            sl: entrySl,
            tp: entryTp,
            size: r.session.position?.sizeStr,
            marginUsdt: r.session.position?.marginUsdt,
            equityPct: r.session.position?.equityPct,
            leverage: r.session.position?.leverage ?? params.cfg.leverage,
            source: params.source,
            signalId: params.signalId ?? r.session.position?.id,
            mode: 'virtual',
            timeframe: params.timeframe,
            signalKo: params.signalKo,
            evidenceKo,
            noteKo: evidenceKo,
            fourStrategyId: params.fourStrategyId,
            analysisTags: params.analysisTags,
            entryScore: params.entryScore,
          }),
        });
      } catch {
        /* ignore tg */
      }
    }
    const msgExtra = [
      rein.widened ? rein.reasonKo : '',
      aiGate.reasonKo && !/스냅없음/.test(aiGate.reasonKo) ? aiGate.reasonKo : '',
    ]
      .filter(Boolean)
      .join(' · ');
    return {
      ok: r.ok,
      msg: r.ok ? `${r.msg}${msgExtra ? ` · ${msgExtra}` : ''}` : r.msg,
      mode: 'virtual',
    };
  }

  const liveSrc = mapAnalysisSourceToLiveOrder(String(params.source));
  if (liveSrc === 'scalp' && !params.cfg.strategyScalp) {
    return { ok: false, msg: '단타 전략 OFF · 실주문 스킵', mode: 'live' };
  }
  if (liveSrc === 'doksuri1' && !params.cfg.strategyDoksuri1) {
    return { ok: false, msg: '독수리 전략 OFF · 실주문 스킵', mode: 'live' };
  }

  const signalId =
    params.signalId ||
    `ua-${params.symbol}-${params.timeframe}-${params.direction}-${Math.round(mark)}-${Date.now()
      .toString(36)
      .slice(-4)}`;

  const r = await maybeLiveOpen({
    signalId,
    symbol: params.symbol,
    direction: params.direction,
    price: mark,
    sl: entrySl,
    tp: entryTp,
    source: liveSrc,
    cfg: cfgForOrder,
    timeframe: params.timeframe,
    signalKo: params.signalKo,
    evidenceKo,
    fourStrategyId: params.fourStrategyId,
    analysisTags: params.analysisTags,
    entryScore: params.entryScore,
    sizeMult,
    skipSlReinforce: true,
    analysisSource: String(params.source || ''),
  });
  if (r.didLive) {
    noteConsecutiveEntry({
      symbol: params.symbol,
      direction: params.direction,
      regimeKey,
    });
    /** 서버 TG 실패 시에만 클라 백업 — await로 전송 누락 방지 */
    if (r.telegramOk === false && typeof fetch !== 'undefined') {
      try {
        await fetch('/api/merged-desk/entry-telegram', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({
            symbol: params.symbol,
            direction: params.direction,
            price: mark,
            sl: entrySl,
            tp: entryTp,
            size: r.size,
            leverage: levForExit,
            source: params.source,
            signalId,
            mode: 'live',
            timeframe: params.timeframe,
            signalKo: params.signalKo,
            evidenceKo,
            noteKo: evidenceKo,
            fourStrategyId: params.fourStrategyId,
            analysisTags: params.analysisTags,
            entryScore: params.entryScore,
          }),
        });
      } catch {
        /* ignore tg */
      }
    }
  }
  const msgExtra = [
    rein.widened ? rein.reasonKo : '',
    aiGate.reasonKo && !/스냅없음/.test(aiGate.reasonKo) ? aiGate.reasonKo : '',
  ]
    .filter(Boolean)
    .join(' · ');
  return {
    ok: r.didLive,
    msg: r.didLive ? `${r.msg}${msgExtra ? ` · ${msgExtra}` : ''}` : r.msg,
    mode: 'live',
    didLive: r.didLive,
    size: r.size,
    telegramOk: r.telegramOk,
  };
}

export type UnifiedEntryMultiResult = {
  ok: boolean;
  msg: string;
  modes: UnifiedTradeMode[];
  results: UnifiedEntryResult[];
  didLive?: boolean;
};

/**
 * 실전·가상 병행 — 같은 신호를 모드별로 각각 실행.
 * signalId는 live/virtual 접미사로 분리 (실주문 중복차단과 가상 분리).
 */
export async function executeUnifiedAnalysisEntryMulti(
  params: Omit<UnifiedEntryParams, 'mode'> & {
    modes?: UnifiedTradeMode[];
    virtActive?: boolean;
  }
): Promise<UnifiedEntryMultiResult> {
  const modes =
    params.modes && params.modes.length
      ? params.modes
      : resolveUnifiedTradeModes(params.cfg, params.virtActive);
  if (!modes.length) {
    return {
      ok: false,
      msg: '실전 ARM 또는 가상매매 ON 필요',
      modes: [],
      results: [],
    };
  }
  const baseId = params.signalId || undefined;
  const results: UnifiedEntryResult[] = [];
  for (const mode of modes) {
    const sid =
      baseId != null
        ? `${baseId}:${mode}`
        : undefined;
    const r = await executeUnifiedAnalysisEntry({
      ...params,
      mode,
      signalId: sid,
      availableUsdt: mode === 'live' ? undefined : params.availableUsdt,
    });
    results.push(r);
  }
  const ok = results.some((r) => r.ok);
  const didLive = results.some((r) => r.didLive);
  const msg = results.map((r) => `${r.mode === 'live' ? '실전' : '가상'}:${r.msg}`).join(' · ');
  return { ok, msg, modes, results, didLive };
}
