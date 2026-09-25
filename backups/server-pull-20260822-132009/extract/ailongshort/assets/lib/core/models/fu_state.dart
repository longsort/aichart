import 'struct_mark.dart';

enum FuSignal { long, short, neutral }

class FuState {
  final double price;
  final int score, confidence, risk;
  final bool locked;
  final String lockedReason;
  final String decisionTitle;
  final int evidenceHit, evidenceTotal;
  final double s1, r1, vwap;

  // v10.7: 수치화(신뢰도/구간/포지션)
  final int confidenceScore;
  final String confidenceLabel;
  final double recommendR;
  final int longScore;
  final int shortScore;
  /// 최종 결정 사유(Decision HUD v11 표시용)
  final String finalDecisionReason;
  final double zoneValid;
  final double zoneInvalid;
  final List<double> zoneTargets;
  final double posQty;
  final int posLev;
  final double posRiskPct;

  // v10.7: 미니차트 토글
  final bool showFvg;
  final bool showOb;
  final bool showBos;
  final bool showChoch;

  // === Futures plan (optional) ===
  // 신호 표시 게이트: (합의 4/5 이상) + (예상 ROI 25% 이상) + (NO-TRADE 아님)
  final double entry;
  final double stop;
  final double target;
  final double leverage;
  final double qty;
  final double roiPotential;
  final bool consensusOk;
  final bool roiOk;
  final bool showSignal;

  // === P-LOCK (anti flip-flop) ===
  // 확정 신호를 일정 시간/캔들 동안 고정해서 "진입했다가 말았다"를 막는다.
  final bool pLocked;
  final String pLockDir; // LONG/SHORT/NO
  final int pLockProb; // 0~100
  final int pLockRemainingSec;
  final String pLockWhy;

  // 방향/확률/등급
  final String signalDir; // LONG/SHORT/NEUTRAL
  final int signalProb;
  final String signalGrade;

  // === 마감/돌파/거래량(정확도 코어) ===
  // 0~100 (50=중립)
  final int closeScore;    // 종가(마감) 품질
  final int breakoutScore; // 돌파 품질
  final int volumeScore;   // 거래량 질

  // 초보용 문장(필드명 호환)
  final String signalKo;
  final String signalWhy;

  // 고급/요약 bullet
  final List<String> signalBullets;

  final List<FuCandle> candles;
  final List<FuZone> fvgZones;
  // 확장 오버레이(엔진이 채움)
  final List<FuZone> obZones;
  final List<FuZone> bprZones;
  final List<FuZone> mbZones;
  final List<FuZone> smcZones;
  final int lossStreak;

  // === 세력/고래/기관 (public-data heuristics) ===
  // 0~100 scale
  final int whaleScore;
  // 세력(Force) / 흡수(Absorption) / 스윕(Stop-hunt/Sweep) 보강
  final int forceScore;
  final int absorptionScore;
  final int sweepRisk;
  final int defenseScore;
  final int distributionScore;
  final int whaleBuyPct;
  final int instBias; // 기관/세력 방향성(매수 우세=높음)
  final int obImbalance; // 오더북 매수 비중(0~100)
  final int tapeBuyPct; // 체결 매수 비중(0~100)
  final String flowHint;

  // === Zone classifier (구간 판정: 신호가 없어도 항상 1개 출력) ===
  final String zoneCode;     // DEFENSE/REBOUND/PULLBACK_REBOUND/ABSORB_BUY/DISTRIBUTION_SELL/DANGER/NONE
  final String zoneName;     // 한글 라벨
  final String zoneBias;     // LONG/SHORT/NEUTRAL
  final int zoneStrength;    // 0~100
  final int zoneLongP;       // 0~100
  final int zoneShortP;      // 0~100
  final int zoneWaitP;       // 0~100
  final String zoneTrigger;  // 진입 트리거 1줄
  final String zoneInvalidLine; // 무효/주의 1줄
  final List<String> zoneReasons; // 근거(최대 3줄)


  // === 구조/반응 구간(CHOCH/BOS) ===
  // UI에서 숫자로 고정 표시(되돌림 반응가격/구간)
  final String structureTag;
  final List<StructMark> structMarks; // RANGE / CHOCH_UP / CHOCH_DN / BOS_UP / BOS_DN
  final double breakLevel;   // 구조 돌파/이탈 기준 가격
  final double reactLevel;   // 되돌림 반응 가격(핵심)
  final double reactLow;     // 반응 구간 하단(띠)
  final double reactHigh;    // 반응 구간 상단(띠)

  // === 멀티 타임프레임 압축 상태(상단 스트립/압력 표시용) ===
  // key 예: '1m','5m','15m','1h','4h','1D','1W','1M'
  final Map<String, FuTfPulse> mtfPulse;

  const FuState({
    this.price = 0,
    this.score = 0,
    this.confidence = 0,
    this.risk = 0,
    this.locked = false,
    this.lockedReason = '',
    this.decisionTitle = 'INIT',
    this.evidenceHit = 0,
    this.evidenceTotal = 5,
    this.s1 = 0,
    this.r1 = 0,
    this.vwap = 0,

    // Futures plan defaults
    this.entry = 0,
    this.stop = 0,
    this.target = 0,
    this.leverage = 1,
    this.qty = 0,
    this.roiPotential = 0,
    this.consensusOk = false,
    this.roiOk = false,
    this.showSignal = false,

    // P-LOCK defaults
    this.pLocked = false,
    this.pLockDir = 'NO',
    this.pLockProb = 0,
    this.pLockRemainingSec = 0,
    this.pLockWhy = '',

    this.signalDir = 'NEUTRAL',
    this.signalProb = 0,
    this.signalGrade = 'C',
    this.closeScore = 50,
    this.breakoutScore = 50,
    this.volumeScore = 50,
    this.signalKo = '',
    this.signalWhy = '',
    this.signalBullets = const [],
    this.candles = const [],
    this.fvgZones = const [],
    this.obZones = const [],
    this.bprZones = const [],
    this.mbZones = const [],
    this.smcZones = const [],
    this.lossStreak = 0,

    // flow
    this.whaleScore = 0,
    this.forceScore = 0,
    this.absorptionScore = 0,
    this.sweepRisk = 0,
    this.defenseScore = 0,
    this.distributionScore = 0,
    this.whaleBuyPct = 50,
    this.instBias = 50,
    this.obImbalance = 50,
    this.tapeBuyPct = 50,
    this.flowHint = '',

    // Zone classifier defaults
    this.zoneCode = 'NONE',
    this.zoneName = '',
    this.zoneBias = 'NEUTRAL',
    this.zoneStrength = 0,
    this.zoneLongP = 0,
    this.zoneShortP = 0,
    this.zoneWaitP = 100,
    this.zoneTrigger = '',
    this.zoneInvalidLine = '',
    this.zoneReasons = const [],

    // structure/reaction defaults
    this.structureTag = 'RANGE',
    this.breakLevel = 0,
    this.reactLevel = 0,
    this.reactLow = 0,
    this.reactHigh = 0,
    this.structMarks = const [],

    // v10.7: 수치화(기본값)
    this.confidenceScore = 0,
    this.confidenceLabel = '보통',
    this.recommendR = 0.25,
    this.longScore = 50,
    this.shortScore = 50,
    this.finalDecisionReason = '',
    this.zoneValid = 0,
    this.zoneInvalid = 0,
    this.zoneTargets = const [0, 0, 0],
    this.posQty = 0,
    this.posLev = 1,
    this.posRiskPct = 5,
    this.showFvg = true,
    this.showOb = true,
    this.showBos = true,
    this.showChoch = true,

    this.mtfPulse = const <String, FuTfPulse>{},
  });

  factory FuState.zero() => const FuState();

  // ---------------- UI helpers (기존 엔진 값으로만 파생)
  /// 상단/오버레이 '최종' 라벨
  String get decisionLabel {
    if (noTrade) return '쉬기';
    if (tradeOk) return '진입';
    return '관망';
  }

  /// 상단/오버레이 '상태' 라벨
  String get statusLabel {
    // 리스크 높음 / 근거 부족 / 합의 부족이면 경고
    final bool lowEvidence = evidenceTotal > 0 ? (evidenceHit / evidenceTotal) < 0.4 : true;
    final bool highRisk = sweepRisk >= 55;
    final bool weakConsensus = !consensusOk;
    if (noTrade) return '경고';
    if (highRisk || lowEvidence || weakConsensus) return '경고';
    return '준비';
  }

  /// 오버레이에 표기할 '리스크(%)'
  int get riskPct {
    final int v = sweepRisk;
    if (v < 0) return 0;
    if (v > 100) return 100;
    return v;
  }

  factory FuState.initial() => const FuState();

  // ------------------------------------------------------------------
  // SPEC aliases (FULINK_FINAL_CODING_SPEC)
  // - 기존 필드를 깨지 않고, 스펙 필드명을 게터/맵으로 제공한다.
  // ------------------------------------------------------------------

  /// 스펙: livePrice
  double get livePrice => price;

  /// 스펙: zoneValid (0~100, int)
  int get zoneValidInt {
    final v = zoneValid;
    if (v.isNaN || v.isInfinite) return 0;
    return v.round().clamp(0, 100);
  }

  /// 스펙: hasStructure
  bool get hasStructure {
    final tag = structureTag.toUpperCase();
    if (tag.contains('CHOCH') || tag.contains('BOS')) return true;
    // RANGE라도 break/react 레벨이 있으면 구조로 취급
    return (breakLevel > 0) || (reactLevel > 0);
  }

  /// 스펙: structureType {box|trend|range|none}
  String get structureType {
    final tag = structureTag.toUpperCase();
    if (!hasStructure && tag.trim().isEmpty) return 'none';
    if (tag.contains('RANGE')) return 'range';
    if (tag.contains('BOS') || tag.contains('CHOCH')) return 'trend';
    return 'box';
  }

  /// 스펙: structureScore (0~100)
  int get structureScoreInt => structureScore;

  /// 스펙: tfAgree
  bool get tfAgree => consensusOk;

  /// 스펙: flags {hasFvg, hasOb, hasBpr, hasChoch, hasBos}
  Map<String, bool> get flags {
    final tag = structureTag.toUpperCase();
    return <String, bool>{
      'hasFvg': fvgZones.isNotEmpty,
      'hasOb': obZones.isNotEmpty,
      'hasBpr': bprZones.isNotEmpty,
      'hasChoch': tag.contains('CHOCH'),
      'hasBos': tag.contains('BOS'),
    };
  }

  /// 스펙: sr {s1, r1, sProb, rProb}
  /// - 확률이 별도로 없으므로, 현재 신뢰/리스크/방향 기반으로 단순 파생(표시용)
  Map<String, dynamic> get sr {
    final int base = signalProb.clamp(0, 100);
    final int riskN = sweepRisk.clamp(0, 100);
    final int sProb = (base - (riskN * 0.3)).round().clamp(0, 100);
    final int rProb = (base - (riskN * 0.2)).round().clamp(0, 100);
    return <String, dynamic>{
      's1': s1,
      'r1': r1,
      'sProb': sProb,
      'rProb': rProb,
    };
  }

  // ---------------- v8 Heatmap compatibility getters ----------------
  String get symbol => 'BTCUSDT';
  String get tf => '';
  String get tfLabel => tf;
  double get resistLow => r1;
  double get resistHigh => r1;

// ReactionHeatmapPanel이 기대하는 필드명을 기존 엔진 필드로 매핑
  int get evidenceHitCount => evidenceHit;
  int get evidenceNeed => evidenceTotal;
  double get reactionZoneLow => reactLow;
  double get reactionZoneHigh => reactHigh;


int get reactionSupportProb => confidence.clamp(0, 100);
int get reactionResistProb => (100 - confidence).clamp(0, 100);

  /// 구조 점수(0~100): CHOCH/BOS 여부 + 브레이크 레벨 유무로 가중
  int get structureScore {
    int v = 45;
    final tag = structureTag.toUpperCase();
    if (tag.contains('CHOCH') || tag.contains('BOS')) v = 72;
    if (breakLevel > 0) v += 8;
    if (reactLevel > 0) v += 5;
    if (v > 100) v = 100;
    return v;
  }

  /// BPR 합류도(0~100): BPR 존 존재/겹침(개수) 기반
  int get bprConfluenceScore {
    int v = 28;
    if (bprZones.isNotEmpty) v = 68;
    if (bprZones.length >= 2) v = 78;
    // 반응구간과 겹치면 추가 가점
    if (reactLow > 0 && reactHigh > 0 && bprZones.isNotEmpty) {
      v += 10;
    }
    if (v > 100) v = 100;
    return v;
  }

  /// PO3 점수(0~100): 흡수(Absorption) 높고 스윕 위험 낮을수록 ↑
  int get po3Score {
    final a = absorptionScore.clamp(0, 100);
    final s = (100 - sweepRisk).clamp(0, 100);
    final v = (a * 0.6 + s * 0.4).round().clamp(0, 100);
    return v;
  }

  /// OB/CHOCH 점수(0~100): OB 존 + 구조 태그 조합
  int get obChochScore {
    int v = 22;
    if (obZones.isNotEmpty) v = 55;
    final tag = structureTag.toUpperCase();
    if (tag.contains('CHOCH')) v += 20;
    if (tag.contains('BOS')) v += 12;
    if (v > 100) v = 100;
    return v;
  }

  /// FVG/BPR 점수(0~100): FVG + BPR 동시 존재면 ↑
  int get fvgBprScore {
    int v = 18;
    if (fvgZones.isNotEmpty) v = 52;
    if (fvgZones.isNotEmpty && bprZones.isNotEmpty) v = 80;
    if (v > 100) v = 100;
    return v;
  }

  FuState copyWith({
    double? price,
    int? score,
    int? confidence,
    int? risk,
    bool? locked,
    String? lockedReason,
    String? decisionTitle,
    int? evidenceHit,
    int? evidenceTotal,
    double? s1,
    double? r1,
    double? vwap,

    double? entry,
    double? stop,
    double? target,
    double? leverage,
    double? qty,
    double? roiPotential,
    bool? consensusOk,
    bool? roiOk,
    bool? showSignal,

    bool? pLocked,
    String? pLockDir,
    int? pLockProb,
    int? pLockRemainingSec,
    String? pLockWhy,

    String? signalDir,
    int? signalProb,
    String? signalGrade,
    int? confidenceScore,
    String? confidenceLabel,
    double? recommendR,
    int? longScore,
    int? shortScore,
    String? finalDecisionReason,
    int? closeScore,
    int? breakoutScore,
    int? volumeScore,
    String? signalKo,
    String? signalWhy,
    List<String>? signalBullets,

    List<FuCandle>? candles,
    List<FuZone>? fvgZones,
    List<FuZone>? obZones,
    List<FuZone>? bprZones,
    List<FuZone>? mbZones,
    List<FuZone>? smcZones,
    int? lossStreak,

    int? whaleScore,
    int? forceScore,
    int? absorptionScore,
    int? sweepRisk,
    int? defenseScore,
    int? distributionScore,
    int? whaleBuyPct,
    int? instBias,
    int? obImbalance,
    int? tapeBuyPct,
    String? flowHint,

    String? zoneCode,
    String? zoneName,
    String? zoneBias,
    int? zoneStrength,
    int? zoneLongP,
    int? zoneShortP,
    int? zoneWaitP,
    String? zoneTrigger,
    String? zoneInvalidLine,
    List<String>? zoneReasons,

    String? structureTag,
    List<StructMark>? structMarks,
    double? breakLevel,
    double? reactLevel,
    double? reactLow,
    double? reactHigh,

    Map<String, FuTfPulse>? mtfPulse,
  }) {
    return FuState(
      price: price ?? this.price,
      score: score ?? this.score,
      confidence: confidence ?? this.confidence,
      risk: risk ?? this.risk,
      locked: locked ?? this.locked,
      lockedReason: lockedReason ?? this.lockedReason,
      decisionTitle: decisionTitle ?? this.decisionTitle,
      evidenceHit: evidenceHit ?? this.evidenceHit,
      evidenceTotal: evidenceTotal ?? this.evidenceTotal,
      s1: s1 ?? this.s1,
      r1: r1 ?? this.r1,
      vwap: vwap ?? this.vwap,

      entry: entry ?? this.entry,
      stop: stop ?? this.stop,
      target: target ?? this.target,
      leverage: leverage ?? this.leverage,
      qty: qty ?? this.qty,
      roiPotential: roiPotential ?? this.roiPotential,
      consensusOk: consensusOk ?? this.consensusOk,
      roiOk: roiOk ?? this.roiOk,
      showSignal: showSignal ?? this.showSignal,

      pLocked: pLocked ?? this.pLocked,
      pLockDir: pLockDir ?? this.pLockDir,
      pLockProb: pLockProb ?? this.pLockProb,
      pLockRemainingSec: pLockRemainingSec ?? this.pLockRemainingSec,
      pLockWhy: pLockWhy ?? this.pLockWhy,

      signalDir: signalDir ?? this.signalDir,
      signalProb: signalProb ?? this.signalProb,
      signalGrade: signalGrade ?? this.signalGrade,
      confidenceScore: confidenceScore ?? this.confidenceScore,
      confidenceLabel: confidenceLabel ?? this.confidenceLabel,
      recommendR: recommendR ?? this.recommendR,
      longScore: longScore ?? this.longScore,
      shortScore: shortScore ?? this.shortScore,
      finalDecisionReason: finalDecisionReason ?? this.finalDecisionReason,
      closeScore: closeScore ?? this.closeScore,
      breakoutScore: breakoutScore ?? this.breakoutScore,
      volumeScore: volumeScore ?? this.volumeScore,
      signalKo: signalKo ?? this.signalKo,
      signalWhy: signalWhy ?? this.signalWhy,
      signalBullets: signalBullets ?? this.signalBullets,

      candles: candles ?? this.candles,
      fvgZones: fvgZones ?? this.fvgZones,
      obZones: obZones ?? this.obZones,
      bprZones: bprZones ?? this.bprZones,
      mbZones: mbZones ?? this.mbZones,
      smcZones: smcZones ?? this.smcZones,
      lossStreak: lossStreak ?? this.lossStreak,

      whaleScore: whaleScore ?? this.whaleScore,
      forceScore: forceScore ?? this.forceScore,
      absorptionScore: absorptionScore ?? this.absorptionScore,
      sweepRisk: sweepRisk ?? this.sweepRisk,
      defenseScore: defenseScore ?? this.defenseScore,
      distributionScore: distributionScore ?? this.distributionScore,
      whaleBuyPct: whaleBuyPct ?? this.whaleBuyPct,
      instBias: instBias ?? this.instBias,
      obImbalance: obImbalance ?? this.obImbalance,
      tapeBuyPct: tapeBuyPct ?? this.tapeBuyPct,
      flowHint: flowHint ?? this.flowHint,

      zoneCode: zoneCode ?? this.zoneCode,
      zoneName: zoneName ?? this.zoneName,
      zoneBias: zoneBias ?? this.zoneBias,
      zoneStrength: zoneStrength ?? this.zoneStrength,
      zoneLongP: zoneLongP ?? this.zoneLongP,
      zoneShortP: zoneShortP ?? this.zoneShortP,
      zoneWaitP: zoneWaitP ?? this.zoneWaitP,
      zoneTrigger: zoneTrigger ?? this.zoneTrigger,
      zoneInvalidLine: zoneInvalidLine ?? this.zoneInvalidLine,
      zoneReasons: zoneReasons ?? this.zoneReasons,

      structureTag: structureTag ?? this.structureTag,
      structMarks: structMarks ?? this.structMarks,
      breakLevel: breakLevel ?? this.breakLevel,
      reactLevel: reactLevel ?? this.reactLevel,
      reactLow: reactLow ?? this.reactLow,
      reactHigh: reactHigh ?? this.reactHigh,

      mtfPulse: mtfPulse ?? this.mtfPulse,
    );
  }

  // UI compatibility aliases (legacy UI patches)
  String get direction => signalDir;
  int get prob => signalProb;
  String get gradeLabel => signalGrade;

  // v7 통합: 누락된 호환 게터(빌드 에러 방지)
  /// 확률(0.0~1.0). UI에서 *100 해서 %로 표시
  double get probFinal => (signalProb.clamp(0, 100)) / 100.0;

  /// 매매 금지/잠금
  bool get noTrade => locked || !showSignal;

  // === ManagerTradePanel 호환 (v6~v7 패치에서 참조) ===
  /// 최종 확률(0~1). UI에서는 *100 해서 %로 표시.
  double get finalProb => probFinal;

  /// 매매 잠금(노트레이드) 상태 (true면 진입 금지)
  bool get tradelock => noTrade;

  /// camelCase 별칭 (UI 패치 호환)
  bool get tradeLock => tradelock;

  /// 신호가 '진입 가능' 수준인지 (기본: noTrade가 아니고, 확률 20% 이상)
  bool get tradeok => (!noTrade) && (probFinal >= 0.20);

  /// camelCase 별칭 (UI 패치 호환)
  bool get tradeOk => tradeok;

  /// '관망/주의' 레벨인지 (기본: 확률 20% 미만)
  bool get watch => (probFinal < 0.20);

  /// 방향을 정수로 (롱=+1, 숏=-1, 중립=0)
  int get dir {
    final d = signalDir.toUpperCase();
    if (d.contains('LONG')) return 1;
    if (d.contains('SHORT')) return -1;
    return 0;
  }
  // === 추가 UI 호환(최근 패치에서 참조) ===
  // ultra_home_screen.dart 등에서 finalDir/grade/rr를 기대
  String get finalDir => signalDir;
  String get grade => signalGrade;
  double get rr {
    final risk = (entry - stop).abs();
    if (risk <= 0) return 0;
    final reward = (target - entry).abs();
    return reward / risk;
  }
  // UI 패치 호환: expectedRoiPct를 찾는 화면이 있음
  double get expectedRoiPct => roiPotential;
  int get srStrength {
    final v = signalProb;
    if (v < 0) return 0;
    if (v > 100) return 100;
    return v;
  }

  // UI 패치 호환: 일부 화면/패치에서 sl/tp/evidencePct를 참조
  double get sl => stop;
  double get tp => target;
  double get evidencePct {
    if (evidenceTotal <= 0) return 0;
    final v = (evidenceHit / evidenceTotal) * 100.0;
    if (v < 0) return 0;
    if (v > 100) return 100;
    return v;
  }
  // === ManagerTradePanel 추가 호환 필드 ===
  /// 노트레이드 이유(있으면 lockedReason 사용)
  String get noTradeReason {
    if (lockedReason.isNotEmpty) return lockedReason;
    if (locked) return '잠금';
    if (!consensusOk) return '상위/멀티TF 합의 부족';
    if (!roiOk) return '예상 범위 부족';
    if (!showSignal) return '근거 부족';
    return '';
  }

  /// 3분할 익절 (40/35/25) - 방향에 따라 entry~target 구간 분배
  double get tp1 {
    if (entry <= 0 || target <= 0) return 0;
    final diff = target - entry;
    return entry + diff * 0.40;
  }

  double get tp2 {
    if (entry <= 0 || target <= 0) return 0;
    final diff = target - entry;
    return entry + diff * 0.75; // 40%+35%
  }

  double get tp3 {
    if (entry <= 0 || target <= 0) return 0;
    return target;
  }

  /// 필요 레버리지(엔진 계산 leverage 그대로)
  double get levNeed => leverage;

// ===== Legacy compatibility (build error prevention) =====
/// 기존 코드에서 state.why 를 참조하는 경우를 위해 제공
String get why => signalWhy;

/// 기존 코드에서 state.evidenceScore 를 참조하는 경우를 위해 제공
int get evidenceScore => score;

/// 기존 코드에서 state.signal (enum) 을 참조하는 경우를 위해 제공
FuSignal get signal {
  final d = signalDir.toUpperCase();
  if (d == 'LONG' || d == 'UP') return FuSignal.long;
  if (d == 'SHORT' || d == 'DOWN') return FuSignal.short;
  return FuSignal.neutral;
}

  // === UI 호환: 개편 위젯에서 참조하는 별칭/태그 ===
  String get patternTag => structureTag;
  String get waveTag => flowHint;

  // 0.0~1.0 (상승/하락 우세 바 계산용)
  double get longPct {
    final p = (signalProb.clamp(0, 100)) / 100.0;
    final d = signalDir.toUpperCase();
    if (d == 'LONG' || d == 'UP') return p;
    if (d == 'SHORT' || d == 'DOWN') return 1.0 - p;
    return 0.5;
  }
  double get shortPct => 1.0 - longPct;

}

class FuCandle {
  final double open, high, low, close;
  /// Optional: volume (Bitget candles include volume). 기존 코드/위젯 호환을 위해 기본값 0.
  final double volume;
  final int ts;
  const FuCandle({
    required this.open,
    required this.high,
    required this.low,
    required this.close,
    required this.ts,
    this.volume = 0,
  });
}

class FuZone {
  final double low, high;
  /// Optional label shown on chart (e.g., "BPR 1", "BPR 2", "OB").
  final String label;
  /// Direction hint: 1 bullish (green), -1 bearish (red), 0 neutral.
  final int dir;

  /// Optional time span (candle index range) for drawing a horizontal box.
  /// - If provided, the zone will be drawn only between [iStart]..[iEnd]
  ///   within the currently visible candle window.
  /// - If null, the zone is drawn across the full visible width.
  final int? iStart;
  final int? iEnd;

  const FuZone({
    required this.low,
    required this.high,
    this.label = '',
    this.dir = 0,
    this.iStart,
    this.iEnd,
  });

  // 호환: 일부 위젯에서 hi/lo를 사용
  double get hi => high;
  double get lo => low;
}

/// 멀티 타임프레임 압축 상태(상단 스트립/압력 표시용)
class FuTfPulse {
  /// LONG/SHORT/NEUTRAL
  final String dir;
  /// RANGE / CHOCH_UP / CHOCH_DN / BOS_UP / BOS_DN
  final String structure;
  /// 0~100 (높을수록 위험)
  final int risk;
  /// 반응구간 터치/근접 여부
  final bool inReaction;
  /// PREMIUM / EQ / DISCOUNT
  final String location;
  /// 0~100 (해당 TF 신호 강도)
  final int strength;

  const FuTfPulse({
    required this.dir,
    required this.structure,
    required this.risk,
    required this.inReaction,
    required this.location,
    required this.strength,
  });

  // --- UI helpers (compile-safe) ---
  static FuTfPulse empty() => const FuTfPulse(
        dir: "WATCH",
        structure: "",
        risk: 0,
        inReaction: false,
        location: "",
        strength: 0,
      );

  String get dirLabel {
    final d = dir.toUpperCase();
    if (d == 'LONG') return '상승';
    if (d == 'SHORT') return '하락';
    return '관망';
  }

  int get dirProb => strength;

  String get closeState {
    if (inReaction) return '반응';
    if (risk >= 65) return '주의';
    if (risk >= 35) return '중립';
    return '좋음';
  }
}

// MTF 맵 접근 편의 (기존 UI 코드 호환)
extension FuPulseMapX on Map<String, FuTfPulse> {
  FuTfPulse get m1 => this['1m'] ?? this['1M'] ?? FuTfPulse.empty();
  FuTfPulse get m5 => this['5m'] ?? FuTfPulse.empty();
  FuTfPulse get m15 => this['15m'] ?? FuTfPulse.empty();
  FuTfPulse get h1 => this['1h'] ?? this['1H'] ?? FuTfPulse.empty();
  FuTfPulse get h4 => this['4h'] ?? this['4H'] ?? FuTfPulse.empty();
  FuTfPulse get d1 => this['1d'] ?? this['1D'] ?? FuTfPulse.empty();
  FuTfPulse get w1 => this['1w'] ?? this['1W'] ?? FuTfPulse.empty();
  FuTfPulse get mo1 => this['1M'] ?? this['1m'] ?? FuTfPulse.empty();


}


