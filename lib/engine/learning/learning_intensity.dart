import 'package:flutter/foundation.dart';

class LearningIntensity {
  static final LearningIntensity I = LearningIntensity._();
  LearningIntensity._();

  /// 0.0 ~ 1.0 (higher = learn faster / change weights more)
  final ValueNotifier<double> alpha = ValueNotifier<double>(0.35);
}