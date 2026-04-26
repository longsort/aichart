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

      // fake timestamps for placeholders (?∞ÏÜê/?∏Í?) - ?§Ï†ú ?∞Í≤∞?Ä ?§Ïùå ?®Í≥Ñ
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

  /// ?§Ïñ¥Í∞ÄÍ∏? Í≥ÑÌöç Î∞ïÏ†ú + Î°úÍ∑∏
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
      state: 'ÏßÑÏûÖ',
      entry: pinnedEntry!,
      stop: pinnedStop!,
      target: pinnedTarget!,
      result: 'ÏßÑÌñâÏ§?,
    );
    logAt = DateTime.now();
    notifyListeners();
  }

  /// ?†Ï??òÍ∏∞: ?ÅÌÉú Í∞ïÏ†ú + ?åÎ¶º ?µÏ†ú(???¥Î? ?åÎûòÍ∑?
  Future<void> actionHold() async {
    if (!pinned) {
      await actionEnter();
    }
    pinnedState = TradeState.hold;
    await TradeLogDb.I.insert(
      symbol: symbol,
      tf: tf.label,
      state: '?†Ï?',
      entry: pinnedEntry ?? (decision?.entry ?? 0),
      stop: pinnedStop ?? (decision?.stop ?? 0),
      target: pinnedTarget ?? (decision?.target ?? 0),
      result: '?†Ï?',
    );
    logAt = DateTime.now();
    notifyListeners();
  }

  /// ?ïÎ¶¨?òÍ∏∞: Ï¢ÖÎ£å + Î°úÍ∑∏
  Future<void> actionClose() async {
    pinnedState = TradeState.exit;
    await TradeLogDb.I.insert(
      symbol: symbol,
      tf: tf.label,
      state: 'Ï¢ÖÎ£å',
      entry: pinnedEntry ?? (decision?.entry ?? 0),
      stop: pinnedStop ?? (decision?.stop ?? 0),
      target: pinnedTarget ?? (decision?.target ?? 0),
      result: 'Ï¢ÖÎ£å',
    );
    logAt = DateTime.now();
    notifyListeners();
  }

  // helper
  String ago(DateTime? t) {
    if (t == null) return '?ÜÏùå';
    final diff = DateTime.now().difference(t);
    if (diff.inSeconds < 10) return 'Î∞©Í∏à';
    if (diff.inMinutes < 1) return '${diff.inSeconds}Ï¥???;
    if (diff.inHours < 1) return '${diff.inMinutes}Î∂???;
    return '${diff.inHours}?úÍ∞Ñ ??;
  }
}
