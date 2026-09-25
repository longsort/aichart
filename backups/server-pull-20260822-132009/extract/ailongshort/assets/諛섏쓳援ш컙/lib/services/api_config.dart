import 'package:flutter/foundation.dart';

const String configWsUrl = 'wss://ws.bitget.com/v2/ws/public';

/// Bitget API/WS 주소를 한 곳에서 관리합니다.
///
/// ✅ 왜 필요?
/// 친구 폰에서 `Failed host lookup: api.bitget.com` 같은 에러는
/// 앱 버그라기보다 **DNS/네트워크/국가망 차단** 이슈인 경우가 많습니다.
/// 그래서 앱 안에서 “접속 모드(주소)”를 바꿔 보며 진단/우회할 수 있게 합니다.
class ApiConfig {
  /// HTTP Base (기본: 공식)
  static final ValueNotifier<String> httpBase =
      ValueNotifier<String>('https://api.bitget.com');

  /// WS Base (기본: 공식)
  static final ValueNotifier<String> wsBase =
      ValueNotifier<String>('wss://ws.bitget.com');

  /// “모드” 프리셋(필요 시 추가)
  /// - preset은 안전하게 2개만 두고, 나머지는 커스텀 입력으로 처리.
  static const presets = <String, Map<String, String>>{
    '기본(권장)': {
      'http': 'https://api.bitget.com',
      'ws': 'wss://ws.bitget.com',
    },
    // 어떤 환경에서는 `www.`가 DNS로 더 잘 풀리는 경우가 있어 “진단용”으로 제공
    '진단용(보조)': {
      'http': 'https://www.bitget.com',
      'ws': 'wss://ws.bitget.com',
    },
    // ✅ 중국/연변 등 일부 환경에서 `api.bitget.com` DNS가 막히는 경우가 있어
    //    주소만 우회해서 “엔진/분석 로직은 그대로” 실행되도록 프리셋 제공
    '중국(우회)': {
      'http': 'https://capi.bitget.com',
      'ws': 'wss://ws.bitget.com',
    },
    // ✅ Bitget DNS 차단/불안정 시(중국/연변 등):
    // - HTTP 호출은 Binance 쪽이 더 잘 되는 경우가 많아서 진단용으로 제공
    // - WS는 지역에 따라 불안정할 수 있어 앱 상단 "중국" 모드에서 자동 OFF 권장
    'Binance(진단)': {
      'http': 'https://fapi.binance.com',
      'ws': 'wss://ws.bitget.com',
    },
  };

  static void setPreset(String name) {
    final p = presets[name];
    if (p == null) return;
    httpBase.value = p['http'] ?? httpBase.value;
    wsBase.value = p['ws'] ?? wsBase.value;
  }

  static void setCustom({String? http, String? ws}) {
    if (http != null && http.trim().isNotEmpty) {
      httpBase.value = http.trim();
    }
    if (ws != null && ws.trim().isNotEmpty) {
      wsBase.value = ws.trim();
    }
  }
}
