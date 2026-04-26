/// 브리핑 출력 — PHASE E에서 사용
class BriefingScenario {
  final String name;
  final String condition;
  final int prob;
  final double? entry;
  final double? sl;
  final double? tp;
  final double? rr;
  /// S-05: 리스크 5% 기준 수량 (equity 입력 시 계산)
  final double? positionSize;

  BriefingScenario({
    required this.name,
    required this.condition,
    required this.prob,
    this.entry,
    this.sl,
    this.tp,
    this.rr,
    this.positionSize,
  });
}

class BriefingOutput {
  final String symbol;
  final String tf;
  final double lastPrice;
  final String status; // watch / caution / confirm
  final int confidence;
  final List<BriefingScenario> scenarios;
  final String summaryLine;
  final String managerComment;
  final String? lockReason;
  /// S-04: 근거 5줄 (초보자용)
  final List<String> evidenceBullets;

  BriefingOutput({
    required this.symbol,
    required this.tf,
    required this.lastPrice,
    required this.status,
    required this.confidence,
    required this.scenarios,
    required this.summaryLine,
    required this.managerComment,
    this.lockReason,
    List<String>? evidenceBullets,
  }) : evidenceBullets = evidenceBullets ?? const [];
}
