import 'dart:async';

import '../data/snapshot/snapshot_hub.dart';
import '../data/snapshot/evidence.dart';
import '../data/snapshot/engine_snapshot.dart';

/// ???„ì²´?ì„œ ?˜ë‚˜ë§??°ëŠ” ì¤‘ì•™ ì½”ì–´
/// - SnapshotHub(ì¤‘ì•™ ?Œì´?? 1ê°?/// - ?´ë””?œë“  AppCore.I.hub ë¡?push/stream ê°€??/// - ?”ë©´?¤ì? setState ?¨ë°œ ?†ì´ StreamBuilderë¡?êµ¬ë…
class AppCore {
  AppCore._();

  static final AppCore I = AppCore._();

  final SnapshotHub hub = SnapshotHub(tick: const Duration(seconds: 1));

  bool _started = false;

  EngineSnapshot get last => hub.last;
  Stream<EngineSnapshot> get stream => hub.stream;

  
  /// ìµœì‹  ?¤ëƒ…???€?œë³´??? í˜¸?ì„œ ë°”ë¡œ ?½ê¸°)
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
