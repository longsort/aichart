import 'dart:math';
import '../models/candle.dart';
import '../models/decision.dart';
import '../models/plan.dart';
import '../models/ultra_result.dart';

class UltraEngine {
  /// ì´ˆë³´ ë³´í˜¸ 3ë²?ëª¨ë“œ:
  /// ?„í—˜?˜ë©´ "?˜ì? ë§ˆë¼(? ê¸ˆ)"???°ì„ .
  static UltraResult analyze({
    required double lastPrice,
    required List<Candle> candles,
  }) {
    if (candles.length < 30) {
      return UltraResult(
        decision: const UiDecision(
          title: 'ì§€ê¸?ì¶”ì²œ: ???˜ì? ë§ˆì„¸??? ê¸ˆ)',
          detail: '?°ì´?°ê? ë¶€ì¡±í•´???ë‹¨??ë¶ˆì•ˆ?•í•©?ˆë‹¤. ìº”ë“¤?????“ì¼ ?Œê¹Œì§€ ê¸°ë‹¤ë¦¬ì„¸??',
          locked: true,
          confidence: 55,
        ),
        evidence: const EvidenceScore(
          flow: 40,
          shape: 35,
          bigHand: 30,
          crowding: 35,
          risk: 75,
        ),
        plan: null,
        coreScore: 35,
        pulse: const [],
      );
    }

    // --- ê¸°ë³¸ ê³„ì‚° ---
    final closes = candles.map((c) => c.close).toList();
    final returns = <double>[];
    for (int i = 1; i < closes.length; i++) {
      returns.add((closes[i] - closes[i - 1]) / closes[i - 1]);
    }

    double stdev(List<double> xs) {
      final m = xs.reduce((a, b) => a + b) / xs.length;
      final v = xs.map((x) => (x - m) * (x - m)).reduce((a, b) => a + b) / xs.length;
      return sqrt(v);
    }

    final vol = stdev(returns.take(60).toList()); // ìµœê·¼ ë³€?™ì„±
    final drift = (closes.last - closes[closes.length - 20]) / closes[closes.length - 20]; // 20ë´?ë°©í–¥

    // ê°„ë‹¨ ?Œí˜•(?•ê·œ??
    final pulse = closes.sublist(max(0, closes.length - 40));
    final minP = pulse.reduce(min);
    final maxP = pulse.reduce(max);
    final normPulse = maxP == minP
        ? List<double>.filled(pulse.length, 0.5)
        : pulse.map((p) => (p - minP) / (maxP - minP)).toList();

    // --- Evidence ?ìˆ˜(0~100) ---
    int clamp0_100(num v) => v.clamp(0, 100).toInt();

    final flowScore = clamp0_100((drift.abs() * 9000)); // ?€ì¶?0~90
    final shapeScore = clamp0_100(35 + (1 - (vol * 120)).clamp(0, 1) * 50);
    final bigHandScore = clamp0_100(30 + (vol * 220).clamp(0, 1) * 40);
    final crowdingScore = clamp0_100(30 + (vol * 260).clamp(0, 1) * 50);
    final riskScore = clamp0_100(30 + (vol * 350).clamp(0, 1) * 70);

    final evidence = EvidenceScore(
      flow: flowScore,
      shape: shapeScore,
      bigHand: bigHandScore,
      crowding: crowdingScore,
      risk: riskScore,
    );

    // --- ? ê¸ˆ ?ë‹¨(ì´ˆë³´ ë³´í˜¸) ---
    final highRisk = riskScore >= 70;
    final noDirection = drift.abs() < 0.008; // 0.8% ë¯¸ë§Œ?´ë©´ ë°©í–¥ ?½í•¨
    final veryChoppy = vol >= 0.012; // ë³€?™ì„± ê±°ì¹ ??
    if (highRisk && (noDirection || veryChoppy)) {
      final conf = clamp0_100(65 + (riskScore - 70) * 1.2);
      return UltraResult(
        decision: UiDecision(
          title: 'ì§€ê¸?ì¶”ì²œ: ???˜ì? ë§ˆì„¸??? ê¸ˆ)',
          detail: '?´ìœ : ?”ë“¤ë¦¼ì´ ?¬ê³  ë°©í–¥???½í•©?ˆë‹¤.\n?´ì œ ì¡°ê±´: ë³€?™ì„±??ì¤„ê±°???ˆì •) ë°©í–¥???œë ·?´ì§ˆ ??',
          locked: true,
          confidence: conf,
        ),
        evidence: evidence,
        plan: null,
        coreScore: clamp0_100(40 + flowScore * 0.25 - riskScore * 0.35),
        pulse: normPulse,
      );
    }

    // --- ?¤ê³„(?¤ì–´ê°„ë‹¤ë©? ---
    final range20 = candles.sublist(candles.length - 20).map((c) => c.high - c.low).toList();
    final avgRange = range20.reduce((a, b) => a + b) / range20.length;
    final dirUp = drift >= 0;

    final entry = lastPrice;
    final stop = dirUp ? (entry - avgRange * 1.2) : (entry + avgRange * 1.2);
    final target = dirUp ? (entry + avgRange * 2.0) : (entry - avgRange * 2.0);

    final core = clamp0_100(
      55 + (flowScore * 0.25) + (shapeScore * 0.15) - (riskScore * 0.35),
    );

    final conf = clamp0_100(60 + flowScore * 0.25 - riskScore * 0.15);

    final title = dirUp ? 'ì§€ê¸?ì¶”ì²œ: ??ì¡°ì‹¬?´ì„œ ?ìŠ¹ ìª??Œì•¡)' : 'ì§€ê¸?ì¶”ì²œ: ??ì¡°ì‹¬?´ì„œ ?˜ë½ ìª??Œì•¡)';
    final detail = '?´ìœ : ë°©í–¥??ì¡°ê¸ˆ ë³´ì´ê³??ë¦„), ?„í—˜??? ê¸ˆ ?˜ì??€ ?„ë‹™?ˆë‹¤.\nì£¼ì˜: ì´ˆë³´??ë¬´ë¦¬ ê¸ˆì?(?Œì•¡/ì§§ê²Œ).';

    return UltraResult(
      decision: UiDecision(title: title, detail: detail, locked: false, confidence: conf),
      evidence: evidence,
      plan: Plan(entry: entry, stop: stop, target: target),
      coreScore: core,
      pulse: normPulse,
    );
  }
}