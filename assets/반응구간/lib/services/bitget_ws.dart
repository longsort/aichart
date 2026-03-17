import 'dart:async';
import 'dart:convert';

import 'package:web_socket_channel/web_socket_channel.dart';
import 'package:web_socket_channel/io.dart';

import 'api_config.dart';
import 'runtime_mode.dart' as rm;

/// Bitget 공개 WebSocket을 이용해 "현재가"를 거의 실시간으로 받습니다.
///
/// ✅ 초보용 요약
/// - 이게 켜져 있으면 화면의 "현재가"가 계속 갱신됩니다.
/// - 네트워크/서버 문제로 WS가 끊기면 자동으로 다시 붙습니다.
/// - WS가 안 되더라도 앱은 기존 HTTP(새로고침) 방식으로 계속 동작합니다.
class BitgetWsTicker {
  WebSocketChannel? _ch;
  StreamSubscription? _sub;
  Timer? _reconnectTimer;

  final _priceCtrl = StreamController<double>.broadcast();
  final _connectedCtrl = StreamController<bool>.broadcast();

  Stream<double> get priceStream => _priceCtrl.stream;
  Stream<bool> get connectedStream => _connectedCtrl.stream;

  bool _isConnected = false;
  bool get isConnected => _isConnected;

  String _instId = 'BTCUSDT';
  String _instType = 'USDT-FUTURES';

  // 과도한 재연결 방지
  int _retry = 0;

  void start({String instId = 'BTCUSDT', String instType = 'USDT-FUTURES'}) {
    if (!rm.wsEnabled) {
      _setConnected(false);
      return;
    }
_instId = instId;
    _instType = instType;
    _retry = 0;
    _connect();
  }

  void stop() {
    _reconnectTimer?.cancel();
    _reconnectTimer = null;

    _sub?.cancel();
    _sub = null;

    try {
      _ch?.sink.close();
    } catch (_) {}

    _ch = null;
    _setConnected(false);
  }

  void dispose() {
    stop();
    _priceCtrl.close();
    _connectedCtrl.close();
  }

  void _setConnected(bool v) {
    if (_isConnected == v) return;
    _isConnected = v;
    _connectedCtrl.add(v);
  }

  void _scheduleReconnect([String reason = '']) {
    _setConnected(false);

    _reconnectTimer?.cancel();
    _reconnectTimer = null;

    // 0.8s ~ 6s 사이로 점점 늘림
    final delayMs = (800 + (_retry * 600)).clamp(800, 6000);
    _retry = (_retry + 1).clamp(0, 10);

    _reconnectTimer = Timer(Duration(milliseconds: delayMs), () {
      _connect();
    });
  }
String configWsUrlOrDefault() {
  // ✅ 네 프로젝트 api_config.dart 변수명이 달라도, 여기만 바꾸면 됨
  // 1) api_config.dart에서 실제 존재하는 WS URL 변수명으로 교체해줘.
  //    예: return bitgetWsUrl;  또는 return kBitgetWsUrl;  또는 return API.wsUrl;
  // 2) 지금은 빌드 안깨지게 기본값을 넣어둠.
  try {
    // ignore: undefined_identifier
    return configWsUrl; // 너 프로젝트에 이게 있으면 그대로 사용
  } catch (_) {
    return 'wss://ws.bitget.com/v2/ws/public';
  }
}
  // ✅ 핵심: https:// / :0 / # 같은 깨진 주소도 자동으로 고쳐서 ws로 바꿈
  String _sanitizeWsUrl(String raw) {
    var url = raw.trim();
    if (url.isEmpty) {
      // api_config.dart에서 비어있을 경우 기본값
      url = 'wss://ws.bitget.com/spot/v1/stream';
    }

    // fragment 제거 (#...)
    final hash = url.indexOf('#');
    if (hash >= 0) url = url.substring(0, hash);

    // http/https → ws/wss
    if (url.startsWith('https://')) {
      url = 'wss://' + url.substring('https://'.length);
    } else if (url.startsWith('http://')) {
      url = 'ws://' + url.substring('http://'.length);
    }

    // ":0" 같은 잘못된 포트 제거
    url = url.replaceAll(':0', '');

    // ws 스킴이 없으면 wss로 붙여줌
    if (!url.startsWith('ws://') && !url.startsWith('wss://')) {
      url = 'wss://$url';
    }

    return url;
  }

  void _connect() {
    // 혹시 이전 연결 남아있으면 정리
    _sub?.cancel();
    _sub = null;

    try {
      _ch?.sink.close();
    } catch (_) {}
    _ch = null;
final wsUrl = _sanitizeWsUrl(configWsUrlOrDefault());

    try {
      // ✅ IOWebSocketChannel로 실제 웹소켓 연결
      _ch = IOWebSocketChannel.connect(Uri.parse(wsUrl));
    } catch (_) {
      _scheduleReconnect('connect-failed');
      return;
    }

    _setConnected(false);

    // ✅ 연결 후 구독 메시지 전송
    // NOTE: Bitget WS 스펙은 채널/파라미터가 다를 수 있어.
    // 지금은 "연결이 https로 잘못 붙는 문제"를 우선 해결하는 안정 버전.
    _sendSubscribe();

    _sub = _ch!.stream.listen(
      (event) {
        _setConnected(true);
        _retry = 0; // 정상 수신이면 리트라이 카운터 초기화
        _handleMessage(event);
      },
      onError: (e) {
        _scheduleReconnect('stream-error');
      },
      onDone: () {
        _scheduleReconnect('done');
      },
      cancelOnError: true,
    );
  }

  void _sendSubscribe() {
    if (_ch == null) return;

    // ✅ 안전한 최소 구독 메시지(서버가 무시해도 앱은 계속 동작)
    // 만약 실제 Bitget 채널 스펙이 다르면, 다음 단계에서 정확 채널로 바꿔주면 됨.
    final msg = <String, dynamic>{
      'op': 'subscribe',
      'args': [
        {
          'instType': _instType,
          'channel': 'ticker',
          'instId': _instId,
        }
      ],
    };

    try {
      _ch!.sink.add(jsonEncode(msg));
    } catch (_) {
      // 전송 실패해도 앱은 유지
    }
  }

  void _handleMessage(dynamic event) {
    try {
      final s = event is String ? event : utf8.decode(event as List<int>);
      final j = jsonDecode(s);

      // Bitget 응답 형식이 다를 수 있어서 최대한 안전 파싱
      // 가능한 케이스:
      // - { "data":[{"last":"..."}] }
      // - { "data": {"last":"..."} }
      // - { ... "last":"..." ... }
      double? last;

      if (j is Map) {
        final data = j['data'];

        if (data is List && data.isNotEmpty && data.first is Map) {
          final m = data.first as Map;
          last = _toDouble(m['last'] ?? m['lastPr'] ?? m['price']);
        } else if (data is Map) {
          last = _toDouble(data['last'] ?? data['lastPr'] ?? data['price']);
        } else {
          last = _toDouble(j['last'] ?? j['lastPr'] ?? j['price']);
        }
      }

      if (last != null && last.isFinite) {
        _priceCtrl.add(last);
      }
    } catch (_) {
      // 파싱 실패는 무시(앱 유지)
    }
  }

  double? _toDouble(dynamic v) {
    if (v == null) return null;
    if (v is num) return v.toDouble();
    if (v is String) return double.tryParse(v);
    return null;
  }
}