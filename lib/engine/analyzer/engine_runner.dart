import '../models/candle.dart';
import '../models/struct_event.dart';
import '../models/level_line.dart';
import '../models/engine_output.dart';
import '../metrics/metric_hub.dart';
import 'structure_engine.dart';
import 'eql_engine.dart';

/// ?”ì§„ ?¬ë„ˆ ??ìº”ë“¤ ??EngineOutput (events ?œê°„?? confidence 0~100)
class EngineRunner {
  final StructureEngine _struct = StructureEngine();
  final EqlEngine _eql = EqlEngine();

  EngineOutput run(List<Candle> candles, String symbol, String tf) {
    if (candles.isEmpty) return EngineOutput(symbol: symbol, tf: tf, events: [], lines: [], confidence: 50);

    final events = _struct.run(candles, tf);
    final lines = _eql.run(candles, tf);

    final sortedEvents = List<StructEvent>.from(events)..sort((a, b) => a.t.compareTo(b.t));

    var confidence = 50;
    for (final e in sortedEvents) {
      if (e.type == StructEventType.BOS_UP || e.type == StructEventType.BOS_DN) confidence += 10;
      if (e.type == StructEventType.MSB_UP || e.type == StructEventType.MSB_DN) confidence += 15;
    }
    for (final _ in lines) confidence += 10;

    final avgV = candles.map((c) => c.v).reduce((a, b) => a + b) / candles.length;
    if (candles.isNotEmpty && candles.last.v > avgV * 1.5) confidence += 10;

    confidence = confidence.clamp(0, 100);

    final meta = MetricHub().toMeta();

    return EngineOutput(
      symbol: symbol,
      tf: tf,
      events: sortedEvents,
      lines: lines,
      confidence: confidence,
      meta: meta.isEmpty ? null : meta,
    );
  }
}
