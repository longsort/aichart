import 'dart:async';

import '../data/snapshot/snapshot_hub.dart';
import '../data/snapshot/evidence.dart';
import '../data/snapshot/engine_snapshot.dart';

/// 앱 전체에서 하나만 쓰는 중앙 코어
/// - SnapshotHub(중앙 파이프) 1개
/// - 어디서든 AppCore.I.hub 로 push/stream 가능
/// - 화면들은 setState 남발 없이 StreamBuilder로 구독
class AppCore {
  AppCore._();

  static final AppCore I = AppCore._();

  final SnapshotHub hub = SnapshotHub(tick: const Duration(seconds: 1));

  bool _started = false;

  EngineSnapshot get last => hub.last;
  Stream<EngineSnapshot> get stream => hub.stream;

  
  /// 최신 스냅샷(대시보드/신호에서 바로 읽기)
  EngineSnapshot get snapshot => hub.last;
void start() {
    if (_started) return;
    _started = true;
    hub.start();
  }

  void dispose() {
    hub.dispose();
  }

  void push(Evidence e) => hub.push(e);
}
