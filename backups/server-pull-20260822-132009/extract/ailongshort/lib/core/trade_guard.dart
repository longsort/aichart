import 'dart:math';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../data/snapshot/engine_snapshot.dart';
import '../engine/central/decision_logger.dart';
import 'symbol_controller.dart';
import 'preset_controller.dart';

/// ?¤ì „ ?ˆì „?¥ì¹˜(?°ì† ?¤íŒ¨ ë°©ì?)
/// - ?°ì† ?¤íŒ¨(?¨ë°°) or ?„í—˜ ì¦ê? ?? ?ë™?¼ë¡œ ? í˜¸ ê¸ˆì?(? ê¸ˆ/ì¿¨ë‹¤??
/// - "?ë™ë§¤ë§¤"ê°€ ?„ë‹ˆ?? ? í˜¸/ì§„ì…??ë§‰ì•„ì£¼ëŠ” ë°©ì–´ë§?class TradeGuard {
  static const _kMaxLoss='tg_maxLoss';
  static const _kCooldown='tg_cooldown';

  Future<void> load() async {
    final p=await SharedPreferences.getInstance();
    maxConsecutiveLoss=p.getInt(_kMaxLoss)??maxConsecutiveLoss;
    cooldownMinutes=p.getInt(_kCooldown)??cooldownMinutes;
  }

  Future<void> save() async {
    final p=await SharedPreferences.getInstance();
    await p.setInt(_kMaxLoss, maxConsecutiveLoss);
    await p.setInt(_kCooldown, cooldownMinutes);
  }

  bool _started = false;

  void start() {
    if (_started) return;
    _started = true;
    DecisionLogger.I.logs.addListener(onNewLog);
  }

  TradeGuard._();
  static final TradeGuard I = TradeGuard._();

  // ?¤ì •(ì´ˆë³´ ê¸°ë³¸ê°?
  int maxConsecutiveLoss = 3;
  int cooldownMinutes = 20;

  final ValueNotifier<bool> locked = ValueNotifier<bool>(false);
  final ValueNotifier<int> cooldownUntilMs = ValueNotifier<int>(0);

  int get _now => DateTime.now().millisecondsSinceEpoch;

  bool get inCooldown => _now < cooldownUntilMs.value;
  bool get isLocked => locked.value || inCooldown;

  void setCooldown(int minutes) {
    cooldownUntilMs.value = _now + minutes * 60 * 1000;
  }

  void unlock() {
    locked.value = false;
    cooldownUntilMs.value = 0;
  }

  /// ë¡œê·¸?ì„œ ?°ì† ?¨ë°°ë¥?ë³´ê³  ?ë™ ? ê¸ˆ
  void onNewLog() {
    final sym = SymbolController.I.symbol.value;
    final logs = DecisionLogger.I.logs.value.where((e) => e.symbol == sym).toList();
    if (logs.isEmpty) return;

    // ìµœê·¼ë¶€???°ì† ?¨ë°° ì²´í¬
    int streakLoss = 0;
    for (final l in logs.reversed) {
      // result: WIN/LOSS/NA
      if (l.result == 'LOSS') {
        streakLoss++;
      } else if (l.result == 'WIN') {
        break;
      }
    }

    if (streakLoss >= maxConsecutiveLoss) {
      locked.value = true;
      setCooldown(cooldownMinutes);
    }
  }

  /// ?¤ëƒ…??ê¸°ì??¼ë¡œ "ì§€ê¸?? í˜¸ ?´ë„ ?˜ëŠ”ì§€" ?ì •
  /// - locked/cooldown?´ë©´ ë¬´ì¡°ê±?ê¸ˆì?
  /// - ? ë¢°/?©ì˜ ??œ¼ë©?ê¸ˆì?(?ˆì „)
  bool allowSignal(EngineSnapshot s) {
    if (isLocked) return false;
    if (s.state == TradeState.block) return false;
    if (s.confidence < PresetController.I.minConfidence) return false;
    if (s.consensus < PresetController.I.minConsensus) return false;
    return true;
  }

  /// ?”ë©´??ë³´ë‚¼ ?ˆë‚´ ë¬¸êµ¬
  String statusText() {
    if (!isLocked) return '?•ìƒ';
    if (inCooldown) {
      final left = ((cooldownUntilMs.value - _now) / 60000).ceil();
      return '? ê¹ ?¬ê¸° ${max(0,left)}ë¶?;
    }
    return '? ê¸ˆ';
  }
}
