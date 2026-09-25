import 'dart:convert';
import 'dart:io';

import 'learning_intensity.dart';

class EvidenceWeightStore {
  static final EvidenceWeightStore I = EvidenceWeightStore._();
  EvidenceWeightStore._();

  static const String _file = 'evidence_weights.json';

  Map<String, double> _weights = <String, double>{};
  Map<String, double> _baseline = <String, double>{};

  Map<String, double> get weights => _weights;
  Map<String, double> get baseline => _baseline;

  Future<Map<String, double>> load() async {
    try {
      final f = File(_file);
      if (await f.exists()) {
        final raw = jsonDecode(await f.readAsString());
        if (raw is Map) {
          _weights = raw.map((k, v) => MapEntry(k.toString(), (v as num).toDouble()));
        }
      }
    } catch (_) {
      // ignore read errors
    }

    // baseline = first loaded weights (session "전")
    if (_baseline.isEmpty) {
      _baseline = Map<String, double>.from(_weights);
    }
    return _weights;
  }

  Future<void> save(Map<String, double> w) async {
    _weights = Map<String, double>.from(w);
    try {
      final f = File(_file);
      await f.writeAsString(jsonEncode(_weights));
    } catch (_) {}
  }

  /// Update weights using current LearningIntensity.alpha (0~1).
  /// success=true => increase weights of ok evidences; false => decrease.
  Future<void> reinforce({
    required Map<String, bool> flags,
    required bool success,
  }) async {
    // ensure loaded
    if (_weights.isEmpty) await load();

    final a = LearningIntensity.I.alpha.value.clamp(0.05, 0.95);
    // step: 0.02 ~ 0.12
    final step = (0.02 + 0.10 * a).clamp(0.02, 0.12);

    final next = Map<String, double>.from(_weights);
    for (final e in flags.entries) {
      final k = e.key;
      final ok = e.value;

      final cur = (next[k] ?? 1.0);
      final dir = success ? 1.0 : -1.0;

      // only move weights for evidences that were ON
      if (!ok) continue;

      final nudged = (cur + dir * step).clamp(0.50, 1.50);
      next[k] = nudged;
    }

    await save(next);
  }
}