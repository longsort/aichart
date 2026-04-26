import 'package:flutter/foundation.dart';

class FulinkHudState {
  final String decision;
  final bool engulfMode;
  final double buyPressure01;
  final double sellPressure01;
  final double upProb01;
  final double downProb01;
  final String lockReason;

  final double? zoneHigh;
  final double? zoneLow;
  final String? zoneTf;
  final String? topReason;

  final int updatedAtMs;

  const FulinkHudState({
    required this.decision,
    required this.engulfMode,
    required this.buyPressure01,
    required this.sellPressure01,
    required this.upProb01,
    required this.downProb01,
    required this.lockReason,
    required this.updatedAtMs,
    this.zoneHigh,
    this.zoneLow,
    this.zoneTf,
    this.topReason,
  });

  static FulinkHudState neutral(int nowMs) => FulinkHudState(
        decision: "NEUTRAL",
        engulfMode: false,
        buyPressure01: 0.5,
        sellPressure01: 0.5,
        upProb01: 0.5,
        downProb01: 0.5,
        lockReason: "",
        updatedAtMs: nowMs,
      );
}

class FulinkHudBus extends ValueNotifier<FulinkHudState> {
  FulinkHudBus._() : super(FulinkHudState.neutral(DateTime.now().millisecondsSinceEpoch));
  static final FulinkHudBus I = FulinkHudBus._();

  void updateClamped({
    String? decision,
    bool? engulfMode,
    double? buyPressure01,
    double? sellPressure01,
    double? upProb01,
    double? downProb01,
    String? lockReason,
    double? zoneHigh,
    double? zoneLow,
    String? zoneTf,
    String? topReason,
  }) {
    double c(double v) => v.isNaN ? 0.5 : v.clamp(0.0, 1.0);
    final cur = value;
    value = FulinkHudState(
      decision: decision ?? cur.decision,
      engulfMode: engulfMode ?? cur.engulfMode,
      buyPressure01: c(buyPressure01 ?? cur.buyPressure01),
      sellPressure01: c(sellPressure01 ?? cur.sellPressure01),
      upProb01: c(upProb01 ?? cur.upProb01),
      downProb01: c(downProb01 ?? cur.downProb01),
      lockReason: lockReason ?? cur.lockReason,
      updatedAtMs: DateTime.now().millisecondsSinceEpoch,
      zoneHigh: zoneHigh ?? cur.zoneHigh,
      zoneLow: zoneLow ?? cur.zoneLow,
      zoneTf: zoneTf ?? cur.zoneTf,
      topReason: topReason ?? cur.topReason,
    );
  }
}
