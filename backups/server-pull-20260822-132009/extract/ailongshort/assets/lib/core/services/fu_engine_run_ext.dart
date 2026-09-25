import '../models/fu_state.dart';
import 'fu_engine.dart';

extension FuEngineRunExt on FuEngine {
  /// UI-friendly alias used by some patches.
  Future<FuState> run({
    required String symbol,
    required String tf,
    bool allowNetwork = true,
    bool safeMode = false,
  }) {
    return fetch(
      symbol: symbol,
      tf: tf,
      allowNetwork: allowNetwork,
      safeMode: safeMode,
    );
  }
}
