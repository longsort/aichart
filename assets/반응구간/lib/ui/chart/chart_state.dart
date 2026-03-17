import '../../engine/models/candle.dart';
import '../../engine/models/struct_event.dart';

/// S-02/S-03: 차트 터치 선택 + viewWindow(줌/팬용 시간 범위)
class ChartState {
  final int? selectedTime;
  final double? selectedPrice;
  final String tooltipText;
  final int? viewStartTime;
  final int? viewEndTime;

  const ChartState({
    this.selectedTime,
    this.selectedPrice,
    this.tooltipText = '',
    this.viewStartTime,
    this.viewEndTime,
  });

  ChartState copyWith({
    int? selectedTime,
    double? selectedPrice,
    String? tooltipText,
    int? viewStartTime,
    int? viewEndTime,
  }) {
    return ChartState(
      selectedTime: selectedTime ?? this.selectedTime,
      selectedPrice: selectedPrice ?? this.selectedPrice,
      tooltipText: tooltipText ?? this.tooltipText,
      viewStartTime: viewStartTime ?? this.viewStartTime,
      viewEndTime: viewEndTime ?? this.viewEndTime,
    );
  }

  static String buildTooltip(int timeMs, double price, List<Candle> candles, List<StructEvent> events) {
    final timeStr = _formatTime(timeMs);
    final eventsAt = events.where((e) => (e.t - timeMs).abs() < 60000).map((e) => e.type.name).join(', ');
    if (eventsAt.isEmpty) return '$timeStr\n가격 ${price.toStringAsFixed(0)}';
    return '$timeStr\n가격 ${price.toStringAsFixed(0)}\n$eventsAt';
  }

  static String _formatTime(int ms) {
    final d = DateTime.fromMillisecondsSinceEpoch(ms);
    return '${d.month}/${d.day} ${d.hour}:${d.minute.toString().padLeft(2, '0')}';
  }
}
