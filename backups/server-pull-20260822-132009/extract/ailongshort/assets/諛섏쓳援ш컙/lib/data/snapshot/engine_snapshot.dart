import 'evidence.dart';

enum TradeState { allow, caution, block }

class EngineSnapshot {
  final int tsMs;
  final double bias;        // -1..+1
  final double longPct;     // 0..1
  final double shortPct;    // 0..1
  final double consensus;   // 0..1
  final double confidence;  // 0..1
  final TradeState state;
  final List<Evidence> top;

  const EngineSnapshot({
    required this.tsMs,
    required this.bias,
    required this.longPct,
    required this.shortPct,
    required this.consensus,
    required this.confidence,
    required this.state,
    required this.top,
  });

  factory EngineSnapshot.empty() => EngineSnapshot(
        tsMs: DateTime.now().millisecondsSinceEpoch,
        bias: 0,
        longPct: 0.5,
        shortPct: 0.5,
        consensus: 0.5,
        confidence: 0.5,
        state: TradeState.caution,
        top: const [],
      );
}
