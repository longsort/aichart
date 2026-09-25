import 'package:flutter/foundation.dart';

/// ?†Ìò∏ Í≥µÏú† ?ÅÌÉú (?†Ìò∏ ?îÎ©¥ ???Ä?úÎ≥¥???∞Í≤∞??
class SignalState {
  SignalState._();
  static final SignalState I = SignalState._();

  /// -1..+1 (?ºÏ™Ω ?? ?§Î•∏Ï™?Î°?
  final ValueNotifier<double> bias = ValueNotifier<double>(0.0);

  /// 0..100
  final ValueNotifier<int> longPct = ValueNotifier<int>(50);
  final ValueNotifier<int> shortPct = ValueNotifier<int>(50);

  /// 0..100
  final ValueNotifier<int> confidence = ValueNotifier<int>(50);

  final ValueNotifier<String> decision = ValueNotifier<String>('WAIT');

  void update({
    required double bias01,
    required int longPct,
    required int shortPct,
    required int confidence,
    required String decision,
  }) {
    bias.value = bias01.clamp(-1.0, 1.0);
    this.longPct.value = longPct.clamp(0, 100);
    this.shortPct.value = shortPct.clamp(0, 100);
    this.confidence.value = confidence.clamp(0, 100);
    this.decision.value = decision;
  }
}
