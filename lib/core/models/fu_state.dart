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

  // v10.7: ?˜ì¹˜??? ë¢°??êµ¬ê°„/?¬ì???
  final int confidenceScore;
  final String confidenceLabel;
  final double recommendR;
  final int longScore;
  final int shortScore;
  /// ìµœì¢… ê²°ì • ?¬ìœ (Decision HUD v11 ?œì‹œ??
  final String finalDecisionReason;
  final double zoneValid;
  final double zoneInvalid;
  final List<double> zoneTargets;
  final double posQty;
  final int posLev;
  final double posRiskPct;

  // v10.7: ë¯¸ë‹ˆì°¨íŠ¸ ? ê?
  final bool showFvg;
  final bool showOb;
  final bool showBos;
  final bool showChoch;

  // === Futures plan (optional) ===
  // ? í˜¸ ?œì‹œ ê²Œì´?? (?©ì˜ 4/5 ?´ìƒ) + (?ˆìƒ ROI 25% ?´ìƒ) + (NO-TRADE ?„ë‹˜)
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
  // ?•ì • ? í˜¸ë¥??¼ì • ?œê°„/ìº”ë“¤ ?™ì•ˆ ê³ ì •?´ì„œ "ì§„ì…?ˆë‹¤ê°€ ë§ì•˜??ë¥?ë§‰ëŠ”??
  final bool pLocked;
  final String pLockDir; // LONG/SHORT/NO
  final int pLockProb; // 0~100
  final int pLockRemainingSec;
  final String pLockWhy;

  // ë°©í–¥/?•ë¥ /?±ê¸‰
  final String signalDir; // LONG/SHORT/NEUTRAL
  final int signalProb;
  final String signalGrade;

  // === ë§ˆê°/?ŒíŒŒ/ê±°ë˜???•í™•??ì½”ì–´) ===
  // 0~100 (50=ì¤‘ë¦½)
  final int closeScore;    // ì¢…ê?(ë§ˆê°) ?ˆì§ˆ
  final int breakoutScore; // ?ŒíŒŒ ?ˆì§ˆ
  final int volumeScore;   // ê±°ë˜??ì§?
  // ì´ˆë³´??ë¬¸ì¥(?„ë“œëª??¸í™˜)
  final String signalKo;
  final String signalWhy;

  // ê³ ê¸‰/?”ì•½ bullet
  final List<String> signalBullets;

  final List<FuCandle> candles;
  final List<FuZone> fvgZones;
  // ?•ì¥ ?¤ë²„?ˆì´(?”ì§„??ì±„ì?)
  final List<FuZone> obZones;
  final List<FuZone> bprZones;
  final List<FuZone> mbZones;
  final List<FuZone> smcZones;
  final int lossStreak;

  // === ?¸ë ¥/ê³ ë˜/ê¸°ê? (public-data heuristics) ===
  // 0~100 scale
  final int whaleScore;
  // ?¸ë ¥(Force) / ?¡ìˆ˜(Absorption) / ?¤ìœ•(Stop-hunt/Sweep) ë³´ê°•
  final int forceScore;
  final int absorptionScore;
  final int sweepRisk;
  final int defenseScore;
  final int distributionScore;
  final int whaleBuyPct;
  final int instBias; // ê¸°ê?/?¸ë ¥ ë°©í–¥??ë§¤ìˆ˜ ?°ì„¸=?’ìŒ)
  final int obImbalance; // ?¤ë”ë¶?ë§¤ìˆ˜ ë¹„ì¤‘(0~100)
  final int tapeBuyPct; // ì²´ê²° ë§¤ìˆ˜ ë¹„ì¤‘(0~100)
  final String flowHint;

  // === Zone classifier (êµ¬ê°„ ?ì •: ? í˜¸ê°€ ?†ì–´????ƒ 1ê°?ì¶œë ¥) ===
  final String zoneCode;     // DEFENSE/REBOUND/PULLBACK_REBOUND/ABSORB_BUY/DISTRIBUTION_SELL/DANGER/NONE
  final String zoneName;     // ?œê? ?¼ë²¨
  final String zoneBias;     // LONG/SHORT/NEUTRAL
  final int zoneStrength;    // 0~100
  final int zoneLongP;       // 0~100
  final int zoneShortP;      // 0~100
  final int zoneWaitP;       // 0~100
  final String zoneTrigger;  // ì§„ì… ?¸ë¦¬ê±?1ì¤?  final String zoneInvalidLine; // ë¬´íš¨/ì£¼ì˜ 1ì¤?  final List<String> zoneReasons; // ê·¼ê±°(ìµœë? 3ì¤?


  // === êµ¬ì¡°/ë°˜ì‘ êµ¬ê°„(CHOCH/BOS) ===
  // UI?ì„œ ?«ìë¡?ê³ ì • ?œì‹œ(?˜ëŒë¦?ë°˜ì‘ê°€ê²?êµ¬ê°„)
  final String structureTag;
  final List<StructMark> structMarks; // RANGE / CHOCH_UP / CHOCH_DN / BOS_UP / BOS_DN
  final double breakLevel;   // êµ¬ì¡° ?ŒíŒŒ/?´íƒˆ ê¸°ì? ê°€ê²?  final double reactLevel;   // ?˜ëŒë¦?ë°˜ì‘ ê°€ê²??µì‹¬)
  final double reactLow;     // ë°˜ì‘ êµ¬ê°„ ?˜ë‹¨(??
  final double reactHigh;    // ë°˜ì‘ êµ¬ê°„ ?ë‹¨(??

  // === ë©€???€?„í”„?ˆì„ ?•ì¶• ?íƒœ(?ë‹¨ ?¤íŠ¸ë¦??•ë ¥ ?œì‹œ?? ===
  // key ?? '1m','5m','15m','1h','4h','1D','1W','1M'
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

    // v10.7: ?˜ì¹˜??ê¸°ë³¸ê°?
    this.confidenceScore = 0,
    this.confidenceLabel = 'ë³´í†µ',
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

  // ---------------- UI helpers (ê¸°ì¡´ ?”ì§„ ê°’ìœ¼ë¡œë§Œ ?Œìƒ)
  /// ?ë‹¨/?¤ë²„?ˆì´ 'ìµœì¢…' ?¼ë²¨
  String get decisionLabel {
    if (noTrade) return '?¬ê¸°';
    if (tradeOk) return 'ì§„ì…';
    return 'ê´€ë§?;
  }

  /// ?ë‹¨/?¤ë²„?ˆì´ '?íƒœ' ?¼ë²¨
  String get statusLabel {
    // ë¦¬ìŠ¤???’ìŒ / ê·¼ê±° ë¶€ì¡?/ ?©ì˜ ë¶€ì¡±ì´ë©?ê²½ê³ 
    final bool lowEvidence = evidenceTotal > 0 ? (evidenceHit / evidenceTotal) < 0.4 : true;
    final bool highRisk = sweepRisk >= 55;
    final bool weakConsensus = !consensusOk;
    if (noTrade) return 'ê²½ê³ ';
    if (highRisk || lowEvidence || weakConsensus) return 'ê²½ê³ ';
    return 'ì¤€ë¹?;
  }

  /// ?¤ë²„?ˆì´???œê¸°??'ë¦¬ìŠ¤??%)'
  int get riskPct {
    final int v = sweepRisk;
    if (v < 0) return 0;
    if (v > 100) return 100;
    return v;
  }

  factory FuState.initial() => const FuState();

  // ------------------------------------------------------------------
  // SPEC aliases (FULINK_FINAL_CODING_SPEC)
  // - ê¸°ì¡´ ?„ë“œë¥?ê¹¨ì? ?Šê³ , ?¤í™ ?„ë“œëª…ì„ ê²Œí„°/ë§µìœ¼ë¡??œê³µ?œë‹¤.
  // ------------------------------------------------------------------

  /// ?¤í™: livePrice
  double get livePrice => price;

  /// ?¤í™: zoneValid (0~100, int)
  int get zoneValidInt {
    final v = zoneValid;
    if (v.isNaN || v.isInfinite) return 0;
    return v.round().clamp(0, 100);
  }

  /// ?¤í™: hasStructure
  bool get hasStructure {
    final tag = structureTag.toUpperCase();
    if (tag.contains('CHOCH') || tag.contains('BOS')) return true;
    // RANGE?¼ë„ break/react ?ˆë²¨???ˆìœ¼ë©?êµ¬ì¡°ë¡?ì·¨ê¸‰
    return (breakLevel > 0) || (reactLevel > 0);
  }

  /// ?¤í™: structureType {box|trend|range|none}
  String get structureType {
    final tag = structureTag.toUpperCase();
    if (!hasStructure && tag.trim().isEmpty) return 'none';
    if (tag.contains('RANGE')) return 'range';
    if (tag.contains('BOS') || tag.contains('CHOCH')) return 'trend';
    return 'box';
  }

  /// ?¤í™: structureScore (0~100)
  int get structureScoreInt => structureScore;

  /// ?¤í™: tfAgree
  bool get tfAgree => consensusOk;

  /// ?¤í™: flags {hasFvg, hasOb, hasBpr, hasChoch, hasBos}
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

  /// ?¤í™: sr {s1, r1, sProb, rProb}
  /// - ?•ë¥ ??ë³„ë„ë¡??†ìœ¼ë¯€ë¡? ?„ì¬ ? ë¢°/ë¦¬ìŠ¤??ë°©í–¥ ê¸°ë°˜?¼ë¡œ ?¨ìˆœ ?Œìƒ(?œì‹œ??
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

// ReactionHeatmapPanel??ê¸°ë??˜ëŠ” ?„ë“œëª…ì„ ê¸°ì¡´ ?”ì§„ ?„ë“œë¡?ë§¤í•‘
  int get evidenceHitCount => evidenceHit;
  int get evidenceNeed => evidenceTotal;
  double get reactionZoneLow => reactLow;
  double get reactionZoneHigh => reactHigh;


int get reactionSupportProb => confidence.clamp(0, 100);
int get reactionResistProb => (100 - confidence).clamp(0, 100);

  /// êµ¬ì¡° ?ìˆ˜(0~100): CHOCH/BOS ?¬ë? + ë¸Œë ˆ?´í¬ ?ˆë²¨ ? ë¬´ë¡?ê°€ì¤?  int get structureScore {
    int v = 45;
    final tag = structureTag.toUpperCase();
    if (tag.contains('CHOCH') || tag.contains('BOS')) v = 72;
    if (breakLevel > 0) v += 8;
    if (reactLevel > 0) v += 5;
    if (v > 100) v = 100;
    return v;
  }

  /// BPR ?©ë¥˜??0~100): BPR ì¡?ì¡´ì¬/ê²¹ì¹¨(ê°œìˆ˜) ê¸°ë°˜
  int get bprConfluenceScore {
    int v = 28;
    if (bprZones.isNotEmpty) v = 68;
    if (bprZones.length >= 2) v = 78;
    // ë°˜ì‘êµ¬ê°„ê³?ê²¹ì¹˜ë©?ì¶”ê? ê°€??    if (reactLow > 0 && reactHigh > 0 && bprZones.isNotEmpty) {
      v += 10;
    }
    if (v > 100) v = 100;
    return v;
  }

  /// PO3 ?ìˆ˜(0~100): ?¡ìˆ˜(Absorption) ?’ê³  ?¤ìœ• ?„í—˜ ??„?˜ë¡ ??  int get po3Score {
    final a = absorptionScore.clamp(0, 100);
    final s = (100 - sweepRisk).clamp(0, 100);
    final v = (a * 0.6 + s * 0.4).round().clamp(0, 100);
    return v;
  }

  /// OB/CHOCH ?ìˆ˜(0~100): OB ì¡?+ êµ¬ì¡° ?œê·¸ ì¡°í•©
  int get obChochScore {
    int v = 22;
    if (obZones.isNotEmpty) v = 55;
    final tag = structureTag.toUpperCase();
    if (tag.contains('CHOCH')) v += 20;
    if (tag.contains('BOS')) v += 12;
    if (v > 100) v = 100;
    return v;
  }

  /// FVG/BPR ?ìˆ˜(0~100): FVG + BPR ?™ì‹œ ì¡´ì¬ë©???  int get fvgBprScore {
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

  // v7 ?µí•©: ?„ë½???¸í™˜ ê²Œí„°(ë¹Œë“œ ?ëŸ¬ ë°©ì?)
  /// ?•ë¥ (0.0~1.0). UI?ì„œ *100 ?´ì„œ %ë¡??œì‹œ
  double get probFinal => (signalProb.clamp(0, 100)) / 100.0;

  /// ë§¤ë§¤ ê¸ˆì?/? ê¸ˆ
  bool get noTrade => locked || !showSignal;

  // === ManagerTradePanel ?¸í™˜ (v6~v7 ?¨ì¹˜?ì„œ ì°¸ì¡°) ===
  /// ìµœì¢… ?•ë¥ (0~1). UI?ì„œ??*100 ?´ì„œ %ë¡??œì‹œ.
  double get finalProb => probFinal;

  /// ë§¤ë§¤ ? ê¸ˆ(?¸íŠ¸?ˆì´?? ?íƒœ (trueë©?ì§„ì… ê¸ˆì?)
  bool get tradelock => noTrade;

  /// camelCase ë³„ì¹­ (UI ?¨ì¹˜ ?¸í™˜)
  bool get tradeLock => tradelock;

  /// ? í˜¸ê°€ 'ì§„ì… ê°€?? ?˜ì??¸ì? (ê¸°ë³¸: noTradeê°€ ?„ë‹ˆê³? ?•ë¥  20% ?´ìƒ)
  bool get tradeok => (!noTrade) && (probFinal >= 0.20);

  /// camelCase ë³„ì¹­ (UI ?¨ì¹˜ ?¸í™˜)
  bool get tradeOk => tradeok;

  /// 'ê´€ë§?ì£¼ì˜' ?ˆë²¨?¸ì? (ê¸°ë³¸: ?•ë¥  20% ë¯¸ë§Œ)
  bool get watch => (probFinal < 0.20);

  /// ë°©í–¥???•ìˆ˜ë¡?(ë¡?+1, ??-1, ì¤‘ë¦½=0)
  int get dir {
    final d = signalDir.toUpperCase();
    if (d.contains('LONG')) return 1;
    if (d.contains('SHORT')) return -1;
    return 0;
  }
  // === ì¶”ê? UI ?¸í™˜(ìµœê·¼ ?¨ì¹˜?ì„œ ì°¸ì¡°) ===
  // ultra_home_screen.dart ?±ì—??finalDir/grade/rrë¥?ê¸°ë?
  String get finalDir => signalDir;
  String get grade => signalGrade;
  double get rr {
    final risk = (entry - stop).abs();
    if (risk <= 0) return 0;
    final reward = (target - entry).abs();
    return reward / risk;
  }
  // UI ?¨ì¹˜ ?¸í™˜: expectedRoiPctë¥?ì°¾ëŠ” ?”ë©´???ˆìŒ
  double get expectedRoiPct => roiPotential;
  int get srStrength {
    final v = signalProb;
    if (v < 0) return 0;
    if (v > 100) return 100;
    return v;
  }

  // UI ?¨ì¹˜ ?¸í™˜: ?¼ë? ?”ë©´/?¨ì¹˜?ì„œ sl/tp/evidencePctë¥?ì°¸ì¡°
  double get sl => stop;
  double get tp => target;
  double get evidencePct {
    if (evidenceTotal <= 0) return 0;
    final v = (evidenceHit / evidenceTotal) * 100.0;
    if (v < 0) return 0;
    if (v > 100) return 100;
    return v;
  }
  // === ManagerTradePanel ì¶”ê? ?¸í™˜ ?„ë“œ ===
  /// ?¸íŠ¸?ˆì´???´ìœ (?ˆìœ¼ë©?lockedReason ?¬ìš©)
  String get noTradeReason {
    if (lockedReason.isNotEmpty) return lockedReason;
    if (locked) return '? ê¸ˆ';
    if (!consensusOk) return '?ìœ„/ë©€?°TF ?©ì˜ ë¶€ì¡?;
    if (!roiOk) return '?ˆìƒ ë²”ìœ„ ë¶€ì¡?;
    if (!showSignal) return 'ê·¼ê±° ë¶€ì¡?;
    return '';
  }

  /// 3ë¶„í•  ?µì ˆ (40/35/25) - ë°©í–¥???°ë¼ entry~target êµ¬ê°„ ë¶„ë°°
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

  /// ?„ìš” ?ˆë²„ë¦¬ì?(?”ì§„ ê³„ì‚° leverage ê·¸ë?ë¡?
  double get levNeed => leverage;

// ===== Legacy compatibility (build error prevention) =====
/// ê¸°ì¡´ ì½”ë“œ?ì„œ state.why ë¥?ì°¸ì¡°?˜ëŠ” ê²½ìš°ë¥??„í•´ ?œê³µ
String get why => signalWhy;

/// ê¸°ì¡´ ì½”ë“œ?ì„œ state.evidenceScore ë¥?ì°¸ì¡°?˜ëŠ” ê²½ìš°ë¥??„í•´ ?œê³µ
int get evidenceScore => score;

/// ê¸°ì¡´ ì½”ë“œ?ì„œ state.signal (enum) ??ì°¸ì¡°?˜ëŠ” ê²½ìš°ë¥??„í•´ ?œê³µ
FuSignal get signal {
  final d = signalDir.toUpperCase();
  if (d == 'LONG' || d == 'UP') return FuSignal.long;
  if (d == 'SHORT' || d == 'DOWN') return FuSignal.short;
  return FuSignal.neutral;
}

  // === UI ?¸í™˜: ê°œí¸ ?„ì ¯?ì„œ ì°¸ì¡°?˜ëŠ” ë³„ì¹­/?œê·¸ ===
  String get patternTag => structureTag;
  String get waveTag => flowHint;

  // 0.0~1.0 (?ìŠ¹/?˜ë½ ?°ì„¸ ë°?ê³„ì‚°??
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
  /// Optional: volume (Bitget candles include volume). ê¸°ì¡´ ì½”ë“œ/?„ì ¯ ?¸í™˜???„í•´ ê¸°ë³¸ê°?0.
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

  // ?¸í™˜: ?¼ë? ?„ì ¯?ì„œ hi/loë¥??¬ìš©
  double get hi => high;
  double get lo => low;
}

/// ë©€???€?„í”„?ˆì„ ?•ì¶• ?íƒœ(?ë‹¨ ?¤íŠ¸ë¦??•ë ¥ ?œì‹œ??
class FuTfPulse {
  /// LONG/SHORT/NEUTRAL
  final String dir;
  /// RANGE / CHOCH_UP / CHOCH_DN / BOS_UP / BOS_DN
  final String structure;
  /// 0~100 (?’ì„?˜ë¡ ?„í—˜)
  final int risk;
  /// ë°˜ì‘êµ¬ê°„ ?°ì¹˜/ê·¼ì ‘ ?¬ë?
  final bool inReaction;
  /// PREMIUM / EQ / DISCOUNT
  final String location;
  /// 0~100 (?´ë‹¹ TF ? í˜¸ ê°•ë„)
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
    if (d == 'LONG') return '?ìŠ¹';
    if (d == 'SHORT') return '?˜ë½';
    return 'ê´€ë§?;
  }

  int get dirProb => strength;

  String get closeState {
    if (inReaction) return 'ë°˜ì‘';
    if (risk >= 65) return 'ì£¼ì˜';
    if (risk >= 35) return 'ì¤‘ë¦½';
    return 'ì¢‹ìŒ';
  }
}

// MTF ë§??‘ê·¼ ?¸ì˜ (ê¸°ì¡´ UI ì½”ë“œ ?¸í™˜)
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


