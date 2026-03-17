import '../models/external_metric.dart';

/// S-20: 외부 지표 슬롯 — meta에 합류, 브리핑에 1줄 요약. 당장은 더미 OK.
class MetricHub {
  static final MetricHub _instance = MetricHub._();
  factory MetricHub() => _instance;

  MetricHub._();

  final List<ExternalMetric> _metrics = [];

  List<ExternalMetric> get currentMetrics => List.unmodifiable(_metrics);

  void add(ExternalMetric m) {
    _metrics.removeWhere((e) => e.name == m.name);
    _metrics.add(m);
  }

  void addAll(List<ExternalMetric> list) {
    for (final m in list) add(m);
  }

  void clear() => _metrics.clear();

  /// meta에 넣을 맵 (EngineOutput.meta에 합류)
  Map<String, dynamic> toMeta() {
    if (_metrics.isEmpty) return {};
    return {
      'external': _metrics.map((m) => m.toJson()).toList(),
      'externalSummary': getSummary(),
    };
  }

  /// 브리핑 1줄 요약
  String getSummary() {
    if (_metrics.isEmpty) return '외부 지표: (없음)';
    final parts = _metrics.map((m) => '${m.name}=${m.value.toStringAsFixed(2)}').take(3).toList();
    return '외부 지표: ${parts.join(', ')}';
  }

  /// 더미 값으로 슬롯 동작 확인 (확장 가능)
  void seedDummy() {
    add(ExternalMetric(name: '온체인_더미', value: 0.0, time: DateTime.now().millisecondsSinceEpoch));
  }
}
