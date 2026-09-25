import 'dart:convert';
import 'dart:io';

import '../models/fu_state.dart';

/// 4H FINAL tracker/logger (no extra deps).
///
/// What it does:
/// 1) Detects a new 4H candle close (by last candle ts change).
/// 2) If a FINAL signal exists (LONG/SHORT + showSignal), it records it.
/// 3) For the previously open signal, it checks TP/SL touch using candle high/low
///    and records an OUTCOME row.
///
/// Files:
/// - fulink_logs/tyron_h4_final_signals.jsonl
/// - fulink_logs/tyron_h4_open.json
class TyronH4FinalTracker {
  static final TyronH4FinalTracker I = TyronH4FinalTracker._();
  TyronH4FinalTracker._();

  int _lastSeenCandleTs = 0;

  /// Call this whenever you update the 4H FuState snapshot.
  Future<void> onH4Snapshot(FuState s) async {
    try {
      if (s.candles.isEmpty) return;
      final lastC = s.candles.last;
      final int ts = lastC.ts;

      // Only act when a NEW candle closes (ts changes).
      if (ts == _lastSeenCandleTs) return;
      _lastSeenCandleTs = ts;

      // Resolve previous open signal first (using THIS candle range).
      await _resolveOpenIfAny(usingHigh: lastC.high, usingLow: lastC.low, tsClose: ts);

      // Record new signal if FINAL.
      final dir = s.signalDir.toUpperCase();
      if (!s.showSignal) return;
      if (dir != 'LONG' && dir != 'SHORT') return;

      final entry = (s.entry > 0) ? s.entry : lastC.close;
      final sl = (s.stop > 0) ? s.stop : (dir == 'LONG' ? entry * 0.99 : entry * 1.01);
      final tp = (s.target > 0) ? s.target : (dir == 'LONG' ? entry * 1.02 : entry * 0.98);

      final row = <String, dynamic>{
        "type": "SIGNAL",
        "ts": DateTime.now().toIso8601String(),
        "tf": "4h",
        "dir": dir,
        "prob": s.signalProb.clamp(0, 100),
        "grade": s.signalGrade,
        "price": s.price,
        "entry": entry,
        "sl": sl,
        "tp": tp,
        "structure": s.structureTag,
        "reactLow": s.reactLow,
        "reactHigh": s.reactHigh,
        "evidence": "${s.evidenceHit}/${s.evidenceTotal}",
      };

      await _appendJsonl(row);

      // Store as open signal for later outcome check.
      await _writeOpen(<String, dynamic>{
        "dir": dir,
        "entry": entry,
        "sl": sl,
        "tp": tp,
        "tsOpen": ts,
        "prob": s.signalProb.clamp(0, 100),
      });
    } catch (_) {
      // swallow
    }
  }

  Future<void> _resolveOpenIfAny({
    required double usingHigh,
    required double usingLow,
    required int tsClose,
  }) async {
    try {
      final open = await _readOpen();
      if (open == null) return;

      final String dir = (open['dir'] ?? '').toString().toUpperCase();
      final double sl = _asDouble(open['sl']);
      final double tp = _asDouble(open['tp']);
      if (sl <= 0 || tp <= 0) return;

      bool? win;
      String method = '';

      if (dir == 'LONG') {
        if (usingHigh >= tp) {
          win = true;
          method = 'TP';
        } else if (usingLow <= sl) {
          win = false;
          method = 'SL';
        }
      } else if (dir == 'SHORT') {
        if (usingLow <= tp) {
          win = true;
          method = 'TP';
        } else if (usingHigh >= sl) {
          win = false;
          method = 'SL';
        }
      }

      if (win == null) return;

      final out = <String, dynamic>{
        "type": "OUTCOME",
        "ts": DateTime.now().toIso8601String(),
        "tf": "4h",
        "dir": dir,
        "result": win ? 'WIN' : 'LOSS',
        "method": method,
        "tsClose": tsClose,
        "entry": _asDouble(open['entry']),
        "sl": sl,
        "tp": tp,
        "prob": open['prob'],
      };

      await _appendJsonl(out);
      await _writeOpen(null);
    } catch (_) {
      // swallow
    }
  }

  Future<void> _appendJsonl(Map<String, dynamic> m) async {
    try {
      final dir = Directory('fulink_logs');
      if (!dir.existsSync()) dir.createSync(recursive: true);
      final f = File('fulink_logs/tyron_h4_final_signals.jsonl');
      await f.writeAsString(jsonEncode(m) + "\n", mode: FileMode.append, flush: false);
    } catch (_) {}
  }

  Future<Map<String, dynamic>?> _readOpen() async {
    try {
      final f = File('fulink_logs/tyron_h4_open.json');
      if (!f.existsSync()) return null;
      final s = await f.readAsString();
      if (s.trim().isEmpty) return null;
      final v = jsonDecode(s);
      if (v is Map<String, dynamic>) return v;
      return null;
    } catch (_) {
      return null;
    }
  }

  Future<void> _writeOpen(Map<String, dynamic>? open) async {
    try {
      final dir = Directory('fulink_logs');
      if (!dir.existsSync()) dir.createSync(recursive: true);
      final f = File('fulink_logs/tyron_h4_open.json');
      if (open == null) {
        if (f.existsSync()) await f.delete();
        return;
      }
      await f.writeAsString(jsonEncode(open), mode: FileMode.write, flush: false);
    } catch (_) {}
  }

  double _asDouble(dynamic v) {
    if (v is num) return v.toDouble();
    return double.tryParse(v?.toString() ?? '') ?? 0.0;
  }
}
