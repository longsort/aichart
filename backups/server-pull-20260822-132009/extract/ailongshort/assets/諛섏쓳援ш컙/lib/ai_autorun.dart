
import 'dart:async';
import 'dart:math';
import 'package:flutter/material.dart';

class AIAutoRun extends ChangeNotifier {
  final Random _rng = Random();
  Timer? _t;

  int evidenceCount = 0;
  double confidence = 0.0;
  List<String> reasons = const [];
  bool finished = false;

  final List<String> _pool = const [
    "에너지↑",
    "변동성↓",
    "거래량↑",
    "구조일치",
    "리스크↓",
    "추세유지",
  ];

  void start({int maxEvidence = 6, int ms = 520}) {
    stop();
    finished = false;
    evidenceCount = 0;
    confidence = 0.22;
    reasons = const [];
    notifyListeners();

    _t = Timer.periodic(Duration(milliseconds: ms), (t) {
      evidenceCount++;
      confidence = (confidence + 0.12 + _rng.nextDouble() * 0.06).clamp(0.0, 0.95);

      final list = reasons.toList();
      final next = _pool[_rng.nextInt(_pool.length)];
      if (!list.contains(next)) list.add(next);
      reasons = list.take(3).toList();

      notifyListeners();

      if (evidenceCount >= maxEvidence) {
        finished = true;
        stop();
        notifyListeners();
      }
    });
  }

  void stop() {
    _t?.cancel();
    _t = null;
  }

  @override
  void dispose() {
    stop();
    super.dispose();
  }
}
