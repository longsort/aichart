import '../utils/ai_safe.dart';

/// STEP15: 과거 통계 요약(유사 시그널/히스토리 기반)
/// dtoMap 안에 아래 중 하나가 있으면 사용:
/// - 'scenarioHistory': List<Map> (예: [{dir, ok, movePct, rr, ts}, ...])
/// - 'history': List<Map>
class AiPastStatsService {
  static Map<String, dynamic> build(Map<String, dynamic> dto) {
    final raw = AiSafe.pick(dto, 'scenarioHistory') ?? AiSafe.pick(dto, 'history');
    if (raw is! List) {
      return {
        'n': 0,
        'winP': 0,
        'avgMoveP': 0.0,
        'avgRR': 0.0,
        'hint': '히스토리 없음',
      };
    }

    final items = raw.whereType<Map>().toList();
    if (items.isEmpty) {
      return {'n': 0, 'winP': 0, 'avgMoveP': 0.0, 'avgRR': 0.0, 'hint': '히스토리 없음'};
    }

    int n = 0;
    int wins = 0;
    double sumMove = 0;
    double sumRR = 0;

    for (final m in items) {
      n += 1;
      final ok = AiSafe.asBool(m['ok'] ?? m['win'], false);
      if (ok) wins += 1;
      sumMove += AiSafe.asDouble(m['movePct'] ?? m['moveP'] ?? m['move'], 0);
      sumRR += AiSafe.asDouble(m['rr'] ?? m['RR'], 0);
    }

    final winP = n == 0 ? 0 : ((wins / n) * 100).round();
    final avgMoveP = n == 0 ? 0.0 : (sumMove / n);
    final avgRR = n == 0 ? 0.0 : (sumRR / n);

    String hint = '유사 $n회 · 승률 $winP%';
    if (n >= 10) hint += ' · 신뢰↑';
    if (n < 5) hint += ' · 표본↓';

    return {
      'n': n,
      'winP': winP,
      'avgMoveP': avgMoveP,
      'avgRR': avgRR,
      'hint': hint,
    };
  }
}
