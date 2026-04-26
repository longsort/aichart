
extension StatsExt on Stats {
  double get winRatePct => total == 0 ? 0 : (win / total) * 100.0;
}
