/// S-20: 온체인/거시 외부 지표 슬롯 — 나중에 꽂을 수 있는 구조만 고정
class ExternalMetric {
  final String name;
  final double value;
  final int time;

  ExternalMetric({
    required this.name,
    required this.value,
    required this.time,
  });

  Map<String, dynamic> toJson() => {'name': name, 'value': value, 'time': time};

  static ExternalMetric? fromJson(Map<String, dynamic>? m) {
    if (m == null) return null;
    final name = m['name'] as String?;
    final value = m['value'] as num?;
    final time = m['time'] as int?;
    if (name == null || value == null || time == null) return null;
    return ExternalMetric(name: name, value: value.toDouble(), time: time);
  }
}
