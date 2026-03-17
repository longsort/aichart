
import 'dart:async';
import 'dart:math';
import 'package:flutter/material.dart';

/// AITimelineController
/// - START() 하면 증거가 1개씩 쌓이고(펄스 트리거용)
/// - confidence가 서서히 수렴하고
/// - reasons가 1줄로 채워짐
class AITimelineController extends ChangeNotifier {
  final Random _rng = Random();
  Timer? _t;
  bool running = false;

  int evidenceCount = 0;
  double confidence = 0.0;
  List<String> reasons = const [];

  // demo 내부 후보 (나중에 진짜 엔진 출력으로 교체)
  final List<String> _pool = const [
    "에너지↑",
    "변동성↓",
    "거래량↑",
    "구조일치",
    "리스크↓",
    "추세유지",
    "돌파시도",
    "되돌림완료",
  ];

  void start({int maxEvidence = 6, int ms = 550}) {
    stop();
    running = true;
    evidenceCount = 0;
    confidence = 0.18 + _rng.nextDouble() * 0.12; // 시작은 낮게
    reasons = const [];
    notifyListeners();

    _t = Timer.periodic(Duration(milliseconds: ms), (timer) {
      evidenceCount += 1;

      // confidence 수렴(증거 늘수록 확신 증가)
      confidence = (confidence + 0.12 + _rng.nextDouble() * 0.06).clamp(0.0, 0.98);

      // reasons 하나씩 추가 (최대 3개만)
      final next = _pool[_rng.nextInt(_pool.length)];
      final list = reasons.toList();
      if (!list.contains(next)) list.add(next);
      reasons = list.take(3).toList();

      notifyListeners();

      if (evidenceCount >= maxEvidence) {
        stop();
      }
    });
  }

  void stop() {
    _t?.cancel();
    _t = null;
    running = false;
  }

  @override
  void dispose() {
    stop();
    super.dispose();
  }
}

/// OneTapAutoRunButton
/// - 버튼 1개로 "자동 수집/수렴" 시작
class OneTapAutoRunButton extends StatelessWidget {
  final VoidCallback onStart;
  final bool running;
  const OneTapAutoRunButton({super.key, required this.onStart, required this.running});

  @override
  Widget build(BuildContext context) {
    return ElevatedButton(
      onPressed: running ? null : onStart,
      child: Text(running ? "RUNNING…" : "AUTO RUN"),
    );
  }
}
