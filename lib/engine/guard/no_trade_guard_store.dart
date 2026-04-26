import 'dart:convert';
import 'dart:io';
import 'package:path_provider/path_provider.dart';

class NoTradeState {
  final bool locked;
  final String reason;
  final DateTime? until;
  final int lossStreak;

  const NoTradeState({
    required this.locked,
    required this.reason,
    required this.until,
    required this.lossStreak,
  });

  Map<String, dynamic> toJson() => {
        'locked': locked,
        'reason': reason,
        'until': until?.toIso8601String(),
        'lossStreak': lossStreak,
      };

  static NoTradeState fromJson(Map<String, dynamic> j) {
    DateTime? until;
    final u = j['until'];
    if (u is String && u.isNotEmpty) {
      until = DateTime.tryParse(u);
    }
    return NoTradeState(
      locked: (j['locked'] ?? false) == true,
      reason: (j['reason'] ?? '').toString(),
      until: until,
      lossStreak: (j['lossStreak'] ?? 0) is num ? (j['lossStreak'] as num).toInt() : 0,
    );
  }

  static const NoTradeState empty = NoTradeState(locked: false, reason: '', until: null, lossStreak: 0);
}

class NoTradeGuardStore {
  static final NoTradeGuardStore I = NoTradeGuardStore._();
  NoTradeGuardStore._();

  Future<File> _file() async {
    final d = await getApplicationDocumentsDirectory();
    return File('${d.path}/no_trade_guard.json');
  }

  Future<NoTradeState> load() async {
    try {
      final f = await _file();
      if (!await f.exists()) return NoTradeState.empty;
      final txt = await f.readAsString();
      final j = jsonDecode(txt) as Map<String, dynamic>;
      return NoTradeState.fromJson(j);
    } catch (_) {
      return NoTradeState.empty;
    }
  }

  Future<void> save(NoTradeState s) async {
    final f = await _file();
    await f.writeAsString(jsonEncode(s.toJson()));
  }

  Future<NoTradeState> updateFromLossStreak({
    required int lossStreak,
    int trigger = 3,
    Duration lockFor = const Duration(minutes: 30),
    String reason = 'loss-streak',
  }) async {
    final now = DateTime.now();
    final cur = await load();

    // auto unlock
    if (cur.locked && cur.until != null && now.isAfter(cur.until!)) {
      final unlocked = NoTradeState(locked: false, reason: '', until: null, lossStreak: lossStreak);
      await save(unlocked);
      return unlocked;
    }

    if (lossStreak >= trigger) {
      final until = now.add(lockFor);
      final locked = NoTradeState(locked: true, reason: reason, until: until, lossStreak: lossStreak);
      await save(locked);
      return locked;
    }

    final updated = NoTradeState(locked: false, reason: '', until: null, lossStreak: lossStreak);
    await save(updated);
    return updated;
  }
}