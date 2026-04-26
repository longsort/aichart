import 'dart:math';

import 'package:flutter/foundation.dart';
import '../learning/evidence_weight_store.dart';
import 'paper_account.dart';
import 'paper_models.dart';

class PaperState {
  final bool enabled; // 자동 가상매매 ON/OFF
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

  /// 최근 가상매매 성과(0~1)
  final ValueNotifier<double> perf01 = ValueNotifier<double>(0.5);
  /// 자동진입 기준(안전도). 기본값 0.85
  final ValueNotifier<double> autoEntryThreshold = ValueNotifier<double>(0.85);


  /// 시간초과(분). 포지션이 이 시간 이상 유지되면 '시간초과 종료'
  final ValueNotifier<int> timeoutMinutes = ValueNotifier<int>(90);

  void toggle(bool on) {
    final s = state.value;
    state.value = PaperState(enabled: on, pos: s.pos, last: s.last);
  }

  /// 안전 레버리지 추천:
  /// - 손절폭(%)을 기준으로 허용 최대 레버리지 계산
  /// - 안전계수로 낮춰서 추천 (0.5~0.75)
  double recommendLeverage({
    required double entry,
    required double sl,
    required double safety01, // 0~1 (높을수록 안전)
  }) {
    final riskPct = 0.05; // 시드 -5% 고정
    final stopPct = (entry == 0) ? 0.01 : ((entry - sl).abs() / entry).clamp(0.0005, 0.20);
    final maxLev = (riskPct / stopPct).clamp(1.0, 50.0);

    final k = (0.55 + 0.15 * safety01).clamp(0.50, 0.75);
    final rec = max(1.0, (maxLev * k));

    return rec.clamp(1.0, 20.0);
  }

  /// 5% 리스크 기준 포지션 규모(USDT) 계산
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
    return size.clamp(10.0, balance * leverage); // 최소 10USDT
  }

  bool _hitTP(PaperPosition p, double price) {
    if (p.tps.isEmpty) return false;
    final tp = p.tps[0];
    if (p.dir == '상승') return price >= tp;
    return price <= tp;
  }

  bool _hitSL(PaperPosition p, double price) {
    if (p.dir == '상승') return price <= p.sl;
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
    final movePct = (p.dir == '상승')
        ? ((exit - p.entry) / p.entry)
        : ((p.entry - exit) / p.entry);

    // 수수료(왕복) 보수적 0.10%
    final feePct = 0.0010;
    final pnl = (movePct * p.leverage - feePct) * p.sizeUsd;

    PaperAccount.I.applyPnL(pnl);

    // 학습: 성공/실패만 반영 (시간초과는 중립)
    if (outcome == '성공' || outcome == '실패') {
      final success = outcome == '성공';
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

  /// 매 틱(가격 갱신)마다 호출
  /// - enabled=false면 아무것도 안함
  /// - 포지션 없으면 "안전 신호"일 때만 진입
  void onTick({
    required double price,
    required String decision, // '상승' / '하락' / '관망'
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
        _close(p: p, exit: p.tps.isNotEmpty ? p.tps[0] : price, outcome: '성공', evidenceHit: evidenceHit, evidenceTotal: evidenceTotal, flags: flags);
        return;
      }
      if (_hitSL(p, price)) {
        _close(p: p, exit: p.sl, outcome: '실패', evidenceHit: evidenceHit, evidenceTotal: evidenceTotal, flags: flags);
        return;
      }

      // 시간초과 종료
      final limitMin = timeoutMinutes.value;
      final ageMin = DateTime.now().difference(p.openedAt).inMinutes;
      if (ageMin >= limitMin) {
        _close(p: p, exit: price, outcome: '시간초과', evidenceHit: evidenceHit, evidenceTotal: evidenceTotal, flags: flags);
        return;
      }
      return;
    }

    final isUp = decision.contains('상승');
    final isDown = decision.contains('하락');
    if (!isUp && !isDown) return;

    // 안전모드: safety01 < 0.85면 신규 진입 금지
    if (safety01 < 0.85) return;

    final lev = recommendLeverage(entry: entry, sl: sl, safety01: safety01);
    final sizeUsd = positionSizeUsd(balance: PaperAccount.I.balance.value, entry: entry, sl: sl, leverage: lev);

    final pos = PaperPosition(
      dir: isUp ? '상승' : '하락',
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