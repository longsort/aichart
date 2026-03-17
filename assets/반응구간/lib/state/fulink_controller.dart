import 'dart:async';

import 'package:flutter/foundation.dart';

import '../core/exchange.dart';
import '../model/candle.dart';
import '../service/decision_engine.dart';
import '../service/market_api.dart';
import '../service/trade_log_db.dart';

class FulinkController extends ChangeNotifier {
  FulinkController({MarketApi? api}) : _api = api ?? MarketApi();

  final MarketApi _api;
  Timer? _timer;

  Exchange exchange = Exchange.bitget;
  String symbol = 'BTCUSDT';
  Tf tf = Tf.m15;

  // live data
  double? lastPrice;
  DateTime? lastPriceAt;
  List<Candle> candles = const [];
  DateTime? lastCandlesAt;

  // decision
  DecisionResult? decision;
  DateTime? decisionAt;

  // pinned plan
  bool pinned = false;
  double? pinnedEntry;
  double? pinnedStop;
  double? pinnedTarget;
  TradeState? pinnedState;

  // timestamps per item
  DateTime? whalesAt;
  DateTime? bookAt;
  DateTime? logAt;

  void start() {
    _timer ??= Timer.periodic(const Duration(seconds: 2), (_) => refresh());
    refresh();
  }

  void disposeTimer() {
    _timer?.cancel();
    _timer = null;
  }

  Future<void> setExchange(Exchange ex) async {
    exchange = ex;
    notifyListeners();
    await refresh(force: true);
  }

  Future<void> setTf(Tf t) async {
    tf = t;
    notifyListeners();
    await refresh(force: true);
  }

  Future<void> refresh({bool force = false}) async {
    try {
      final p = await _api.fetchLastPrice(exchange: exchange, symbol: symbol);
      if (p != null) {
        lastPrice = p;
        lastPriceAt = DateTime.now();
      }
      final cs = await _api.fetchCandles(exchange: exchange, symbol: symbol, tf: tf, limit: 120);
      if (cs.isNotEmpty) {
        candles = cs;
        lastCandlesAt = DateTime.now();
      }

      // fake timestamps for placeholders (큰손/호가) - 실제 연결은 다음 단계
      whalesAt = DateTime.now();
      bookAt = DateTime.now();

      if (candles.isNotEmpty && lastPrice != null) {
        final d = DecisionEngine.decide(candles: candles, lastPrice: lastPrice!);
        decision = pinned ? (decision?.copyWith(state: pinnedState ?? d.state) ?? d) : d;
        decisionAt = DateTime.now();
      }
    } catch (_) {
      // ignore
    }
    notifyListeners();
  }

  /// 들어가기: 계획 박제 + 로그
  Future<void> actionEnter() async {
    final d = decision;
    if (d == null) return;
    pinned = true;
    pinnedEntry = d.entry;
    pinnedStop = d.stop;
    pinnedTarget = d.target;
    pinnedState = TradeState.enter;
    await TradeLogDb.I.insert(
      symbol: symbol,
      tf: tf.label,
      state: '진입',
      entry: pinnedEntry!,
      stop: pinnedStop!,
      target: pinnedTarget!,
      result: '진행중',
    );
    logAt = DateTime.now();
    notifyListeners();
  }

  /// 유지하기: 상태 강제 + 알림 억제(앱 내부 플래그)
  Future<void> actionHold() async {
    if (!pinned) {
      await actionEnter();
    }
    pinnedState = TradeState.hold;
    await TradeLogDb.I.insert(
      symbol: symbol,
      tf: tf.label,
      state: '유지',
      entry: pinnedEntry ?? (decision?.entry ?? 0),
      stop: pinnedStop ?? (decision?.stop ?? 0),
      target: pinnedTarget ?? (decision?.target ?? 0),
      result: '유지',
    );
    logAt = DateTime.now();
    notifyListeners();
  }

  /// 정리하기: 종료 + 로그
  Future<void> actionClose() async {
    pinnedState = TradeState.exit;
    await TradeLogDb.I.insert(
      symbol: symbol,
      tf: tf.label,
      state: '종료',
      entry: pinnedEntry ?? (decision?.entry ?? 0),
      stop: pinnedStop ?? (decision?.stop ?? 0),
      target: pinnedTarget ?? (decision?.target ?? 0),
      result: '종료',
    );
    logAt = DateTime.now();
    notifyListeners();
  }

  // helper
  String ago(DateTime? t) {
    if (t == null) return '없음';
    final diff = DateTime.now().difference(t);
    if (diff.inSeconds < 10) return '방금';
    if (diff.inMinutes < 1) return '${diff.inSeconds}초 전';
    if (diff.inHours < 1) return '${diff.inMinutes}분 전';
    return '${diff.inHours}시간 전';
  }
}
