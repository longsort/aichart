import '../models/candle.dart';

/// 앱에서 실데이터 연결 시 이 함수만 교체하면 됨.
/// - REST 폴링, WebSocket, CSV tail 등 어떤 방식도 가능
abstract class RealtimeCandleRepo {
  Future<List<Candle>> fetch({required String symbol, required String tf, required int limit});
}
