import 'dart:async';
import 'evidence.dart';
import 'engine_snapshot.dart';

class SnapshotHub {
  final Duration tick;
  final _ev = <Evidence>[];
  final _out = StreamController<EngineSnapshot>.broadcast();
  Timer? _timer;

  EngineSnapshot _last = EngineSnapshot.empty();
  EngineSnapshot get last => _last;
  Stream<EngineSnapshot> get stream => _out.stream;

  SnapshotHub({this.tick = const Duration(seconds: 1)});

  void start() => _timer ??= Timer.periodic(tick, (_) => _emit());

  void stop() {
    _timer?.cancel();
    _timer = null;
  }

  void dispose() {
    stop();
    _out.close();
  }

  void push(Evidence e) => _ev.add(e);

  void _emit() {
    if (_out.isClosed) return;
    final now = DateTime.now().millisecondsSinceEpoch;
    final ev = List<Evidence>.from(_ev);
    _ev.clear();

    if (ev.isEmpty) {
      _last = EngineSnapshot(
        tsMs: now,
        bias: _last.bias,
        longPct: _last.longPct,
        shortPct: _last.shortPct,
        consensus: _last.consensus,
        confidence: _last.confidence,
        state: _last.state,
        top: _last.top,
      );
      _out.add(_last);
      return;
    }

    double wSum = 0, sSum = 0, cSum = 0;
    for (final e in ev) {
      final w = (e.weight * (0.4 + 0.6 * e.confidence)).clamp(0.0, 1.2);
      wSum += w;
      sSum += w * e.score.clamp(-1.0, 1.0);
      cSum += w * e.confidence.clamp(0.0, 1.0);
    }

    final bias = (wSum <= 0 ? 0.0 : (sSum / wSum)).clamp(-1.0, 1.0);
    final conf = (wSum <= 0 ? 0.5 : (cSum / wSum)).clamp(0.0, 1.0);

    double variance = 0;
    for (final e in ev) {
      final d = (e.score - bias);
      variance += d * d;
    }
    variance = variance / ev.length;
    final consensus = (1.0 - variance).clamp(0.0, 1.0);

    final longPct = ((bias + 1) / 2).clamp(0.0, 1.0);
    final shortPct = 1.0 - longPct;

    final state =
        (conf >= 0.72 && consensus >= 0.62) ? TradeState.allow :
        (conf >= 0.52 && consensus >= 0.45) ? TradeState.caution :
        TradeState.block;

    ev.sort((a, b) {
      final aa = (a.weight * a.confidence) * a.score.abs();
      final bb = (b.weight * b.confidence) * b.score.abs();
      return bb.compareTo(aa);
    });

    _last = EngineSnapshot(
      tsMs: now,
      bias: bias,
      longPct: longPct,
      shortPct: shortPct,
      consensus: consensus,
      confidence: conf,
      state: state,
      top: ev.take(6).toList(growable: false),
    );

    _out.add(_last);
  }
}
