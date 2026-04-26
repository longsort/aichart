import 'package:flutter/foundation.dart';
import 'models/fu_state.dart';
import '../data/trade_log_db.dart';
import 'ai_open_position.dart';
import 'result_judge.dart';

enum AiState { idle, entry, hold, danger, closed }

class AiSnapshot {
  final AiState state;
  final String line;
  final DateTime at;
  const AiSnapshot({required this.state, required this.line, required this.at});
}

class AiStateController {
  AiStateController._();
  static final AiStateController I = AiStateController._();

  final ValueNotifier<AiSnapshot> snap =
      ValueNotifier<AiSnapshot>(AiSnapshot(state: AiState.idle, line: '⚪ 아직은 기다려', at: DateTime.now()));

  AiState? _manual;
  DateTime? _manualUntil;

  bool get hasManual => _manual != null && _manualUntil != null && DateTime.now().isBefore(_manualUntil!);

  void setManual(AiState s, {Duration ttl = const Duration(seconds: 60)}) {
    _manual = s;
    _manualUntil = DateTime.now().add(ttl);
  }

  void compute(FuState st) {
    if (hasManual) return;

    if (st.locked) {
      snap.value = AiSnapshot(state: AiState.danger, line: '🔴 위험 · ${st.lockedReason}', at: DateTime.now());
      return;
    }

    final entryOk = st.showSignal && st.entry > 0 && (st.signalProb >= TuningController.I.requiredProb);
    if (entryOk) {
      snap.value = AiSnapshot(state: AiState.entry, line: '🟢 지금이 진입 자리입니다', at: DateTime.now());
      return;
    }

    snap.value = AiSnapshot(state: AiState.idle, line: '⚪ 아직은 기다려', at: DateTime.now());
  }

  Future<void> actionEnter(FuState st) async {
    setManual(AiState.entry, ttl: const Duration(seconds: 90));
    snap.value = AiSnapshot(state: AiState.entry, line: '🟢 지금이 진입 자리입니다', at: DateTime.now());
    AiOpenPositionStore.set(AiOpenPosition(symbol: st.symbol, tf: st.tf, entry: st.entry, stop: st.stop, target: st.target, openedAt: DateTime.now()));
    await TradeLogDb.I.insert(action: 'ENTER', symbol: st.symbol, tf: st.tf, state: 'ENTRY', st: st, note: st.signalWhy);
  }

  Future<void> actionHold(FuState st) async {
    setManual(AiState.hold, ttl: const Duration(seconds: 120));
    snap.value = AiSnapshot(state: AiState.hold, line: '🟡 아직 들고 있어도 됩니다', at: DateTime.now());
    await TradeLogDb.I.insert(action: 'HOLD', symbol: st.symbol, tf: st.tf, state: 'HOLD', st: st, note: '');
  }

  Future<void> actionClose(FuState st, {String reason = '정리'}) async {
    setManual(AiState.closed, ttl: const Duration(seconds: 180));
    snap.value = AiSnapshot(state: AiState.closed, line: '✅ 종료 · $reason', at: DateTime.now());
    await TradeLogDb.I.insert(action: 'CLOSE', symbol: st.symbol, tf: st.tf, state: 'CLOSED', st: st, note: reason);
    AiOpenPositionStore.clear();
  }
}
