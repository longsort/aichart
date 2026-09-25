import 'dart:async';
import 'dart:convert';

import 'package:web_socket_channel/io.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

/// PATCH-2: Bitget 선물 WS로 "체결(trade) + 오더북(books5)" 수집
/// - REST 폴백은 BitgetPublic에서 계속 유지
/// - 여기서 모은 데이터는 BitgetPublic.getOrderBook / getRecentFills가 우선 사용
class BitgetFlowWs {
  static final BitgetFlowWs I = BitgetFlowWs._();
  BitgetFlowWs._();

  static const String _url = 'wss://ws.bitget.com/v2/ws/public';

  WebSocketChannel? _ch;
  StreamSubscription? _sub;
  Timer? _ping;
  Timer? _stale;
  Timer? _reconnect;

  String _symbol = 'BTCUSDT';
  String _instType = 'USDT-FUTURES';

  DateTime? _lastMsgAt;

  // caches
  Map<String, dynamic>? _lastBook;
  DateTime? _lastBookAt;

  final List<Map<String, dynamic>> _fills = <Map<String, dynamic>>[];
  DateTime? _lastFillAt;

  // Public getters
  Map<String, dynamic>? get lastOrderBook => _lastBook;
  DateTime? get lastOrderBookAt => _lastBookAt;

  List<Map<String, dynamic>> get recentFills => List.unmodifiable(_fills);
  DateTime? get lastFillAt => _lastFillAt;

  bool get isRunning => _ch != null;

  /// ensure ws started (idempotent)
  void ensureStarted({required String symbol, String instType = 'USDT-FUTURES'}) {
    symbol = symbol.toUpperCase();
    if (_ch != null && _symbol == symbol && _instType == instType) return;
    _symbol = symbol;
    _instType = instType;
    _connect();
  }

  void stop() {
    _disposeSocketOnly();
    _reconnect?.cancel();
    _reconnect = null;
  }

  void _connect() {
    _disposeSocketOnly();
    try {
      _ch = IOWebSocketChannel.connect(Uri.parse(_url));
    } catch (_) {
      _scheduleReconnect();
      return;
    }

    _sub = _ch!.stream.listen(
      (event) {
        _lastMsgAt = DateTime.now();
        _handle(event);
      },
      onError: (_) => _scheduleReconnect(),
      onDone: () => _scheduleReconnect(),
      cancelOnError: true,
    );

    // subscribe ticker/trade/books5
    final req = {
      "op": "subscribe",
      "args": [
        {"instType": _instType, "channel": "trade", "instId": _symbol},
        {"instType": _instType, "channel": "books5", "instId": _symbol},
      ]
    };
    try {
      _ch!.sink.add(jsonEncode(req));
    } catch (_) {}

    // keepalive
    _ping?.cancel();
    _ping = Timer.periodic(const Duration(seconds: 25), (_) {
      try { _ch?.sink.add("ping"); } catch (_) {}
    });

    // stale watchdog
    _stale?.cancel();
    _stale = Timer.periodic(const Duration(seconds: 5), (_) {
      final lm = _lastMsgAt;
      if (lm == null) return;
      if (DateTime.now().difference(lm) > const Duration(seconds: 60)) {
        _scheduleReconnect();
      }
    });
  }

  void _scheduleReconnect() {
    if (_reconnect != null) return;
    _disposeSocketOnly();
    _reconnect = Timer(const Duration(seconds: 2), () {
      _reconnect = null;
      _connect();
    });
  }

  void _disposeSocketOnly() {
    _sub?.cancel();
    _sub = null;
    _ping?.cancel();
    _ping = null;
    _stale?.cancel();
    _stale = null;
    try { _ch?.sink.close(); } catch (_) {}
    _ch = null;
  }

  void _handle(dynamic event) {
    if (event is! String) return;
    if (event == 'pong') return;

    Map<String, dynamic>? obj;
    try {
      final decoded = jsonDecode(event);
      if (decoded is Map<String, dynamic>) obj = decoded;
    } catch (_) {
      return;
    }
    if (obj == null) return;

    final arg = obj!['arg'];
    final channel = (arg is Map ? arg['channel'] : null)?.toString() ?? '';
    final data = obj!['data'];

    if (data is! List || data.isEmpty) return;

    if (channel == 'books5') {
      final row = data.first;
      if (row is Map) {
        // keep raw structure similar to REST orderbook output
        _lastBook = row.cast<String, dynamic>();
        _lastBookAt = DateTime.now();
      }
      return;
    }

    if (channel == 'trade') {
      // data is list of trades
      for (final it in data) {
        if (it is! Map) continue;
        final m = it.cast<String, dynamic>();
        final sideRaw = (m['side'] ?? m['tradeSide'] ?? '').toString().toLowerCase();
        final side = (sideRaw.contains('buy')) ? 'buy' : (sideRaw.contains('sell') ? 'sell' : '');
        final price = double.tryParse((m['px'] ?? m['price'] ?? m['p'] ?? '').toString());
        final size = double.tryParse((m['sz'] ?? m['size'] ?? m['q'] ?? '').toString());
        final tsMs = int.tryParse((m['ts'] ?? m['t'] ?? '').toString()) ?? DateTime.now().millisecondsSinceEpoch;

        if (side.isEmpty || price == null || size == null) continue;

        _fills.add({
          'side': side,
          'price': price,
          'size': size,
          'ts': tsMs,
        });
      }
      // keep last 300 fills max
      while (_fills.length > 300) {
        _fills.removeAt(0);
      }
      _lastFillAt = DateTime.now();
      return;
    }
  }
}
