import 'package:flutter/foundation.dart';
import '../bitget/bitget_live_store.dart';
import 'exchange.dart';
import 'market_ticker.dart';
import 'binance_public_client.dart';

class MarketStore {
  MarketStore._();
  static final MarketStore I = MarketStore._();

  final ValueNotifier<Exchange> exchange = ValueNotifier<Exchange>(Exchange.bitget);

  final ValueNotifier<MarketTicker> ticker = ValueNotifier<MarketTicker>(
    MarketTicker(symbol: 'BTCUSDT_UMCBL', last: 0, connected: false, ts: DateTime.fromMillisecondsSinceEpoch(0)),
  );

  final BinancePublicClient _binance = BinancePublicClient();

  bool _started = false;
  bool _mirrored = false;

  void start() {
    if (_started) return;
    _started = true;
    exchange.addListener(_switch);
    _switch();
  }

  void _switch() {
    _binance.stop();
    if (exchange.value == Exchange.binance) {
      ticker.value = ticker.value.copyWith(connected: false, ts: DateTime.now());
      _binance.startPolling(
        symbol: 'BTCUSDT_UMCBL',
        interval: const Duration(milliseconds: 900),
        onTick: (t) => ticker.value = t,
        onError: () => ticker.value = ticker.value.copyWith(connected: false, ts: DateTime.now()),
      );
      return;
    }
    _mirrorBitgetOnce();
  }

  void _mirrorBitgetOnce() {
    if (_mirrored) return;
    _mirrored = true;

    void sync() {
      final bt = BitgetLiveStore.I.ticker.value;
      final online = BitgetLiveStore.I.online.value;
      ticker.value = ticker.value.copyWith(
        symbol: bt?.symbol ?? 'BTCUSDT_UMCBL',
        last: bt?.last ?? 0.0,
        connected: online,
        ts: DateTime.now(),
      );
    }

    sync();
    BitgetLiveStore.I.ticker.addListener(() {
      if (exchange.value != Exchange.bitget) return;
      sync();
    });
    BitgetLiveStore.I.online.addListener(() {
      if (exchange.value != Exchange.bitget) return;
      sync();
    });
  }

  void setExchange(Exchange x) {
    if (exchange.value == x) return;
    exchange.value = x;
    _switch();
  }

  void dispose() {
    _binance.dispose();
  }
}
