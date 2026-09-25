// Super AGI v6 Adapter Core (STOP-HUNT) - no UI dependencies.
// Pure functions only. Safe to import anywhere.
//
// Philosophy: "ì§??ŒëŠ” ?ˆë? ì§„ìž…?˜ì? ?ŠëŠ”??.
// Stop-loss is recommended *outside* the stop-hunt band.

class StopHuntResult {
  final double buffer;
  final double huntLow;   // valid for LONG
  final double huntHigh;  // valid for SHORT
  final double suggestedSlLong;
  final double suggestedSlShort;

  // 0~100 (higher = more stop-hunt risk)
  final double riskScore;

  const StopHuntResult({
    required this.buffer,
    required this.huntLow,
    required this.huntHigh,
    required this.suggestedSlLong,
    required this.suggestedSlShort,
    required this.riskScore,
  });
}

class StopHuntCalculatorV6 {
  /// Compute stop-hunt band + suggested SL using:
  /// buffer = max(ATR(tf)*k1, zoneWidth*k2)
  ///
  /// Inputs are "best-effort": provide what you have, null is allowed.
  /// - For LONG: candidates for "hunt base low" are min of (swingLow, wickClusterLow, liquiditySweepLow, zoneLow).
  /// - For SHORT: candidates for "hunt base high" are max of (swingHigh, wickClusterHigh, liquiditySweepHigh, zoneHigh).
  static StopHuntResult compute({
    required double zoneLow,
    required double zoneHigh,
    double? atr,
    double k1 = 1.0,
    double k2 = 0.20,
    double? swingLow,
    double? swingHigh,
    double? wickClusterLow,
    double? wickClusterHigh,
    double? liquiditySweepLow,
    double? liquiditySweepHigh,
    double? entry,
  }) {
    final zoneWidth = (zoneHigh - zoneLow).abs();
    final atrPart = (atr ?? 0.0) * k1;
    final widthPart = zoneWidth * k2;
    final buffer = (atrPart > widthPart) ? atrPart : widthPart;

    final longBase = _minNonNull([
      swingLow,
      wickClusterLow,
      liquiditySweepLow,
      zoneLow,
    ]) ?? zoneLow;

    final shortBase = _maxNonNull([
      swingHigh,
      wickClusterHigh,
      liquiditySweepHigh,
      zoneHigh,
    ]) ?? zoneHigh;

    final huntLow = longBase - buffer;
    final huntHigh = shortBase + buffer;

    // Suggested SL is outside the stop-hunt band
    final suggestedSlLong = huntLow;
    final suggestedSlShort = huntHigh;

    // Risk score heuristic (0~100). We keep it simple + safe.
    // - Narrow zone => higher risk (hunts more likely)
    // - If entry is close to zone edges => higher risk
    double risk = 0.0;
    if (zoneWidth <= 0) {
      risk = 100.0;
    } else {
      // narrower zone => bigger risk
      final wScore = (1.0 / zoneWidth) * 10.0; // scale
      risk += (wScore.isFinite ? wScore : 100.0);

      if (entry != null) {
        final distToEdge = _min2((entry - zoneLow).abs(), (zoneHigh - entry).abs());
        final edgeScore = (1.0 / (distToEdge + 1e-9)) * 5.0;
        risk += (edgeScore.isFinite ? edgeScore : 50.0);
      }

      // larger buffer reduces risk (more room)
      risk -= (buffer / (zoneWidth + 1e-9)) * 10.0;
    }
    if (risk < 0) risk = 0;
    if (risk > 100) risk = 100;

    return StopHuntResult(
      buffer: buffer,
      huntLow: huntLow,
      huntHigh: huntHigh,
      suggestedSlLong: suggestedSlLong,
      suggestedSlShort: suggestedSlShort,
      riskScore: risk,
    );
  }

  static double? _minNonNull(List<double?> xs) {
    double? m;
    for (final x in xs) {
      if (x == null) continue;
      m = (m == null) ? x : (x < m ? x : m);
    }
    return m;
  }

  static double? _maxNonNull(List<double?> xs) {
    double? m;
    for (final x in xs) {
      if (x == null) continue;
      m = (m == null) ? x : (x > m ? x : m);
    }
    return m;
  }

  static double _min2(double a, double b) => a < b ? a : b;
}
