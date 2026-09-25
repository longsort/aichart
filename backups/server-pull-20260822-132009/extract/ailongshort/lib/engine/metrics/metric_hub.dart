import '../models/external_metric.dart';

/// S-20: ?¸ë? ì§€???¬ë¡¯ ??meta???©ë¥˜, ë¸Œë¦¬?‘ì— 1ì¤??”ì•½. ?¹ì¥?€ ?”ë? OK.
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

  /// meta???£ì„ ë§?(EngineOutput.meta???©ë¥˜)
  Map<String, dynamic> toMeta() {
    if (_metrics.isEmpty) return {};
    return {
      'external': _metrics.map((m) => m.toJson()).toList(),
      'externalSummary': getSummary(),
    };
  }

  /// ë¸Œë¦¬??1ì¤??”ì•½
  String getSummary() {
    if (_metrics.isEmpty) return '?¸ë? ì§€?? (?†ìŒ)';
    final parts = _metrics.map((m) => '${m.name}=${m.value.toStringAsFixed(2)}').take(3).toList();
    return '?¸ë? ì§€?? ${parts.join(', ')}';
  }

  /// ?”ë? ê°’ìœ¼ë¡??¬ë¡¯ ?™ì‘ ?•ì¸ (?•ì¥ ê°€??
  void seedDummy() {
    add(ExternalMetric(name: '?¨ì²´???”ë?', value: 0.0, time: DateTime.now().millisecondsSinceEpoch));
  }
}
