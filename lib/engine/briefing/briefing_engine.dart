import '../models/engine_output.dart';
import '../models/briefing_output.dart';
import '../metrics/metric_hub.dart';
import '../safety/risk_engine.dart';
import '../safety/no_trade_lock.dart';
import '../self_tune/self_tune_engine.dart';

/// PHASE E/F + S-08 ??EngineOutput + lastPrice -> BriefingOutput, ë¦¬ìŠ¤??5%, 2?°íŒ¨ ??confidence -10
class BriefingEngine {
  final RiskEngine _risk = RiskEngine();
  final NoTradeLock _lock = NoTradeLock();
  final SelfTuneEngine _selfTune = SelfTuneEngine();

  BriefingOutput run(EngineOutput output, double lastPrice, {double equity = 10000, int lossStreak = 0}) {
    final effectiveConfidence = _selfTune.adjustedConfidence(output.confidence, lossStreak);
    final status = effectiveConfidence < 40 ? 'watch' : effectiveConfidence < 70 ? 'caution' : 'confirm';
    final statusKo = status == 'watch' ? 'ê´€ë§? : status == 'caution' ? 'ì£¼ì˜' : 'ì§„ì…ê°€???„ë³´';

    final scenarios = <BriefingScenario>[];
    if (output.events.any((e) => e.type.name.contains('UP'))) {
      final entry = lastPrice;
      final sl = lastPrice * 0.99;
      if (_risk.isValidScenario(entry, sl)) {
        scenarios.add(BriefingScenario(
          name: '?¨í? ë¡?,
          condition: 'BOS ?ìŠ¹ ??ì§€ì§€ ?•ì¸',
          prob: (effectiveConfidence * 0.9).round().clamp(0, 99),
          entry: entry,
          sl: sl,
          tp: lastPrice * 1.02,
          rr: 2.0,
          positionSize: _risk.positionSize(equity, entry, sl),
        ));
      }
    }
    if (output.confidence >= 60 && output.lines.isNotEmpty) {
      final entry = lastPrice;
      final sl = lastPrice * 0.98;
      if (_risk.isValidScenario(entry, sl)) {
        scenarios.add(BriefingScenario(
          name: '?¤ìœ™ ë¡?,
          condition: 'EQH/EQL ?ˆë²¨ ?°ì¹˜ ??ë°˜ë“±',
          prob: (effectiveConfidence * 0.85).round().clamp(0, 99),
          entry: entry,
          sl: sl,
          tp: lastPrice * 1.03,
          rr: 1.5,
          positionSize: _risk.positionSize(equity, entry, sl),
        ));
      }
    }
    if (output.events.any((e) => e.type.name.contains('DN')) && scenarios.length < 3) {
      final entry = lastPrice;
      final sl = lastPrice * 1.01;
      if (_risk.isValidScenario(entry, sl)) {
        scenarios.add(BriefingScenario(
          name: '??,
          condition: 'BOS ?˜ë½ ?œì—ë§?,
          prob: (effectiveConfidence * 0.7).round().clamp(0, 99),
          entry: entry,
          sl: sl,
          tp: lastPrice * 0.98,
          rr: 1.0,
          positionSize: _risk.positionSize(equity, entry, sl),
        ));
      }
    }
    scenarios.sort((a, b) => b.prob.compareTo(a.prob));
    final top = scenarios.take(3).toList();

    final lock = _lock.check(output, lossStreak: lossStreak);
    final summaryLine = lock.isLocked
        ? 'ì§€ê¸ˆì? ë§¤ë§¤ ê¸ˆì? êµ¬ê°„: ${lock.reason}'
        : '?„ì¬ $statusKo. ? ë¢°??${effectiveConfidence}%. ?´ë²¤??${output.events.length}ê°? ?ˆë²¨ ${output.lines.length}ê°?';
    final managerComment = '?ì‚°??5% ?´ìƒ?€ ?„í—˜???¸ì¶œ?˜ì? ë§ˆì„¸?? ?ì ˆ?€ ë°˜ë“œ???¤ì •?˜ì„¸??';

    final evidenceBullets = _buildEvidenceBullets(output);
    final externalLine = MetricHub().getSummary();
    if (evidenceBullets.length >= 5) {
      evidenceBullets[4] = externalLine;
    } else {
      evidenceBullets.add(externalLine);
    }
    final bullets = evidenceBullets.take(5).toList();

    return BriefingOutput(
      symbol: output.symbol,
      tf: output.tf,
      lastPrice: lastPrice,
      status: statusKo,
      confidence: effectiveConfidence,
      scenarios: lock.isLocked ? [] : top,
      summaryLine: summaryLine,
      managerComment: managerComment,
      lockReason: lock.isLocked ? lock.reason : null,
      evidenceBullets: bullets,
    );
  }

  /// S-04: ê·¼ê±° 5ì¤????¬ìš´ ?œê?(ì§€ì§€ ?•ì¸, ?€???¤íŒ¨ ??, ê³¼ì¥ ê¸ˆì?
  List<String> _buildEvidenceBullets(EngineOutput output) {
    final list = <String>[];
    if (output.events.any((e) => e.type.name.contains('UP'))) list.add('?ìŠ¹ ?ŒíŒŒ ??ì§€ì§€ ?•ì¸??);
    if (output.events.any((e) => e.type.name.contains('DN'))) list.add('?˜ë½ ?ŒíŒŒ ???€???•ì¸??);
    if (output.lines.isNotEmpty) list.add('EQH/EQL ?ˆë²¨ ${output.lines.length}ê°??¸ì •');
    list.add('? ë¢°??${output.confidence}% (ë³´ì • ???ìš©)');
    if (output.events.isNotEmpty) list.add('êµ¬ì¡° ?´ë²¤??${output.events.length}ê°?);
    while (list.length < 5) list.add('ì¶”ê? ?•ì¸ ì¤?);
    return list.take(5).toList();
  }
}
