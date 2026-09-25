import 'package:flutter/foundation.dart';

/// 거래 비용(수수료/펀딩/슬리피지) 모델
class TradeCostModel {
  static final TradeCostModel I = TradeCostModel._();
  TradeCostModel._();

  /// true=시장가(테이커), false=지정가(메이커)
  final ValueNotifier<bool> useTaker = ValueNotifier<bool>(true);

  /// 수수료(편도, Notional 대비)
  final ValueNotifier<double> takerFeeOneWay = ValueNotifier<double>(0.0006); // 0.06%
  final ValueNotifier<double> makerFeeOneWay = ValueNotifier<double>(0.0002); // 0.02%

  /// 슬리피지(왕복 합산, Notional 대비)
  final ValueNotifier<double> slippageRound = ValueNotifier<double>(0.0004); // 0.04%

  /// 펀딩비(8시간 기준, Notional 대비)
  final ValueNotifier<double> fundingPer8h = ValueNotifier<double>(0.0001); // 0.01%

  double feeOneWay() => useTaker.value ? takerFeeOneWay.value : makerFeeOneWay.value;

  /// Notional 기준 비용률 (왕복+펀딩)
  double costPctOnNotional({required double holdHours}) {
    final feeRound = 2.0 * feeOneWay();
    final slipRound = slippageRound.value;
    final funding = fundingPer8h.value * (holdHours / 8.0);
    return (feeRound + slipRound + funding).clamp(0.0, 0.10);
  }

  /// ROE(마진 대비) 비용률 = Notional 비용률 * 레버리지
  double costPctOnMargin({required double leverage, required double holdHours}) {
    return (costPctOnNotional(holdHours: holdHours) * leverage).clamp(0.0, 1.0);
  }
}
