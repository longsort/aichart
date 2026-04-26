import 'package:flutter/foundation.dart';
import 'package:fulink_pro_ultra/engine/consensus/consensus_bus.dart';

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

/// 중앙 AI (v1): ConsensusBus(0~1) + evidence(hit/total) + staleness(연동) 기반으로
/// 최상단 게이지에 바로 꽂을 수 있는 DecisionState를 생성.
/// - 지금은 Entry/SL/TP는 0 placeholder (다음 단계에서 핵심구간/ATR로 채움)
class DecisionEngineV1 {
  static const int staleMs = 6000; // 6초 이상 갱신 없으면 LOCK
  static const double minConfidenceToTrade = 25; // 25% 미만이면 LOCK
  static const int minEvidenceHit = 4; // hit < 4면 LOCK (10개 기준)

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
        reason: '연동안됨(데이터 갱신 없음)',
      );
    }

    if (!evidenceOk) {
      return DecisionState(
        direction: TradeDirection.neutral,
        finalScore: score,
        confidence: confidence,
        noTradeLock: true,
        reason: '근거 부족 ($evidenceHit/$evidenceTotal)',
      );
    }

    if (confidence < minConfidenceToTrade) {
      return DecisionState(
        direction: TradeDirection.neutral,
        finalScore: score,
        confidence: confidence,
        noTradeLock: true,
        reason: '합의 약함',
      );
    }

    final dir = score > 0 ? TradeDirection.long : TradeDirection.short;
    return DecisionState(
      direction: dir,
      finalScore: score,
      confidence: confidence,
      noTradeLock: false,
      reason: '중앙 AI 합의',
      plan: const TradePlan(entry: 0, sl: 0, tps: [0, 0, 0]),
    );
  }
}

/// UI에서 편하게 쓰라고 ValueNotifier로 감싼 상태 저장소
class DecisionStoreV1 {
  static final DecisionStoreV1 I = DecisionStoreV1._();
  DecisionStoreV1._() {
    // 초기값
    _recompute();

    // bus 변경 감지
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
      reason: '부팅중',
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
