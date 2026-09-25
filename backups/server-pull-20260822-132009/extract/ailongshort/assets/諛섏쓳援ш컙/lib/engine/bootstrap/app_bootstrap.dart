
import 'dart:async';
import '../hub/central_hub.dart';

/// Build-fix + visible movement.
/// main.dart calls AppBootstrap.start() -> guaranteed 존재.
/// 기존 기능 삭제 없음. (단, 중앙허브에 DEMO push만 추가)
class AppBootstrap {
  static Timer? _t;
  static int _tick = 0;

  static void start() {
    _t?.cancel();
    // DEMO: evidence 10개를 1초 주기로 계속 갱신 (실제 엔진 연결 전까지 UI 확인용)
    _t = Timer.periodic(const Duration(seconds: 1), (_) {
      _tick++;
      final p = ((_tick % 10) + 1) / 10.0;
      // 10 evidence keys
      centralHub.push('세력', (p * 0.92).clamp(0.0, 1.0));
      centralHub.push('고래', (p * 0.77).clamp(0.0, 1.0));
      centralHub.push('거래량', (p * 0.85).clamp(0.0, 1.0));
      centralHub.push('FVG', (p * 0.66).clamp(0.0, 1.0));
      centralHub.push('유동성', (p * 0.73).clamp(0.0, 1.0));
      centralHub.push('펀딩', (p * 0.58).clamp(0.0, 1.0));
      centralHub.push('구조', (p * 0.81).clamp(0.0, 1.0));
      centralHub.push('온체인', (p * 0.62).clamp(0.0, 1.0));
      centralHub.push('거시', (p * 0.55).clamp(0.0, 1.0));
      centralHub.push('AI오차', (1.0 - p).clamp(0.0, 1.0));
    });
  }
}
