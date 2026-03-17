
class PositionState {
  final double entry;
  final double current;
  final double tp;
  final double sl;

  PositionState({
    required this.entry,
    required this.current,
    required this.tp,
    required this.sl,
  });

  double get progress {
    if (current >= entry) {
      return ((current - entry) / (tp - entry)).clamp(0.0, 1.0);
    } else {
      return ((entry - current) / (entry - sl)).clamp(0.0, 1.0);
    }
  }

  bool get isSuccess => current >= tp;
  bool get isFail => current <= sl;
}
