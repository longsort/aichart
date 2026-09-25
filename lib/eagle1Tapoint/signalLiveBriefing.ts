/**
 * 우측 신호감지 생동 브리핑 — 게이지·상태 이모지.
 * 초록=롱 · 빨강=숏 · 회색=대기. 확정 승률 아님.
 */
import type { TapointDecisionReport } from './types';
import {
  SWEEP_CONSEC_SKILL_KO,
  SWEEP_CONSEC_SKILL_TAG,
} from '@/lib/eagle1Tapoint/sweepLiveSignalTap';
import { HTF_SWEEP_FILTER_SKILL_KO } from '@/lib/eagle1Tapoint/htfSweepFilter';
import {
  isExclusiveSkillOn,
  resolveExclusiveCoin,
  type CoinExclusiveSkillMap,
} from '@/lib/mergedDeskCoinExclusiveSkills';

export type SignalLiveTone = 'long' | 'short' | 'wait' | 'hot' | 'ok';

/** 게이지 옆 방향 뱃지 — 색만 보고 헷갈리지 않게 */
export type SignalLiveDirBadge = '롱' | '숏' | '대기' | '혼조' | '통과' | '차단' | '참고';

export type SignalLiveRow = {
  id: string;
  emoji: string;
  name: string;
  statusKo: string;
  /** 하얀 네모 자리 · 실시간 생동 브리핑 */
  briefKo: string;
  /** 게이지 색 의미 한 글자 */
  dirBadge: SignalLiveDirBadge;
  value: number;
  tone: SignalLiveTone;
  pulse: boolean;
};

/** 코인별 실시간 활동 → 자동진입 판정 */
export type SignalLiveAutoEntry = {
  ready: boolean;
  direction: 'LONG' | 'SHORT' | null;
  reasonKo: string;
  liveScore: number;
};

function clamp(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function dirWord(dir: 'LONG' | 'SHORT' | null | undefined): string {
  if (dir === 'LONG') return '롱';
  if (dir === 'SHORT') return '숏';
  return '대기';
}

/**
 * 실시간 활동 카드 기준 코인별 롱/숏 자동진입.
 * CONFIRMED + 치명게이트 없음 + 스윕합류(필수·3봉내연속스윕진입 가산) + 활동톤 정렬일 때만 ready.
 * soft 게이트(NO_CONTEXT 등)는 이미 CONFIRMED면 재차단하지 않음.
 * RSI·선진은 합류 신호(단독 진입 금지).
 */
function gateFatalBlockKo(gate: TapointDecisionReport['gate'] | undefined): string | null {
  if (!gate) return '게이트없음';
  if (gate.ok === true) return null;
  const fails = gate.failReasons || [];
  const fatalExact = new Set([
    'DATA_QUALITY_BAD',
    'EXEC_LEVELS_BAD',
    'CORR_CLUSTER_LIMIT',
  ]);
  for (const r of fails) {
    if (fatalExact.has(r)) return r;
  }
  return null;
}

export function resolveSignalLiveAutoEntry(
  report: TapointDecisionReport | null | undefined,
  opts?: { exclusiveMap?: CoinExclusiveSkillMap | null }
): SignalLiveAutoEntry {
  if (!report) {
    return { ready: false, direction: null, reasonKo: '신호없음', liveScore: 0 };
  }
  const dec = report.decision;
  const dir =
    dec === 'CONFIRMED_LONG'
      ? ('LONG' as const)
      : dec === 'CONFIRMED_SHORT'
        ? ('SHORT' as const)
        : dec === 'ARMED_LONG'
          ? ('LONG' as const)
          : dec === 'ARMED_SHORT'
            ? ('SHORT' as const)
            : null;
  if (!dir) {
    return {
      ready: false,
      direction: report.direction,
      reasonKo: `대기 · ${report.rejectReasonKo || report.decision || 'WAIT'}`,
      liveScore: clamp(report.scores?.entry ?? 0),
    };
  }
  const fatal = gateFatalBlockKo(report.gate);
  if (fatal) {
    return {
      ready: false,
      direction: dir,
      reasonKo: `게이트치명 · ${fatal}`,
      liveScore: clamp(report.scores?.entry ?? 0),
    };
  }
  if (!report.signalId || report.entry == null || report.sl == null) {
    return {
      ready: false,
      direction: dir,
      reasonKo: '진입선 부족',
      liveScore: clamp(report.scores?.entry ?? 0),
    };
  }

  const sw = report.sweepLive;
  const sweepOk =
    Boolean(sw?.direction === dir && sw.alignsWithDir) &&
    Boolean(sw?.fired || sw?.consecutive2 || (sw?.reclaimed && (sw.ageBars ?? 99) <= 8));
  if (!sweepOk) {
    const flowOk = (report.scores?.flow ?? 0) >= 62 || report.flowSnap?.alignsWithDir === true;
    const burstOk = report.volRoeBurst?.fired === true && report.volRoeBurst.direction === dir;
    const bandOk = report.instBandPlan?.actionable === true && report.instBandPlan.direction === dir;
    if (!(flowOk && (burstOk || bandOk))) {
      return {
        ready: false,
        direction: dir,
        reasonKo: sw?.noteKo
          ? `스윕합류부족 · ${sw.noteKo}`
          : '스윕합류부족 · 스윕/밴드반응/수급 중 필요',
        liveScore: clamp(((report.scores?.entry ?? 0) + (sw?.score ?? 20)) / 2),
      };
    }
  }

  /** 상위스윕필터 스킬 ON이면 역행 시 자동진입 차단 */
  const coin = resolveExclusiveCoin(report.symbol);
  const htfFilterOn = isExclusiveSkillOn(coin, 'htfSweepFilter', opts?.exclusiveMap);
  if (htfFilterOn && report.htfSweep?.conflict) {
    return {
      ready: false,
      direction: dir,
      reasonKo: `상위스윕필터 · ${report.htfSweep.noteKo || '역행'}`,
      liveScore: clamp(
        ((report.scores?.entry ?? 0) + (sw?.score ?? 20) + (report.htfSweep.scoreBoost || 0)) /
          2
      ),
    };
  }

  const rows = buildTapointSignalLiveRowsCore(report);
  const align = rows.filter(
    (r) =>
      r.id !== 'decision' &&
      r.id !== 'coinAuto' &&
      r.id !== 'sweepLive' &&
      r.id !== 'htfSweep' &&
      ((dir === 'LONG' && r.tone === 'long') || (dir === 'SHORT' && r.tone === 'short')) &&
      r.value >= 55
  );
  const alignAvg =
    align.length > 0 ? align.reduce((s, r) => s + r.value, 0) / align.length : 40;
  const consecBoost = sw?.consecutive2 ? 8 : 0;
  const liveScore = clamp(
    (report.scores.entry + report.scores.flow + alignAvg + (sw?.score || 0)) / 2.6 +
      consecBoost
  );

  /** 연속스윕·밴드READY면 활동 0개여도 타점점수 통과 */
  const bandReady = report.instBandPlan?.actionable === true && report.instBandPlan.direction === dir;
  const alignNeed = sw?.consecutive2 || bandReady ? 0 : 1;
  const entryFloor = sw?.consecutive2 || bandReady ? 55 : 64;
  if (align.length < alignNeed && report.scores.entry < entryFloor) {
    return {
      ready: false,
      direction: dir,
      reasonKo: '실시간활동 합류부족',
      liveScore,
    };
  }

  return {
    ready: true,
    direction: dir,
    reasonKo: `${dir === 'LONG' ? '롱' : '숏'} 자동진입 · 스윕합류${
      sw?.consecutive2 ? `·${SWEEP_CONSEC_SKILL_KO}` : ''
    }+활동 ${align.length}`,
    liveScore,
  };
}

/** 진입·TG용 — 3봉내연속스윕이면 스킬명·태그 붙임 */
export function sweepConsecSkillMeta(report: TapointDecisionReport): {
  skillKo: string | null;
  tag: string | null;
  consecutive: boolean;
} {
  const consecutive = report.sweepLive?.consecutive2 === true;
  return {
    consecutive,
    skillKo: consecutive ? SWEEP_CONSEC_SKILL_KO : null,
    tag: consecutive ? SWEEP_CONSEC_SKILL_TAG : null,
  };
}

function buildTapointSignalLiveRowsCore(report: TapointDecisionReport): SignalLiveRow[] {
  const vb = report.volRoeBurst;
  const av = report.sharedMerged?.advVolume;
  const face = report.sharedMerged?.dailyFace;
  const gateOk = report.gate?.ok === true;
  const ex = report.extreme;
  const sw = report.sweepLive;
  const dec = String(report.decision || 'WAIT');
  const dir = report.direction;
  const dw = dirWord(dir);

  const burstFired = vb?.fired === true;
  const burstVal = burstFired
    ? clamp(55 + Math.min(40, (Number(vb?.rvol) || 3) * 8))
    : clamp(12 + Math.min(40, (Number(vb?.rvol) || 0) * 10));

  let advTone: SignalLiveTone = 'wait';
  let advEmoji = '📊';
  let advStatus = av?.actionKo || '관망';
  let advVal = 40;
  let advBadge: SignalLiveDirBadge = '대기';
  let advBrief = '선진거래량 관망 · 롱·숏 힌트 없음';
  if (av?.action === 'long-ref') {
    advTone = 'long';
    advEmoji = '🟢';
    advVal = av.notable ? 88 : 70;
    advStatus = av.actionKo || '롱참고';
    advBadge = '롱';
    advBrief = av.notable
      ? '선진↑ · 초록 게이지=롱 쪽 수급 · 롱 합류 가산'
      : '선진 롱참고 · 초록=롱 편향 · 확정은 타점·게이트 필요';
  } else if (av?.action === 'short-ref') {
    advTone = 'short';
    advEmoji = '🔴';
    advVal = av.notable ? 88 : 70;
    advStatus = av.actionKo || '숏참고';
    advBadge = '숏';
    advBrief = av.notable
      ? '선진↓ · 빨강 게이지=숏 쪽 수급 · 숏 합류 가산'
      : '선진 숏참고 · 빨강=숏 편향 · 확정은 타점·게이트 필요';
  } else if (av?.notable) {
    advTone = 'hot';
    advEmoji = '⚡';
    advVal = 62;
    advBadge = '참고';
    advBrief = '선진 주목 · 방향 미정(노랑) · 관망 유지';
  }

  let faceTone: SignalLiveTone = 'wait';
  let faceEmoji = '🌓';
  let faceVal = 45;
  let faceBadge: SignalLiveDirBadge = '대기';
  let faceBrief = '일봉면 데이터 대기';
  if (face?.bias === 'up') {
    faceTone = 'long';
    faceEmoji = '📈';
    faceVal = 78;
    faceBadge = '롱';
    faceBrief = '일봉면 상승 · 초록=롱 우세 · 숏이면 역행주의';
  } else if (face?.bias === 'down') {
    faceTone = 'short';
    faceEmoji = '📉';
    faceVal = 78;
    faceBadge = '숏';
    faceBrief = '일봉면 하락 · 빨강=숏 우세 · 롱이면 역행주의';
  } else if (face) {
    faceEmoji = '➖';
    faceVal = 50;
    faceBadge = '혼조';
    faceBrief = '일봉면 혼조 · 회색=방향없음 · 단독진입 금지';
  }

  const gateFail = (report.gate?.failReasons || []).slice(0, 1).join('') || '대기';
  const eventHot = Boolean(ex?.kind && ex.kind !== 'NONE');

  let decTone: SignalLiveTone = 'wait';
  let decEmoji = '⏸';
  let decBadge: SignalLiveDirBadge = '대기';
  let decBrief = '타점 대기 · 회색 게이지=아직 롱·숏 확정 아님';
  let decStatus = '대기';
  if (dec === 'CONFIRMED_LONG') {
    decTone = 'long';
    decEmoji = '🚀';
    decBadge = '롱';
    decStatus = '확정롱';
    decBrief = `확정롱 · 초록↑=롱 신호 강도 ${clamp(report.scores?.entry ?? 0)} · 게이트·활동합류 되면 롱진입`;
  } else if (dec === 'CONFIRMED_SHORT') {
    decTone = 'short';
    decEmoji = '💥';
    decBadge = '숏';
    decStatus = '확정숏';
    decBrief = `확정숏 · 빨강↑=숏 신호 강도 ${clamp(report.scores?.entry ?? 0)} · 게이트·활동합류 되면 숏진입`;
  } else if (dec === 'ARMED_LONG') {
    decTone = 'long';
    decEmoji = '🧭';
    decBadge = '롱';
    decStatus = '무장롱';
    decBrief = '무장롱 · 초록=롱 준비 · 아직 주문 안 함(타점 대기)';
  } else if (dec === 'ARMED_SHORT') {
    decTone = 'short';
    decEmoji = '🧭';
    decBadge = '숏';
    decStatus = '무장숏';
    decBrief = '무장숏 · 빨강=숏 준비 · 아직 주문 안 함(타점 대기)';
  }

  const histN = report.historical?.n ?? 0;
  const histSim = report.historical?.similarity;

  const passN = report.gate?.passTags?.length || 0;
  const gateVal = gateOk ? 92 : clamp(12 + passN * 6);
  /**
   * 헷갈림 최소화:
   * - 뱃지(원)=항상 롱/숏 (통과·차단 아님)
   * - 상태글=「숏통과」「숏차단」처럼 방향+결과
   * - 색=롱초록·숏빨강 (차단이어도 후보방향 색 유지)
   */
  const gateDirKo =
    dir === 'LONG' ? '롱' : dir === 'SHORT' ? '숏' : null;
  let gateTone: SignalLiveTone = 'wait';
  let gateBadge: SignalLiveDirBadge = '대기';
  let gateEmoji = '🚧';
  let gateStatus = '대기 · 방향없음';
  let gateBrief =
    '필수게이트 · 아직 롱/숏 후보 없음 · 타점결정에 방향이 잡히면 여기 표시';
  if (gateDirKo && dir) {
    gateTone = dir === 'SHORT' ? 'short' : 'long';
    gateBadge = gateDirKo;
    if (gateOk) {
      gateEmoji = dir === 'SHORT' ? '✅' : '✅';
      gateStatus = `${gateDirKo}통과`;
      gateBrief = `【${gateDirKo}】게이트 통과 · ${gateDirKo} 주문 허용 조건 OK · 태그 ${passN} · 스윕·활동 합류 후 ${gateDirKo}진입 가능`;
    } else {
      gateEmoji = '🚧';
      gateStatus = `${gateDirKo}차단`;
      gateBrief = `【${gateDirKo}】게이트 차단 · 이유 ${gateFail} · ${gateDirKo} 주문금지 · 다른태그 ${passN}개 통과해도 ${gateDirKo}진입 안 함`;
    }
  } else if (gateOk) {
    gateTone = 'ok';
    gateBadge = '통과';
    gateEmoji = '✅';
    gateStatus = '통과 · 방향미정';
    gateBrief = `게이트 조건은 통과 · 롱/숏 방향은 타점결정 확인 · 태그 ${passN}`;
  } else {
    gateBadge = '차단';
    gateStatus = `차단 · ${gateFail}`;
    gateBrief = `게이트 차단 · ${gateFail} · 롱/숏 미정 · 통과태그 ${passN}`;
  }

  let eventBrief = '이벤트 없음 · 회색=특수상황 미발화';
  let eventBadge: SignalLiveDirBadge = '대기';
  if (eventHot) {
    if (dir === 'SHORT') {
      eventBadge = '숏';
      eventBrief = `${ex?.kind} · 빨강=숏 이벤트 · ${ex?.noteKo?.slice(0, 22) || '숏 후보'}`;
    } else if (dir === 'LONG') {
      eventBadge = '롱';
      eventBrief = `${ex?.kind} · 초록=롱 이벤트 · ${ex?.noteKo?.slice(0, 22) || '롱 후보'}`;
    } else {
      eventBadge = '참고';
      eventBrief = `${ex?.kind} · 노랑=이벤트 주목 · 방향은 타점결정 따름`;
    }
  }

  const flowScore = report.scores?.flow ?? 0;
  const setupScore = report.scores?.setup ?? 0;
  const flowHot = flowScore >= 65;
  let flowTone: SignalLiveTone = 'wait';
  let flowBadge: SignalLiveDirBadge = '대기';
  let flowBrief = `흐름 ${flowScore}·셋업 ${setupScore} · 회색=아직 약함 · 합류대기`;
  if (flowHot && dir === 'SHORT') {
    flowTone = 'short';
    flowBadge = '숏';
    flowBrief = `흐름↑ ${flowScore} · 빨강=숏 쪽 흐름 합류 · 셋업 ${setupScore}`;
  } else if (flowHot && dir === 'LONG') {
    flowTone = 'long';
    flowBadge = '롱';
    flowBrief = `흐름↑ ${flowScore} · 초록=롱 쪽 흐름 합류 · 셋업 ${setupScore}`;
  }

  const sweepFired = sw?.fired === true;
  let sweepTone: SignalLiveTone = 'wait';
  let sweepBadge: SignalLiveDirBadge = '대기';
  let sweepEmoji = '🧹';
  if (sweepFired && sw?.direction === 'SHORT') {
    sweepTone = 'short';
    sweepBadge = '숏';
    sweepEmoji = '🔻';
  } else if (sweepFired && sw?.direction === 'LONG') {
    sweepTone = 'long';
    sweepBadge = '롱';
    sweepEmoji = '🔺';
  } else if (sw?.direction) {
    sweepBadge = '참고';
    sweepTone = 'hot';
  }

  /** 캔들·RSI·선진 — 합류 신호(단독 진입 금지) · 코인별 롱/숏 힌트 */
  const rsi = report.rsiDiv;
  const rsiV = rsi?.rsi != null ? Math.round(rsi.rsi) : null;
  let craTone: SignalLiveTone = 'wait';
  let craBadge: SignalLiveDirBadge = '대기';
  let craEmoji = '📐';
  let craStatus = '대기';
  let craVal = 35;
  let craBrief = '캔들·RSI·선진 합류 대기 · 단독진입금지';
  const advLong = av?.action === 'long-ref';
  const advShort = av?.action === 'short-ref';
  const rsiBull =
    rsi?.divergence === 'BULLISH' || (rsiV != null && rsiV <= 35 && rsi?.slopeKo === '상승');
  const rsiBear =
    rsi?.divergence === 'BEARISH' || (rsiV != null && rsiV >= 65 && rsi?.slopeKo === '하락');
  if (advLong && !rsi?.chaseWarn && (rsiBull || !rsiBear)) {
    craTone = 'long';
    craBadge = '롱';
    craEmoji = '🟢';
    craStatus = `롱힌트 · RSI${rsiV ?? '—'} · 선진↑`;
    craVal = av?.notable ? 86 : 72;
    craBrief = `롱 합류 · 선진롱 + RSI${rsiV ?? '—'} · 확정·스윕과 함께 · 단독주문금지`;
  } else if (advShort && !rsi?.chaseWarn && (rsiBear || !rsiBull)) {
    craTone = 'short';
    craBadge = '숏';
    craEmoji = '🔴';
    craStatus = `숏힌트 · RSI${rsiV ?? '—'} · 선진↓`;
    craVal = av?.notable ? 86 : 72;
    craBrief = `숏 합류 · 선진숏 + RSI${rsiV ?? '—'} · 확정·스윕과 함께 · 단독주문금지`;
  } else if (rsiBull && !advShort) {
    craTone = 'long';
    craBadge = '롱';
    craEmoji = '📈';
    craStatus = `RSI롱 · ${rsiV ?? '—'}`;
    craVal = 64;
    craBrief = `RSI 롱편향 · 선진 미확정 · 합류만 · 단독주문금지`;
  } else if (rsiBear && !advLong) {
    craTone = 'short';
    craBadge = '숏';
    craEmoji = '📉';
    craStatus = `RSI숏 · ${rsiV ?? '—'}`;
    craVal = 64;
    craBrief = `RSI 숏편향 · 선진 미확정 · 합류만 · 단독주문금지`;
  } else if (av?.notable || rsiV != null) {
    craTone = 'hot';
    craBadge = '참고';
    craEmoji = '⚡';
    craStatus = `참고 · RSI${rsiV ?? '—'}`;
    craVal = 55;
    craBrief = `혼조/관망 · RSI${rsiV ?? '—'} · 선진 ${av?.actionKo || '—'} · 진입신호 아님`;
  }

  return [
    {
      id: 'decision',
      emoji: decEmoji,
      name: '타점결정',
      statusKo: decStatus,
      briefKo: decBrief,
      dirBadge: decBadge,
      value: clamp(report.scores?.entry ?? 20),
      tone: decTone,
      pulse: dec.startsWith('CONFIRMED') || dec.startsWith('ARMED'),
    },
    {
      id: 'sweepLive',
      emoji: sweepEmoji,
      name:
        sw?.phase === 'ENTRY_2' || sw?.consecutive2
          ? '2회스윕·진입합류'
          : sw?.phase === 'RECORD_1'
            ? '1회스윕·기록'
            : '스윕합류',
      statusKo: sw?.noteKo?.slice(0, 40) || '스윕대기',
      briefKo:
        sw?.briefKo ||
        '1회=기록 · 2회(3봉내동방향)=진입합류 · 분·시·일·주·월 TF보드 · 단독주문금지',
      dirBadge: sweepBadge,
      value: clamp(sw?.score ?? 12),
      tone: sweepTone,
      pulse: sweepFired,
    },
    {
      id: 'htfSweep',
      emoji: '🧭',
      name: HTF_SWEEP_FILTER_SKILL_KO,
      statusKo: report.htfSweep?.noteKo?.slice(0, 36) || '상위스윕대기',
      briefKo:
        report.htfSweep?.briefKo ||
        '실행TF보다 상위(15m~1D) 스윕 역행이면 자동진입 차단 · 정렬이면 합류',
      dirBadge: report.htfSweep?.conflict
        ? '차단'
        : report.htfSweep?.aligned
          ? dir === 'LONG'
            ? '롱'
            : dir === 'SHORT'
              ? '숏'
              : '통과'
          : '참고',
      value: clamp(
        report.htfSweep?.conflict
          ? 22
          : report.htfSweep?.aligned
            ? 72 + Math.min(20, (report.htfSweep.alignTfs?.length || 0) * 5)
            : 40
      ),
      tone: report.htfSweep?.conflict
        ? 'wait'
        : report.htfSweep?.aligned
          ? dir === 'SHORT'
            ? 'short'
            : 'long'
          : 'ok',
      pulse: Boolean(report.htfSweep?.aligned || report.htfSweep?.conflict),
    },
    {
      id: 'candleRsiAdv',
      emoji: craEmoji,
      name: '캔들·RSI·선진',
      statusKo: craStatus,
      briefKo: craBrief,
      dirBadge: craBadge,
      value: craVal,
      tone: craTone,
      pulse: craTone === 'long' || craTone === 'short',
    },
    {
      id: 'volBurst',
      emoji: burstFired ? (vb?.direction === 'SHORT' ? '🌋' : '🔥') : '🕯️',
      name: `볼륨폭발${vb?.detectTf ? `·${vb.detectTf}` : '·5/15'}`,
      statusKo: burstFired
        ? `${vb?.direction === 'SHORT' ? '숏' : '롱'} RVOL ${(vb?.rvol ?? 0).toFixed(1)}×`
        : vb?.noteKo?.slice(0, 28) || '미발화',
      briefKo: burstFired
        ? vb?.direction === 'SHORT'
          ? `볼륨폭발 숏 · 빨강↑ · RVOL ${(vb?.rvol ?? 0).toFixed(1)}× · 숏 합류`
          : `볼륨폭발 롱 · 초록↑ · RVOL ${(vb?.rvol ?? 0).toFixed(1)}× · 롱 합류`
        : `미발화 · RVOL ${(vb?.rvol ?? 0).toFixed(1)} · 회색=폭발 전 · 대기`,
      dirBadge: burstFired ? (vb?.direction === 'SHORT' ? '숏' : '롱') : '대기',
      value: burstVal,
      tone: burstFired ? (vb?.direction === 'SHORT' ? 'short' : 'long') : 'wait',
      pulse: burstFired,
    },
    {
      id: 'advVol',
      emoji: advEmoji,
      name: '선진거래량',
      statusKo: advStatus,
      briefKo: advBrief,
      dirBadge: advBadge,
      value: advVal,
      tone: advTone,
      pulse: av?.notable === true || av?.action === 'long-ref' || av?.action === 'short-ref',
    },
    {
      id: 'dailyFace',
      emoji: faceEmoji,
      name: '일봉면',
      statusKo: face?.labelKo || '데이터 없음',
      briefKo: faceBrief,
      dirBadge: faceBadge,
      value: faceVal,
      tone: faceTone,
      pulse: face?.bias === 'up' || face?.bias === 'down',
    },
    {
      id: 'gate',
      emoji: gateEmoji,
      name: gateDirKo ? `필수게이트·${gateDirKo}` : '필수게이트',
      statusKo: gateStatus,
      briefKo: gateBrief,
      dirBadge: gateBadge,
      value: gateVal,
      tone: gateTone,
      pulse: Boolean(gateDirKo),
    },
    {
      id: 'event',
      emoji: eventHot ? '⚡' : '🛰️',
      name: '이벤트',
      statusKo: eventHot ? `${ex?.kind} · ${ex?.noteKo?.slice(0, 18) || ''}` : '없음',
      briefKo: eventBrief,
      dirBadge: eventBadge,
      value: clamp(ex?.score ?? 15),
      tone: eventHot
        ? dir === 'SHORT'
          ? 'short'
          : dir === 'LONG'
            ? 'long'
            : 'hot'
        : 'wait',
      pulse: eventHot,
    },
    {
      id: 'flow',
      emoji: '💨',
      name: '흐름·셋업',
      statusKo: `FLOW ${flowScore || '—'} · SETUP ${setupScore || '—'}`,
      briefKo: flowBrief,
      dirBadge: flowBadge,
      value: clamp((flowScore + setupScore) / 2),
      tone: flowTone,
      pulse: flowScore >= 70,
    },
    {
      id: 'hist',
      emoji: histN >= 20 ? '🧬' : '🔍',
      name: '유사표본',
      statusKo:
        histN > 0
          ? `${report.historical?.biasKo || (dir === 'LONG' ? '롱유사' : dir === 'SHORT' ? '숏유사' : '유사')} · 표본N=${histN}${
              histSim != null ? ` · 유사도${histSim}` : ''
            }${
              report.historical?.up5 != null
                ? ` · ${dir === 'SHORT' ? '숏' : dir === 'LONG' ? '롱' : ''}유리${(
                    report.historical.up5 * 100
                  ).toFixed(0)}%`
                : ''
            }`
          : report.historical?.noteKo?.slice(0, 28) || '통계 부족',
      briefKo:
        histN >= 20
          ? `${report.historical?.biasKo || '유사'} · 표본N=${histN}(=샘플수) · 지금 ${dw} 방향 기준 과거닮은구간 · 5봉익절비율 ${(
              (report.historical?.up5 ?? 0) * 100
            ).toFixed(0)}% · 확정승률아님`
          : `표본부족 n=${histN} · 회색=통계약함 · 단독신뢰 금지`,
      dirBadge:
        histN >= 20
          ? dir === 'LONG'
            ? '롱'
            : dir === 'SHORT'
              ? '숏'
              : '참고'
          : '대기',
      value: histN >= 20 ? clamp(40 + (histSim ?? 0) * 0.5) : clamp(histN * 2),
      tone:
        histN >= 20
          ? dir === 'LONG'
            ? 'long'
            : dir === 'SHORT'
              ? 'short'
              : 'ok'
          : 'wait',
      pulse: histN >= 20,
    },
  ];
}

export function buildTapointSignalLiveRows(
  report: TapointDecisionReport | null | undefined
): SignalLiveRow[] {
  if (!report) {
    return [
      {
        id: 'idle',
        emoji: '💤',
        name: '스캔',
        statusKo: '대기 · 신호 수집중',
        briefKo: '스캔 중 · 회색=아직 방향없음 · 잠시만',
        dirBadge: '대기',
        value: 8,
        tone: 'wait',
        pulse: true,
      },
    ];
  }
  const core = buildTapointSignalLiveRowsCore(report);
  const rows = Array.isArray(core) ? core : [];
  const auto = resolveSignalLiveAutoEntry(report);
  const coinAuto: SignalLiveRow = {
    id: 'coinAuto',
    emoji: auto.ready ? (auto.direction === 'SHORT' ? '🔴' : '🟢') : '🪙',
    name: '코인별자동',
    statusKo: String(auto.reasonKo || '대기'),
    briefKo: auto.ready
      ? auto.direction === 'SHORT'
        ? `숏 자동진입 준비 · 빨강=숏 · ${auto.reasonKo || ''}`
        : `롱 자동진입 준비 · 초록=롱 · ${auto.reasonKo || ''}`
      : `자동진입 대기 · ${auto.reasonKo || ''} · 게이지만으로 주문 안 함`,
    dirBadge: auto.ready ? (auto.direction === 'SHORT' ? '숏' : '롱') : '대기',
    value: auto.liveScore,
    tone: auto.ready ? (auto.direction === 'SHORT' ? 'short' : 'long') : 'wait',
    pulse: auto.ready,
  };
  if (!rows.length) return [coinAuto];
  return [rows[0]!, coinAuto, ...rows.slice(1)];
}

/** 색 범례 — UI 헤더용 */
export const SIGNAL_LIVE_COLOR_LEGEND_KO =
  '초록=롱 · 빨강=숏 · 회색=대기 · 파랑=통과/참고';
