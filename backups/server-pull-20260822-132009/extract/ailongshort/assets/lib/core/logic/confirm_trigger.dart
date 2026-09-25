// Fulink Pro - Confirm Trigger
//
// 일부 패치에서 trade_verdict.dart 가 이 파일을 import 합니다.
// 실제 트리거/알림 로직은 UI/엔진에서 직접 판정하도록 되어있어,
// 여기서는 빌드 에러를 막는 최소 구현만 제공합니다.

import '../models/trade_verdict.dart';

class ConfirmTrigger {
  /// 롱/숏 '확정' 상황에서 카드 반짝임/알림 트리거 여부
  static bool shouldFlash(TradeVerdict v) {
    return v.isConfirmed;
  }
}
