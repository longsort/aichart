import '../market/market_store.dart';
import '../market/exchange.dart';
import 'app_db.dart';

class LogService {
  LogService._();
  static final LogService I = LogService._();

  Future<void> init() async {
    await AppDb.I.init();
  }

  Future<void> logSignal({
    required String decision,
    required double confidence,
    required double longP,
    required double shortP,
    required int evidenceActive,
    String? note,
  }) async {
    final t = MarketStore.I.ticker.value;
    final ex = MarketStore.I.exchange.value;
    await AppDb.I.db.insert('signal_logs', {
      'ts': DateTime.now().millisecondsSinceEpoch,
      'symbol': t.symbol,
      'exchange': ex.label,
      'decision': decision,
      'confidence': confidence,
      'longP': longP,
      'shortP': shortP,
      'evidenceActive': evidenceActive,
      'note': note,
    });
  }

  Future<void> logZones({
    required List<double?> p,
    required double price,
    required List<double> support,
    required List<double> resistance,
  }) async {
    final t = MarketStore.I.ticker.value;
    await AppDb.I.db.insert('zone_logs', {
      'ts': DateTime.now().millisecondsSinceEpoch,
      'symbol': t.symbol,
      'p1': p.length > 0 ? p[0] : null,
      'p2': p.length > 1 ? p[1] : null,
      'p3': p.length > 2 ? p[2] : null,
      'p4': p.length > 3 ? p[3] : null,
      'p5': p.length > 4 ? p[4] : null,
      'price': price,
      'support1': support.length > 0 ? support[0] : 0.0,
      'resistance1': resistance.length > 0 ? resistance[0] : 0.0,
      'support2': support.length > 1 ? support[1] : 0.0,
      'resistance2': resistance.length > 1 ? resistance[1] : 0.0,
      'support3': support.length > 2 ? support[2] : 0.0,
      'resistance3': resistance.length > 2 ? resistance[2] : 0.0,
      'support4': support.length > 3 ? support[3] : 0.0,
      'resistance4': resistance.length > 3 ? resistance[3] : 0.0,
      'support5': support.length > 4 ? support[4] : 0.0,
      'resistance5': resistance.length > 4 ? resistance[4] : 0.0,
    });
  }
}
