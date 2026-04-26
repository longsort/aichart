import '../settings/app_settings.dart';

class RiskCalcResult {
  final double notionalUsdt;
  final double qty;
  final double leverage;
  final double marginUsdt;
  final double slPct; // 수수료 포함 손절%
  final double tpPct; // 수수료 포함 목표%
  final double slUsdt;
  final double tpUsdt;

  const RiskCalcResult({
    required this.notionalUsdt,
    required this.qty,
    required this.leverage,
    required this.marginUsdt,
    required this.slPct,
    required this.tpPct,
    required this.slUsdt,
    required this.tpUsdt,
  });
}

/// 화면 표기용 간단 계산기
/// - FuState의 entry/stop/target/leverage/qty를 그대로 사용
/// - 수수료(왕복)는 AppSettings.feeRoundTrip로 반영
class RiskCalc {
  static RiskCalcResult compute({
    required double entry,
    required double stop,
    required double target,
    required double qty,
    required double leverage,
  }) {
    final feeRt = AppSettings.feeRoundTrip;
    final notional = (qty * entry).abs();
    final margin = leverage <= 0 ? 0.0 : (notional / leverage);

    double pctLoss() {
      if (entry <= 0) return 0;
      final raw = ((entry - stop).abs() / entry);
      return ((raw + feeRt) * 100.0);
    }

    double pctGain() {
      if (entry <= 0) return 0;
      final raw = ((target - entry).abs() / entry);
      final net = (raw - feeRt);
      return (net < 0 ? 0 : net * 100.0);
    }

    final slPct = pctLoss();
    final tpPct = pctGain();
    final slUsdt = notional * (slPct / 100.0);
    final tpUsdt = notional * (tpPct / 100.0);

    return RiskCalcResult(
      notionalUsdt: notional,
      qty: qty,
      leverage: leverage,
      marginUsdt: margin,
      slPct: slPct,
      tpPct: tpPct,
      slUsdt: slUsdt,
      tpUsdt: tpUsdt,
    );
  }
}
