import 'dart:convert';
import 'dart:io';
import 'core_engine.dart';

class StatsHub {
  final File file;

  StatsHub({String path = 'fulink_stats.json'}) : file = File(path);

  Map<String, dynamic> _db = {};

  Future<void> load() async {
    if (await file.exists()) {
      try {
        _db = jsonDecode(await file.readAsString()) as Map<String, dynamic>;
      } catch (_) {
        _db = {};
      }
    }
  }

  Future<void> save() async {
    await file.writeAsString(jsonEncode(_db));
  }

  /// Record a snapshot; caller can extend with trade outcome later.
  void push(CoreSnapshot s) {
    final key = s.tf;
    final cur = (_db[key] as Map<String, dynamic>?) ?? <String, dynamic>{};
    final n = (cur['n'] ?? 0) as int;

    cur['n'] = n + 1;
    cur['avgUp'] = _avg(cur['avgUp'], n, s.breakoutUp);
    cur['avgDown'] = _avg(cur['avgDown'], n, s.breakoutDown);
    cur['lastWhale'] = s.whale;
    cur['lastRisk'] = s.risk;

    _db[key] = cur;
  }

  Map<String, dynamic> snapshot(String tf) => (_db[tf] as Map<String, dynamic>?) ?? <String, dynamic>{};

  double _avg(dynamic prev, int n, double x) {
    final p = (prev is num) ? prev.toDouble() : 0.0;
    if (n <= 0) return x;
    return (p * n + x) / (n + 1);
  }
}
