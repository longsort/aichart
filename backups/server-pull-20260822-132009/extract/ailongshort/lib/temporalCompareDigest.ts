import type { AnalyzeResponse } from '@/types';
import type { MonthDeskVerdictValidationSummary } from '@/lib/monthDeskClosingEngine';

export type TemporalCompareItem = {
  label: string;
  value: string;
  hint?: string;
  accent?: 'long' | 'short' | 'wait' | 'info' | 'warn';
};

export type TemporalCompareColumn = {
  key: 'past' | 'present' | 'future';
  title: string;
  subtitle: string;
  items: TemporalCompareItem[];
  empty?: string;
};

export type TemporalAxisStatus = 'confirmed' | 'failed' | 'candidate' | 'split' | 'watch';

export type TemporalAxisVerdict = {
  direction: 'LONG' | 'SHORT' | 'WATCH';
  directionKo: string;
  status: TemporalAxisStatus;
  statusKo: string;
  strength0to100: number;
  oneLine: string;
};

export type TemporalPathBar = {
  key: string;
  label: string;
  pct: number;
  direction: 'LONG' | 'SHORT' | 'NEUTRAL';
};

export type TemporalCompareDigest = {
  symbol: string;
  timeframe: string;
  columns: [TemporalCompareColumn, TemporalCompareColumn, TemporalCompareColumn];
  pastVerdict: TemporalAxisVerdict;
  presentVerdict: TemporalAxisVerdict;
  futureVerdict: TemporalAxisVerdict;
  /** 한눈 결론 — 미래 우선, 분기 시 경고 */
  glance: TemporalAxisVerdict;
  pathBars: TemporalPathBar[];
  beamLongPct: number;
  beamShortPct: number;
  conflict: boolean;
  conflictKo: string | null;
  alignmentKo: string;
  riskNote: string;
};

function inferPathTilt(paths: AnalyzeResponse['futurePaths']): { long: number; short: number; neutral: number } {
  let long = 0;
  let short = 0;
  let neutral = 0;
  for (const p of paths ?? []) {
    if (p.direction === 'bullish') long += p.probability;
    else if (p.direction === 'bearish') short += p.probability;
    else neutral += p.probability;
  }
  return { long, short, neutral };
}

function beamTilt(beam: AnalyzeResponse['beamPathForecast']): { long: number; short: number; dominant: 'LONG' | 'SHORT' | 'WATCH' } {
  if (!beam?.points?.length) {
    if (beam?.dominant === 'LONG') return { long: beam.confidence, short: 100 - beam.confidence, dominant: 'LONG' };
    if (beam?.dominant === 'SHORT') return { long: 100 - beam.confidence, short: beam.confidence, dominant: 'SHORT' };
    return { long: 50, short: 50, dominant: 'WATCH' };
  }
  const last = beam.points[beam.points.length - 1];
  const long = last.longProb;
  const short = last.shortProb;
  const dominant: 'LONG' | 'SHORT' | 'WATCH' =
    long > short + 6 ? 'LONG' : short > long + 6 ? 'SHORT' : beam.dominant === 'MIXED' ? 'WATCH' : beam.dominant;
  return { long, short, dominant };
}

function buildAxisVerdict(
  direction: 'LONG' | 'SHORT' | 'WATCH',
  status: TemporalAxisStatus,
  strength: number,
  oneLine: string
): TemporalAxisVerdict {
  const directionKo = direction === 'LONG' ? '롱' : direction === 'SHORT' ? '숏' : '관망';
  const statusKo =
    status === 'confirmed'
      ? '확정'
      : status === 'failed'
        ? '실패'
        : status === 'candidate'
          ? '후보'
          : status === 'split'
            ? '분기'
            : '대기';
  return { direction, directionKo, status, statusKo, strength0to100: Math.round(strength), oneLine };
}

function fmtPx(n: number): string {
  return n >= 1000 ? n.toLocaleString(undefined, { maximumFractionDigits: 2 }) : n.toFixed(2);
}

function dirAccent(d: string | undefined): TemporalCompareItem['accent'] {
  if (d === 'LONG' || d === 'long' || d === 'bullish') return 'long';
  if (d === 'SHORT' || d === 'short' || d === 'bearish') return 'short';
  if (d === 'WATCH' || d === 'NEUTRAL' || d === 'neutral' || d === 'MIXED') return 'wait';
  return 'info';
}

function push(items: TemporalCompareItem[], label: string, value: string, hint?: string, accent?: TemporalCompareItem['accent']) {
  if (!value || value === '—') return;
  items.push({ label, value, hint, accent });
}

export function buildTemporalCompareDigest(
  analysis: AnalyzeResponse | null,
  opts?: {
    chartVerdictValidation?: MonthDeskVerdictValidationSummary | null;
    symbol?: string;
    timeframe?: string;
  }
): TemporalCompareDigest | null {
  if (!analysis) return null;

  const symbol = opts?.symbol ?? analysis.symbol ?? '—';
  const timeframe = opts?.timeframe ?? analysis.timeframe ?? '—';
  const past: TemporalCompareItem[] = [];
  const present: TemporalCompareItem[] = [];
  const future: TemporalCompareItem[] = [];

  const sim = analysis.similarBriefing;
  if (sim && (sim.similarity ?? 0) > 0) {
    push(
      past,
      '유사 과거 케이스',
      `${sim.similarity}% · ${sim.direction}`,
      sim.summary?.slice(0, 100),
      dirAccent(sim.direction)
    );
    if (sim.entry) push(past, '당시 진입', fmtPx(sim.entry));
    if (sim.target1) push(past, '당시 목표', fmtPx(sim.target1));
  }

  const ref = analysis.topReferences?.[0];
  if (ref) {
    push(past, '참조 매칭', `${ref.title || ref.id} · ${(ref.score * 100).toFixed(0)}%`, ref.reason?.slice(0, 80));
  }

  const lp = analysis.learnedPatternsTop5?.[0];
  if (lp) {
    push(past, '학습 패턴', `${lp.title} · ${lp.bias ?? '–'}`, lp.outcome?.slice(0, 60), dirAccent(lp.bias));
  }

  if (analysis.recallSummary?.trim()) {
    push(past, '리콜 요약', analysis.recallSummary.trim().slice(0, 120));
  }

  const hist = analysis.pre3SparkleHistory;
  if (hist?.length) {
    const last = hist[hist.length - 1];
    push(
      past,
      'Pre3 유사 봉',
      `${hist.length}건 · 최근 ${last.direction} ${Math.round(last.similarity)}%`,
      undefined,
      dirAccent(last.direction)
    );
  }

  const val = opts?.chartVerdictValidation;
  if (val?.windows?.length) {
    const w = val.windows[val.windows.length - 1];
    push(
      past,
      `과거 검증(${val.chartTf})`,
      `${w.bars}봉 · 안착 ${w.ok} / 실패 ${w.fail}`,
      val.footnote?.slice(0, 80)
    );
  }

  const supOb = analysis.nearestSupportOb;
  if (supOb?.pastTouches != null) {
    push(past, '지지 OB 과거', `터치 ${supOb.pastTouches} · 반응 ${supOb.pastHits ?? 0}`);
  }
  const resOb = analysis.nearestResistanceOb;
  if (resOb?.pastTouches != null) {
    push(past, '저항 OB 과거', `터치 ${resOb.pastTouches} · 반응 ${resOb.pastHits ?? 0}`);
  }

  const v = analysis.verdict;
  push(present, '현재 판정', v, analysis.summary?.slice(0, 90), dirAccent(v));
  if (analysis.confidence != null) push(present, '신뢰도', `${Math.round(analysis.confidence)}%`);
  if (analysis.currentPrice != null) push(present, '현재가', fmtPx(analysis.currentPrice));

  const cs = analysis.confirmedSignal;
  if (cs) {
    push(
      present,
      '구조 확정',
      `${cs.gatesPassCount ?? [cs.structure, cs.rsi, cs.supportResistance, cs.close, cs.fvgZone].filter(Boolean).length}/5`,
      cs.mtfBlocked ? 'MTF 반대·억제' : cs.reasons?.[0]?.slice(0, 60),
      cs.confirmed ? 'long' : 'wait'
    );
  }

  const sz = analysis.settlementZone;
  if (sz && sz.state !== 'none') {
    push(
      present,
      '마감·안착',
      `${sz.state} ${sz.grade} · ${sz.direction}`,
      sz.level != null ? fmtPx(sz.level) : undefined,
      dirAccent(sz.direction)
    );
  }

  if (analysis.mtf?.summary) push(present, 'MTF', analysis.mtf.summary.slice(0, 100));
  else if (analysis.mtf?.htfBias) {
    push(present, 'MTF', `${analysis.mtf.htfBias} · ${analysis.mtf.ltfEntryBias ?? '–'}`);
  }

  if (analysis.currentZoneSummary?.trim()) {
    push(present, '현재 존', analysis.currentZoneSummary.trim().slice(0, 100));
  }

  if (analysis.entry?.trim()) push(present, '엔진 타점', analysis.entry.trim().slice(0, 80));
  if (analysis.stopLoss?.trim()) push(present, '손절·무효', analysis.stopLoss.trim().slice(0, 80), undefined, 'warn');

  const paths = analysis.futurePaths ?? [];
  for (const p of paths.slice(0, 3)) {
    const tgt = p.targets?.[0];
    push(
      future,
      `경로 ${p.path}`,
      `${p.probability}% · ${p.direction}`,
      tgt != null ? `목표 ~${fmtPx(tgt)} · ${p.reason}` : p.reason,
      dirAccent(p.direction)
    );
  }

  const beam = analysis.beamPathForecast;
  if (beam?.points?.length) {
    push(future, '빔 우세', `${beam.dominant} · ${Math.round(beam.confidence)}%`, undefined, dirAccent(beam.dominant));
    for (const pt of beam.points) {
      const dom = pt.longProb >= pt.shortProb ? 'LONG' : 'SHORT';
      const px = dom === 'LONG' ? pt.expectedPriceLong : pt.expectedPriceShort;
      push(
        future,
        `+${pt.horizon}봉 예상`,
        `${dom === 'LONG' ? '롱' : '숏'} ${pt.longProb}/${pt.shortProb}% → ${fmtPx(px)}`,
        undefined,
        dirAccent(dom)
      );
    }
  }

  if (analysis.targets?.length) {
    push(
      future,
      '익절 참고',
      analysis.targets
        .slice(0, 3)
        .map((t) => t.trim())
        .join(' · ')
    );
  }

  if (analysis.bullishScenario?.trim()) {
    push(future, '상승 시나리오', analysis.bullishScenario.trim().slice(0, 100), undefined, 'long');
  }
  if (analysis.bearishScenario?.trim()) {
    push(future, '하락 시나리오', analysis.bearishScenario.trim().slice(0, 100), undefined, 'short');
  }

  const ai = analysis.aiUnifiedLongShort;
  if (ai?.scenarioA && !paths.length) {
    push(future, 'AI 시나리오 A', ai.scenarioA.slice(0, 90));
  }

  const pathTilt = inferPathTilt(paths);
  const beamT = beamTilt(beam);
  const pathDir: 'LONG' | 'SHORT' | 'WATCH' =
    pathTilt.long > pathTilt.short + 10 ? 'LONG' : pathTilt.short > pathTilt.long + 10 ? 'SHORT' : 'WATCH';
  const beamDir = beamT.dominant;

  const pathBars: TemporalPathBar[] = paths.slice(0, 3).map((p) => ({
    key: p.path,
    label: `경로 ${p.path}`,
    pct: p.probability,
    direction: p.direction === 'bullish' ? 'LONG' : p.direction === 'bearish' ? 'SHORT' : 'NEUTRAL',
  }));

  const pastDir: 'LONG' | 'SHORT' | 'WATCH' =
    sim?.direction === 'LONG' || sim?.direction === 'SHORT' ? sim.direction : 'WATCH';
  const pastStrength = sim?.similarity ?? (ref ? ref.score * 100 : 0);
  const pastVerdict = buildAxisVerdict(
    pastDir,
    pastDir !== 'WATCH' && (sim?.similarity ?? 0) >= 78 ? 'confirmed' : pastDir !== 'WATCH' ? 'candidate' : 'watch',
    pastStrength,
    pastDir !== 'WATCH'
      ? `유사 ${Math.round(sim?.similarity ?? 0)}% · ${pastDir === 'LONG' ? '롱' : '숏'} 패턴`
      : '유사 과거 없음'
  );

  const presentDir: 'LONG' | 'SHORT' | 'WATCH' =
    v === 'LONG' || v === 'SHORT' ? v : 'WATCH';
  const gates = cs?.gatesPassCount ?? [cs?.structure, cs?.rsi, cs?.supportResistance, cs?.close, cs?.fvgZone].filter(Boolean).length;
  let presentStatus: TemporalAxisStatus = 'watch';
  if (sz?.state === 'failed') presentStatus = 'failed';
  else if (sz?.state === 'confirmed' && presentDir !== 'WATCH') presentStatus = 'confirmed';
  else if (cs?.confirmed && (cs.readinessTier === 'full' || gates >= 5)) presentStatus = 'confirmed';
  else if (gates >= 4 && presentDir !== 'WATCH') presentStatus = 'candidate';
  else if (presentDir !== 'WATCH') presentStatus = 'candidate';

  const presentVerdict = buildAxisVerdict(
    presentDir,
    presentStatus,
    analysis.confidence ?? 0,
    presentStatus === 'failed'
      ? `안착 실패 — 판정 ${presentDir}와 충돌`
      : presentStatus === 'confirmed'
        ? `확정 ${presentDir} · 게이트 ${gates}/5`
        : `판정 ${presentDir} · 확정 ${gates}/5 · 신뢰 ${Math.round(analysis.confidence ?? 0)}%`
  );

  let futureDir: 'LONG' | 'SHORT' | 'WATCH' = beamDir !== 'WATCH' ? beamDir : pathDir;
  let futureStatus: TemporalAxisStatus = 'watch';
  let conflict = false;
  let conflictKo: string | null = null;

  if (pathDir !== 'WATCH' && beamDir !== 'WATCH' && pathDir !== beamDir) {
    conflict = true;
    conflictKo = `경로는 ${pathDir === 'LONG' ? '롱' : '숏'} ${Math.round(pathTilt.long > pathTilt.short ? pathTilt.long : pathTilt.short)}% 우세 · 빔은 ${beamDir === 'LONG' ? '롱' : '숏'} ${Math.round(beamT.long > beamT.short ? beamT.long : beamT.short)}% — 분기`;
    futureDir = beamDir;
    futureStatus = 'split';
  } else if (futureDir !== 'WATCH') {
    const strength = Math.max(pathTilt.long, pathTilt.short, beamT.long, beamT.short);
    futureStatus = strength >= 58 ? 'candidate' : 'watch';
  }

  const futureVerdict = buildAxisVerdict(
    futureDir,
    futureStatus,
    Math.max(beamT.long, beamT.short, pathTilt.long, pathTilt.short),
    conflict && conflictKo
      ? conflictKo
      : futureDir === 'WATCH'
        ? '경로·빔 방향 불명 — 관망'
        : `미래 ${futureDir === 'LONG' ? '롱' : '숏'} 우세 · 빔 ${beamT.short}%/${beamT.long}% · 경로 L${Math.round(pathTilt.long)} S${Math.round(pathTilt.short)}`
  );

  const glance = buildAxisVerdict(
    conflict ? futureDir : futureDir !== 'WATCH' ? futureDir : presentDir,
    conflict ? 'split' : presentStatus === 'failed' ? 'failed' : futureStatus === 'candidate' ? futureStatus : presentStatus,
    futureVerdict.strength0to100,
    conflict
      ? `한눈: 분기 — 빔 ${futureDir === 'LONG' ? '롱' : '숏'} vs 경로 ${pathDir === 'LONG' ? '롱' : '숏'}`
      : `한눈: 미래 ${futureVerdict.directionKo} · 현재 ${presentVerdict.statusKo}`
  );

  let alignmentKo = '과거·현재·미래 데이터가 부족합니다 — 분석 갱신 후 다시 확인하세요.';
  if (presentDir !== 'WATCH') {
    const parts: string[] = [
      `현재 ${presentVerdict.directionKo} (${presentVerdict.statusKo})`,
      `미래 ${futureVerdict.directionKo} (${futureVerdict.statusKo})`,
    ];
    if (pastDir !== 'WATCH') parts.unshift(`과거 유사 ${pastVerdict.directionKo}`);
    if (conflictKo) parts.push(conflictKo);
    alignmentKo = parts.join(' · ');
  }

  const columns: [TemporalCompareColumn, TemporalCompareColumn, TemporalCompareColumn] = [
    {
      key: 'past',
      title: '과거',
      subtitle: '유사·학습·검증·OB 터치',
      items: past,
      empty: '유사 케이스·학습 기록 없음',
    },
    {
      key: 'present',
      title: '현재',
      subtitle: '판정·확정·안착·존',
      items: present,
      empty: '분석 로드 대기',
    },
    {
      key: 'future',
      title: '미래',
      subtitle: '경로·빔·TP·시나리오',
      items: future,
      empty: '예측 경로 없음 — collect=1·엔진 확인',
    },
  ];

  return {
    symbol,
    timeframe,
    columns,
    pastVerdict,
    presentVerdict,
    futureVerdict,
    glance,
    pathBars,
    beamLongPct: beamT.long,
    beamShortPct: beamT.short,
    conflict,
    conflictKo,
    alignmentKo,
    riskNote: '예측·유사 과거는 참고용이며 확정 수익·승률을 보장하지 않습니다.',
  };
}
