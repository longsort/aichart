/// Fulink Pro 공통 상수. S-19: 멀티자산 — 심볼별 DB 키 분리(혼합 금지)
class Constants {
  static const String defaultSymbol = 'BTCUSDT';
  static const String defaultTf = 'm15';
  static const String appVersion = '1.0.0';

  /// 관심코인 리스트 (BTC, XRP, SOL, ADA, SHIB 등)
  static const List<String> symbolList = [
    'BTCUSDT',
    'ETHUSDT',
    'XRPUSDT',
    'SOLUSDT',
    'ADAUSDT',
    'DOGEUSDT',
    'SHIBUSDT',
    'AVAXUSDT',
    'LINKUSDT',
    'MATICUSDT',
  ];

  static const String favoriteSymbolsKey = 'favorite_symbols';
}
