import 'dart:math';

import 'package:flutter/foundation.dart';
import '../learning/evidence_weight_store.dart';
import 'paper_account.dart';
import 'paper_models.dart';

class PaperState {
  final bool enabled; // ?ë™ ê°€?ë§¤ë§?ON/OFF
  final PaperPosition? pos;
  final List<PaperResult> last;

  const PaperState({
    required this.enabled,
    required this.pos,
    required this.last,
  });

  factory PaperState.empty() => const PaperState(enabled: false, pos: null, last: []);
}

class PaperTradeEngine {
  static final PaperTradeEngine I = PaperTradeEngine._();
  PaperTradeEngine._();

  final ValueNotifier<PaperState> state = ValueNotifier<PaperState>(PaperState.empty());

  /// ìµœê·¼ ê°€?ë§¤ë§??±ê³¼(0~1)
  final ValueNotifier<double> perf01 = ValueNotifier<double>(0.5);
  /// ?ë™ì§„ì… ê¸°ì?(?ˆì „??. ê¸°ë³¸ê°?0.85
  final ValueNotifier<double> autoEntryThreshold = ValueNotifier<double>(0.85);


  /// ?œê°„ì´ˆê³¼(ë¶?. ?¬ì??˜ì´ ???œê°„ ?´ìƒ ? ì??˜ë©´ '?œê°„ì´ˆê³¼ ì¢…ë£Œ'
  final ValueNotifier<int> timeoutMinutes = ValueNotifier<int>(90);

  void toggle(bool on) {
    final s = state.value;
    state.value = PaperState(enabled: on, pos: s.pos, last: s.last);
  }

  /// ?ˆì „ ?ˆë²„ë¦¬ì? ì¶”ì²œ:
  /// - ?ì ˆ??%)??ê¸°ì??¼ë¡œ ?ˆìš© ìµœë? ?ˆë²„ë¦¬ì? ê³„ì‚°
  /// - ?ˆì „ê³„ìˆ˜ë¡???¶°??ì¶”ì²œ (0.5~0.75)
  double recommendLeverage({
    required double entry,
    required double sl,
    required double safety01, // 0~1 (?’ì„?˜ë¡ ?ˆì „)
  }) {
    final riskPct = 0.05; // ?œë“œ -5% ê³ ì •
    final stopPct = (entry == 0) ? 0.01 : ((entry - sl).abs() / entry).clamp(0.0005, 0.20);
    final maxLev = (riskPct / stopPct).clamp(1.0, 50.0);

    final k = (0.55 + 0.15 * safety01).clamp(0.50, 0.75);
    final rec = max(1.0, (maxLev * k));

    return rec.clamp(1.0, 20.0);
  }

  /// 5% ë¦¬ìŠ¤??ê¸°ì? ?¬ì???ê·œëª¨(USDT) ê³„ì‚°
  double positionSizeUsd({
    required double balance,
    required double entry,
    required double sl,
    required double leverage,
  }) {
    final riskUsd = balance * 0.05;
    final stopPct = (entry == 0) ? 0.01 : ((entry - sl).abs() / entry).clamp(0.0005, 0.20);

    // price move * leverage * sizeUsd = riskUsd  => sizeUsd = riskUsd / (stopPct * leverage)
    final size = riskUsd / (stopPct * leverage);
    return size.clamp(10.0, balance * leverage); // ìµœì†Œ 10USDT
  }

  bool _hitTP(PaperPosition p, double price) {
    if (p.tps.isEmpty) return false;
    final tp = p.tps[0];
    if (p.dir == '?ìŠ¹') return price >= tp;
    return price <= tp;
  }

  bool _hitSL(PaperPosition p, double price) {
    if (p.dir == '?ìŠ¹') return price <= p.sl;
    return price >= p.sl;
  }

  void _close({
    required PaperPosition p,
    required double exit,
    required String outcome,
    required int evidenceHit,
    required int evidenceTotal,
    required Map<String, bool> flags,
  }) async {
    final movePct = (p.dir == '?ìŠ¹')
        ? ((exit - p.entry) / p.entry)
        : ((p.entry - exit) / p.entry);

    // ?˜ìˆ˜ë£??•ë³µ) ë³´ìˆ˜??0.10%
    final feePct = 0.0010;
    final pnl = (movePct * p.leverage - feePct) * p.sizeUsd;

    PaperAccount.I.applyPnL(pnl);

    // ?™ìŠµ: ?±ê³µ/?¤íŒ¨ë§?ë°˜ì˜ (?œê°„ì´ˆê³¼??ì¤‘ë¦½)
    if (outcome == '?±ê³µ' || outcome == '?¤íŒ¨') {
      final success = outcome == '?±ê³µ';
      await EvidenceWeightStore.I.reinforce(flags: flags, success: success);
    }

    final s = state.value;
    final nextLast = [
      PaperResult(
        ts: DateTime.now(),
        dir: p.dir,
        entry: p.entry,
        exit: exit,
        outcome: outcome,
        pnlUsd: pnl,
        evidenceHit: evidenceHit,
        evidenceTotal: evidenceTotal,
      ),
      ...s.last
    ];
    if (nextLast.length > 50) nextLast.removeRange(50, nextLast.length);

    state.value = PaperState(enabled: s.enabled, pos: null, last: nextLast);
  }

  /// ë§???ê°€ê²?ê°±ì‹ )ë§ˆë‹¤ ?¸ì¶œ
  /// - enabled=falseë©??„ë¬´ê²ƒë„ ?ˆí•¨
  /// - ?¬ì????†ìœ¼ë©?"?ˆì „ ? í˜¸"???Œë§Œ ì§„ì…
  void onTick({
    required double price,
    required String decision, // '?ìŠ¹' / '?˜ë½' / 'ê´€ë§?
    required double entry,
    required double sl,
    required List<double> tps,
    required int evidenceHit,
    required int evidenceTotal,
    required Map<String, bool> flags,
    required double safety01,
  }) {
    final s = state.value;
    if (!s.enabled) return;

    final p = s.pos;
    if (p != null) {
      if (_hitTP(p, price)) {
        _close(p: p, exit: p.tps.isNotEmpty ? p.tps[0] : price, outcome: '?±ê³µ', evidenceHit: evidenceHit, evidenceTotal: evidenceTotal, flags: flags);
        return;
      }
      if (_hitSL(p, price)) {
        _close(p: p, exit: p.sl, outcome: '?¤íŒ¨', evidenceHit: evidenceHit, evidenceTotal: evidenceTotal, flags: flags);
        return;
      }

      // ?œê°„ì´ˆê³¼ ì¢…ë£Œ
      final limitMin = timeoutMinutes.value;
      final ageMin = DateTime.now().difference(p.openedAt).inMinutes;
      if (ageMin >= limitMin) {
        _close(p: p, exit: price, outcome: '?œê°„ì´ˆê³¼', evidenceHit: evidenceHit, evidenceTotal: evidenceTotal, flags: flags);
        return;
      }
      return;
    }

    final isUp = decision.contains('?ìŠ¹');
    final isDown = decision.contains('?˜ë½');
    if (!isUp && !isDown) return;

    // ?ˆì „ëª¨ë“œ: safety01 < 0.85ë©?? ê·œ ì§„ì… ê¸ˆì?
    if (safety01 < 0.85) return;

    final lev = recommendLeverage(entry: entry, sl: sl, safety01: safety01);
    final sizeUsd = positionSizeUsd(balance: PaperAccount.I.balance.value, entry: entry, sl: sl, leverage: lev);

    final pos = PaperPosition(
      dir: isUp ? '?ìŠ¹' : '?˜ë½',
      entry: entry,
      sl: sl,
      tps: tps,
      sizeUsd: sizeUsd,
      leverage: lev,
      openedAt: DateTime.now(),
    );

    state.value = PaperState(enabled: s.enabled, pos: pos, last: s.last);
  }
}