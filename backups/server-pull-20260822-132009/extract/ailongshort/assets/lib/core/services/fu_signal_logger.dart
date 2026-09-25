import 'dart:convert';
import 'dart:io';

import '../models/fu_state.dart';

class FuSignalLogger {
  static Future<void> append(FuState s) async {
    try {
      if (!s.showSignal) return;
      final f = File('fulink_logs.jsonl');
      final m = {
        "ts": DateTime.now().toIso8601String(),
        "symbol": "BTCUSDT",
        // FuState에 tf 필드가 없어서 고정값 사용(필요 시 이후 key/tfLabel로 확장)
        "tf": "AUTO",
        "dir": s.signalDir,
        "prob": s.signalProb,
        "grade": s.signalGrade,
        "price": s.price,
        "entry": s.entry,
        "stop": s.stop,
        "target": s.target,
        "structure": s.structureTag,
        "breakLevel": s.breakLevel,
        "reactLow": s.reactLow,
        "reactHigh": s.reactHigh,
        "closeScore": s.closeScore,
        "breakoutScore": s.breakoutScore,
        "volumeScore": s.volumeScore,
        "force": s.forceScore,
        "absorb": s.absorptionScore,
        "defense": s.defenseScore,
        "dist": s.distributionScore,
        "sweep": s.sweepRisk,
        "zoneReasons": s.zoneReasons,
        "noTrade": s.noTrade,
        "noTradeReason": s.noTradeReason,
      };
      await f.writeAsString(jsonEncode(m) + "\n", mode: FileMode.append);
    } catch (_) {}
  }
}