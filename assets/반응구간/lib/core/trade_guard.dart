import 'dart:math';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../data/snapshot/engine_snapshot.dart';
import '../engine/central/decision_logger.dart';
import 'symbol_controller.dart';
import 'preset_controller.dart';

/// 실전 안전장치(연속 실패 방지)
/// - 연속 실패(패배) or 위험 증가 시, 자동으로 신호 금지(잠금/쿨다운)
/// - "자동매매"가 아니라, 신호/진입을 막아주는 방어막
class TradeGuard {
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

  // 설정(초보 기본값)
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

  /// 로그에서 연속 패배를 보고 자동 잠금
  void onNewLog() {
    final sym = SymbolController.I.symbol.value;
    final logs = DecisionLogger.I.logs.value.where((e) => e.symbol == sym).toList();
    if (logs.isEmpty) return;

    // 최근부터 연속 패배 체크
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

  /// 스냅샷 기준으로 "지금 신호 내도 되는지" 판정
  /// - locked/cooldown이면 무조건 금지
  /// - 신뢰/합의 낮으면 금지(안전)
  bool allowSignal(EngineSnapshot s) {
    if (isLocked) return false;
    if (s.state == TradeState.block) return false;
    if (s.confidence < PresetController.I.minConfidence) return false;
    if (s.consensus < PresetController.I.minConsensus) return false;
    return true;
  }

  /// 화면에 보낼 안내 문구
  String statusText() {
    if (!isLocked) return '정상';
    if (inCooldown) {
      final left = ((cooldownUntilMs.value - _now) / 60000).ceil();
      return '잠깐 쉬기 ${max(0,left)}분';
    }
    return '잠금';
  }
}
