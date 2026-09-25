import 'package:flutter/foundation.dart';
import 'trade_guard.dart';

enum PresetMode { beginner, conservative, aggressive }

class PresetController {
  PresetController._();
  static final PresetController I = PresetController._();

  final ValueNotifier<PresetMode> mode = ValueNotifier<PresetMode>(PresetMode.conservative);

  /// ?�호 최소 기�?(TradeGuard?�서 ?�용)
  double minConfidence = 0.60;
  double minConsensus = 0.50;

  void apply(PresetMode m) {
    mode.value = m;

    if (m == PresetMode.beginner) {
      minConfidence = 0.65;
      minConsensus = 0.55;
      TradeGuard.I.maxConsecutiveLoss = 2;
      TradeGuard.I.cooldownMinutes = 25;
    } else if (m == PresetMode.conservative) {
      minConfidence = 0.60;
      minConsensus = 0.50;
      TradeGuard.I.maxConsecutiveLoss = 3;
      TradeGuard.I.cooldownMinutes = 20;
    } else {
      minConfidence = 0.55;
      minConsensus = 0.45;
      TradeGuard.I.maxConsecutiveLoss = 4;
      TradeGuard.I.cooldownMinutes = 15;
    }

    TradeGuard.I.save();
  }

  String label(PresetMode m) {
    switch (m) {
      case PresetMode.beginner:
        return '초보';
      case PresetMode.conservative:
        return '보수';
      case PresetMode.aggressive:
        return '공격';
    }
  }
}
