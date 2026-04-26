import '../models/engine_output.dart';
import '../models/briefing_output.dart';
import '../metrics/metric_hub.dart';
import '../safety/risk_engine.dart';
import '../safety/no_trade_lock.dart';
import '../self_tune/self_tune_engine.dart';

/// PHASE E/F + S-08 — EngineOutput + lastPrice -> BriefingOutput, 리스크 5%, 2연패 시 confidence -10
class BriefingEngine {
  final RiskEngine _risk = RiskEngine();
  final NoTradeLock _lock = NoTradeLock();
  final SelfTuneEngine _selfTune = SelfTuneEngine();

  BriefingOutput run(EngineOutput output, double lastPrice, {double equity = 10000, int lossStreak = 0}) {
    final effectiveConfidence = _selfTune.adjustedConfidence(output.confidence, lossStreak);
    final status = effectiveConfidence < 40 ? 'watch' : effectiveConfidence < 70 ? 'caution' : 'confirm';
    final statusKo = status == 'watch' ? '관망' : status == 'caution' ? '주의' : '진입가능 후보';

    final scenarios = <BriefingScenario>[];
    if (output.events.any((e) => e.type.name.contains('UP'))) {
      final entry = lastPrice;
      final sl = lastPrice * 0.99;
      if (_risk.isValidScenario(entry, sl)) {
        scenarios.add(BriefingScenario(
          name: '단타 롱',
          condition: 'BOS 상승 후 지지 확인',
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
          name: '스윙 롱',
          condition: 'EQH/EQL 레벨 터치 후 반등',
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
          name: '숏',
          condition: 'BOS 하락 시에만',
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
        ? '지금은 매매 금지 구간: ${lock.reason}'
        : '현재 $statusKo. 신뢰도 ${effectiveConfidence}%. 이벤트 ${output.events.length}개, 레벨 ${output.lines.length}개.';
    final managerComment = '자산의 5% 이상은 위험에 노출하지 마세요. 손절은 반드시 설정하세요.';

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

  /// S-04: 근거 5줄 — 쉬운 한글(지지 확인, 저항 실패 등), 과장 금지
  List<String> _buildEvidenceBullets(EngineOutput output) {
    final list = <String>[];
    if (output.events.any((e) => e.type.name.contains('UP'))) list.add('상승 돌파 후 지지 확인됨');
    if (output.events.any((e) => e.type.name.contains('DN'))) list.add('하락 돌파 후 저항 확인됨');
    if (output.lines.isNotEmpty) list.add('EQH/EQL 레벨 ${output.lines.length}개 인정');
    list.add('신뢰도 ${output.confidence}% (보정 후 적용)');
    if (output.events.isNotEmpty) list.add('구조 이벤트 ${output.events.length}개');
    while (list.length < 5) list.add('추가 확인 중');
    return list.take(5).toList();
  }
}
