
import 'signal_stats.dart';

class StatsRegistry {
  final Map<String, SignalStats> _map = {};

  SignalStats of(String key) {
    return _map.putIfAbsent(key, () => SignalStats(key));
  }
}
