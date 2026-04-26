import 'dart:math';

/// 매우 단순한 경제 이벤트 캘린더(오프라인 안전 버전)
///
/// ✅ 목표
/// - "발표 임박"을 감지해서 위험도(LOCK)에 가중치를 주는 것.
/// - 네트워크/외부 API가 없어도 앱이 항상 실행되어야 함.
///
/// ⚠️ 추후
/// - 실제 경제캘린더 API 연동으로 교체 가능.

class EconomicEvent {
  final DateTime timeLocal; // Asia/Seoul 기준
  final String title;
  final String region; // 예: US
  final int importance; // 1..3

  const EconomicEvent({
    required this.timeLocal,
    required this.title,
    required this.region,
    required this.importance,
  });
}

class EconomicCalendar {
  /// 오늘(로컬) 주요 이벤트 TOP N 반환 (오프라인 기본값)
  ///
  /// - 현재는 샘플 이벤트를 제공합니다.
  /// - 사용자는 이후 "patch.json"으로 리스트를 교체하는 방식으로도 확장 가능.
  static List<EconomicEvent> today({DateTime? now, int maxItems = 5}) {
    final n = now ?? DateTime.now();

    // 샘플: 오늘 날짜에 맞춰 "시간"만 고정(실제 값은 추후 연동)
    final y = n.year;
    final m = n.month;
    final d = n.day;
    final sample = <EconomicEvent>[
      EconomicEvent(
        timeLocal: DateTime(y, m, d, 22, 30),
        title: '미국 주요지표 발표(샘플)',
        region: 'US',
        importance: 3,
      ),
      EconomicEvent(
        timeLocal: DateTime(y, m, d, 24, 0),
        title: 'FOMC/연준 관련(샘플)',
        region: 'US',
        importance: 3,
      ),
      EconomicEvent(
        timeLocal: DateTime(y, m, d, 18, 0),
        title: '유럽 지표(샘플)',
        region: 'EU',
        importance: 2,
      ),
    ];

    sample.sort((a, b) => a.timeLocal.compareTo(b.timeLocal));
    return sample.take(maxItems).toList();
  }

  /// 발표 임박 위험도(0..100)
  /// - 0: 일정 없음/영향 적음
  /// - 100: 초임박(예: 0~10분)
  static int eventRisk({
    required List<EconomicEvent> events,
    DateTime? now,
  }) {
    if (events.isEmpty) return 0;
    final n = now ?? DateTime.now();

    // 가장 가까운 "앞으로" 이벤트만 본다.
    EconomicEvent? next;
    for (final e in events) {
      if (e.timeLocal.isAfter(n)) {
        next = e;
        break;
      }
    }
    if (next == null) return 0;

    final diffMin = next.timeLocal.difference(n).inMinutes;
    // 120분 밖은 거의 무시
    if (diffMin > 120) return 0;

    // 임박도: 0..100 (0분에 가까울수록 높음)
    // 120분 -> 0, 0분 -> 100
    final base = ((120 - diffMin) / 120 * 100).round().clamp(0, 100);

    // 중요도 가중
    final imp = (next.importance).clamp(1, 3);
    final mult = imp == 3 ? 1.0 : (imp == 2 ? 0.75 : 0.55);
    return max(0, (base * mult).round()).clamp(0, 100);
  }
}
