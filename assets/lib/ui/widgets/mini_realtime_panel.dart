import 'package:flutter/material.dart';
import '../../core/realtime/realtime_bus.dart';
import '../../data/models/candle.dart';
import 'mini_realtime_chart.dart';

/// 사용:
/// MiniRealtimePanel(bus: bus)
/// - 화면 initState에서 bus.start()
/// - dispose에서 bus.dispose()
class MiniRealtimePanel extends StatelessWidget {
  final RealtimeBus bus;
  final double height;

  const MiniRealtimePanel({super.key, required this.bus, this.height = 140});

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<List<Candle>>(
      stream: bus.stream,
      builder: (context, snap) {
        final candles = snap.data ?? const <Candle>[];
        return MiniRealtimeChart(candles: candles, height: height);
      },
    );
  }
}
