import 'dart:async';
import 'dart:convert';

import 'package:web_socket_channel/web_socket_channel.dart';

class BitgetTicker {
  final String symbol;
  final double last;
  final double bid;
  final double ask;
  final DateTime ts;

  const BitgetTicker({
    required this.symbol,
    required this.last,
    required this.bid,
    required this.ask,
    required this.ts,
  });
}

class BitgetPublicWs {
  static const String _url = 'wss://ws.bitget.com/v2/ws/public';

  final Duration pingInterval;
  final Duration staleTimeout;
  final Duration reconnectBackoffMin;
  final Duration reconnectBackoffMax;

  WebSocketChannel? _ch;
  StreamSubscription? _sub;
  Timer? _pingT;
  Timer? _staleT;
  Timer? _reconnectT;

  final _tickerCtrl = StreamController<BitgetTicker>.broadcast();
  Stream<BitgetTicker> get tickerStream => _tickerCtrl.stream;

  DateTime? _lastMsgAt;
  String? _symbol;
  String _instType = 'USDT-FUTURES';

  BitgetPublicWs({
    this.pingInterval = const Duration(seconds: 30),
    this.staleTimeout = const Duration(seconds: 75),
    this.reconnectBackoffMin = const Duration(seconds: 2),
    this.reconnectBackoffMax = const Duration(seconds: 20),
  });

  bool get isConnected => _ch != null;
  DateTime? get lastMessageTime => _lastMsgAt;

  void connectTicker({
    required String symbol,
    String instType = 'USDT-FUTURES',
  }) {
    _symbol = symbol.toUpperCase();
    _instType = instType;
    _connect();
  }

  void _connect() {
    _disposeSocketOnly();

    final ch = WebSocketChannel.connect(Uri.parse(_url));
    _ch = ch;

    _sub = ch.stream.listen(
      (event) {
        _lastMsgAt = DateTime.now();
        _handleMessage(event);
      },
      onError: (_) => _scheduleReconnect(),
      onDone: () => _scheduleReconnect(),
      cancelOnError: true,
    );

    // subscribe
    if (_symbol != null) {
      final req = {
        "op": "subscribe",
        "args": [
          {"instType": _instType, "channel": "ticker", "instId": _symbol}
        ]
      };
      ch.sink.add(jsonEncode(req));
    }

    _pingT?.cancel();
    _pingT = Timer.periodic(pingInterval, (_) {
      try {
        _ch?.sink.add("ping");
      } catch (_) {}
    });

    _staleT?.cancel();
    _staleT = Timer.periodic(const Duration(seconds: 5), (_) {
      final lm = _lastMsgAt;
      if (lm == null) return;
      if (DateTime.now().difference(lm) > staleTimeout) {
        _scheduleReconnect();
      }
    });
  }

  void _handleMessage(dynamic event) {
    try {
      if (event is String) {
        if (event == 'pong') return;
        final obj = jsonDecode(event);
        if (obj is Map && obj["data"] is List) {
          final data = obj["data"] as List;
          if (data.isEmpty) return;
          final row = data.first;
          if (row is Map) {
            final sym = (row["instId"] ?? row["symbol"] ?? "").toString().toUpperCase();
            final last = double.tryParse((row["lastPr"] ?? row["lastPrice"] ?? row["last"] ?? "").toString());
            final bid = double.tryParse((row["bidPr"] ?? row["bid1Price"] ?? row["bid"] ?? "").toString());
            final ask = double.tryParse((row["askPr"] ?? row["ask1Price"] ?? row["ask"] ?? "").toString());
            final tsRaw = row["ts"] ?? obj["ts"];
            final tsMs = int.tryParse(tsRaw?.toString() ?? '');
            if (sym.isEmpty || last == null) return;
            final t = tsMs != null
                ? DateTime.fromMillisecondsSinceEpoch(tsMs, isUtc: false)
                : DateTime.now();
            _tickerCtrl.add(BitgetTicker(
              symbol: sym,
              last: last,
              bid: bid ?? last,
              ask: ask ?? last,
              ts: t,
            ));
          }
        }
      }
    } catch (_) {
      // ignore malformed frames
    }
  }

  void _scheduleReconnect() {
    if (_reconnectT != null) return;
    _disposeSocketOnly();
    _reconnectT = Timer(reconnectBackoffMin, () {
      _reconnectT = null;
      if (_symbol != null) _connect();
    });
  }

  void _disposeSocketOnly() {
    _sub?.cancel();
    _sub = null;
    _pingT?.cancel();
    _pingT = null;
    _staleT?.cancel();
    _staleT = null;
    try {
      _ch?.sink.close();
    } catch (_) {}
    _ch = null;
  }

  Future<void> dispose() async {
    _reconnectT?.cancel();
    _reconnectT = null;
    _disposeSocketOnly();
    await _tickerCtrl.close();
  }
}
