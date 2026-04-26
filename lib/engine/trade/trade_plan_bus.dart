import 'dart:async';
import 'package:flutter/foundation.dart';

import 'trade_journal.dart';
import 'trade_plan.dart';

class TradePlanBus {
  TradePlanBus._();
  static final TradePlanBus I = TradePlanBus._();

  /// ?„ì¬ ?œì„± ?Œëœ(? í˜¸)
  final ValueNotifier<TradePlan> plan = ValueNotifier<TradePlan>(TradePlan.none());

  /// ?„ì¬ ?¬ì???ê°€??
  final ValueNotifier<bool> inPosition = ValueNotifier<bool>(false);

  /// ?¬ì????íƒœ
  String _posSide = 'NONE';
  double _posEntry = 0;

  /// ?Œëœ ê°±ì‹ (?”ì§„?ì„œ ?¸ì¶œ)
  Future<void> publish(TradePlan p) async {
    plan.value = p;
    if (p.isValid) {
      await TradeJournal.I.logPlan(p);
    }
  }

  /// ê°€??ì§„ì…(?¬ìš©???ë™)
  void enterFromPlan() {
    final p = plan.value;
    if (!p.isValid) return;
    inPosition.value = true;
    _posSide = p.side;
    _posEntry = p.entry;
  }

  /// ê°€??ì²?‚°(?¬ìš©???ë™)
  Future<void> exit({
    required double exitPrice,
    required String reason,
  }) async {
    if (!inPosition.value) return;
    inPosition.value = false;

    final side = _posSide;
    final entry = _posEntry;

    double pnlPct = 0;
    if (entry > 0) {
      if (side == 'LONG') pnlPct = (exitPrice - entry) / entry * 100.0;
      if (side == 'SHORT') pnlPct = (entry - exitPrice) / entry * 100.0;
    }

    await TradeJournal.I.logResult(
      symbol: plan.value.symbol,
      side: side,
      entry: entry,
      exit: exitPrice,
      pnlPct: pnlPct,
      reason: reason,
    );

    _posSide = 'NONE';
    _posEntry = 0;
  }
}
