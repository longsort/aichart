import 'struct_event.dart';
import 'level_line.dart';

/// 엔진 출력 — UI와 분리
class EngineOutput {
  final String symbol;
  final String tf;
  final List<StructEvent> events;
  final List<LevelLine> lines;
  final int confidence;
  final Map<String, dynamic>? meta;

  EngineOutput({
    required this.symbol,
    required this.tf,
    required this.events,
    required this.lines,
    required this.confidence,
    this.meta,
  });
}
