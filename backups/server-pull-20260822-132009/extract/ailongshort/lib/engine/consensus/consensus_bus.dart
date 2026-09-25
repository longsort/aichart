import 'package:flutter/foundation.dart';

class ConsensusBus {
  static final ConsensusBus I = ConsensusBus._();
  ConsensusBus._();

  /// 0.0 ~ 1.0
  final ValueNotifier<double> consensus01 = ValueNotifier<double>(0.0);

  /// TF => UP% (0~100)
  final ValueNotifier<Map<String, int>> tfUp = ValueNotifier<Map<String, int>>({});
}