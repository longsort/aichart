import '../models/fu_state.dart';

class CloseContextV1 {
  final String labelKo; // ê°•í•¨/ë³´í†µ/?½í•¨/?¨ì •
  final int score; // 0~100
  final String reason;
  final double bodyPct; // 0~1
  final double wickUpPct; // 0~1
  final double wickDnPct; // 0~1
  const CloseContextV1({
    required this.labelKo,
    required this.score,
    required this.reason,
    required this.bodyPct,
    required this.wickUpPct,
    required this.wickDnPct,
  });
}

/// ì¢…ê?(ë§ˆê°) ?ˆì§ˆ ê°„ë‹¨ ?ì •
/// - ë§ˆì?ë§?ìº”ë“¤(ìµœì‹ ) ê¸°ì??¼ë¡œ ë°”ë””/ê¼¬ë¦¬/ì¢…ê? ?„ì¹˜ë¥??ìˆ˜??/// - ?„ë¬¸?©ì–´ ìµœì†Œ??ì´ˆë³´???œê?)
class CloseContextEngineV1 {
  const CloseContextEngineV1();

  /// ê¸°ì¡´ FuEngine ?¸í™˜???•ì  ?¸ì¶œ)
  /// - FuState ?†ì´ ìº”ë“¤ë§Œìœ¼ë¡?ê°„ë‹¨ ?ì •
  static CloseContextV1 eval(List<FuCandle> candles) {
    if (candles.isEmpty) {
      return const CloseContextV1(
        labelKo: '?€ê¸?,
        score: 0,
        reason: 'ìº”ë“¤ ?°ì´???†ìŒ',
        bodyPct: 0,
        wickUpPct: 0,
        wickDnPct: 0,
      );
    }
    final c = candles.last;
    final range = (c.high - c.low).abs();
    if (range <= 0) {
      return const CloseContextV1(
        labelKo: '?€ê¸?,
        score: 0,
        reason: 'ë³€???†ìŒ',
        bodyPct: 0,
        wickUpPct: 0,
        wickDnPct: 0,
      );
    }

    final body = (c.close - c.open).abs();
    final upperWick = (c.high - (c.open > c.close ? c.open : c.close)).clamp(0, double.infinity);
    final lowerWick = ((c.open < c.close ? c.open : c.close) - c.low).clamp(0, double.infinity);

    final bodyPct = (body / range).clamp(0.0, 1.0);
    final wickUpPct = (upperWick / range).clamp(0.0, 1.0);
    final wickDnPct = (lowerWick / range).clamp(0.0, 1.0);
    final closePos = ((c.close - c.low) / range).clamp(0.0, 1.0);

    int score = (bodyPct * 60 + closePos * 40).round().clamp(0, 100);
    if (wickUpPct >= 0.45 && closePos <= 0.55) {
      score = (score * 0.7).round();
      return CloseContextV1(
        labelKo: '?¨ì •ì£¼ì˜',
        score: score,
        reason: '?—ê¼¬ë¦?ê¸¸ê³  ?„ì—??ëª?ë²„í?',
        bodyPct: bodyPct,
        wickUpPct: wickUpPct,
        wickDnPct: wickDnPct,
      );
    }
    if (bodyPct >= 0.55 && closePos >= 0.72) {
      return CloseContextV1(
        labelKo: 'ê°•í•œ ë§ˆê°',
        score: score,
        reason: 'ëª¸í†µ ??+ ?„ì—??ë§ˆê°',
        bodyPct: bodyPct,
        wickUpPct: wickUpPct,
        wickDnPct: wickDnPct,
      );
    }
    if (bodyPct <= 0.28 && closePos <= 0.35) {
      score = (score * 0.85).round();
      return CloseContextV1(
        labelKo: '?½í•œ ë§ˆê°',
        score: score,
        reason: 'ëª¸í†µ ?‘ê³  ?„ë˜ë¡?ë§ˆê°',
        bodyPct: bodyPct,
        wickUpPct: wickUpPct,
        wickDnPct: wickDnPct,
      );
    }
    return CloseContextV1(
      labelKo: 'ë³´í†µ',
      score: score,
      reason: closePos >= 0.5 ? '?„ìª½ ë§ˆê°(ë¬´ë‚œ)' : '?„ë˜ìª?ë§ˆê°(ë¬´ë‚œ)',
      bodyPct: bodyPct,
      wickUpPct: wickUpPct,
      wickDnPct: wickDnPct,
    );
  }

  CloseContextV1 analyze(FuState s) {
    final cs = s.candles;
    if (cs.isEmpty) {
      return const CloseContextV1(
        labelKo: '?€ê¸?,
        score: 0,
        reason: 'ìº”ë“¤ ?°ì´???†ìŒ',
        bodyPct: 0,
        wickUpPct: 0,
        wickDnPct: 0,
      );
    }
    final c = cs.last;
    final range = (c.high - c.low).abs();
    if (range <= 0) {
      return const CloseContextV1(
        labelKo: '?€ê¸?,
        score: 0,
        reason: 'ë³€???†ìŒ',
        bodyPct: 0,
        wickUpPct: 0,
        wickDnPct: 0,
      );
    }

    final body = (c.close - c.open).abs();
    final upperWick = (c.high - (c.open > c.close ? c.open : c.close)).clamp(0, double.infinity);
    final lowerWick = ((c.open < c.close ? c.open : c.close) - c.low).clamp(0, double.infinity);

    final bodyPct = (body / range).clamp(0.0, 1.0);
    final wickUpPct = (upperWick / range).clamp(0.0, 1.0);
    final wickDnPct = (lowerWick / range).clamp(0.0, 1.0);

    // ì¢…ê? ?„ì¹˜(?ë‹¨/ì¤‘ë‹¨/?˜ë‹¨)
    final closePos = ((c.close - c.low) / range).clamp(0.0, 1.0);

    // ?ìˆ˜(?´ë¦¬?¤í‹±)
    int score = (bodyPct * 60 + closePos * 40).round().clamp(0, 100);

    // ?¨ì •: ?—ê¼¬ë¦?ê³¼ë‹¤ + ì¢…ê?ê°€ ?„ì—??ëª?ë²„í?
    if (wickUpPct >= 0.45 && closePos <= 0.55) {
      score = (score * 0.7).round();
      return CloseContextV1(
        labelKo: '?¨ì •ì£¼ì˜',
        score: score,
        reason: '?—ê¼¬ë¦?ê¸¸ê³  ?„ì—??ëª?ë²„í?',
        bodyPct: bodyPct,
        wickUpPct: wickUpPct,
        wickDnPct: wickDnPct,
      );
    }

    // ê°•í•¨: ë°”ë”” ??+ ì¢…ê? ?ë‹¨ ë§ˆê°
    if (bodyPct >= 0.55 && closePos >= 0.72) {
      return CloseContextV1(
        labelKo: 'ê°•í•œ ë§ˆê°',
        score: score,
        reason: 'ëª¸í†µ ??+ ?„ì—??ë§ˆê°',
        bodyPct: bodyPct,
        wickUpPct: wickUpPct,
        wickDnPct: wickDnPct,
      );
    }

    // ?½í•¨: ë°”ë”” ?‘ìŒ + ì¢…ê? ?˜ë‹¨
    if (bodyPct <= 0.28 && closePos <= 0.35) {
      score = (score * 0.85).round();
      return CloseContextV1(
        labelKo: '?½í•œ ë§ˆê°',
        score: score,
        reason: 'ëª¸í†µ ?‘ê³  ?„ë˜ë¡?ë§ˆê°',
        bodyPct: bodyPct,
        wickUpPct: wickUpPct,
        wickDnPct: wickDnPct,
      );
    }

    return CloseContextV1(
      labelKo: 'ë³´í†µ',
      score: score,
      reason: closePos >= 0.5 ? '?„ìª½ ë§ˆê°(ë¬´ë‚œ)' : '?„ë˜ìª?ë§ˆê°(ë¬´ë‚œ)',
      bodyPct: bodyPct,
      wickUpPct: wickUpPct,
      wickDnPct: wickDnPct,
    );
  }
}
