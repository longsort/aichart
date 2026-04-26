import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../data/bitget/bitget_live_store.dart';
import '../engine/central/decision_logger.dart';
import 'symbol_controller.dart';

/// 자동 채점(벤치마크)
/// - 자동매매 아님
/// - 신호가 기록되면 "N분 뒤 가격"으로 WIN/LOSS를 자동 판정해 줌
/// - 결과는 통계/코치에 즉시 반영됨
class AutoJudge {
  AutoJudge._();
  static final AutoJudge I = AutoJudge._();

  static const _kEnabled = 'aj_enabled';
  static const _kHoldMin = 'aj_holdMin';
  static const _kMinMoveBp = 'aj_minMoveBp'; // basis points (0.01%)

  final ValueNotifier<bool> enabled = ValueNotifier<bool>(false);
  int holdMinutes = 10;
  int minMoveBp = 15; // 0.15%

  bool _started = false;
  final Map<String, Timer> _timers = {};

  Future<void> load() async {
    final p = await SharedPreferences.getInstance();
    enabled.value = p.getBool(_kEnabled) ?? false;
    holdMinutes = p.getInt(_kHoldMin) ?? holdMinutes;
    minMoveBp = p.getInt(_kMinMoveBp) ?? minMoveBp;
  }

  Future<void> save() async {
    final p = await SharedPreferences.getInstance();
    await p.setBool(_kEnabled, enabled.value);
    await p.setInt(_kHoldMin, holdMinutes);
    await p.setInt(_kMinMoveBp, minMoveBp);
  }

  void start() {
    if (_started) return;
    _started = true;

    DecisionLogger.I.logs.addListener(_onLogs);
    enabled.addListener(() {
      save();
    });
  }

  void _onLogs() {
    if (!enabled.value) return;
    final sym = SymbolController.I.symbol.value;

    for (final e in DecisionLogger.I.logs.value) {
      if (e.symbol != sym) continue;
      if (e.result != 'NA') continue;
      if (_timers.containsKey(e.id)) continue;

      final start = _lastPrice();
      if (start == null) continue;

      _timers[e.id] = Timer(Duration(minutes: holdMinutes), () {
        _timers.remove(e.id);
        final end = _lastPrice();
        if (end == null) return;

        final move = (end - start) / start; // + up, - down
        final minMove = minMoveBp / 10000.0; // basis points -> fraction
        if (move.abs() < minMove) {
          // 움직임이 작으면 미정 유지
          return;
        }

        final isLong = e.decision.contains('롱');
        final isShort = e.decision.contains('숏');
        String result = 'NA';
        if (isLong) result = move > 0 ? 'WIN' : 'LOSS';
        if (isShort) result = move < 0 ? 'WIN' : 'LOSS';

        if (result != 'NA') {
          DecisionLogger.I.setResult(e.id, result);
        }
      });
    }
  }

  double? _lastPrice() {
    final p = BitgetLiveStore.I.prices;
    if (p.isEmpty) return null;
    return p.last;
  }
}
