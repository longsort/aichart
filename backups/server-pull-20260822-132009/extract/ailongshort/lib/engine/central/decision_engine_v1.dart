import 'package:flutter/foundation.dart';
import 'package:ailongshort/engine/consensus/consensus_bus.dart';

enum TradeDirection { long, short, neutral }

class TradePlan {
  final double entry;
  final double sl;
  final List<double> tps; // [tp1,tp2,tp3]
  const TradePlan({required this.entry, required this.sl, required this.tps});
}

class DecisionState {
  final TradeDirection direction;
  final double finalScore; // -100 ~ +100
  final double confidence; // 0 ~ 100
  final bool noTradeLock;
  final String reason;
  final TradePlan? plan;

  const DecisionState({
    required this.direction,
    required this.finalScore,
    required this.confidence,
    required this.noTradeLock,
    required this.reason,
    this.plan,
  });
}

/// ì¤‘ì•™ AI (v1): ConsensusBus(0~1) + evidence(hit/total) + staleness(?°ë™) ê¸°ë°˜?¼ë¡œ
/// ìµœìƒ??ê²Œì´ì§€??ë°”ë¡œ ê½‚ì„ ???ˆëŠ” DecisionStateë¥??ì„±.
/// - ì§€ê¸ˆì? Entry/SL/TP??0 placeholder (?¤ìŒ ?¨ê³„?ì„œ ?µì‹¬êµ¬ê°„/ATRë¡?ì±„ì?)
class DecisionEngineV1 {
  static const int staleMs = 6000; // 6ì´??´ìƒ ê°±ì‹  ?†ìœ¼ë©?LOCK
  static const double minConfidenceToTrade = 25; // 25% ë¯¸ë§Œ?´ë©´ LOCK
  static const int minEvidenceHit = 4; // hit < 4ë©?LOCK (10ê°?ê¸°ì?)

  static DecisionState fromBus({
    required double consensus01,
    required int evidenceHit,
    required int evidenceTotal,
    required int lastUpdateMs,
    required int nowMs,
  }) {
    // 0~1 -> -100~+100
    final score = ((consensus01.clamp(0.0, 1.0) - 0.5) * 200.0).clamp(-100.0, 100.0);
    final confidence = score.abs().clamp(0.0, 100.0);

    final isStale = (nowMs - lastUpdateMs) > staleMs;
    final evidenceOk = evidenceHit >= minEvidenceHit;

    if (isStale) {
      return DecisionState(
        direction: TradeDirection.neutral,
        finalScore: 0,
        confidence: 0,
        noTradeLock: true,
        reason: '?°ë™?ˆë¨(?°ì´??ê°±ì‹  ?†ìŒ)',
      );
    }

    if (!evidenceOk) {
      return DecisionState(
        direction: TradeDirection.neutral,
        finalScore: score,
        confidence: confidence,
        noTradeLock: true,
        reason: 'ê·¼ê±° ë¶€ì¡?($evidenceHit/$evidenceTotal)',
      );
    }

    if (confidence < minConfidenceToTrade) {
      return DecisionState(
        direction: TradeDirection.neutral,
        finalScore: score,
        confidence: confidence,
        noTradeLock: true,
        reason: '?©ì˜ ?½í•¨',
      );
    }

    final dir = score > 0 ? TradeDirection.long : TradeDirection.short;
    return DecisionState(
      direction: dir,
      finalScore: score,
      confidence: confidence,
      noTradeLock: false,
      reason: 'ì¤‘ì•™ AI ?©ì˜',
      plan: const TradePlan(entry: 0, sl: 0, tps: [0, 0, 0]),
    );
  }
}

/// UI?ì„œ ?¸í•˜ê²??°ë¼ê³?ValueNotifierë¡?ê°ì‹¼ ?íƒœ ?€?¥ì†Œ
class DecisionStoreV1 {
  static final DecisionStoreV1 I = DecisionStoreV1._();
  DecisionStoreV1._() {
    // ì´ˆê¸°ê°?    _recompute();

    // bus ë³€ê²?ê°ì?
    ConsensusBus.I.consensus01.addListener(_recompute);
    ConsensusBus.I.evidenceHit.addListener(_recompute);
    ConsensusBus.I.evidenceTotal.addListener(_recompute);
    ConsensusBus.I.lastUpdateMs.addListener(_recompute);
  }

  final ValueNotifier<DecisionState> state = ValueNotifier<DecisionState>(
    const DecisionState(
      direction: TradeDirection.neutral,
      finalScore: 0,
      confidence: 0,
      noTradeLock: true,
      reason: 'ë¶€?…ì¤‘',
    ),
  );

  void _recompute() {
    final now = DateTime.now().millisecondsSinceEpoch;
    final s = DecisionEngineV1.fromBus(
      consensus01: ConsensusBus.I.consensus01.value,
      evidenceHit: ConsensusBus.I.evidenceHit.value,
      evidenceTotal: ConsensusBus.I.evidenceTotal.value,
      lastUpdateMs: ConsensusBus.I.lastUpdateMs.value,
      nowMs: now,
    );
    state.value = s;
  }
}
