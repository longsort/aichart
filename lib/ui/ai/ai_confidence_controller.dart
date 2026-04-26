import 'dart:math' as math;

/// AI Confidence Controller (2ë²?ê¸°ëŠ¥)
/// - ìµœê·¼ ?ˆì¸¡ ?ì¤‘ë¥??±ê³¼ë¥?confidence(0~1)ë¡??•ê·œ??/// - confidenceë¡?ë¯¸ëž˜ê²½ë¡œ??ê¸¸ì´(horizon), ?ê»˜(stroke), ?¬ëª…??alpha)ë¥?ì¡°ì ˆ
///
/// NOTE: ???Œì¼?€ "ë¡œì§ë§? ?œê³µ. UI/ì°¨íŠ¸??PATCH_NOTES.txt?€ë¡??°ê²°.
class AiConfidenceController {
  /// 0.0 ~ 1.0 (??„?˜ë¡ ë³´ìˆ˜?ìœ¼ë¡? ì§§ê³  ?‡ê³  ?ë¦¬ê²?
  final double confidence;

  /// Future path horizon multiplier (0.35 ~ 1.00)
  final double horizonMul;

  /// Stroke width multiplier (0.70 ~ 1.40)
  final double strokeMul;

  /// Opacity multiplier (0.35 ~ 1.00)
  final double opacityMul;

  const AiConfidenceController._({
    required this.confidence,
    required this.horizonMul,
    required this.strokeMul,
    required this.opacityMul,
  });

  /// Create from recent hit-rate (0~100)
  factory AiConfidenceController.fromHitRate({
    required double hitRatePct,
    double minHorizon = 0.35,
    double maxHorizon = 1.00,
    double minStroke = 0.70,
    double maxStroke = 1.40,
    double minOpacity = 0.35,
    double maxOpacity = 1.00,
  }) {
    final c = _clamp01(hitRatePct / 100.0);

    // Smooth curve: low confidence drops harder
    final eased = _easeInOut(math.pow(c, 1.15).toDouble());

    return AiConfidenceController._(
      confidence: c,
      horizonMul: _lerp(minHorizon, maxHorizon, eased),
      strokeMul: _lerp(minStroke, maxStroke, eased),
      opacityMul: _lerp(minOpacity, maxOpacity, eased),
    );
  }

  /// Create from rolling score (-1.0 ~ +1.0)
  factory AiConfidenceController.fromRollingScore({
    required double score, // -1..+1
  }) {
    final c = _clamp01((score + 1.0) / 2.0);
    final eased = _easeInOut(math.pow(c, 1.10).toDouble());
    return AiConfidenceController._(
      confidence: c,
      horizonMul: _lerp(0.35, 1.00, eased),
      strokeMul: _lerp(0.70, 1.40, eased),
      opacityMul: _lerp(0.35, 1.00, eased),
    );
  }

  static double _clamp01(double v) => v < 0 ? 0 : (v > 1 ? 1 : v);

  static double _lerp(double a, double b, double t) => a + (b - a) * t;

  /// good looking easing
  static double _easeInOut(double t) {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    return t * t * (3 - 2 * t);
  }
}