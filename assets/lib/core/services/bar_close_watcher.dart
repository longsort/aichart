import 'dart:async';
import 'package:flutter/foundation.dart';
import '../utils/candle_close_util.dart';
import '../models/fu_state.dart';

/// 마감 이벤트/카운트다운 제공 (로컬시간 기준)
/// - UI에서 1초 단위로 남은 시간을 보여주기 위한 Watcher
/// - 엔진 확정 판정(마감 기반) 트리거의 기반으로 사용 가능
class BarCloseWatcher {
  final List<String> tfs;
  final ValueNotifier<List<CandleCloseInfo>> infos = ValueNotifier<List<CandleCloseInfo>>(<CandleCloseInfo>[]);
  Timer? _timer;

  BarCloseWatcher({required this.tfs});

  void start(FuState s) {
    stop();
    _tick(s);
    _timer = Timer.periodic(const Duration(seconds: 1), (_) => _tick(s));
  }

  void updateState(FuState s) {
    // 상태만 바뀐 경우 즉시 반영 (가격/vwap/점수/리스크 등)
    _tick(s);
  }

  void _tick(FuState s) {
    final list = <CandleCloseInfo>[];
    for (final tf in tfs) {
      list.add(CandleCloseUtil.evaluate(
        tfLabel: tf,
        price: s.price,
        vwap: s.vwap,
        score: s.score,
        confidence: s.confidence,
        risk: s.risk,
      ));
    }
    infos.value = list;
  }

  void stop() {
    _timer?.cancel();
    _timer = null;
  }

  void dispose() {
    stop();
    infos.dispose();
  }
}
