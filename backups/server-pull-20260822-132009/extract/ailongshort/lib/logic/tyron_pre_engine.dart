import '../core/app_settings.dart';
import '../logic/tyron_pro_engine.dart' show TyronProEngine;
import '../data/models/candle.dart' as rt;

/// PRE(마감 ?? 경고 ?�진
/// - 결정??바꾸지 ?�는??
/// - 캔들 진행률이 충분???�을 ??기본 90%)�?'?�전 경고'�??�다.
class TyronPreEngine {
  static TyronPreRes? analyzePre({
    required String tf,
    required List<rt.Candle> candles,
    required int lastCandleOpenMs,
    required int nowMs,
    int preMinProb = 65,
  }) {
    if (candles.length < 60) return null;

    final prog = candleProgress(tf: tf, lastOpenMs: lastCandleOpenMs, nowMs: nowMs);
    if (prog < 0.90) return null;

    final pro = TyronProEngine.analyze(candles);
    // NEUTRAL?�면 PRE???��? ?�음
    if (pro.bias == 'NEUTRAL') return null;

    // PRE??'결정�?미만' 구간?�서�??��?가 ?�다.
    if (pro.confidence >= AppSettings.signalMinProb) return null;

    if (pro.confidence < preMinProb) return null;

    return TyronPreRes(
      dir: pro.bias,
      readiness: pro.confidence,
      progress: prog,
      reason: pro.reasons.isNotEmpty ? pro.reasons.first : '조건 축적 �?,
    );
  }

  /// tf 문자??-> ms
  static int tfMillis(String tf) {
    switch (tf) {
      case '1m': return 60 * 1000;
      case '3m': return 3 * 60 * 1000;
      case '5m': return 5 * 60 * 1000;
      case '15m': return 15 * 60 * 1000;
      case '30m': return 30 * 60 * 1000;
      case '1h': return 60 * 60 * 1000;
      case '2h': return 2 * 60 * 60 * 1000;
      case '4h': return 4 * 60 * 60 * 1000;
      case '1D': return 24 * 60 * 60 * 1000;
      case '1W': return 7 * 24 * 60 * 60 * 1000;
      case '1M': return 30 * 24 * 60 * 60 * 1000;
      default: return 5 * 60 * 1000;
    }
  }

  static double candleProgress({required String tf, required int lastOpenMs, required int nowMs}) {
    final period = tfMillis(tf);
    final elapsed = (nowMs - lastOpenMs).clamp(0, period);
    return (elapsed / period).clamp(0.0, 1.0);
  }
}

class TyronPreRes {
  final String dir; // LONG/SHORT
  final int readiness; // 0~100
  final double progress; // 0~1
  final String reason;
  TyronPreRes({required this.dir, required this.readiness, required this.progress, required this.reason});
}
